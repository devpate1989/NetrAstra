-- Extensions
create extension if not exists pgcrypto;

-- Shared role enum used across profiles and RLS policies
create type public.user_role as enum ('io', 'sho', 'admin');

-- Generic "touch updated_at" trigger reused by every table below
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
