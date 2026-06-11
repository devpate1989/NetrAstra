-- Document Intelligence Engine (Phase 4/5/6): AI legal analysis + BNS/BNSS/BSA
-- section reference mapping.
--
-- legal_analyses stores Claude's "Quick" or "Deep Research" analysis of either
-- pasted text or a previously-scanned document's OCR text (Phase 2/3). RLS is
-- owner-only, mirroring scanned_documents.
--
-- bns_section_mappings is a curated, read-only reference table mapping the
-- repealed IPC / CrPC / Indian Evidence Act sections to their Bharatiya Nyaya
-- Sanhita (BNS) / Bharatiya Nagarik Suraksha Sanhita (BNSS) / Bharatiya Sakshya
-- Adhiniyam (BSA) equivalents (effective 1 July 2024). It covers the offences
-- and procedures most relevant to police inquiry work, not the full criminal
-- code — treat it as a starting reference, not a substitute for the bare act.

create table public.legal_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  source_document_id uuid references public.scanned_documents (id) on delete set null,
  mode text not null check (mode in ('quick', 'deep')),
  status text not null default 'processing' check (status in ('processing', 'completed', 'failed')),
  input_text text not null,
  case_type text,
  summary text,
  applicable_sections jsonb,
  key_facts jsonb,
  recommended_actions jsonb,
  detailed_analysis jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index legal_analyses_user_id_idx on public.legal_analyses (user_id, created_at desc);

create trigger set_legal_analyses_updated_at
  before update on public.legal_analyses
  for each row execute function public.set_updated_at();

alter table public.legal_analyses enable row level security;

create policy "Users manage their own legal analyses"
  on public.legal_analyses for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Curated IPC/CrPC/Evidence Act -> BNS/BNSS/BSA reference table.
create table public.bns_section_mappings (
  id uuid primary key default gen_random_uuid(),
  sort_order int not null,
  category text not null,
  old_act text not null,
  old_section text not null,
  new_act text not null,
  new_section text not null,
  title text not null,
  created_at timestamptz not null default now()
);

create index bns_section_mappings_sort_idx on public.bns_section_mappings (sort_order);
create index bns_section_mappings_old_section_idx on public.bns_section_mappings (old_section);
create index bns_section_mappings_new_section_idx on public.bns_section_mappings (new_section);

alter table public.bns_section_mappings enable row level security;

create policy "Authenticated users can read BNS section mappings"
  on public.bns_section_mappings for select
  to authenticated
  using (true);

insert into public.bns_section_mappings (sort_order, category, old_act, old_section, new_act, new_section, title) values
-- Offences Against the Body
(1,  'Offences Against the Body', 'IPC', '299',   'BNS', '100', 'Culpable homicide'),
(2,  'Offences Against the Body', 'IPC', '300',   'BNS', '101', 'Murder'),
(3,  'Offences Against the Body', 'IPC', '302',   'BNS', '103', 'Punishment for murder'),
(4,  'Offences Against the Body', 'IPC', '304',   'BNS', '105', 'Culpable homicide not amounting to murder'),
(5,  'Offences Against the Body', 'IPC', '304A',  'BNS', '106', 'Causing death by negligence'),
(6,  'Offences Against the Body', 'IPC', '306',   'BNS', '108', 'Abetment of suicide'),
(7,  'Offences Against the Body', 'IPC', '307',   'BNS', '109', 'Attempt to murder'),
(8,  'Offences Against the Body', 'IPC', '308',   'BNS', '110', 'Attempt to commit culpable homicide'),
(9,  'Offences Against the Body', 'IPC', '309',   'BNS', '226', 'Attempt to commit suicide'),
(10, 'Offences Against the Body', 'IPC', '319',   'BNS', '114', 'Hurt'),
(11, 'Offences Against the Body', 'IPC', '320',   'BNS', '116', 'Grievous hurt'),
(12, 'Offences Against the Body', 'IPC', '323',   'BNS', '115', 'Punishment for voluntarily causing hurt'),
(13, 'Offences Against the Body', 'IPC', '324',   'BNS', '118', 'Voluntarily causing hurt by dangerous weapons or means'),
(14, 'Offences Against the Body', 'IPC', '325',   'BNS', '117', 'Punishment for voluntarily causing grievous hurt'),
(15, 'Offences Against the Body', 'IPC', '326',   'BNS', '118', 'Voluntarily causing grievous hurt by dangerous weapons or means'),
(16, 'Offences Against the Body', 'IPC', '326A',  'BNS', '124', 'Voluntarily causing grievous hurt by acid attack'),
(17, 'Offences Against the Body', 'IPC', '326B',  'BNS', '124', 'Voluntarily throwing or attempting to throw acid'),
(18, 'Offences Against the Body', 'IPC', '339',   'BNS', '126', 'Wrongful restraint'),
(19, 'Offences Against the Body', 'IPC', '340',   'BNS', '127', 'Wrongful confinement'),
(20, 'Offences Against the Body', 'IPC', '351',   'BNS', '130', 'Assault'),
(21, 'Offences Against the Body', 'IPC', '352',   'BNS', '131', 'Punishment for assault or criminal force'),

-- Offences Against Women & Children
(22, 'Offences Against Women & Children', 'IPC', '375',  'BNS', '63',  'Rape'),
(23, 'Offences Against Women & Children', 'IPC', '376',  'BNS', '64',  'Punishment for rape'),
(24, 'Offences Against Women & Children', 'IPC', '354',  'BNS', '74',  'Assault or criminal force to woman with intent to outrage her modesty'),
(25, 'Offences Against Women & Children', 'IPC', '354A', 'BNS', '75',  'Sexual harassment'),
(26, 'Offences Against Women & Children', 'IPC', '354B', 'BNS', '76',  'Assault with intent to disrobe a woman'),
(27, 'Offences Against Women & Children', 'IPC', '354C', 'BNS', '77',  'Voyeurism'),
(28, 'Offences Against Women & Children', 'IPC', '354D', 'BNS', '78',  'Stalking'),
(29, 'Offences Against Women & Children', 'IPC', '509',  'BNS', '79',  'Word, gesture or act intended to insult the modesty of a woman'),
(30, 'Offences Against Women & Children', 'IPC', '304B', 'BNS', '80',  'Dowry death'),
(31, 'Offences Against Women & Children', 'IPC', '498A', 'BNS', '85',  'Cruelty by husband or relatives of husband'),
(32, 'Offences Against Women & Children', 'IPC', '494',  'BNS', '82',  'Marrying again during lifetime of husband or wife (bigamy)'),
(33, 'Offences Against Women & Children', 'IPC', '359',  'BNS', '137', 'Kidnapping'),
(34, 'Offences Against Women & Children', 'IPC', '363',  'BNS', '137', 'Punishment for kidnapping'),
(35, 'Offences Against Women & Children', 'IPC', '366',  'BNS', '140', 'Kidnapping or abducting a woman to compel her marriage'),
(36, 'Offences Against Women & Children', 'IPC', '370',  'BNS', '143', 'Trafficking of persons'),
(37, 'Offences Against Women & Children', 'IPC', '372',  'BNS', '145', 'Selling a child for purposes of prostitution etc.'),

-- Offences Against Property
(38, 'Offences Against Property', 'IPC', '378',  'BNS', '303', 'Theft'),
(39, 'Offences Against Property', 'IPC', '379',  'BNS', '303', 'Punishment for theft'),
(40, 'Offences Against Property', 'IPC', '380',  'BNS', '305', 'Theft in a building, tent or vessel'),
(41, 'Offences Against Property', 'IPC', '381',  'BNS', '306', 'Theft by clerk or servant of property in possession of master'),
(42, 'Offences Against Property', 'IPC', '383',  'BNS', '308', 'Extortion'),
(43, 'Offences Against Property', 'IPC', '384',  'BNS', '308', 'Punishment for extortion'),
(44, 'Offences Against Property', 'IPC', '390',  'BNS', '309', 'Robbery'),
(45, 'Offences Against Property', 'IPC', '392',  'BNS', '309', 'Punishment for robbery'),
(46, 'Offences Against Property', 'IPC', '395',  'BNS', '310', 'Punishment for dacoity'),
(47, 'Offences Against Property', 'IPC', '397',  'BNS', '309', 'Robbery or dacoity with attempt to cause death or grievous hurt'),
(48, 'Offences Against Property', 'IPC', '403',  'BNS', '314', 'Dishonest misappropriation of property'),
(49, 'Offences Against Property', 'IPC', '405',  'BNS', '316', 'Criminal breach of trust'),
(50, 'Offences Against Property', 'IPC', '406',  'BNS', '316', 'Punishment for criminal breach of trust'),
(51, 'Offences Against Property', 'IPC', '409',  'BNS', '316', 'Criminal breach of trust by public servant, banker, etc.'),
(52, 'Offences Against Property', 'IPC', '411',  'BNS', '317', 'Dishonestly receiving stolen property'),
(53, 'Offences Against Property', 'IPC', '415',  'BNS', '318', 'Cheating'),
(54, 'Offences Against Property', 'IPC', '420',  'BNS', '318', 'Cheating and dishonestly inducing delivery of property'),
(55, 'Offences Against Property', 'IPC', '425',  'BNS', '324', 'Mischief'),
(56, 'Offences Against Property', 'IPC', '426',  'BNS', '324', 'Punishment for mischief'),
(57, 'Offences Against Property', 'IPC', '441',  'BNS', '329', 'Criminal trespass'),
(58, 'Offences Against Property', 'IPC', '447',  'BNS', '329', 'Punishment for criminal trespass'),
(59, 'Offences Against Property', 'IPC', '448',  'BNS', '329', 'Punishment for house-trespass'),
(60, 'Offences Against Property', 'IPC', '454',  'BNS', '331', 'House-trespass to commit an offence punishable with imprisonment'),
(61, 'Offences Against Property', 'IPC', '457',  'BNS', '331', 'House-breaking by night to commit an offence'),

-- Forgery & Fraudulent Documents
(62, 'Forgery & Fraudulent Documents', 'IPC', '463',  'BNS', '336', 'Forgery'),
(63, 'Forgery & Fraudulent Documents', 'IPC', '465',  'BNS', '336', 'Punishment for forgery'),
(64, 'Forgery & Fraudulent Documents', 'IPC', '467',  'BNS', '338', 'Forgery of valuable security, will or authority to adopt'),
(65, 'Forgery & Fraudulent Documents', 'IPC', '468',  'BNS', '336', 'Forgery for purpose of cheating'),
(66, 'Forgery & Fraudulent Documents', 'IPC', '471',  'BNS', '340', 'Using as genuine a forged document or electronic record'),
(67, 'Forgery & Fraudulent Documents', 'IPC', '489A', 'BNS', '178', 'Counterfeiting currency notes or bank notes'),

-- Criminal Intimidation, Insult & Defamation
(68, 'Criminal Intimidation, Insult & Defamation', 'IPC', '503', 'BNS', '351', 'Criminal intimidation'),
(69, 'Criminal Intimidation, Insult & Defamation', 'IPC', '506', 'BNS', '351', 'Punishment for criminal intimidation'),
(70, 'Criminal Intimidation, Insult & Defamation', 'IPC', '504', 'BNS', '352', 'Intentional insult with intent to provoke breach of the peace'),
(71, 'Criminal Intimidation, Insult & Defamation', 'IPC', '499', 'BNS', '356', 'Defamation'),
(72, 'Criminal Intimidation, Insult & Defamation', 'IPC', '500', 'BNS', '356', 'Punishment for defamation'),

-- Offences Against Public Tranquility
(73, 'Offences Against Public Tranquility', 'IPC', '141',  'BNS', '189', 'Unlawful assembly'),
(74, 'Offences Against Public Tranquility', 'IPC', '146',  'BNS', '191', 'Rioting'),
(75, 'Offences Against Public Tranquility', 'IPC', '147',  'BNS', '191', 'Punishment for rioting'),
(76, 'Offences Against Public Tranquility', 'IPC', '148',  'BNS', '191', 'Rioting armed with a deadly weapon'),
(77, 'Offences Against Public Tranquility', 'IPC', '149',  'BNS', '190', 'Every member of unlawful assembly guilty of offence committed in prosecution of common object'),
(78, 'Offences Against Public Tranquility', 'IPC', '153A', 'BNS', '196', 'Promoting enmity between groups on grounds of religion, race, etc.'),
(79, 'Offences Against Public Tranquility', 'IPC', '159',  'BNS', '194', 'Affray'),

-- General Provisions (Conspiracy, Abetment, Attempt)
(80, 'General Provisions', 'IPC', '34',   'BNS', '3',   'Acts done by several persons in furtherance of common intention'),
(81, 'General Provisions', 'IPC', '109',  'BNS', '107', 'Punishment of abetment if act abetted is committed'),
(82, 'General Provisions', 'IPC', '120A', 'BNS', '61',  'Criminal conspiracy'),
(83, 'General Provisions', 'IPC', '120B', 'BNS', '61',  'Punishment for criminal conspiracy'),
(84, 'General Provisions', 'IPC', '511',  'BNS', '62',  'Punishment for attempting to commit offences'),

-- Offences Against the State
(85, 'Offences Against the State', 'IPC', '124A', 'BNS', '152', 'Acts endangering sovereignty, unity and integrity of India'),
(86, 'Offences Against the State', 'IPC', '121',  'BNS', '147', 'Waging war against the Government of India'),

-- Negligent Acts Affecting Life & Safety
(87, 'Negligent Acts Affecting Life & Safety', 'IPC', '279', 'BNS', '281', 'Rash driving or riding on a public way'),
(88, 'Negligent Acts Affecting Life & Safety', 'IPC', '336', 'BNS', '125', 'Act endangering life or personal safety of others'),
(89, 'Negligent Acts Affecting Life & Safety', 'IPC', '337', 'BNS', '125', 'Causing hurt by act endangering life or personal safety of others'),
(90, 'Negligent Acts Affecting Life & Safety', 'IPC', '338', 'BNS', '125', 'Causing grievous hurt by act endangering life or personal safety of others'),
(91, 'Negligent Acts Affecting Life & Safety', 'IPC', '283', 'BNS', '285', 'Danger or obstruction in a public way or line of navigation'),

-- Investigation & Procedure (BNSS)
(92,  'Investigation & Procedure (BNSS)', 'CrPC', '154',  'BNSS', '173', 'Information in cognizable cases (FIR)'),
(93,  'Investigation & Procedure (BNSS)', 'CrPC', '156',  'BNSS', '175', 'Police officer''s power to investigate a cognizable case'),
(94,  'Investigation & Procedure (BNSS)', 'CrPC', '161',  'BNSS', '180', 'Examination of witnesses by police'),
(95,  'Investigation & Procedure (BNSS)', 'CrPC', '164',  'BNSS', '183', 'Recording of confessions and statements by Magistrate'),
(96,  'Investigation & Procedure (BNSS)', 'CrPC', '41',   'BNSS', '35',  'When police may arrest without warrant'),
(97,  'Investigation & Procedure (BNSS)', 'CrPC', '41A',  'BNSS', '35',  'Notice of appearance before police officer'),
(98,  'Investigation & Procedure (BNSS)', 'CrPC', '173',  'BNSS', '193', 'Report of police officer on completion of investigation (chargesheet)'),
(99,  'Investigation & Procedure (BNSS)', 'CrPC', '125',  'BNSS', '144', 'Order for maintenance of wives, children and parents'),
(100, 'Investigation & Procedure (BNSS)', 'CrPC', '144',  'BNSS', '163', 'Power to issue order in urgent cases of nuisance or apprehended danger'),
(101, 'Investigation & Procedure (BNSS)', 'CrPC', '107',  'BNSS', '126', 'Security for keeping the peace in cases other than breach of peace at public meetings'),
(102, 'Investigation & Procedure (BNSS)', 'CrPC', '200',  'BNSS', '223', 'Examination of complainant'),
(103, 'Investigation & Procedure (BNSS)', 'CrPC', '190',  'BNSS', '210', 'Cognizance of offences by Magistrate'),
(104, 'Investigation & Procedure (BNSS)', 'CrPC', '482',  'BNSS', '528', 'Saving of inherent powers of the High Court'),

-- Evidence (BSA)
(105, 'Evidence (BSA)', 'Evidence Act', '24',    'BSA', '22',  'Confession caused by inducement, threat or promise, when irrelevant'),
(106, 'Evidence (BSA)', 'Evidence Act', '25',    'BSA', '23',  'Confession to police officer not provable'),
(107, 'Evidence (BSA)', 'Evidence Act', '27',    'BSA', '23',  'Information received from accused while in police custody'),
(108, 'Evidence (BSA)', 'Evidence Act', '32',    'BSA', '26',  'Statements by persons who cannot be called as witnesses (e.g. dying declaration)'),
(109, 'Evidence (BSA)', 'Evidence Act', '45',    'BSA', '39',  'Opinion of experts'),
(110, 'Evidence (BSA)', 'Evidence Act', '65B',   'BSA', '63',  'Admissibility of electronic records'),
(111, 'Evidence (BSA)', 'Evidence Act', '113A',  'BSA', '117', 'Presumption as to abetment of suicide by a married woman'),
(112, 'Evidence (BSA)', 'Evidence Act', '113B',  'BSA', '118', 'Presumption as to dowry death'),
(113, 'Evidence (BSA)', 'Evidence Act', '114',   'BSA', '119', 'Court may presume existence of certain facts');
