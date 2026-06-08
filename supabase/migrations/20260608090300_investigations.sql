-- Pending investigations scraped from the external CCTNS portal (module 8).
-- The scraping job (running with the service-role key, bypassing RLS) is the only
-- writer; SHO/Admin read the IO-categorized view, and Admin may correct the
-- IO name and धारा (Section) recorded against a case.
create table public.investigations (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'cctv_portal',
  external_reference text,

  police_station text not null,
  district text,

  io_name text,
  section text,

  complainant_name text,
  case_summary text,
  case_status text,
  registered_on date,

  -- full scraped payload, kept for traceability / re-parsing if the site changes
  raw_data jsonb not null default '{}'::jsonb,

  scraped_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (source, external_reference)
);

create index investigations_police_station_idx on public.investigations (police_station);
create index investigations_io_name_idx on public.investigations (io_name);

create trigger investigations_set_updated_at
  before update on public.investigations
  for each row execute function public.set_updated_at();

alter table public.investigations enable row level security;

create policy "SHO and Admin can read investigations"
  on public.investigations for select
  to authenticated
  using (public.current_user_role() in ('sho', 'admin'));

create policy "Admin can edit IO name and section"
  on public.investigations for update
  to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');
