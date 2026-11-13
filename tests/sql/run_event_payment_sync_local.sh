#!/usr/bin/env bash
# PostgreSQL desechable local; nunca usa credenciales de Lovable Cloud.
# Sin argumentos: línea base (definición productiva previa). Con "candidate": aplica 0112 pendiente.
# Con "rollback": aplica 0112 y luego su rollback.
set -euo pipefail
unset PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE
AS=(); [[ $(id -u) -eq 0 ]] && AS=(setpriv --reuid=9999 --regid=9999 --clear-groups)
export PGSSLMODE=disable
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; cd "$ROOT"
DIR=/tmp/evpay-pg; PORT=55442
if [[ ! -d $DIR/data ]]; then mkdir -p $DIR; chown pgtest $DIR 2>/dev/null || true; "${AS[@]}" initdb -D $DIR/data -U lovable -A trust >/dev/null; fi
"${AS[@]}" pg_ctl -D $DIR/data -o "-p $PORT -k $DIR -c listen_addresses=''" -l $DIR/log status >/dev/null 2>&1 || "${AS[@]}" pg_ctl -D $DIR/data -o "-p $PORT -k $DIR -c listen_addresses=''" -l $DIR/log -w start >/dev/null
DB="evpay_$(date +%s)_$$"
createdb -h $DIR -p $PORT -U lovable "$DB"
PSQL=(psql -X -h $DIR -p $PORT -U lovable -d "$DB" -v ON_ERROR_STOP=1)
"${PSQL[@]}" -q -f tests/sql/event_payment_sync_fixture.sql >/dev/null
"${PSQL[@]}" -q -f tests/sql/event_payment_sync_baseline_recalc.sql >/dev/null
case "${1:-}" in
  candidate) "${PSQL[@]}" -q -f sql/pending/0112_event_mp_payment_sync.sql >/dev/null ;;
  rollback) "${PSQL[@]}" -q -f sql/pending/0112_event_mp_payment_sync.sql >/dev/null; "${PSQL[@]}" -q -f sql/pending/0112_event_mp_payment_sync_rollback.sql >/dev/null ;;
esac
"${PSQL[@]}" -q -f tests/sql/event_payment_sync_regression.sql
if [[ "${1:-}" == candidate ]]; then python3 tests/sql/event_payment_sync_concurrency.py "$DB"; fi
