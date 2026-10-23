#!/usr/bin/env bash
# Explicit isolated localhost connection; never reads managed database credentials.
set -euo pipefail
export PGSSLMODE=disable
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DB="reconciliation_qa_$(date +%s)"
export RECONCILIATION_TEST_DB="$DB"
createdb -h 127.0.0.1 -p 55439 -U lovable "$DB"
PSQL=(psql -X -h 127.0.0.1 -p 55439 -U lovable -d "$DB" -v ON_ERROR_STOP=1)
"${PSQL[@]}" -f "$ROOT/tests/sql/reconciliation_legacy_local_setup.sql"
"${PSQL[@]}" -f "$ROOT/tests/sql/reconciliation_legacy_application_fixture.sql"
"${PSQL[@]}" -f "$ROOT/tests/sql/reconciliation_legacy_consumption_fixture.sql"
"${PSQL[@]}" -f "$ROOT/tests/sql/reconciliation_legacy_statement_fixture.sql"
"${PSQL[@]}" -f "$ROOT/drizzle/migrations/0083_legacy_mp_credit_imputation_coherence.sql"
"${PSQL[@]}" -f "$ROOT/tests/sql/reconciliation_legacy_rollback.sql"
python3 "$ROOT/tests/sql/reconciliation_legacy_concurrency.py"
