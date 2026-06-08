-- The external portal is officially CCTNS (Crime and Criminal Tracking Network
-- & Systems); align the `source` default/values with the scraper, which now
-- writes 'cctns_portal' (see services/scraping/cctnsPortal.service.ts).
alter table public.investigations
  alter column source set default 'cctns_portal';

update public.investigations
  set source = 'cctns_portal'
  where source = 'cctv_portal';
