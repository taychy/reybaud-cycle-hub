#!/usr/bin/env bash
# Explicitly isolated connection; never reads the managed PG* credentials.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LOCAL_PORT="${BILLING_TEST_PORT:-55439}"
if [[ "$LOCAL_PORT" != "55439" ]]; then echo 'Unexpected isolated test port' >&2; exit 1; fi
PSQL=(psql -X -h 127.0.0.1 -p "$LOCAL_PORT" -U lovable -d postgres -v ON_ERROR_STOP=1)
"${PSQL[@]}" -f "$ROOT/tests/sql/billing_queue_exclusion_local_setup.sql"
"${PSQL[@]}" -f "$ROOT/drizzle/migrations/0082_billing_queue_reversible_exclusion.sql"
"${PSQL[@]}" -f "$ROOT/tests/sql/billing_queue_exclusion_rollback.sql"