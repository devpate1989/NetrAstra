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
9. `20260609000000_add_username_to_profiles.sql` — adds `profiles.username` for username-based login
10. `20260610000000_audit_log.sql` — `audit_log` table for sensitive admin/report actions, admin-only read RLS
11. `20260610010000_scanned_documents.sql` — `scanned_documents` table (Document Intelligence Engine) + `scanned-documents` private storage bucket, owner-only RLS
12. `20260610020000_legal_analysis.sql` — `legal_analyses` table (AI legal analysis, owner-only RLS) + `bns_section_mappings` curated IPC/CrPC/Evidence Act → BNS/BNSS/BSA reference table (read-only for authenticated users)
13. `20260611000000_beat_directory.sql` — `chowkis`/`chowki_villages`/`chowki_officers` (बीट/चौकी → गाँव/मोहल्ले → SI reference data) and `thana_staff` (Karm Yogi-registered थाना personnel), curated reference tables for Thana Kumarganj, read-only for authenticated users, admin-managed

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
