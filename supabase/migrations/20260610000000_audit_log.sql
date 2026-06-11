-- Audit log for accountability on sensitive admin and report actions (Phase 10).
-- Written exclusively by the Express service-role client (audit.service.ts) —
-- no insert policy is needed since the service-role key bypasses RLS.
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id) on delete set null,
  actor_username text,
  action text not null,
  target_table text,
  target_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_created_at_idx on public.audit_log (created_at desc);
create index audit_log_actor_id_idx on public.audit_log (actor_id);

alter table public.audit_log enable row level security;

-- Only admins can read the audit log (the Express API also enforces this).
create policy "Admins can read audit log"
  on public.audit_log for select
  to authenticated
  using (public.current_user_role() = 'admin');
