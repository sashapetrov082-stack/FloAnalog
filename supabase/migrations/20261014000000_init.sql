-- Начальная схема: данные владелицы, режим пары, правила доступа (RLS).
--
-- Главное правило: партнёр никогда не читает таблицы владелицы напрямую.
-- Всё, что видит партнёр, отдаёт функция public.get_partner_view(), которая
-- учитывает share_settings и пишет запись в access_log.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Типы
-- ---------------------------------------------------------------------------

create type public.tracking_mode as enum ('cycle', 'conception', 'pregnancy');
create type public.flow_level as enum ('spotting', 'light', 'medium', 'heavy');
create type public.link_status as enum ('pending', 'active', 'revoked');
create type public.note_kind as enum ('note', 'request');

-- ---------------------------------------------------------------------------
-- Данные владелицы
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 50),
  birth_date date,
  mode public.tracking_mode not null default 'cycle',
  avg_cycle_length smallint not null default 28 check (avg_cycle_length between 15 and 60),
  avg_period_length smallint not null default 5 check (avg_period_length between 1 and 14),
  theme text not null default 'system' check (theme in ('system', 'light', 'dark')),
  health_data_consent_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  start_date date not null,
  end_date date,
  created_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date),
  unique (user_id, start_date)
);

create table public.day_logs (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  flow public.flow_level,
  symptoms text[] not null default '{}',
  moods text[] not null default '{}',
  temperature numeric(4, 2) check (temperature between 34 and 43),
  ovulation_test text check (ovulation_test in ('negative', 'positive', 'peak')),
  note text check (char_length(note) <= 2000),
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);

create table public.daily_status (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  energy smallint check (energy between 1 and 5),
  mood text check (char_length(mood) <= 30),
  needs text[] not null default '{}',
  libido smallint check (libido between 1 and 5),
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);

-- Последний прогноз, посчитанный клиентом владелицы (src/lib/cycle/predict.ts).
-- Нужен, чтобы партнёр видел фазу и прогноз, не получая доступа к истории месячных.
create table public.predictions (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  computed_for date not null,
  cycle_day smallint not null,
  phase text not null check (phase in ('menstruation', 'follicular', 'fertile', 'ovulation', 'luteal')),
  next_period_date date not null,
  next_period_earliest date not null,
  next_period_latest date not null,
  ovulation_date date not null,
  fertile_start date not null,
  fertile_end date not null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Режим пары
-- ---------------------------------------------------------------------------

-- Коды приглашения. Хранится только хэш; читает и пишет только сервер (функции ниже).
create table public.invite_codes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  code_hash bytea not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- Попытки ввода кода — для лимита перебора.
create table public.invite_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  succeeded boolean not null,
  attempted_at timestamptz not null default now()
);
create index invite_attempts_user_time on public.invite_attempts (user_id, attempted_at);

create table public.partner_links (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  partner_id uuid not null references auth.users (id) on delete cascade,
  status public.link_status not null default 'pending',
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  revoked_at timestamptz,
  check (owner_id <> partner_id)
);
-- В MVP — один партнёр одновременно (ожидающий или активный).
create unique index partner_links_one_open_per_owner
  on public.partner_links (owner_id) where status in ('pending', 'active');

create table public.share_settings (
  link_id uuid primary key references public.partner_links (id) on delete cascade,
  periods boolean not null default false,
  prediction boolean not null default true,
  fertility boolean not null default false,
  mood boolean not null default false,
  daily_status boolean not null default false,
  symptoms boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.shared_notes (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.partner_links (id) on delete cascade,
  author_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  kind public.note_kind not null default 'note',
  body text not null check (char_length(body) between 1 and 500),
  done_at timestamptz,
  created_at timestamptz not null default now()
);
create index shared_notes_link_date on public.shared_notes (link_id, date);

create table public.access_log (
  id bigint generated always as identity primary key,
  link_id uuid not null references public.partner_links (id) on delete cascade,
  viewer_id uuid not null references auth.users (id) on delete cascade,
  what text[] not null,
  viewed_at timestamptz not null default now()
);
create index access_log_link_time on public.access_log (link_id, viewed_at desc);

-- ---------------------------------------------------------------------------
-- Вспомогательные функции
-- ---------------------------------------------------------------------------

-- Активная связь, где текущий пользователь — участник.
create function public.is_link_member(p_link_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.partner_links l
    where l.id = p_link_id
      and l.status = 'active'
      and auth.uid() in (l.owner_id, l.partner_id)
  );
$$;

create function public.is_adult(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.birth_date <= (current_date - interval '18 years')::date
     from public.profiles p where p.id = p_user_id),
    false
  );
$$;

-- Профиль создаётся вместе с пользователем.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- RLS: данные владелицы доступны только ей самой
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.periods enable row level security;
alter table public.day_logs enable row level security;
alter table public.daily_status enable row level security;
alter table public.predictions enable row level security;
alter table public.invite_codes enable row level security;
alter table public.invite_attempts enable row level security;
alter table public.partner_links enable row level security;
alter table public.share_settings enable row level security;
alter table public.shared_notes enable row level security;
alter table public.access_log enable row level security;

create policy "own profile" on public.profiles
  for all to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy "own periods" on public.periods
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own day logs" on public.day_logs
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own daily status" on public.daily_status
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own prediction" on public.predictions
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- invite_codes и invite_attempts: политик нет, значит, клиенту недоступны вовсе.

-- Связи: оба участника видят; менять — только через функции.
create policy "link members read" on public.partner_links
  for select to authenticated
  using (auth.uid() in (owner_id, partner_id));

-- Настройки видимости: оба видят, меняет только владелица.
create policy "link members read settings" on public.share_settings
  for select to authenticated
  using (exists (
    select 1 from public.partner_links l
    where l.id = link_id and auth.uid() in (l.owner_id, l.partner_id)
  ));

create policy "owner updates settings" on public.share_settings
  for update to authenticated
  using (exists (
    select 1 from public.partner_links l
    where l.id = link_id and l.owner_id = auth.uid() and l.status = 'active'
  ))
  with check (exists (
    select 1 from public.partner_links l
    where l.id = link_id and l.owner_id = auth.uid() and l.status = 'active'
  ));

-- Общие заметки: только участники активной связи.
create policy "members read notes" on public.shared_notes
  for select to authenticated
  using (public.is_link_member(link_id));

create policy "members add notes" on public.shared_notes
  for insert to authenticated
  with check (author_id = auth.uid() and public.is_link_member(link_id));

create policy "members update notes" on public.shared_notes
  for update to authenticated
  using (public.is_link_member(link_id))
  with check (public.is_link_member(link_id));

create policy "authors delete notes" on public.shared_notes
  for delete to authenticated
  using (author_id = auth.uid() and public.is_link_member(link_id));

-- Чужую заметку можно только отметить «Сделано», но не переписать.
create function public.guard_shared_note_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.link_id <> old.link_id or new.author_id <> old.author_id
     or new.kind <> old.kind or new.created_at <> old.created_at then
    raise exception 'Эти поля заметки менять нельзя';
  end if;
  if old.author_id <> auth.uid() and (new.body <> old.body or new.date <> old.date) then
    raise exception 'Чужую заметку можно только отметить выполненной';
  end if;
  return new;
end;
$$;

create trigger shared_notes_guard
  before update on public.shared_notes
  for each row execute function public.guard_shared_note_update();

-- Журнал просмотров видит только владелица.
create policy "owner reads access log" on public.access_log
  for select to authenticated
  using (exists (
    select 1 from public.partner_links l
    where l.id = link_id and l.owner_id = auth.uid()
  ));

-- ---------------------------------------------------------------------------
-- Привязка партнёра
-- ---------------------------------------------------------------------------

-- Новый одноразовый код на 24 часа. Возвращается один раз, в базе — только хэш.
create function public.create_invite_code()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- без 0/O, 1/I
  raw bytea := extensions.gen_random_bytes(8);
  code text := '';
  i int;
begin
  if auth.uid() is null then
    raise exception 'Нужно войти в аккаунт';
  end if;
  if not public.is_adult(auth.uid()) then
    raise exception 'Режим пары доступен только с 18 лет';
  end if;
  if exists (select 1 from public.partner_links
             where owner_id = auth.uid() and status in ('pending', 'active')) then
    raise exception 'Партнёр уже подключён';
  end if;

  for i in 0..7 loop
    code := code || substr(alphabet, (get_byte(raw, i) % 32) + 1, 1);
  end loop;

  -- Старые неиспользованные коды владелицы гасим: действует только последний.
  update public.invite_codes set used_at = now()
  where owner_id = auth.uid() and used_at is null;

  insert into public.invite_codes (owner_id, code_hash, expires_at)
  values (auth.uid(), extensions.digest(code, 'sha256'), now() + interval '24 hours');

  return code;
end;
$$;

-- Партнёр вводит код: создаётся ожидающая связь, владелица должна её подтвердить.
create function public.redeem_invite_code(p_code text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  invite public.invite_codes%rowtype;
  new_link uuid;
begin
  if me is null then
    raise exception 'Нужно войти в аккаунт';
  end if;
  if (select count(*) from public.invite_attempts
      where user_id = me and not succeeded
        and attempted_at > now() - interval '1 hour') >= 5 then
    raise exception 'Слишком много попыток, попробуйте через час';
  end if;
  if not public.is_adult(me) then
    raise exception 'Режим пары доступен только с 18 лет';
  end if;

  select * into invite from public.invite_codes
  where code_hash = extensions.digest(upper(trim(p_code)), 'sha256')
    and used_at is null
    and expires_at > now()
  for update;

  if not found or invite.owner_id = me then
    insert into public.invite_attempts (user_id, succeeded) values (me, false);
    -- Возвращаем ошибку без исключения, чтобы попытка сохранилась.
    return null;
  end if;

  update public.invite_codes set used_at = now() where id = invite.id;
  insert into public.invite_attempts (user_id, succeeded) values (me, true);

  insert into public.partner_links (owner_id, partner_id)
  values (invite.owner_id, me)
  returning id into new_link;

  return new_link;
end;
$$;

-- Владелица разрешает подключение.
create function public.approve_partner_link(p_link_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.partner_links
  set status = 'active', approved_at = now()
  where id = p_link_id and owner_id = auth.uid() and status = 'pending';
  if not found then
    raise exception 'Запрос на подключение не найден';
  end if;
  insert into public.share_settings (link_id) values (p_link_id);
end;
$$;

-- Отключение — мгновенно, любым из участников, без объяснений.
create function public.revoke_partner_link(p_link_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.partner_links
  set status = 'revoked', revoked_at = now()
  where id = p_link_id
    and auth.uid() in (owner_id, partner_id)
    and status in ('pending', 'active');
  if not found then
    raise exception 'Связь не найдена';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Что видит партнёр
-- ---------------------------------------------------------------------------

-- Данные владелицы для текущего партнёра с учётом переключателей видимости.
-- Возвращает null, если активной связи нет.
create function public.get_partner_view(p_from date default current_date - 90, p_to date default current_date + 60)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  link public.partner_links%rowtype;
  s public.share_settings%rowtype;
  pred public.predictions%rowtype;
  result jsonb;
  seen text[] := '{}';
begin
  if p_to - p_from > 400 then
    raise exception 'Слишком большой период';
  end if;

  select * into link from public.partner_links
  where partner_id = auth.uid() and status = 'active'
  limit 1;
  if not found then
    return null;
  end if;
  select * into s from public.share_settings where link_id = link.id;
  select * into pred from public.predictions where user_id = link.owner_id;

  result := jsonb_build_object(
    'link_id', link.id,
    'owner_name', (select display_name from public.profiles where id = link.owner_id),
    'settings', jsonb_build_object(
      'periods', s.periods, 'prediction', s.prediction, 'fertility', s.fertility,
      'mood', s.mood, 'daily_status', s.daily_status, 'symptoms', s.symptoms
    )
  );

  if s.prediction and pred.user_id is not null then
    result := result || jsonb_build_object('prediction', jsonb_build_object(
      'computed_for', pred.computed_for,
      'cycle_day', pred.cycle_day,
      -- Без доступа к фертильности фазы «фертильно» и «овуляция» не раскрываем.
      'phase', case when not s.fertility and pred.phase in ('fertile', 'ovulation')
                    then 'follicular' else pred.phase end,
      'next_period_earliest', pred.next_period_earliest,
      'next_period_latest', pred.next_period_latest
    ));
    seen := array_append(seen, 'prediction');
  end if;

  if s.fertility and pred.user_id is not null then
    result := result || jsonb_build_object('fertility', jsonb_build_object(
      'ovulation_date', pred.ovulation_date,
      'fertile_start', pred.fertile_start,
      'fertile_end', pred.fertile_end
    ));
    seen := array_append(seen, 'fertility');
  end if;

  if s.periods then
    result := result || jsonb_build_object('periods', coalesce((
      select jsonb_agg(jsonb_build_object('start', p.start_date, 'end', p.end_date) order by p.start_date)
      from public.periods p
      where p.user_id = link.owner_id and p.start_date between p_from and p_to
    ), '[]'::jsonb));
    seen := array_append(seen, 'periods');
  end if;

  if s.daily_status then
    result := result || jsonb_build_object('daily_status', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date', d.date, 'energy', d.energy, 'mood', d.mood, 'needs', d.needs, 'libido', d.libido
      ) order by d.date)
      from public.daily_status d
      where d.user_id = link.owner_id and d.date between p_from and p_to
    ), '[]'::jsonb));
    seen := array_append(seen, 'daily_status');
  end if;

  -- Из day_logs наружу уходят только настроение и симптомы — никогда заметки,
  -- температура или тесты.
  if s.mood or s.symptoms then
    result := result || jsonb_build_object('day_logs', coalesce((
      select jsonb_agg(
        jsonb_build_object('date', l.date)
        || case when s.mood then jsonb_build_object('moods', l.moods) else '{}'::jsonb end
        || case when s.symptoms then jsonb_build_object('symptoms', l.symptoms) else '{}'::jsonb end
        order by l.date)
      from public.day_logs l
      where l.user_id = link.owner_id and l.date between p_from and p_to
    ), '[]'::jsonb));
    if s.mood then seen := array_append(seen, 'mood'); end if;
    if s.symptoms then seen := array_append(seen, 'symptoms'); end if;
  end if;

  insert into public.access_log (link_id, viewer_id, what) values (link.id, auth.uid(), seen);
  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Права
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon;
revoke all on function public.is_link_member(uuid) from public, anon;
revoke all on function public.is_adult(uuid) from public, anon;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.create_invite_code() from public, anon;
revoke all on function public.redeem_invite_code(text) from public, anon;
revoke all on function public.approve_partner_link(uuid) from public, anon;
revoke all on function public.revoke_partner_link(uuid) from public, anon;
revoke all on function public.get_partner_view(date, date) from public, anon;

grant execute on function public.is_link_member(uuid) to authenticated;
grant execute on function public.create_invite_code() to authenticated;
grant execute on function public.redeem_invite_code(text) to authenticated;
grant execute on function public.approve_partner_link(uuid) to authenticated;
grant execute on function public.revoke_partner_link(uuid) to authenticated;
grant execute on function public.get_partner_view(date, date) to authenticated;
