#!/usr/bin/env bash
set -euo pipefail
# Requires an already running, explicitly local PostgreSQL test server.
# No application connection variables are used.
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
export PGSSLMODE=disable
PSQL=(psql -X -h 127.0.0.1 -p 55441 -U lovable -d correction_test -v ON_ERROR_STOP=1)
python3 - "$ROOT" <<'PY'
from pathlib import Path
import sys
s=(Path(sys.argv[1])/'drizzle/migrations/0009_stock_negativo_y_sustitucion_falta_stock.sql').read_text()
a=s.index('CREATE OR REPLACE FUNCTION public.adjust_store_stock')
b=s.index('$function$;',s.index('AS $function$',a))+len('$function$;')
Path('/tmp/store-correction-stock-function.sql').write_text(s[a:b])
PY
# The fixture aborts unless correction_test is empty. Create a fresh local
# database named correction_test before running; never reset application data.
"${PSQL[@]}" -f "$ROOT/tests/sql/store_cambio_corrections_isolated.sql"
python3 "$ROOT/tests/sql/store_cambio_corrections_concurrency.py"