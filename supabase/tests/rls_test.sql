-- Проверки правил доступа. Запуск: scripts/test-db.sh
-- Каждая проверка падает с исключением, если правило нарушено.
\set ON_ERROR_STOP on

create or replace function pg_temp.login(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, false), set_config('role', 'authenticated', false);
$$;
create or replace function pg_temp.logout() returns void language sql as $$
  select set_config('role', 'postgres', false), set_config('request.jwt.claim.sub', '', false);
$$;

-- Владелица (O), партнёр (P), посторонний (X), подросток (T).
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-00000000000b'),
  ('00000000-0000-0000-0000-00000000000c'),
  ('00000000-0000-0000-0000-00000000000d');
update public.profiles set birth_date = '1995-01-01', display_name = 'Аня' where id = '00000000-0000-0000-0000-00000000000a';
update public.profiles set birth_date = '1994-01-01', display_name = 'Иван' where id = '00000000-0000-0000-0000-00000000000b';
update public.profiles set birth_date = '1990-01-01' where id = '00000000-0000-0000-0000-00000000000c';
update public.profiles set birth_date = current_date - interval '16 years' where id = '00000000-0000-0000-0000-00000000000d';

create temp table ctx (k text primary key, v text);
grant all on ctx to authenticated;

-- Владелица заполняет данные.
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
insert into public.periods (start_date, end_date) values ('2026-09-20', '2026-09-24');
insert into public.day_logs (date, symptoms, moods, note, temperature) values ('2026-10-01', '{headache}', '{calm}', 'секрет', 36.6);
insert into public.daily_status (date, energy, needs, libido) values ('2026-10-01', 2, '{care}', 3);
insert into public.predictions (computed_for, cycle_day, phase, next_period_date, next_period_earliest,
  next_period_latest, ovulation_date, fertile_start, fertile_end, last_period_start, cycle_length, period_length)
values ('2026-10-04', 15, 'ovulation', '2026-10-18', '2026-10-17', '2026-10-19', '2026-10-04', '2026-09-29', '2026-10-05',
  '2026-09-20', 28, 5);

do $$ begin
  -- 1. Подросток не может создать код.
  perform pg_temp.logout(); perform pg_temp.login('00000000-0000-0000-0000-00000000000d');
  begin perform public.create_invite_code(); raise exception 'FAIL 1';
  exception when others then if sqlerrm = 'FAIL 1' then raise; end if; end;
end $$;

select pg_temp.logout(); select pg_temp.login('00000000-0000-0000-0000-00000000000a');
insert into ctx values ('code', public.create_invite_code());

do $$ begin
  -- 2. Таблица кодов клиенту недоступна вовсе.
  begin perform count(*) from public.invite_codes; raise exception 'FAIL 2: invite_codes видны клиенту';
  exception when insufficient_privilege then null; end;
end $$;

-- 3. Код хранится только в виде хэша.
select pg_temp.logout();
do $$ begin
  if exists (select 1 from public.invite_codes where code_hash = convert_to((select v from ctx where k='code'), 'UTF8'))
  then raise exception 'FAIL 3: код хранится открытым'; end if;
end $$;

-- 4. Партнёр вводит код (в нижнем регистре и с пробелами) — связь ожидает подтверждения.
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
insert into ctx values ('link', public.redeem_invite_code(' ' || lower((select v from ctx where k='code')) || ' ')::text);
do $$ begin
  if (select v from ctx where k='link') is null then raise exception 'FAIL 4: код не принят'; end if;
  -- 5. До подтверждения партнёр ничего не видит.
  if public.get_partner_view() is not null then raise exception 'FAIL 5: данные видны до подтверждения'; end if;
end $$;

-- 6. Код нельзя использовать дважды.
select pg_temp.logout(); select pg_temp.login('00000000-0000-0000-0000-00000000000c');
do $$ begin
  if public.redeem_invite_code((select v from ctx where k='code')) is not null then
    raise exception 'FAIL 6: код сработал второй раз'; end if;
end $$;

-- 7. Партнёр не может сам подтвердить связь.
select pg_temp.logout(); select pg_temp.login('00000000-0000-0000-0000-00000000000b');
do $$ begin
  begin perform public.approve_partner_link((select v from ctx where k='link')::uuid); raise exception 'FAIL 7';
  exception when others then if sqlerrm = 'FAIL 7' then raise; end if; end;
end $$;

select pg_temp.logout(); select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select public.approve_partner_link((select v from ctx where k='link')::uuid);

-- 21. Список связей: каждый видит роль и имя второго участника, посторонний — ничего.
do $$ declare r record; begin
  select * into r from public.get_my_links();
  if r.role <> 'owner' or r.other_name <> 'Иван' or r.status <> 'active' then
    raise exception 'FAIL 21: владелица видит %', r; end if;
end $$;
select pg_temp.logout(); select pg_temp.login('00000000-0000-0000-0000-00000000000c');
do $$ begin
  if exists (select 1 from public.get_my_links()) then raise exception 'FAIL 21: посторонний видит связи'; end if;
end $$;

select pg_temp.logout(); select pg_temp.login('00000000-0000-0000-0000-00000000000b');
do $$ declare r record; begin
  select * into r from public.get_my_links();
  if r.role <> 'partner' or r.other_name <> 'Аня' then raise exception 'FAIL 21: партнёр видит %', r; end if;
end $$;
do $$ declare v jsonb; n int; begin
  -- 8. Партнёр не читает таблицы владелицы напрямую.
  select count(*) into n from public.day_logs;     if n <> 0 then raise exception 'FAIL 8: day_logs'; end if;
  select count(*) into n from public.periods;      if n <> 0 then raise exception 'FAIL 8: periods'; end if;
  select count(*) into n from public.daily_status; if n <> 0 then raise exception 'FAIL 8: daily_status'; end if;
  select count(*) into n from public.predictions;  if n <> 0 then raise exception 'FAIL 8: predictions'; end if;
  select count(*) into n from public.profiles where id <> auth.uid(); if n <> 0 then raise exception 'FAIL 8: profiles'; end if;

  -- 9. По умолчанию — только прогноз (опорные даты), без овуляции и фертильного окна.
  v := public.get_partner_view('2026-09-01', '2026-10-31');
  if v->'prediction' is null then raise exception 'FAIL 9: нет прогноза'; end if;
  if v->'prediction'->>'last_period_start' <> '2026-09-20' or v->'prediction'->>'period_length' <> '5' then
    raise exception 'FAIL 9: нет опорных дат %', v->'prediction'; end if;
  if v::text like '%ovulation%' or v::text like '%fertile%' or v::text like '%phase%' then
    raise exception 'FAIL 9: раскрыта фертильность %', v; end if;
  if v ? 'periods' or v ? 'fertility' or v ? 'day_logs' or v ? 'daily_status' then
    raise exception 'FAIL 9: лишние данные %', v; end if;

  -- 25. Партнёр не может записать или изменить журнал и месячные владелицы.
  begin
    insert into public.day_logs (user_id, date, symptoms) values ('00000000-0000-0000-0000-00000000000a', '2026-10-02', '{cramps}');
    raise exception 'FAIL 25: партнёр записал в журнал владелицы';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  update public.day_logs set note = 'взлом' where user_id = '00000000-0000-0000-0000-00000000000a';
  begin
    insert into public.periods (user_id, start_date) values ('00000000-0000-0000-0000-00000000000a', '2026-10-10');
    raise exception 'FAIL 25: партнёр добавил месячные владелице';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  delete from public.periods where user_id = '00000000-0000-0000-0000-00000000000a';

  -- 10. Партнёр не может поменять настройки видимости.
  update public.share_settings set symptoms = true;
  if (select symptoms from public.share_settings) then raise exception 'FAIL 10'; end if;
end $$;

-- Проверяем от имени администратора базы: партнёру чужие строки и так не видны.
select pg_temp.logout();
do $$ begin
  if exists (select 1 from public.day_logs where note = 'взлом') then raise exception 'FAIL 25: журнал изменён'; end if;
  if (select count(*) from public.periods where user_id = '00000000-0000-0000-0000-00000000000a') <> 1 then
    raise exception 'FAIL 25: месячные удалены'; end if;
  if (select count(*) from public.day_logs where user_id = '00000000-0000-0000-0000-00000000000a') <> 1 then
    raise exception 'FAIL 25: в журнал владелицы добавлена запись'; end if;
end $$;
select pg_temp.login('00000000-0000-0000-0000-00000000000b');

-- 11. Владелица включает симптомы: партнёр видит симптомы, но не заметку и не температуру.
select pg_temp.logout(); select pg_temp.login('00000000-0000-0000-0000-00000000000a');
update public.share_settings set symptoms = true, daily_status = true;
select pg_temp.logout(); select pg_temp.login('00000000-0000-0000-0000-00000000000b');
do $$ declare v jsonb; begin
  v := public.get_partner_view('2026-09-01', '2026-10-31');
  if v->'day_logs'->0->'symptoms' is null then raise exception 'FAIL 11: нет симптомов'; end if;
  if v::text like '%секрет%' or v::text like '%36.6%' or v->'day_logs'->0 ? 'moods' then
    raise exception 'FAIL 11: утекли лишние поля %', v; end if;
  if v->'daily_status'->0->>'energy' <> '2' then raise exception 'FAIL 11: нет статуса дня'; end if;
  -- 22. Либидо скрыто без отдельного разрешения.
  if v->'daily_status'->0 ? 'libido' then raise exception 'FAIL 22: либидо видно без разрешения'; end if;
end $$;

select pg_temp.logout(); select pg_temp.login('00000000-0000-0000-0000-00000000000a');
update public.share_settings set libido = true;
select pg_temp.logout(); select pg_temp.login('00000000-0000-0000-0000-00000000000b');
do $$ begin
  if public.get_partner_view('2026-09-01', '2026-10-31')->'daily_status'->0->>'libido' <> '3' then
    raise exception 'FAIL 22: либидо не видно после разрешения'; end if;
end $$;

-- 27. Контрацепция: партнёр не видит без разрешения и не читает таблицы напрямую.
select pg_temp.logout(); select pg_temp.login('00000000-0000-0000-0000-00000000000a');
insert into public.contraception (method, regimen, start_date) values ('pill', '21_7', current_date - 3);
insert into public.contraception_log (date) values (current_date);
select pg_temp.logout(); select pg_temp.login('00000000-0000-0000-0000-00000000000b');
do $$ declare n int; begin
  if public.get_partner_view() ? 'contraception' then raise exception 'FAIL 27: видно без разрешения'; end if;
  select count(*) into n from public.contraception; if n <> 0 then raise exception 'FAIL 27: таблица видна партнёру'; end if;
  select count(*) into n from public.contraception_log; if n <> 0 then raise exception 'FAIL 27: журнал виден партнёру'; end if;
  update public.share_settings set contraception = true;
end $$;
select pg_temp.logout(); select pg_temp.login('00000000-0000-0000-0000-00000000000a');
update public.share_settings set contraception = true;
select pg_temp.logout(); select pg_temp.login('00000000-0000-0000-0000-00000000000b');
do $$ declare v jsonb; begin
  v := public.get_partner_view()->'contraception';
  if v->>'method' <> 'pill' or v->>'regimen' <> '21_7' or jsonb_array_length(v->'taken_dates') <> 1 then
    raise exception 'FAIL 27: после разрешения %', v; end if;
  -- При гормональном методе фаза и фертильное окно партнёру не уходят.
  v := public.get_partner_view();
  if v ? 'prediction' or v ? 'fertility' then raise exception 'FAIL 27: прогноз при гормональном методе'; end if;
end $$;
select pg_temp.logout(); select pg_temp.login('00000000-0000-0000-0000-00000000000a');
update public.contraception set regimen = 'pop';
select pg_temp.logout(); select pg_temp.login('00000000-0000-0000-0000-00000000000b');
do $$ begin
  if not public.get_partner_view() ? 'prediction' then raise exception 'FAIL 27: прогноз пропал при мини-пили'; end if;
end $$;

-- 29. Беременность: партнёр видит срок только с разрешения; фаза цикла при этом не уходит.
select pg_temp.logout(); select pg_temp.login('00000000-0000-0000-0000-00000000000a');
update public.profiles set mode = 'pregnancy', pregnancy_lmp = current_date - 84 where id = auth.uid();
select pg_temp.logout(); select pg_temp.login('00000000-0000-0000-0000-00000000000b');
do $$ declare v jsonb; begin
  v := public.get_partner_view();
  if v ? 'pregnancy' then raise exception 'FAIL 29: видно без разрешения'; end if;
  if v ? 'prediction' or v ? 'fertility' then raise exception 'FAIL 29: фаза цикла при беременности'; end if;
  update public.share_settings set pregnancy = true; -- партнёр сам включить не может
end $$;
select pg_temp.logout(); select pg_temp.login('00000000-0000-0000-0000-00000000000a');
do $$ begin
  if (select pregnancy from public.share_settings) then raise exception 'FAIL 29: партнёр изменил разрешение'; end if;
end $$;
update public.share_settings set pregnancy = true;
select pg_temp.logout(); select pg_temp.login('00000000-0000-0000-0000-00000000000b');
do $$ declare n int; begin
  if (public.get_partner_view()->'pregnancy'->>'lmp')::date <> current_date - 84 then raise exception 'FAIL 29: нет срока'; end if;
  select count(*) into n from public.profiles where pregnancy_lmp is not null;
  if n <> 0 then raise exception 'FAIL 29: профиль владелицы виден напрямую'; end if;
end $$;
select pg_temp.logout(); select pg_temp.login('00000000-0000-0000-0000-00000000000a');
update public.profiles set mode = 'cycle' where id = auth.uid();
select pg_temp.logout(); select pg_temp.login('00000000-0000-0000-0000-00000000000b');
do $$ begin
  if public.get_partner_view() ? 'pregnancy' then raise exception 'FAIL 29: срок виден вне режима беременности'; end if;
end $$;

-- 12. Каждый просмотр пишется в журнал, журнал видит только владелица.
do $$ declare n int; begin
  select count(*) into n from public.access_log; if n <> 0 then raise exception 'FAIL 12: партнёр видит журнал'; end if;
end $$;
select pg_temp.logout(); select pg_temp.login('00000000-0000-0000-0000-00000000000a');
do $$ declare n int; begin
  select count(*) into n from public.access_log; if n < 2 then raise exception 'FAIL 12: журнал пуст'; end if;
end $$;

-- 13. Общие заметки: оба пишут; партнёр отмечает просьбу «Сделано», но не меняет текст.
insert into public.shared_notes (link_id, date, kind, body)
values ((select v from ctx where k='link')::uuid, '2026-10-01', 'request', 'принеси грелку');
select pg_temp.logout(); select pg_temp.login('00000000-0000-0000-0000-00000000000b');
insert into public.shared_notes (link_id, date, body) values ((select v from ctx where k='link')::uuid, '2026-10-01', 'в субботу годовщина');
update public.shared_notes set done_at = now() where kind = 'request';
-- 23. Партнёр может поставить ❤️ на заметку владелицы.
update public.shared_notes set hearted_at = now() where kind = 'request';
do $$ begin
  if (select hearted_at from public.shared_notes where kind = 'request') is null then raise exception 'FAIL 23: реакция не сохранилась'; end if;
end $$;
do $$ begin
  if (select done_at from public.shared_notes where kind = 'request') is null then raise exception 'FAIL 13: не отмечено'; end if;
  begin update public.shared_notes set body = 'другое' where kind = 'request'; raise exception 'FAIL 13';
  exception when others then if sqlerrm = 'FAIL 13' then raise; end if; end;
end $$;

-- 24. Рисунки: партнёр рисует, владелица видит и отмечает просмотренным, но не меняет.
insert into public.drawings (link_id, strokes) values ((select v from ctx where k='link')::uuid, '[{"c":"#e0557f","s":8,"b":"pen","p":[1,2,3,4]}]');
do $$ begin
  begin update public.drawings set seen_at = now(); raise exception 'FAIL 24: автор отметил свой рисунок';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
select pg_temp.logout(); select pg_temp.login('00000000-0000-0000-0000-00000000000a');
update public.drawings set seen_at = now();
do $$ begin
  if (select seen_at from public.drawings) is null then raise exception 'FAIL 24: не отмечен просмотренным'; end if;
  begin update public.drawings set strokes = '[]'; raise exception 'FAIL 24: чужой рисунок изменён';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  delete from public.drawings; -- чужой: политика не даст удалить
  if (select count(*) from public.drawings) <> 1 then raise exception 'FAIL 24: удалён чужой рисунок'; end if;
end $$;
select pg_temp.logout(); select pg_temp.login('00000000-0000-0000-0000-00000000000b');

-- 14. Посторонний не видит ни связей, ни заметок и не может писать в чужую пару.
select pg_temp.logout(); select pg_temp.login('00000000-0000-0000-0000-00000000000c');
do $$ declare n int; begin
  select count(*) into n from public.shared_notes;  if n <> 0 then raise exception 'FAIL 14: заметки'; end if;
  select count(*) into n from public.partner_links; if n <> 0 then raise exception 'FAIL 14: связи'; end if;
  select count(*) into n from public.drawings; if n <> 0 then raise exception 'FAIL 14: рисунки'; end if;
  begin
    insert into public.shared_notes (link_id, date, body) values ((select v from ctx where k='link')::uuid, '2026-10-01', 'x');
    raise exception 'FAIL 14';
  exception when others then if sqlerrm = 'FAIL 14' then raise; end if; end;
end $$;

-- 15. Отключение мгновенное: сразу после него партнёр ничего не видит.
select pg_temp.logout(); select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select public.revoke_partner_link((select v from ctx where k='link')::uuid);
select pg_temp.logout(); select pg_temp.login('00000000-0000-0000-0000-00000000000b');
do $$ declare n int; begin
  if exists (select 1 from public.get_my_links()) then raise exception 'FAIL 21: отключённая связь в списке'; end if;
  if public.get_partner_view() is not null then raise exception 'FAIL 15: данные видны после отключения'; end if;
  select count(*) into n from public.shared_notes; if n <> 0 then raise exception 'FAIL 15: заметки видны'; end if;
  select count(*) into n from public.drawings; if n <> 0 then raise exception 'FAIL 15: рисунки видны после отключения'; end if;
end $$;

-- 16. Просроченный код не работает.
select pg_temp.logout(); select pg_temp.login('00000000-0000-0000-0000-00000000000a');
delete from ctx where k = 'code';
insert into ctx values ('code', public.create_invite_code());
select pg_temp.logout();
update public.invite_codes set expires_at = now() - interval '1 minute' where used_at is null;
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
do $$ begin
  if public.redeem_invite_code((select v from ctx where k='code')) is not null then
    raise exception 'FAIL 16: просроченный код сработал'; end if;
end $$;

-- 17. Лимит попыток: после 5 неудачных за час — блокировка, даже для верного кода.
select pg_temp.logout(); select pg_temp.login('00000000-0000-0000-0000-00000000000a');
delete from ctx where k = 'code';
insert into ctx values ('code', public.create_invite_code());
select pg_temp.logout();
delete from public.invite_attempts where user_id = '00000000-0000-0000-0000-00000000000c';
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select public.redeem_invite_code('WRONG' || g) from generate_series(1, 5) g;
do $$ begin
  begin perform public.redeem_invite_code((select v from ctx where k='code')); raise exception 'FAIL 17';
  exception when others then if sqlerrm = 'FAIL 17' then raise; end if; end;
end $$;

-- 26. Подписки на уведомления: каждый видит только свои; браузер переходит к новому аккаунту.
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select public.save_push_subscription('https://push.example/x', 'key1', 'auth1');
select pg_temp.logout(); select pg_temp.login('00000000-0000-0000-0000-00000000000b');
do $$ declare n int; begin
  select count(*) into n from public.push_subscriptions; if n <> 0 then raise exception 'FAIL 26: видна чужая подписка'; end if;
  begin insert into public.push_subscriptions (endpoint, p256dh, auth) values ('https://push.example/y', 'k', 'a');
    raise exception 'FAIL 26: прямая запись подписки';
  exception when insufficient_privilege then null; end;
  perform public.delete_push_subscription('https://push.example/x'); -- чужую удалить нельзя
end $$;
select public.save_push_subscription('https://push.example/x', 'key2', 'auth2');
do $$ begin
  if (select count(*) from public.push_subscriptions) <> 1 then raise exception 'FAIL 26: подписка не перешла'; end if;
  begin perform count(*) from public.notify_log; raise exception 'FAIL 26: журнал уведомлений доступен клиенту';
  exception when insufficient_privilege then null; end;
end $$;
select public.delete_push_subscription('https://push.example/x');
select pg_temp.logout();
do $$ begin
  if exists (select 1 from public.push_subscriptions) then raise exception 'FAIL 26: подписка не удалена'; end if;
end $$;

-- 18. Гость (anon) не имеет доступа ни к чему.
select pg_temp.logout();
set role anon;
do $$ begin
  begin perform count(*) from public.day_logs; raise exception 'FAIL 18';
  exception when insufficient_privilege then null; end;
  begin perform public.get_partner_view(); raise exception 'FAIL 18';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- 19. Клиент не может напрямую писать в связи, журнал и коды.
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
do $$ begin
  begin
    insert into public.partner_links (owner_id, partner_id)
    values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b');
    raise exception 'FAIL 19: partner_links';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.access_log (link_id, viewer_id, what) values (gen_random_uuid(), auth.uid(), '{}');
    raise exception 'FAIL 19: access_log';
  exception when insufficient_privilege then null; end;
end $$;
select pg_temp.logout();

-- 20. Удаление аккаунта: удаляются только свои данные, гость удалить ничего не может.
set role anon;
do $$ begin
  begin perform public.delete_my_account(); raise exception 'FAIL 20: гость';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select public.delete_my_account();
select pg_temp.logout();
do $$ begin
  if exists (select 1 from auth.users where id = '00000000-0000-0000-0000-00000000000a') then
    raise exception 'FAIL 20: пользователь не удалён'; end if;
  if exists (select 1 from public.periods where user_id = '00000000-0000-0000-0000-00000000000a')
     or exists (select 1 from public.day_logs where user_id = '00000000-0000-0000-0000-00000000000a')
     or exists (select 1 from public.profiles where id = '00000000-0000-0000-0000-00000000000a')
     or exists (select 1 from public.partner_links where owner_id = '00000000-0000-0000-0000-00000000000a') then
    raise exception 'FAIL 20: остались данные'; end if;
  if not exists (select 1 from auth.users where id = '00000000-0000-0000-0000-00000000000b') then
    raise exception 'FAIL 20: удалён чужой аккаунт'; end if;
end $$;

-- 28. Сервер (service_role) может прочитать всё, что нужно для уведомлений.
set role service_role;
do $$ begin
  perform count(*) from public.push_subscriptions;
  perform count(*) from public.partner_links;
  perform count(*) from public.share_settings;
  perform count(*) from public.profiles;
  perform count(*) from public.predictions;
  perform count(*) from public.contraception;
  perform count(*) from public.contraception_log;
  perform count(*) from public.notify_log;
  insert into public.notify_log (sender_id, event) values ('00000000-0000-0000-0000-00000000000b', 'test');
  delete from public.push_subscriptions where false;
exception when insufficient_privilege then
  raise exception 'FAIL 28: серверу не хватает прав: %', sqlerrm;
end $$;
reset role;

\echo 'Все проверки доступа пройдены'
