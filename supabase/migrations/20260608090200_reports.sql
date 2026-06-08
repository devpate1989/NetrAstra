-- Police Inquiry / Investigation Report ("जाँच हेतु बिन्दुकृत कार्यवाही का विवरण").
-- One row per submission. Field names follow the 23-point structure (क्र.सं. 1-23)
-- plus the General Diary (Part B) section described in prompt.md / khushbu.pdf.
-- jansunwai_application_id is added later (see 20260608090400) to avoid a circular FK.
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  officer_id uuid not null references public.profiles (id) on delete restrict,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'pdf_generated')),

  -- Header block: addressee, reference number, date
  addressee_district text,
  reference_number text,
  report_date date,

  -- 1. Complainant
  complainant_name text,
  complainant_address text,
  complainant_mobile text,

  -- 2. Opposite party
  opposite_party_name text,
  opposite_party_address text,
  opposite_party_mobile text,

  -- 3. Complaint summary
  complaint_description text,

  -- 4. Investigating officer
  io_name text,
  io_designation text,
  io_mobile text,

  -- 5. FIR details (or "निल")
  fir_details text,

  -- 6. Dispute category
  dispute_category text check (dispute_category in ('land', 'domestic', 'illegal_possession', 'other')),
  dispute_category_note text,

  -- 7-8. Statements
  complainant_statement text,
  opposite_party_statement text,

  -- 10. Prior offence
  prior_offence_details text,

  -- 11. Joint team / land dispute site visit
  land_dispute_team_details text,

  -- 12. BNSS Section 126/135 bond details
  bond_section_126_135_details text,

  -- 13 & 18. Prior application history (chronological)
  prior_application_details text,
  prior_application_chronology text,

  -- 14. UP-112 notification & PRV closure report attachment
  up112_informed boolean,
  up112_report_url text,

  -- 15. BNSS Section 170 details
  section_170_details text,

  -- 16. Pending court case details
  court_case_details text,

  -- 17. Site visit date, GPS-tagged photo
  site_visit_date date,
  site_visit_latitude numeric(10, 6),
  site_visit_longitude numeric(10, 6),
  site_visit_photo_url text,

  -- 19. Compromise / settlement
  compromise_details text,
  compromise_attachment_url text,

  -- 20. Analytical conclusion & recommendation
  analytical_conclusion text,

  -- 21. Feedback / conversation summary
  feedback_notes text,

  -- 22. Complainant satisfaction
  is_complainant_satisfied boolean,
  dissatisfaction_details text,

  -- 23. Other comments
  other_comments text,

  -- Signature block
  signed_name text,
  signed_designation text,
  signed_police_station text,
  signed_district text,
  signed_date date,
  signature_url text,

  -- Part B — General Diary (G.D.)
  gd_state text,
  gd_police_station text,
  gd_district text,
  gd_no text,
  gd_date date,
  gd_type text,
  gd_entry_officer text,
  gd_case_type text,
  gd_brief text,
  gd_subject text,
  gd_report_printed_on date,
  gd_report_printed_by_name text,
  gd_report_printed_by_rank text,
  gd_report_printed_by_number text,

  -- Generated artifact
  pdf_url text,
  generated_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index reports_officer_id_idx on public.reports (officer_id);
create index reports_status_idx on public.reports (status);

create trigger reports_set_updated_at
  before update on public.reports
  for each row execute function public.set_updated_at();

-- 9. Independent witnesses (repeatable group)
create table public.report_witnesses (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports (id) on delete cascade,
  position int not null default 0,
  name text,
  address text,
  mobile text,
  statement text,
  created_at timestamptz not null default now()
);

-- Part B Acts & Sections table (अधिनियम और धारा, repeatable rows)
create table public.report_acts_sections (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports (id) on delete cascade,
  position int not null default 0,
  s_no int,
  act text,
  section text,
  created_at timestamptz not null default now()
);

-- Officer sign-off blocks (Name, Rank, Number, Signature) — typically two per report
create table public.report_signoffs (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports (id) on delete cascade,
  position int not null default 0,
  label text,
  name text,
  rank text,
  number text,
  signature_url text,
  created_at timestamptz not null default now()
);

-- Site-visit photos and other supporting documents embedded in the generated PDF
create table public.report_attachments (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports (id) on delete cascade,
  kind text not null check (kind in ('site_photo', 'up112_report', 'compromise_document', 'signature', 'other')),
  file_url text not null,
  caption text,
  latitude numeric(10, 6),
  longitude numeric(10, 6),
  created_at timestamptz not null default now()
);

create index report_witnesses_report_id_idx on public.report_witnesses (report_id);
create index report_acts_sections_report_id_idx on public.report_acts_sections (report_id);
create index report_signoffs_report_id_idx on public.report_signoffs (report_id);
create index report_attachments_report_id_idx on public.report_attachments (report_id);

-- security definer helpers so child-table policies don't need to repeat the join logic
create or replace function public.owns_report(target_report_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.reports
    where id = target_report_id and officer_id = auth.uid()
  );
$$;

create or replace function public.can_read_report(target_report_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.reports r
    where r.id = target_report_id
      and (r.officer_id = auth.uid() or public.current_user_role() in ('sho', 'admin'))
  );
$$;

alter table public.reports enable row level security;

-- IOs fully manage their own reports; SHO/Admin get read-only oversight of all reports.
create policy "IOs manage their own reports"
  on public.reports for all
  to authenticated
  using (officer_id = auth.uid())
  with check (officer_id = auth.uid());

create policy "SHO and Admin can read all reports"
  on public.reports for select
  to authenticated
  using (public.current_user_role() in ('sho', 'admin'));

-- Apply the same read/write split to every child table via the helper functions.
do $$
declare
  child_table text;
begin
  foreach child_table in array array[
    'report_witnesses',
    'report_acts_sections',
    'report_signoffs',
    'report_attachments'
  ]
  loop
    execute format('alter table public.%I enable row level security', child_table);

    execute format(
      'create policy "Read via parent report" on public.%I for select to authenticated using (public.can_read_report(report_id))',
      child_table
    );
    execute format(
      'create policy "Insert via owned report" on public.%I for insert to authenticated with check (public.owns_report(report_id))',
      child_table
    );
    execute format(
      'create policy "Update via owned report" on public.%I for update to authenticated using (public.owns_report(report_id)) with check (public.owns_report(report_id))',
      child_table
    );
    execute format(
      'create policy "Delete via owned report" on public.%I for delete to authenticated using (public.owns_report(report_id))',
      child_table
    );
  end loop;
end;
$$;
