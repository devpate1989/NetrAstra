-- Private bucket the Jan Sunwai scraper mirrors प्रार्थना पत्र (petition) PDFs into
-- (module 9). The portal's own document URLs require its login session/cookies,
-- which the officer's browser/app doesn't have — so the scraper downloads each
-- PDF with its authenticated session and stores it here; objects are stored at
-- "<application_number>/<timestamp>.pdf" (see janSunwaiPortal.service.ts).
-- The controller mints short-lived signed URLs on demand, the same pattern used
-- for report-pdfs / report-attachments.
insert into storage.buckets (id, name, public)
values ('jansunwai-petitions', 'jansunwai-petitions', false)
on conflict (id) do nothing;

create policy "Petitions readable by assigned IO or oversight roles"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'jansunwai-petitions'
    and (
      public.current_user_role() in ('sho', 'admin')
      or exists (
        select 1
        from public.jansunwai_applications ja
        where ja.assigned_io_id = auth.uid()
          and ja.petition_url = storage.objects.name
      )
    )
  );
