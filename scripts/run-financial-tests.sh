#!/usr/bin/env bash
# Tests de regresión del circuito financiero (Fase 1.5).
# Corren dentro de una transacción con ROLLBACK: no modifican datos.
# Uso: ./scripts/run-financial-tests.sh
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -z "${PGHOST:-}" ]; then
  echo "PGHOST no está definido: este script necesita acceso directo a la base." >&2
  exit 1
fi
psql -v ON_ERROR_STOP=1 -f supabase/tests/financial_regression.sql
