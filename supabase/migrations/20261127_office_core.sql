-- Applied to the Supabase project "deskhive-office" (see ai-office/js/config.js).
-- Every saved document of the office: one row per (collection, id).
-- Private collections live under data/users/<uid>/...; the optional shared team board is collection 'team', one row per user.
create table public.docs (
  col text not null,
  id text not null,
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (col, id),
  constraint docs_size check (pg_column_size(data) < 300000)
);
create index docs_owner_idx on public.docs (owner);
alter table public.docs enable row level security;
create policy docs_select on public.docs for select to authenticated
  using (starts_with(col, 'data/users/' || (select auth.uid())::text || '/') or col = 'team');
create policy docs_insert on public.docs for insert to authenticated
  with check (owner = (select auth.uid()) and (starts_with(col, 'data/users/' || (select auth.uid())::text || '/') or (col = 'team' and id = (select auth.uid())::text)));
create policy docs_update on public.docs for update to authenticated
  using (owner = (select auth.uid()))
  with check (owner = (select auth.uid()) and (starts_with(col, 'data/users/' || (select auth.uid())::text || '/') or (col = 'team' and id = (select auth.uid())::text)));
create policy docs_delete on public.docs for delete to authenticated using (owner = (select auth.uid()));

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '' check (char_length(name) <= 60),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy profiles_select on public.profiles for select to authenticated using (true);
create policy profiles_update on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, name) values (new.id, left(coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)), 60));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create table public.api_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null default current_date,
  requests int not null default 0,
  primary key (user_id, day)
);
alter table public.api_usage enable row level security;
create policy api_usage_select on public.api_usage for select to authenticated using (user_id = (select auth.uid()));
create function public.bump_usage(p_user uuid, p_cap int) returns boolean language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  insert into public.api_usage (user_id, day, requests) values (p_user, current_date, 1)
  on conflict (user_id, day) do update set requests = public.api_usage.requests + 1
  returning requests into n;
  return n <= p_cap;
end $$;
revoke all on function public.bump_usage(uuid, int) from public, anon, authenticated;
grant execute on function public.bump_usage(uuid, int) to service_role;
revoke all on function public.handle_new_user() from public, anon, authenticated;
