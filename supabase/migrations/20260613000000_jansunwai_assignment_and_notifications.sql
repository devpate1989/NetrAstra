-- AI-driven चौकी/हल्का auto-assignment for Jan Sunwai applications (matches the
-- petition's incident location against `chowki_villages` and assigns the
-- relevant चौकी/हल्का प्रभारी's profile), plus the in-app + push notification
-- infrastructure used to alert that officer.

alter table public.jansunwai_applications
  add column assigned_chowki_id uuid references public.chowkis (id) on delete set null,
  add column assignment_source text check (assignment_source in ('manual', 'ai_chowki', 'ai_unmatched'));

alter table public.profiles
  add column expo_push_token text;

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  data jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

create policy "Users can read their own notifications"
  on public.notifications for select
  to authenticated
  using (user_id = auth.uid());

create policy "Users can mark their own notifications read"
  on public.notifications for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
