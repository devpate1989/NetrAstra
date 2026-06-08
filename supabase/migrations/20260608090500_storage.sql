-- Storage buckets for avatars, generated report PDFs, and report attachments
-- (site-visit photos, signatures, UP-112 / compromise documents, etc.).
-- Convention: objects are stored at "<owner_user_id>/<...>" so ownership can be
-- derived from the path's first folder segment.
insert into storage.buckets (id, name, public)
values
  ('avatars', 'avatars', true),
  ('report-pdfs', 'report-pdfs', false),
  ('report-attachments', 'report-attachments', false)
on conflict (id) do nothing;

-- Avatars: publicly readable, owner-only write
create policy "Avatar images are publicly readable"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "Users upload their own avatar"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users update their own avatar"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users delete their own avatar"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Report PDFs & attachments: owner read/write; SHO/Admin read-only oversight
create policy "Report files readable by owner or oversight roles"
  on storage.objects for select
  to authenticated
  using (
    bucket_id in ('report-pdfs', 'report-attachments')
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.current_user_role() in ('sho', 'admin')
    )
  );

create policy "Officers upload their own report files"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id in ('report-pdfs', 'report-attachments')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Officers update their own report files"
  on storage.objects for update
  to authenticated
  using (
    bucket_id in ('report-pdfs', 'report-attachments')
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id in ('report-pdfs', 'report-attachments')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Officers delete their own report files"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id in ('report-pdfs', 'report-attachments')
    and (storage.foldername(name))[1] = auth.uid()::text
  );
