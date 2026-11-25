#!/usr/bin/env bash
# Disposable local PostgreSQL only; never use managed database credentials.
set -euo pipefail
unset PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE
export PGSSLMODE=disable
AS=(); [[ $(id -u) -eq 0 ]] && AS=(setpriv --reuid=1000 --regid=1000 --clear-groups)
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIR=/tmp/public-jornada-pg; PORT=55448
if [[ ! -d $DIR/data ]]; then
 mkdir -p "$DIR"; chown 1000:1000 "$DIR"
 "${AS[@]}" initdb -D "$DIR/data" -U lovable -A trust >/dev/null
fi
"${AS[@]}" pg_ctl -D "$DIR/data" -o "-p $PORT -k $DIR -c listen_addresses=''" -l "$DIR/log" status >/dev/null 2>&1 || \
 "${AS[@]}" pg_ctl -D "$DIR/data" -o "-p $PORT -k $DIR -c listen_addresses=''" -l "$DIR/log" -w start >/dev/null
DB="jornada_$(date +%s)_$$"
createdb -h "$DIR" -p "$PORT" -U lovable "$DB"
trap 'dropdb -h "$DIR" -p "$PORT" -U lovable "$DB"' EXIT
PSQL=(psql -X -h "$DIR" -p "$PORT" -U lovable -d "$DB" -v ON_ERROR_STOP=1)
"${PSQL[@]}" -q -f "$ROOT/tests/sql/public_jornada_fixture.sql"
"${PSQL[@]}" -q -f "$ROOT/drizzle/migrations/0118_public_jornada_attendance.sql"
"${PSQL[@]}" -q -f "$ROOT/tests/sql/public_jornada_regression.sql"
export JORNADA_LOCAL_SOCKET="$DIR" JORNADA_LOCAL_PORT="$PORT" JORNADA_LOCAL_DB="$DB"
python3 "$ROOT/tests/sql/public_jornada_concurrency.py"