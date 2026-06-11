-- Document Intelligence Engine (Phase 2/3): scanned documents + OCR results.
-- Each row represents one camera/gallery/PDF scan a user submitted for OCR.
-- This is a personal scanning utility, so RLS is owner-only (no SHO/Admin
-- oversight, unlike reports/investigations).
create type public.document_source as enum ('camera', 'image', 'pdf');
create type public.ocr_status as enum ('pending', 'processing', 'completed', 'failed');

create table public.scanned_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  source public.document_source not null,
  file_path text not null,
  file_name text not null,
  mime_type text not null,
  file_size integer not null,
  ocr_status public.ocr_status not null default 'pending',
  extracted_text text,
  confidence numeric,
  language_detected text,
  entities jsonb,
  keywords jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index scanned_documents_user_id_idx on public.scanned_documents (user_id, created_at desc);

create trigger set_scanned_documents_updated_at
  before update on public.scanned_documents
  for each row execute function public.set_updated_at();

alter table public.scanned_documents enable row level security;

create policy "Users manage their own scanned documents"
  on public.scanned_documents for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Storage bucket for the original scanned files (images/PDFs), owner-only.
insert into storage.buckets (id, name, public)
values ('scanned-documents', 'scanned-documents', false)
on conflict (id) do nothing;

create policy "Users read their own scanned document files"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'scanned-documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users upload their own scanned document files"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'scanned-documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users delete their own scanned document files"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'scanned-documents' and (storage.foldername(name))[1] = auth.uid()::text);
