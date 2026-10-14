-- Удаление аккаунта самой пользовательницей, без писем в поддержку (GDPR, требование Apple).
-- Удаляется запись в auth.users; все данные удаляются каскадом по внешним ключам.

create function public.delete_my_account()
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
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
