-- Контрацепция: метод и схема, отметки «принята», напоминания в заданное время.

create table public.contraception (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  method text not null default 'none' check (method in ('none', 'pill', 'ring', 'patch')),
  -- Для таблеток: 21_7, 24_4, 28_0 (без перерыва), pop (мини-пили).
  regimen text check (regimen in ('21_7', '24_4', '28_0', 'pop')),
  -- Первый день текущей упаковки / день, когда вставлено кольцо / наклеен первый пластырь.
  start_date date,
  reminders_on boolean not null default false,
  reminder_time time not null default '21:00',
  -- Часовой пояс устройства (IANA), чтобы напоминать по местному времени.
  timezone text not null default 'Europe/Berlin' check (char_length(timezone) <= 64),
  updated_at timestamptz not null default now(),
  check (method = 'none' or start_date is not null),
  check (method <> 'pill' or regimen is not null)
);

create table public.contraception_log (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  taken_at timestamptz not null default now(),
  primary key (user_id, date)
);

alter table public.contraception enable row level security;
alter table public.contraception_log enable row level security;

create policy "own contraception" on public.contraception
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own contraception log" on public.contraception_log
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.contraception, public.contraception_log from anon, authenticated;
grant select, insert, update, delete on public.contraception, public.contraception_log to authenticated;

-- Партнёр видит контрацепцию только с отдельного разрешения (по умолчанию — нет).
alter table public.share_settings add column contraception boolean not null default false;

create or replace function public.get_partner_view(p_from date default current_date - 90, p_to date default current_date + 60)
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
  hormonal boolean;
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
  -- При гормональной контрацепции (кроме мини-пили) фаза и фертильное окно по календарю
  -- неприменимы — партнёру их не отдаём, чтобы не вводить в заблуждение.
  hormonal := exists (
    select 1 from public.contraception c
    where c.user_id = link.owner_id
      and (c.method in ('ring', 'patch') or (c.method = 'pill' and c.regimen <> 'pop'))
  );

  result := jsonb_build_object(
    'link_id', link.id,
    'owner_name', (select display_name from public.profiles where id = link.owner_id),
    'settings', jsonb_build_object(
      'periods', s.periods, 'prediction', s.prediction, 'fertility', s.fertility,
      'mood', s.mood, 'daily_status', s.daily_status, 'symptoms', s.symptoms, 'libido', s.libido,
      'contraception', s.contraception
    )
  );

  if s.prediction and pred.user_id is not null and not hormonal then
    -- Опорные даты: из них приложение партнёра само считает день цикла и фазу на сегодня,
    -- даже если владелица давно не открывала приложение.
    result := result || jsonb_build_object('prediction', jsonb_build_object(
      'computed_for', pred.computed_for,
      'last_period_start', pred.last_period_start,
      'cycle_length', pred.cycle_length,
      'period_length', pred.period_length,
      'next_period_date', pred.next_period_date,
      'next_period_earliest', pred.next_period_earliest,
      'next_period_latest', pred.next_period_latest
    ));
    seen := array_append(seen, 'prediction');
  end if;

  if s.fertility and pred.user_id is not null and not hormonal then
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

  -- Контрацепция: только метод, схема, начало упаковки и отметка «принята сегодня».
  if s.contraception then
    result := result || jsonb_build_object('contraception', (
      select jsonb_build_object(
        'method', c.method, 'regimen', c.regimen, 'start_date', c.start_date,
        'taken_dates', coalesce((
          select jsonb_agg(l.date order by l.date) from public.contraception_log l
          where l.user_id = link.owner_id and l.date between current_date - 7 and current_date + 1
        ), '[]'::jsonb)
      )
      from public.contraception c where c.user_id = link.owner_id and c.method <> 'none'
    ));
    seen := array_append(seen, 'contraception');
  end if;

  if s.daily_status then
    result := result || jsonb_build_object('daily_status', coalesce((
      select jsonb_agg(
        jsonb_build_object('date', d.date, 'energy', d.energy, 'mood', d.mood, 'needs', d.needs)
        -- Либидо — отдельное разрешение.
        || case when s.libido then jsonb_build_object('libido', d.libido) else '{}'::jsonb end
        order by d.date)
      from public.daily_status d
      where d.user_id = link.owner_id and d.date between p_from and p_to
    ), '[]'::jsonb));
    seen := array_append(seen, 'daily_status');
    if s.libido then seen := array_append(seen, 'libido'); end if;
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
