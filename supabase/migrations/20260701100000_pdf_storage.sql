-- Storage buckets and petition_url columns for PDF scraping across all 3 portals

-- Add petition_url to public_grievances (PG portal complaint PDFs)
alter table public.public_grievances add column if not exists petition_url text;

-- Add FIR PDF tracking table (CCTNS)
create table if not exists public.cctns_fir_files (
  id uuid primary key default gen_random_uuid(),
  external_reference text not null,  -- FIR No e.g. "0099/2026"
  file_path text not null,            -- Supabase Storage path
  file_size_bytes integer,
  downloaded_at timestamptz not null default now(),
  unique (external_reference)
);

alter table public.cctns_fir_files enable row level security;
create policy "SHO/Admin read FIR files"
  on public.cctns_fir_files for select
  to authenticated
  using (public.current_user_role() in ('sho', 'admin', 'io'));

-- Storage buckets
insert into storage.buckets (id, name, public)
  values ('pg-complaints', 'pg-complaints', false)
  on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
  values ('cctns-firs', 'cctns-firs', false)
  on conflict (id) do nothing;

-- RLS for pg-complaints
create policy "Authenticated users can read PG complaint PDFs"
  on storage.objects for select to authenticated
  using (bucket_id = 'pg-complaints');

-- RLS for cctns-firs
create policy "Authenticated users can read CCTNS FIR PDFs"
  on storage.objects for select to authenticated
  using (bucket_id = 'cctns-firs');
