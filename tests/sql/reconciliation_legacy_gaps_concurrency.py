"""Both credit/link orderings, isolated localhost fixtures with actual assignment RPC."""
import os, subprocess, uuid
DB = os.environ['RECONCILIATION_TEST_DB']
assert DB.startswith('reconciliation_gaps_'), 'isolated database required'
ENV = {**os.environ, 'PGSSLMODE': 'disable'}
CMD = ['psql', '-X', '-h', '/tmp/reconciliation-pg', '-p', '55439', '-U', 'lovable', '-d', DB, '-At', '-v', 'ON_ERROR_STOP=1']
AUTH = "SET LOCAL request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';"
def run(sql):
 return subprocess.run(CMD, input=sql, text=True, capture_output=True, env=ENV, timeout=15)
def race(first, second, expected):
 p = subprocess.Popen(CMD, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=ENV)
 assert p.stdin is not None and p.stdout is not None
 p.stdin.write('BEGIN;' + AUTH + first + "; SELECT 'LOCKED'; SELECT pg_sleep(1); COMMIT;\n")
 p.stdin.close()
 while p.stdout.readline().strip() != 'LOCKED':
  if p.poll() is not None:
   raise AssertionError(p.stderr.read() if p.stderr is not None else 'first failed')
 result = run('BEGIN;' + AUTH + second + '; COMMIT;')
 p.wait(timeout=10)
 assert p.returncode == 0 and result.returncode != 0 and expected in result.stderr, result.stderr
a, plan, account = [str(uuid.uuid4()) for _ in range(3)]
for order in ('credit_first', 'link_first'):
 m, s = [str(uuid.uuid4()) for _ in range(2)]
 ref = 'qa:gap-race:' + m
 setup = run(f"""
 INSERT INTO public.planes(id,nombre,moneda,precio) VALUES('{plan}','QA','ARS',800);
 INSERT INTO public.suscripciones(id,alumno_id,plan_id,precio_final,estado,metodo_pago,origen_registro) VALUES('{s}','{a}','{plan}',800,'pendiente','pendiente','admin');
 INSERT INTO public.mp_account_movements(id,cuenta_mp_id,mp_payment_id,alumno_id,amount,currency,direccion,status) VALUES('{m}','{account}','{ref}','{a}',800,'ARS','ingreso','approved');
 """)
 assert setup.returncode == 0, setup.stderr
 credit = f"INSERT INTO public.cuenta_ajustes(id,alumno_id,tipo,monto,moneda,referencia_externa,cuenta_mp_id) VALUES(gen_random_uuid(),'{a}','credito',800,'ARS','{ref}','{account}')"
 link = f"SELECT public.assign_mp_movement_to_target('{m}','{a}','suscripcion','{s}')"
 if order == 'credit_first':
  race(credit, link, 'movement_has_existing_credit')
 else:
  race(link, credit, 'mp_income_already_linked_to_subscription')
 result = run(f"SELECT (SELECT count(*) FROM public.cuenta_ajustes WHERE referencia_externa='{ref}') + (SELECT count(*) FROM public.mp_account_movements WHERE id='{m}' AND suscripcion_id IS NOT NULL)")
 assert result.returncode == 0 and result.stdout.strip() == '1', result.stdout + result.stderr
 print('PASS', order, ': loser blocked; exactly one representation')