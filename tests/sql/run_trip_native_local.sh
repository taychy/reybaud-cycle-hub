#!/usr/bin/env bash
set -euo pipefail
unset PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE
export PGSSLMODE=disable
AS=(); [[ $(id -u) -eq 0 ]] && AS=(setpriv --reuid=1000 --regid=1000 --clear-groups)
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIR=/tmp/trip-native-pg; PORT=55453
mkdir -p "$DIR"; chown 1000:1000 "$DIR"
[[ -d $DIR/data ]] || "${AS[@]}" initdb -D "$DIR/data" -U lovable -A trust >/dev/null
"${AS[@]}" pg_ctl -D "$DIR/data" status >/dev/null 2>&1 || "${AS[@]}" pg_ctl -D "$DIR/data" -o "-p $PORT -k $DIR -c listen_addresses=''" -l "$DIR/log" -w start >/dev/null
DB="native_$(date +%s)_$$"
createdb -h "$DIR" -p "$PORT" -U lovable "$DB"
trap 'dropdb -h "$DIR" -p "$PORT" -U lovable "$DB"' EXIT
PSQL=(psql -X -h "$DIR" -p "$PORT" -U lovable -d "$DB" -v ON_ERROR_STOP=1)
"${PSQL[@]}" -q -f "$ROOT/tests/sql/trip_capacity_fixture.sql"
"${PSQL[@]}" -q -f "$ROOT/drizzle/migrations/0129_trip_shared_capacity_holds.sql"
"${PSQL[@]}" -q -f "$ROOT/tests/sql/trip_native_fixture.sql"
"${PSQL[@]}" -q -f "$ROOT/tests/sql/trip_native_functions_fixture.sql"
SQL="${1:-$ROOT/drizzle/migrations/0130_trip_native_handoff_preparation.sql}"
"${PSQL[@]}" -q -f "$SQL"
"${PSQL[@]}" -q -f "$ROOT/drizzle/migrations/0131_trip_native_links_explicit_privileges.sql"
"${PSQL[@]}" -q -f "$ROOT/tests/sql/trip_native_regression.sql"
export CAPACITY_LOCAL_SOCKET="$DIR" CAPACITY_LOCAL_PORT="$PORT" CAPACITY_LOCAL_DB="$DB"
python3 "$ROOT/tests/sql/trip_native_concurrency.py"
