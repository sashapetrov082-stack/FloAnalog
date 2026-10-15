-- Трекер привычек: привычки пользователя и отметки по дням. Только свои — партнёру не видны.
-- id привычки создаёт клиент (uuid), чтобы привычки работали и без интернета, и в гостевом режиме.

create table public.habits (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  emoji text check (char_length(emoji) <= 16),
  -- Цель: сколько дней в месяц.
  goal smallint not null default 31 check (goal between 1 and 31),
  position smallint not null default 0 check (position between 0 and 999),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.habit_checks (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  habit_id uuid not null references public.habits (id) on delete cascade,
  date date not null,
  primary key (habit_id, date)
);
create index habit_checks_user_date on public.habit_checks (user_id, date);

alter table public.habits enable row level security;
alter table public.habit_checks enable row level security;

create policy "own habits" on public.habits
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Отметить можно только свою привычку.
create policy "own habit checks" on public.habit_checks
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.habits h where h.id = habit_id and h.user_id = auth.uid())
  );

revoke all on public.habits, public.habit_checks from anon, authenticated;
grant select, insert, update, delete on public.habits, public.habit_checks to authenticated;
