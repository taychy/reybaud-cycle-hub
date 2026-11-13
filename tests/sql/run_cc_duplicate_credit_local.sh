#!/usr/bin/env bash
# Explicit isolated PostgreSQL connection; never reads managed DB credentials.
# Without arguments: reproduce against the current pre-fix definitions.
# With one argument: apply that pending SQL only to the disposable local DB.
set -euo pipefail
export PGSSLMODE=disable
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DB="cc_duplicate_qa_$(date +%s)_$$"
export RECONCILIATION_TEST_DB="$DB"
createdb -h /tmp/reconciliation-pg -p 55439 -U lovable "$DB"
PSQL=(psql -X -h /tmp/reconciliation-pg -p 55439 -U lovable -d "$DB" -v ON_ERROR_STOP=1)
for fixture in local_setup application_fixture consumption_fixture statement_fixture assignment_fixture; do
  "${PSQL[@]}" -f "$ROOT/tests/sql/reconciliation_legacy_${fixture}.sql" >/dev/null
done
for migration in 0083_legacy_mp_credit_imputation_coherence 0084_mp_recognized_income_and_credit_link_guards; do
  "${PSQL[@]}" -f "$ROOT/drizzle/migrations/${migration}.sql" >/dev/null
done
"${PSQL[@]}" -f "$ROOT/tests/sql/cc_duplicate_credit_fixture.sql" >/dev/null
"${PSQL[@]}" -f "$ROOT/drizzle/migrations/0110_mp_multi_debt_imputation.sql" >/dev/null
if [[ $# -gt 1 ]]; then
  echo 'Usage: run_cc_duplicate_credit_local.sh [pending-migration.sql]' >&2
  exit 2
fi
if [[ $# -eq 1 ]]; then
  "${PSQL[@]}" -f "$1" >/dev/null
fi
"${PSQL[@]}" -f "$ROOT/tests/sql/cc_duplicate_credit_regression.sql"
