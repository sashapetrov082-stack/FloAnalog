-- Push-уведомления: подписки устройств и журнал отправок (для защиты от спама).
-- Отправляет уведомления только сервер (Vercel) с сервисным ключом; клиент видит лишь свои подписки.

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) <= 1000 and endpoint like 'https://%'),
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

create policy "own push subscriptions" on public.push_subscriptions
  for select to authenticated
  using (user_id = auth.uid());

revoke all on public.push_subscriptions from anon, authenticated;
grant select on public.push_subscriptions to authenticated;

-- Сохранить подписку этого браузера. Если раньше в нём был другой аккаунт,
-- подписка переходит к текущему: уведомления должен получать тот, кто сейчас вошёл.
create function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Нужно войти в аккаунт';
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth, created_at = now();
end;
$$;

create function public.delete_push_subscription(p_endpoint text)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
$$;

revoke all on function public.save_push_subscription(text, text, text) from public, anon;
revoke all on function public.delete_push_subscription(text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;
grant execute on function public.delete_push_subscription(text) to authenticated;

-- Когда и какое уведомление отправлялось — чтобы не присылать их слишком часто.
-- Только для сервера: политик нет, клиенту таблица недоступна.
create table public.notify_log (
  id bigint generated always as identity primary key,
  sender_id uuid not null references auth.users (id) on delete cascade,
  event text not null check (char_length(event) <= 30),
  sent_at timestamptz not null default now()
);
create index notify_log_sender_event on public.notify_log (sender_id, event, sent_at desc);

alter table public.notify_log enable row level security;
revoke all on public.notify_log from anon, authenticated;
