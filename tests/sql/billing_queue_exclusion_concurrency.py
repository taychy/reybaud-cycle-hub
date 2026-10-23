"""Two real PostgreSQL sessions, synthetic rows, isolated localhost only."""
import os
import subprocess

PSQL = ["psql", "-X", "-h", "127.0.0.1", "-p", "55439", "-U", "lovable", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"]
ENV = {**os.environ, "PGSSLMODE": "disable"}
Q = "00000000-0000-0000-0000-000000000010"
F = "00000000-0000-0000-0000-000000000011"
ADMIN = "SET LOCAL request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';"

def run(sql):
    return subprocess.run(PSQL, input=sql, text=True, capture_output=True, env=ENV, timeout=15)

def race(first, second):
    proc = subprocess.Popen(PSQL, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=ENV)
    assert proc.stdin and proc.stdout
    proc.stdin.write(f"BEGIN; {ADMIN} {first}; SELECT 'LOCKED'; SELECT pg_sleep(2); COMMIT;\n")
    proc.stdin.close()
    while proc.stdout.readline().strip() != "LOCKED":
        if proc.poll() is not None:
            raise AssertionError("First transaction failed before locking")
    result = run(f"BEGIN; {ADMIN} {second}; COMMIT;")
    proc.wait(timeout=10)
    assert proc.returncode == 0
    assert result.returncode != 0, "Concurrent incompatible operation succeeded"
    return result.stderr

setup = run(f"""
INSERT INTO public.facturacion_cola(id,source,pago_id,referencia_tipo,referencia_id,concepto,monto,moneda,pagado_at,periodo_pago,periodo_operativo)
VALUES('{Q}','reservation_payment','qa:race','reservation_payment','{Q}','QA race',100,'EUR',now(),current_date,current_date);
INSERT INTO public.facturas(id,concepto,monto,referencia_tipo,referencia_id,facturacion_cola_id)
VALUES('{F}','QA race',100,'reservation_payment','{Q}','{Q}');
""")
assert setup.returncode == 0, setup.stderr
try:
    error = race(f"SELECT public.admin_set_facturacion_exclusion(ARRAY['{Q}'::uuid],true)",
                 f"UPDATE public.facturas SET estado='emitiendo' WHERE id='{F}'")
    assert "Cobro excluido" in error, error
    result = run(f"BEGIN; {ADMIN} SELECT public.admin_set_facturacion_exclusion(ARRAY['{Q}'::uuid],false); COMMIT;")
    assert result.returncode == 0, result.stderr
    error = race(f"UPDATE public.facturas SET estado='emitiendo' WHERE id='{F}'",
                 f"SELECT public.admin_set_facturacion_exclusion(ARRAY['{Q}'::uuid],true)")
    assert "emisión" in error, error
    print("PASS: exclusion-first blocks emission; emission-first blocks exclusion across concurrent sessions")
finally:
    result = run(f"DELETE FROM public.facturas WHERE id='{F}'; DELETE FROM public.facturacion_cola_exclusion_log WHERE cola_id='{Q}'; DELETE FROM public.facturacion_cola WHERE id='{Q}';")
    assert result.returncode == 0, result.stderr