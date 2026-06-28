-- Tracks which संदर्भ प्रकार (sandarbh/category) each Jan Sunwai application
-- belongs to, plus the portal's own "अगले 3 दिवसों में डिफाल्टर" (defaulter within
-- next 3 days) classification — both scraped directly from the portal, not
-- computed locally. Powers the admin/SHO "Pending IGRS" pendency dashboard.
alter table public.jansunwai_applications
  add column reference_type_code integer,
  add column reference_type_name text,
  add column received_date date,
  add column is_defaulter_soon boolean not null default false;

alter table public.jansunwai_reference_summary
  add column defaulter_3day_count integer not null default 0;
