#!/usr/bin/env bash
# Disposable local PostgreSQL only; never reads managed database credentials.
set -euo pipefail
export PGSSLMODE=disable
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DB="cc0111_twelve_qa_$(date +%s)_$$"
createdb -h /tmp/reconciliation-pg -p 55439 -U lovable "$DB"
PSQL=(psql -X -h /tmp/reconciliation-pg -p 55439 -U lovable -d "$DB" -v ON_ERROR_STOP=1)
for fixture in local_setup application_fixture consumption_fixture statement_fixture assignment_fixture; do
  "${PSQL[@]}" -f "$ROOT/tests/sql/reconciliation_legacy_${fixture}.sql" >/dev/null
done
for migration in 0083_legacy_mp_credit_imputation_coherence 0084_mp_recognized_income_and_credit_link_guards; do
  "${PSQL[@]}" -f "$ROOT/drizzle/migrations/${migration}.sql" >/dev/null
done
cd "$ROOT"
"${PSQL[@]}" -f tests/sql/cc_0111_twelve_cases_isolated.sql
