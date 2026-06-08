# Database migrations

SQL migrations for the Netra Astra Supabase project, applied in filename order:

1. `20260608090000_extensions_and_helpers.sql` — extensions, `user_role` enum, shared `set_updated_at` trigger
2. `20260608090100_profiles.sql` — `profiles` table, role-escalation guard, RLS
3. `20260608090200_reports.sql` — `reports` (23-point inquiry + General Diary) and child tables (`report_witnesses`, `report_acts_sections`, `report_signoffs`, `report_attachments`), RLS
4. `20260608090300_investigations.sql` — CCTNS/FIR pending-investigations tracker (module 8), RLS
5. `20260608090400_jansunwai.sql` — Jan Sunwai applications (module 9) + back-reference from `reports`, RLS
6. `20260608090500_storage.sql` — storage buckets (`avatars`, `report-pdfs`, `report-attachments`) and object-level RLS
7. `20260608090600_jansunwai_petitions_bucket.sql` — `jansunwai-petitions` private storage bucket + RLS policy
8. `20260608090700_investigations_source_cctns.sql` — aligns `investigations.source` default/values with the CCTNS portal naming

## Applying

Either:

- **Supabase Dashboard** → SQL Editor → paste and run each file in order, or
- **Supabase CLI**, from the project root:
  ```
  npx supabase link --project-ref <your-project-ref>
  npx supabase db push
  ```

## Notes

- All tables use Row Level Security. The Express backend authenticates as the
  service-role key (bypasses RLS) and enforces roles via `requireAuth`/`requireRole`
  middleware — RLS here is defense-in-depth for any direct Supabase client access.
- `profiles` rows are created by the `/auth/register` endpoint (not a DB trigger),
  since registration also assigns role, police station, and district.
- `current_user_role()`, `owns_report()`, and `can_read_report()` are
  `security definer` helpers that let RLS policies check role/ownership without
  recursively re-evaluating `profiles`/`reports` policies.
