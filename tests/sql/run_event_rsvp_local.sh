#!/usr/bin/env bash
# PostgreSQL desechable local; nunca usa credenciales de Lovable Cloud.
set -euo pipefail
unset PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE
AS=(); [[ $(id -u) -eq 0 ]] && AS=(setpriv --reuid=1000 --regid=1000 --clear-groups)
export PGSSLMODE=disable
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; cd "$ROOT"
DIR=/tmp/event-rsvp-pg; PORT=55444
if [[ ! -d $DIR/data ]]; then
  mkdir -p $DIR
  chown 1000:1000 $DIR 2>/dev/null || true
  "${AS[@]}" initdb -D $DIR/data -U lovable -A trust >/dev/null
fi
"${AS[@]}" pg_ctl -D $DIR/data -o "-p $PORT -k $DIR -c listen_addresses=''" -l $DIR/log status >/dev/null 2>&1 || \
  "${AS[@]}" pg_ctl -D $DIR/data -o "-p $PORT -k $DIR -c listen_addresses=''" -l $DIR/log -w start >/dev/null
DB="event_rsvp_$(date +%s)_$$"
createdb -h $DIR -p $PORT -U lovable "$DB"
PSQL=(psql -X -h $DIR -p $PORT -U lovable -d "$DB" -v ON_ERROR_STOP=1)
"${PSQL[@]}" -q -f tests/sql/event_rsvp_fixture.sql >/dev/null
"${PSQL[@]}" -q -f sql/pending/0113_event_rsvp_lunch.sql >/dev/null
"${PSQL[@]}" -q -f tests/sql/event_rsvp_regression.sql
