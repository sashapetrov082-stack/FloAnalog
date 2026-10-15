-- Рисунки друг для друга в паре. Рисунок хранится линиями (jsonb), а не картинкой:
-- это компактно и позволяет «проиграть» его штрих за штрихом.

create table public.drawings (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.partner_links (id) on delete cascade,
  author_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  background text not null default 'blush' check (char_length(background) <= 30),
  strokes jsonb not null check (jsonb_typeof(strokes) = 'array' and pg_column_size(strokes) <= 300000),
  -- Когда второй участник открыл рисунок.
  seen_at timestamptz,
  created_at timestamptz not null default now()
);
create index drawings_link_time on public.drawings (link_id, created_at desc);

alter table public.drawings enable row level security;

-- Только участники активной связи.
create policy "members read drawings" on public.drawings
  for select to authenticated
  using (public.is_link_member(link_id));

create policy "members add drawings" on public.drawings
  for insert to authenticated
  with check (author_id = auth.uid() and public.is_link_member(link_id));

create policy "members mark drawings seen" on public.drawings
  for update to authenticated
  using (public.is_link_member(link_id))
  with check (public.is_link_member(link_id));

create policy "authors delete drawings" on public.drawings
  for delete to authenticated
  using (author_id = auth.uid() and public.is_link_member(link_id));

-- Чужой рисунок можно только отметить просмотренным, свой — не менять вовсе.
create function public.guard_drawing_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.link_id <> old.link_id or new.author_id <> old.author_id or new.strokes <> old.strokes
     or new.background <> old.background or new.created_at <> old.created_at then
    raise exception 'Рисунок менять нельзя';
  end if;
  if old.author_id = auth.uid() and new.seen_at is distinct from old.seen_at then
    raise exception 'Свой рисунок нельзя отметить просмотренным';
  end if;
  return new;
end;
$$;

create trigger drawings_guard
  before update on public.drawings
  for each row execute function public.guard_drawing_update();

revoke all on public.drawings from anon, authenticated;
grant select, insert, update, delete on public.drawings to authenticated;
