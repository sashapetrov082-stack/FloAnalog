-- Права сервера (Vercel, сервисный ключ) на таблицы, которые он читает и пишет при отправке
-- уведомлений. В новых проектах Supabase таблицы не открываются ролям автоматически,
-- поэтому выдаём явно и только то, что нужно (см. src/app/api и src/lib/server).

grant usage on schema public to service_role;

grant select, delete on public.push_subscriptions to service_role;
grant select, insert on public.notify_log to service_role;
grant select on
  public.partner_links,
  public.share_settings,
  public.profiles,
  public.predictions,
  public.contraception,
  public.contraception_log
to service_role;
