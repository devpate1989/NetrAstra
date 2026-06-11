-- Category-wise (संदर्भ प्रकार) summary of pending Jan Sunwai references, scraped from
-- /igrs/UnmarkRefrence (unmark_count) and /igrs/officeLevelReferences (office_pending_count).
-- total_pending = unmark_count + office_pending_count, surfaced on the Admin/SHO portal.
create table public.jansunwai_reference_summary (
  id uuid primary key default gen_random_uuid(),

  complaint_type_code integer not null unique,
  complaint_type_name text not null,

  unmark_count integer not null default 0,
  office_pending_count integer not null default 0,
  total_pending integer generated always as (unmark_count + office_pending_count) stored,

  scraped_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger jansunwai_reference_summary_set_updated_at
  before update on public.jansunwai_reference_summary
  for each row execute function public.set_updated_at();

alter table public.jansunwai_reference_summary enable row level security;

create policy "SHO/Admin read reference summary"
  on public.jansunwai_reference_summary for select
  to authenticated
  using (public.current_user_role() in ('sho', 'admin'));
