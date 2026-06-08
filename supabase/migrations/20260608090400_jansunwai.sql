-- Jan Sunwai (जनसुनवाई) pending applications scraped from the public-grievance portal
-- (module 9). Each application is matched to an Investigating Officer; opening one
-- shows its प्रार्थना पत्र (PDF or text) and offers a "Create Report" action that
-- pre-fills a new inquiry report (module 7) and links back here via reports.jansunwai_application_id.
create table public.jansunwai_applications (
  id uuid primary key default gen_random_uuid(),
  application_number text not null,
  source text not null default 'jansunwai_portal',

  assigned_io_id uuid references public.profiles (id) on delete set null,
  assigned_io_name text,

  petitioner_name text,
  petitioner_address text,
  petitioner_mobile text,
  subject text,
  description text,

  petition_format text not null default 'text' check (petition_format in ('pdf', 'text')),
  petition_url text,
  petition_text text,

  status text not null default 'pending' check (status in ('pending', 'report_started', 'closed')),

  raw_data jsonb not null default '{}'::jsonb,

  report_id uuid references public.reports (id) on delete set null,

  scraped_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (source, application_number)
);

create index jansunwai_assigned_io_idx on public.jansunwai_applications (assigned_io_id);
create index jansunwai_status_idx on public.jansunwai_applications (status);

create trigger jansunwai_set_updated_at
  before update on public.jansunwai_applications
  for each row execute function public.set_updated_at();

-- Back-reference so a report can record which Jan Sunwai application seeded it
-- (added here, after jansunwai_applications exists, to avoid a circular FK).
alter table public.reports
  add column jansunwai_application_id uuid references public.jansunwai_applications (id) on delete set null;

create index reports_jansunwai_application_idx on public.reports (jansunwai_application_id);

alter table public.jansunwai_applications enable row level security;

create policy "IOs read their assigned applications; SHO/Admin read all"
  on public.jansunwai_applications for select
  to authenticated
  using (assigned_io_id = auth.uid() or public.current_user_role() in ('sho', 'admin'));

create policy "IOs can update their own application status"
  on public.jansunwai_applications for update
  to authenticated
  using (assigned_io_id = auth.uid())
  with check (assigned_io_id = auth.uid());
