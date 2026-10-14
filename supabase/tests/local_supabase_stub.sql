-- Минимальная имитация Supabase для проверки миграций на обычном Postgres
-- (без Docker и Supabase CLI). На настоящем Supabase этот файл не нужен.
create schema if not exists auth;
create schema if not exists extensions;
create table if not exists auth.users (id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
grant usage on schema public, auth, extensions to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
-- Имитируем худший случай — «Automatically expose new tables» включено:
-- миграция должна сама забрать лишние права и выдать только нужные.
alter default privileges in schema public grant all on tables to authenticated, anon;
alter default privileges in schema public grant all on sequences to authenticated, anon;
