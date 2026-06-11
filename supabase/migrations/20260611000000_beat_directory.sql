-- Beat / Chowki directory (बीट/चौकी निर्देशिका) — read-only reference data showing
-- which villages/मोहल्ले fall under each चौकी/हल्का, the सब-इंस्पेक्टर(s) posted
-- there, and a roster of थाना-level Karm Yogi-registered staff. Sourced from the
-- थाना कुमारगंज बीट आबन्टन (दिनाँक 09.02.2026) and नक्शा नौकरी (दिनाँक 31.05.2026)
-- documents — kept as a curated reference table, not auto-synced.

create table public.chowkis (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'chowki' check (kind in ('chowki', 'halka', 'special')),
  police_station text,
  district text,
  in_charge_name text,
  in_charge_designation text,
  in_charge_phone text,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index chowkis_display_order_idx on public.chowkis (display_order);

create table public.chowki_villages (
  id uuid primary key default gen_random_uuid(),
  chowki_id uuid not null references public.chowkis (id) on delete cascade,
  village_name text not null,
  beat_number text,
  display_order integer not null default 0
);

create index chowki_villages_chowki_idx on public.chowki_villages (chowki_id);

create table public.chowki_officers (
  id uuid primary key default gen_random_uuid(),
  chowki_id uuid not null references public.chowkis (id) on delete cascade,
  full_name text not null,
  designation text not null,
  phone text,
  pno text,
  display_order integer not null default 0
);

create index chowki_officers_chowki_idx on public.chowki_officers (chowki_id);

-- Per-बीट breakdown: SI, बीट कर्मचारी, and लिंक अधिकारी for each numbered beat,
-- as laid out in the बीट आबन्टन table (one row per बीट संख्या).
create table public.beats (
  id uuid primary key default gen_random_uuid(),
  chowki_id uuid not null references public.chowkis (id) on delete cascade,
  beat_number text,
  si_name text,
  si_phone text,
  si_pno text,
  staff_name text,
  staff_phone text,
  link_officer_name text,
  link_officer_phone text,
  display_order integer not null default 0
);

create index beats_chowki_idx on public.beats (chowki_id);

create table public.thana_staff (
  id uuid primary key default gen_random_uuid(),
  pno text,
  full_name text not null,
  designation text,
  phone text,
  email text,
  police_station text,
  district text,
  current_posting text,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index thana_staff_display_order_idx on public.thana_staff (display_order);

create trigger chowkis_set_updated_at
  before update on public.chowkis
  for each row execute function public.set_updated_at();

create trigger thana_staff_set_updated_at
  before update on public.thana_staff
  for each row execute function public.set_updated_at();

alter table public.chowkis enable row level security;
alter table public.chowki_villages enable row level security;
alter table public.chowki_officers enable row level security;
alter table public.beats enable row level security;
alter table public.thana_staff enable row level security;

create policy "Chowkis are readable by authenticated users"
  on public.chowkis for select to authenticated using (true);

create policy "Chowki villages are readable by authenticated users"
  on public.chowki_villages for select to authenticated using (true);

create policy "Chowki officers are readable by authenticated users"
  on public.chowki_officers for select to authenticated using (true);

create policy "Beats are readable by authenticated users"
  on public.beats for select to authenticated using (true);

create policy "Thana staff are readable by authenticated users"
  on public.thana_staff for select to authenticated using (true);

create policy "Admins manage chowkis"
  on public.chowkis for all to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

create policy "Admins manage chowki villages"
  on public.chowki_villages for all to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

create policy "Admins manage chowki officers"
  on public.chowki_officers for all to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

create policy "Admins manage beats"
  on public.beats for all to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

create policy "Admins manage thana staff"
  on public.thana_staff for all to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- ── Seed data: थाना कुमारगंज, जनपद अयोध्या ───────────────────────────

insert into public.chowkis (name, kind, police_station, district, in_charge_name, in_charge_designation, in_charge_phone, display_order) values
('हल्का नं0 01', 'halka', 'Kumarganj', 'Ayodhya', 'उ0नि0 दिनेश चन्द्र मिश्र', 'हल्का प्रभारी', '8273692758', 1),
('हल्का नं0 02', 'halka', 'Kumarganj', 'Ayodhya', 'उ0नि0 विमल कुमार यादव', 'हल्का प्रभारी', '9565706754', 2),
('चौकी एनडीए',   'chowki', 'Kumarganj', 'Ayodhya', 'उ0नि0 अभिषेक कुमार', 'चौकी प्रभारी', null, 3),
('चौकी चिलबिली', 'chowki', 'Kumarganj', 'Ayodhya', 'उ0नि0 शैलेन्द्र मणि', 'चौकी प्रभारी', '9695435038', 4),
('चौकी देवगाँव', 'chowki', 'Kumarganj', 'Ayodhya', 'उ0नि0 अशोक कुमार पाठक', 'चौकी प्रभारी', '9336109038', 5),
('महिला हेल्प डेस्क / जनशिकायत अधिकारी', 'special', 'Kumarganj', 'Ayodhya', null, null, null, 6);

-- हल्का नं0 01 (बीट 01-05)
insert into public.chowki_villages (chowki_id, village_name, beat_number, display_order)
select id, v.village_name, v.beat_number, v.ord
from public.chowkis, (values
  ('इटौंजा', '01', 1), ('तिन्दौली', '01', 2), ('जगन्नाथपुर', '01', 3),
  ('वीराभारी', '02', 4), ('बहबरमऊ', '02', 5),
  ('अकमा', '03', 6), ('बिरौलीझाम', '03', 7),
  ('कटघरा', '04', 8), ('भटपुरा गोपालपुर', '04', 9),
  ('चौधरीपुर', '05', 10), ('कटैयाबालम', '05', 11), ('उमरहर', '05', 12), ('धमथुआ बभनान', '05', 13)
) as v(village_name, beat_number, ord)
where chowkis.name = 'हल्का नं0 01';

insert into public.chowki_officers (chowki_id, full_name, designation, phone, pno, display_order)
select id, o.full_name, o.designation, o.phone, o.pno, o.ord
from public.chowkis, (values
  ('उ0नि0 दिनेश चन्द्र मिश्र', 'हल्का प्रभारी', '8273692758', '892590809', 1),
  ('म0का0 ज्योति रानी', 'हल्का प्रभारी सहायक', '9058405667', '192252674', 2)
) as o(full_name, designation, phone, pno, ord)
where chowkis.name = 'हल्का नं0 01';

insert into public.beats (chowki_id, beat_number, si_name, si_phone, si_pno, staff_name, staff_phone, link_officer_name, link_officer_phone, display_order)
select id, b.beat_number, b.si_name, b.si_phone, b.si_pno, b.staff_name, b.staff_phone, b.link_officer_name, b.link_officer_phone, b.ord
from public.chowkis, (values
  ('01', 'उ0नि0 गौरव कुमार पाण्डेय', '8765257553', '231073561', 'हे0का0 विनोद गुप्ता', '9168981717', 'का0 रोहित कुमार', '8887667532', 1),
  ('02', null, null, null, 'का0 मुलायम यादव', '8858603191', 'हे0का0 विनोद गुप्ता', '9168981717', 2),
  ('03', 'उ0नि0 गौरव कुमार पाण्डेय', '8765257553', '231073561', 'का0 भगवान सिंह', '8171617485', 'का0 मुलायम यादव', '8858603191', 3),
  ('04', null, null, null, 'का0 रोहित कुमार', '8887667532', 'हे0का0 संजय तिवारी', '9598370490', 4),
  ('05', 'उ0नि0 गौरव कुमार पाण्डेय', '8765257553', '231073561', 'हे0का0 संजय तिवारी', '9598370490', 'का0 भगवान सिंह', '8171617485', 5)
) as b(beat_number, si_name, si_phone, si_pno, staff_name, staff_phone, link_officer_name, link_officer_phone, ord)
where chowkis.name = 'हल्का नं0 01';

-- हल्का नं0 02 (बीट 06-11)
insert into public.chowki_villages (chowki_id, village_name, beat_number, display_order)
select id, v.village_name, v.beat_number, v.ord
from public.chowkis, (values
  ('पाराधमथुआ', '06', 1), ('सिधौना', '06', 2), ('बरईपारा', '06', 3),
  ('पूरबगाँव', '07', 4), ('तेंधा', '07', 5), ('बवां', '07', 6),
  ('मुगलन धमथुआ', '08', 7), ('धनैचा', '08', 8),
  ('सरांय हेमराज', '09', 9), ('जमुनियामऊ', '09', 10), ('उधुई', '09', 11),
  ('मसेढा', '10', 12), ('डफलपुर', '10', 13), ('सरूरपुर', '10', 14),
  ('बघौड़ा', '11', 15), ('सरायं धनेठी', '11', 16), ('गोयड़ी', '11', 17)
) as v(village_name, beat_number, ord)
where chowkis.name = 'हल्का नं0 02';

insert into public.chowki_officers (chowki_id, full_name, designation, phone, pno, display_order)
select id, o.full_name, o.designation, o.phone, o.pno, o.ord
from public.chowkis, (values
  ('उ0नि0 विमल कुमार यादव', 'हल्का प्रभारी', '9565706754', null, 1),
  ('म0का0 सोनी निगम', 'हल्का प्रभारी सहायक', '7307507465', null, 2)
) as o(full_name, designation, phone, pno, ord)
where chowkis.name = 'हल्का नं0 02';

insert into public.beats (chowki_id, beat_number, si_name, si_phone, si_pno, staff_name, staff_phone, link_officer_name, link_officer_phone, display_order)
select id, b.beat_number, b.si_name, b.si_phone, b.si_pno, b.staff_name, b.staff_phone, b.link_officer_name, b.link_officer_phone, b.ord
from public.chowkis, (values
  ('06', 'उ0नि0 राजेश कुमार गुप्ता', '7905733329', '972080518', 'हे0का0 आलोक पाण्डेय', '9450185982', 'का0 शशिकान्त मिश्रा', '7309766841', 1),
  ('07', 'उ0नि0 राजेश कुमार गुप्ता', '7905733329', '972080518', 'का0 शशिकान्त मिश्रा', '7309766841', 'हे0का0 आलोक पाण्डेय', '9450185982', 2),
  ('08', 'उ0नि0 राजेश कुमार गुप्ता', '7905733329', '972080518', 'का0 विकास कुमार', '6394557061', 'हे0का0 उमेश कुमार गौतम', '9125529195', 3),
  ('09', 'उ0नि0 आकिल हुसैन', '9198521649', '234112685', 'हे0का0 उमेश कुमार गौतम', '9125529195', 'का0 विकास कुमार', '6394557061', 4),
  ('10', 'उ0नि0 आकिल हुसैन', '9198521649', '234112685', 'हे0का0 नागेन्द्र कुमार', '6306584911', 'का0 देवराज सिंह', '8006363006', 5),
  ('11', 'उ0नि0 आकिल हुसैन', '9198521649', '234112685', 'का0 देवराज सिंह', '8006363006', 'हे0का0 नागेन्द्र कुमार', '6306584911', 6)
) as b(beat_number, si_name, si_phone, si_pno, staff_name, staff_phone, link_officer_name, link_officer_phone, ord)
where chowkis.name = 'हल्का नं0 02';

-- चौकी एनडीए (बीट 12-15)
insert into public.chowki_villages (chowki_id, village_name, beat_number, display_order)
select id, v.village_name, v.beat_number, v.ord
from public.chowkis, (values
  ('शिवनाथपुर', '12', 1), ('इसौलीभारी', '12', 2),
  ('अमावां छींटन', '13', 3), ('पिठला', '13', 4),
  ('भरत का पुरवा', '14', 5), ('बलारमऊ', '14', 6),
  ('जोरियम', '15', 7)
) as v(village_name, beat_number, ord)
where chowkis.name = 'चौकी एनडीए';

insert into public.chowki_officers (chowki_id, full_name, designation, phone, pno, display_order)
select id, o.full_name, o.designation, o.phone, o.pno, o.ord
from public.chowkis, (values
  ('उ0नि0 अभिषेक कुमार', 'चौकी प्रभारी (नक्शा नौकरी 31.05.2026)', null, null, 1)
) as o(full_name, designation, phone, pno, ord)
where chowkis.name = 'चौकी एनडीए';

insert into public.beats (chowki_id, beat_number, si_name, si_phone, si_pno, staff_name, staff_phone, link_officer_name, link_officer_phone, display_order)
select id, b.beat_number, b.si_name, b.si_phone, b.si_pno, b.staff_name, b.staff_phone, b.link_officer_name, b.link_officer_phone, b.ord
from public.chowkis, (values
  ('12', 'उ0नि0 राजेन्द्र प्रसाद', '6306318212', '932357959', 'हे0का0 विवेक त्रिपाठी', '9559901398', 'का0 बृजेश यादव', '8318854331', 1),
  ('13', 'उ0नि0 राजेन्द्र प्रसाद', '6306318212', '932357959', 'का0 बृजेश यादव', '8318854331', 'हे0का0 विवेक त्रिपाठी', '9559901398', 2),
  ('14', 'उ0नि0 नूतन स्वरूप', '7905444179', '152701392', 'का0 शिवम शुक्ला', '7905700129', 'का0 आशिक अली', '7897218607', 3),
  ('15', 'उ0नि0 नूतन स्वरूप', '7905444179', '152701392', 'का0 आशिक अली', '7897218607', 'का0 शिवम शुक्ला', '7905700129', 4)
) as b(beat_number, si_name, si_phone, si_pno, staff_name, staff_phone, link_officer_name, link_officer_phone, ord)
where chowkis.name = 'चौकी एनडीए';

-- चौकी चिलबिली (बीट 16-17)
insert into public.chowki_villages (chowki_id, village_name, beat_number, display_order)
select id, v.village_name, v.beat_number, v.ord
from public.chowkis, (values
  ('हरदोइया', '16', 1), ('नरेन्द्रभादा', '16', 2), ('गोकुला', '16', 3), ('मोहनवां', '16', 4),
  ('गणेशपुर', '17', 5), ('केशवपुर चिलबिली', '17', 6), ('मरूईगणेशपुर', '17', 7), ('खरियौना', '17', 8)
) as v(village_name, beat_number, ord)
where chowkis.name = 'चौकी चिलबिली';

insert into public.chowki_officers (chowki_id, full_name, designation, phone, pno, display_order)
select id, o.full_name, o.designation, o.phone, o.pno, o.ord
from public.chowkis, (values
  ('उ0नि0 शैलेन्द्र मणि', 'चौकी प्रभारी', '9695435038', '234111826', 1),
  ('म0का0 संध्या दीक्षित', 'चौकी प्रभारी सहायक', '9956717078', '192255019', 2)
) as o(full_name, designation, phone, pno, ord)
where chowkis.name = 'चौकी चिलबिली';

insert into public.beats (chowki_id, beat_number, si_name, si_phone, si_pno, staff_name, staff_phone, link_officer_name, link_officer_phone, display_order)
select id, b.beat_number, b.si_name, b.si_phone, b.si_pno, b.staff_name, b.staff_phone, b.link_officer_name, b.link_officer_phone, b.ord
from public.chowkis, (values
  ('16', 'उ0नि0 ईश्वरचन्द्र कौशल', '8957954197', '892738744', 'का0 सत्यम मिश्रा प्रथम', '6397480497', 'का0 जितेन्द्र बहादुर सिंह', '7839263876', 1),
  ('17', 'उ0नि0 ईश्वरचन्द्र कौशल', '8957954197', '892738744', 'का0 जितेन्द्र बहादुर सिंह', '7839263876', 'का0 सत्यम मिश्रा प्रथम', '6397480497', 2)
) as b(beat_number, si_name, si_phone, si_pno, staff_name, staff_phone, link_officer_name, link_officer_phone, ord)
where chowkis.name = 'चौकी चिलबिली';

-- चौकी देवगाँव (बीट 18-22)
insert into public.chowki_villages (chowki_id, village_name, beat_number, display_order)
select id, v.village_name, v.beat_number, v.ord
from public.chowkis, (values
  ('उधरनपुर', '18', 1), ('पूरा उर्फ सुमेरपुर', '18', 2), ('माँझगाँव', '18', 3),
  ('पालपुर', '19', 4), ('मेवापुर', '19', 5),
  ('मुबारकपुर चौबेपुर', '20', 6), ('रसूलपुर लिलहा', '20', 7), ('मेवापुर मुतालके', '20', 8),
  ('पूरेलाल खाँ', '21', 9), ('इमामगंज', '21', 10), ('देवगाँव', '21', 11),
  ('घोड़वल', '22', 12), ('रानिकपुर', '22', 13), ('इदिलपुर', '22', 14)
) as v(village_name, beat_number, ord)
where chowkis.name = 'चौकी देवगाँव';

insert into public.chowki_officers (chowki_id, full_name, designation, phone, pno, display_order)
select id, o.full_name, o.designation, o.phone, o.pno, o.ord
from public.chowkis, (values
  ('उ0नि0 अशोक कुमार पाठक', 'चौकी प्रभारी', '9336109038', '980500481', 1),
  ('म0का0 कामना मिश्रा', 'चौकी प्रभारी सहायक', '9519622460', '192255048', 2)
) as o(full_name, designation, phone, pno, ord)
where chowkis.name = 'चौकी देवगाँव';

insert into public.beats (chowki_id, beat_number, si_name, si_phone, si_pno, staff_name, staff_phone, link_officer_name, link_officer_phone, display_order)
select id, b.beat_number, b.si_name, b.si_phone, b.si_pno, b.staff_name, b.staff_phone, b.link_officer_name, b.link_officer_phone, b.ord
from public.chowkis, (values
  ('18', 'उ0नि0 अमित कुमार', '8318206835', '231080811', 'का0 रवि प्रताप यादव', '9795491407', 'हे0का0 उमेश यादव', '8756490600', 1),
  ('19', 'उ0नि0 अमित कुमार', '8318206835', '231080811', 'हे0का0 उमेश यादव', '8756490600', 'का0 रवि प्रताप यादव', '9795491407', 2),
  ('20', 'उ0नि0 अमित कुमार', '8318206835', '231080811', 'हे0का0 अजय कुमार', '8115664767', 'हे0का0 योगन्द्र पाल सिंह', '8948649501', 3),
  ('21', 'उ0नि0 अमित कुमार', '8318206835', '231080811', 'हे0का0 योगन्द्र पाल सिंह', '8948649501', 'हे0का0 नेबूलाल', '9455701977', 4),
  ('22', 'उ0नि0 अमित कुमार', '8318206835', '231080811', 'हे0का0 नेबूलाल', '9455701977', 'हे0का0 अजय कुमार', '8115664767', 5)
) as b(beat_number, si_name, si_phone, si_pno, staff_name, staff_phone, link_officer_name, link_officer_phone, ord)
where chowkis.name = 'चौकी देवगाँव';

-- महिला हेल्प डेस्क / जनशिकायत अधिकारी (कोई गाँव/बीट नहीं — multi-duty special row)
insert into public.chowki_officers (chowki_id, full_name, designation, phone, pno, display_order)
select id, o.full_name, o.designation, o.phone, o.pno, o.ord
from public.chowkis, (values
  ('म0का0 सपना सिंह', 'महिला हेल्प डेस्क', '9696375516', null, 1),
  ('म0का0 फरीन बानो', 'महिला हेल्प डेस्क', '7703016760', null, 2),
  ('उ0नि0 आकिल हुसैन', 'जनशिकायत अधिकारी', '9519189696', null, 3),
  ('हे0का0 नरेन्द्र देव मिश्र', 'जनशिकायत अधिकारी', '9452875034', null, 4)
) as o(full_name, designation, phone, pno, ord)
where chowkis.name = 'महिला हेल्प डेस्क / जनशिकायत अधिकारी';

-- थाना कुमारगंज — Karm Yogi पोर्टल पर पंजीकृत कार्मिक (karma yogi.pdf)
insert into public.thana_staff (pno, full_name, designation, phone, email, police_station, district, current_posting, display_order) values
('231064000', 'Ashish Singh', 'Sub Inspector', '8172968605', 'singhashish1009@gmail.com', 'Kumarganj', 'Ayodhya', null, 1),
('231090984', 'Pooja Raikwar', 'SICP', '7518857546', 'pooja.raykwar@gmail.com', 'Kumarganj', 'Ayodhya', null, 2),
('231080811', 'Amit Kumar', 'Sub Inspector', '8318206835', 'amitkumar141001@gmail.com', 'Kumarganj', 'Ayodhya', 'चौकी देवगाँव — बीट उ0नि0', 3),
('892738744', 'Ishwar Chandra Kaushal', 'Sub Inspector', '8957954197', 'ishwark291@gmai.com', 'Kumarganj', 'Ayodhya', 'चौकी चिलबिली — बीट उ0नि0', 4),
('231073561', 'Gaurav Kumar Pandey', 'Sub Inspector', '8765257553', 'gauravkpndey0011@gmail.com', 'Kumarganj', 'Ayodhya', 'हल्का नं0 01 — बीट उ0नि0', 5),
('234117013', 'Vimal Kumar Yadav', 'Sub Inspector', '9565706754', 'vimalyadav148@gmail.com', 'Kumarganj', 'Ayodhya', 'हल्का नं0 02 — हल्का प्रभारी', 6),
('231270438', 'Neeraj Chaurasia', 'Sub Inspector', '9555825523', 'neerajchaurasia282@gmail.com', 'Kumarganj', 'Ayodhya', null, 7),
('912320962', 'Bishun Ram', 'Sub Inspector', '6387227002', 'bishunram2021@gmail.com', 'Kumarganj', 'Ayodhya', null, 8),
('234111826', 'Shailendra Mani', 'Sub Inspector', '9695435038', 'shailendransi67@gmail.com', 'Kumarganj', 'Ayodhya', 'चौकी चिलबिली — चौकी प्रभारी', 9),
('231073428', 'Chitresh Singh', 'Sub Inspector', '7897600602', 'singhchitresh8799@gmail.com', 'Kumarganj', 'Ayodhya', null, 10),
('882430096', 'Om Prakash', 'Sub Inspector', '8299421675', 'siop646@gmail.com', 'Kumarganj', 'Ayodhya', null, 11),
('234112685', 'Aakil Husain', 'Sub Inspector', '9198521649', 'malikmohdaquil@gmail.com', 'Kumarganj', 'Ayodhya', 'हल्का नं0 02 — बीट उ0नि0', 12),
('892350519', 'Shiv Kumar', 'Sub Inspector', '8317030775', 'kumarshiv54833@gmail.com', 'Kumarganj', 'Ayodhya', 'थाना हाजा', 13),
('231044819', 'Yadunath Singh', 'Sub Inspector', '8317041684', 'singhyadunath680@gmail.com', 'Kumarganj', 'Ayodhya', null, 14);
