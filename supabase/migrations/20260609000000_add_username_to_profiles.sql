-- Replace email-based identity with username for officer login.
-- The auth.users email becomes an internal implementation detail
-- (stored as {username}@{station}.internal) — never shown in the UI.

alter table public.profiles
  add column if not exists username text,
  alter column email drop not null;

-- Back-fill existing rows: derive username from the part before @ in email
update public.profiles
set username = split_part(email, '@', 1)
where username is null and email is not null;

-- For any remaining null usernames (edge case), fall back to id prefix
update public.profiles
set username = 'user_' || left(id::text, 8)
where username is null;

alter table public.profiles
  alter column username set not null;

create unique index if not exists profiles_username_idx on public.profiles (username);
