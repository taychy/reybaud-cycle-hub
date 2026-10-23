#!/usr/bin/env bash
set -euo pipefail
export PGSSLMODE=disable
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DB="reconciliation_gaps_$(date +%s)"
export RECONCILIATION_TEST_DB="$DB"
createdb -h /tmp/reconciliation-pg -p 55439 -U lovable "$DB"
PSQL=(psql -X -h /tmp/reconciliation-pg -p 55439 -U lovable -d "$DB" -v ON_ERROR_STOP=1)
for fixture in local_setup application_fixture consumption_fixture statement_fixture assignment_fixture; do
 "${PSQL[@]}" -f "$ROOT/tests/sql/reconciliation_legacy_${fixture}.sql"
done
"${PSQL[@]}" -f "$ROOT/drizzle/migrations/0083_legacy_mp_credit_imputation_coherence.sql"
"${PSQL[@]}" -f "${1:?supply follow-up migration SQL path}"
"${PSQL[@]}" -f "$ROOT/tests/sql/reconciliation_legacy_rollback.sql"
"${PSQL[@]}" -f "$ROOT/tests/sql/reconciliation_legacy_gaps_rollback.sql"
python3 "$ROOT/tests/sql/reconciliation_legacy_gaps_concurrency.py"