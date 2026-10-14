# Трекер цикла

Трекер цикла с режимом пары (аналог Flo). План продукта — [`docs/plan.md`](docs/plan.md), правила для ИИ-помощника — [`CLAUDE.md`](CLAUDE.md).

## Запуск

```bash
npm install
cp .env.example .env.local   # ключи ТЕСТОВОГО проекта Supabase
npm run dev                  # http://localhost:3000
```

## Проверки

```bash
npm test             # алгоритм прогноза
npm run typecheck
npm run lint
scripts/test-db.sh   # миграции и правила доступа на временном Postgres
```

## База данных

Миграции лежат в `supabase/migrations/`. Применить к тестовому проекту: `supabase link` и `supabase db push` (Supabase CLI).

Приложение не является методом контрацепции и не ставит диагнозов.
