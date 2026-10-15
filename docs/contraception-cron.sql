-- Расписание напоминаний о контрацепции: каждые 5 минут Supabase вызывает сайт,
-- сайт проверяет, кому пора напомнить по местному времени (src/app/api/cron/contraception).
-- Vercel на бесплатном тарифе запускает свои расписания только раз в день, поэтому — pg_cron.
--
-- Выполнить один раз в Supabase → SQL Editor, подставив вместо <CRON_SECRET> значение
-- переменной CRON_SECRET из Vercel. Секрет в репозиторий не класть.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'contraception-reminders',
  '*/5 * * * *',
  $$
  select net.http_get(
    url := 'https://flo-analog.vercel.app/api/cron/contraception',
    headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>'),
    timeout_milliseconds := 20000
  );
  $$
);

-- Проверить, что задача работает (через 5–10 минут):
--   select status, status_code, created from net._http_response order by created desc limit 5;
-- Отключить:
--   select cron.unschedule('contraception-reminders');
