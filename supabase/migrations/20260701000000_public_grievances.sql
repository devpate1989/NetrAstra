-- Public Grievance Portal (पब्लिक ग्रीवांस पोर्टल) integration
-- Scraped from https://ts.uppolice.gov.in/PublicGrievance/PS_DASHBOARD
-- using existing CCTNS CUG credentials (no separate login needed).

-- Summary counts synced from the PS_DASHBOARD page
create table public.pg_summary (
  id uuid primary key default gen_random_uuid(),
  police_station text,
  total_applications integer not null default 0,
  disposed integer not null default 0,
  pending integer not null default 0,
  pending_above_10_days integer not null default 0,
  scraped_at timestamptz not null default now()
);

create index pg_summary_scraped_at_idx on public.pg_summary (scraped_at desc);

-- Individual pending public grievance complaints
create table public.public_grievances (
  id uuid primary key default gen_random_uuid(),
  complaint_no text not null unique,
  applicant_name text,
  mobile text,
  complaint_category text,
  complaint_details text,
  police_station text,
  district text,
  assigned_io text,
  date_of_complaint date,
  status text,
  priority text,
  current_stage text,
  remarks text,
  raw_data jsonb not null default '{}'::jsonb,
  scraped_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index pg_complaints_status_idx on public.public_grievances (status);
create index pg_complaints_scraped_at_idx on public.public_grievances (scraped_at desc);

create trigger pg_set_updated_at
  before update on public.public_grievances
  for each row execute function public.set_updated_at();

-- RLS: SHO/Admin read all, IO reads own assigned
alter table public.public_grievances enable row level security;
alter table public.pg_summary enable row level security;

create policy "SHO/Admin read pg complaints"
  on public.public_grievances for select
  to authenticated
  using (public.current_user_role() in ('sho', 'admin', 'io'));

create policy "SHO/Admin read pg summary"
  on public.pg_summary for select
  to authenticated
  using (public.current_user_role() in ('sho', 'admin', 'io'));
