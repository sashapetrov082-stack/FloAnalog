#!/usr/bin/env bash
# Прогоняет миграции и проверки доступа на временном локальном Postgres.
# Нужны бинарники Postgres 15+ (initdb, pg_ctl, psql) в PATH или в PG_BIN.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PG_BIN="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
export PATH="$PG_BIN:$PATH"
DATA="$(mktemp -d)"
PORT="${PGPORT_TEST:-54329}"
cleanup() { run_pg "$PG_BIN/pg_ctl -D '$DATA' -m immediate stop" >/dev/null 2>&1 || true; rm -rf "$DATA"; }
trap cleanup EXIT
run_pg() { if [ "$(id -u)" = 0 ]; then chown -R postgres "$DATA"; su postgres -c "$*"; else bash -c "$*"; fi; }
run_pg "$PG_BIN/initdb -D '$DATA' -U postgres -A trust >/dev/null"
run_pg "$PG_BIN/pg_ctl -D '$DATA' -o '-p $PORT -k /tmp -c listen_addresses=' -w start >/dev/null"
PSQL=(psql -h /tmp -p "$PORT" -U postgres -d postgres -q -v ON_ERROR_STOP=1)
"${PSQL[@]}" -f "$ROOT/supabase/tests/local_supabase_stub.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do "${PSQL[@]}" -f "$f"; done
"${PSQL[@]}" -f "$ROOT/supabase/tests/rls_test.sql" -o /dev/null
