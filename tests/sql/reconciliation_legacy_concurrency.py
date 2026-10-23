"""Isolated localhost only: source and obligation races cannot overallocate."""
import os, subprocess, uuid
ENV={**os.environ,'PGSSLMODE':'disable'}
CMD=['psql','-X','-h','127.0.0.1','-p','55439','-U','lovable','-d','reconciliation2','-At','-v','ON_ERROR_STOP=1']
A="SET LOCAL request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';"
def run(s): return subprocess.run(CMD,input=s,text=True,capture_output=True,env=ENV,timeout=15)
def race(first,second):
 p=subprocess.Popen(CMD,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,env=ENV)
 if p.stdin is None or p.stdout is None: raise AssertionError('missing pipes')
 p.stdin.write('BEGIN;'+A+first+"; SELECT 'LOCKED'; SELECT pg_sleep(1); COMMIT;\n");p.stdin.close()
 while p.stdout.readline().strip()!='LOCKED':
  if p.poll() is not None: raise AssertionError('first lock failed')
 result=run('BEGIN;'+A+second+'; COMMIT;');p.wait(timeout=10)
 assert p.returncode==0 and result.returncode!=0,result.stderr
 return result.stderr
ids=[str(uuid.uuid4()) for _ in range(7)];a,plan,account,m1,m2,s1,s2=ids
setup=run(f"""
CREATE TRIGGER trg_guard_pagos_imputaciones BEFORE INSERT OR UPDATE ON public.pagos_imputaciones FOR EACH ROW EXECUTE FUNCTION public.guard_pagos_imputaciones();
INSERT INTO public.planes(id,nombre,moneda,precio) VALUES('{plan}','QA','ARS',1000);
INSERT INTO public.suscripciones(id,alumno_id,plan_id,precio_final,estado,metodo_pago,origen_registro) VALUES('{s1}','{a}','{plan}',1000,'pendiente','pendiente','admin'),('{s2}','{a}','{plan}',1000,'pendiente','pendiente','admin');
INSERT INTO public.mp_account_movements(id,cuenta_mp_id,alumno_id,mp_payment_id,amount,currency,direccion,status) VALUES('{m1}','{account}','{a}','qa:race1',1000,'ARS','ingreso','approved'),('{m2}','{account}','{a}','qa:race2',1000,'ARS','ingreso','approved');
""");assert setup.returncode==0,setup.stderr
def impute(m,s,amt):return f"SELECT public.imputar_pago('mp_movement','{m}','suscripcion','{s}','{a}',{amt},'ARS','{{}}')"
try:
 assert 'overallocated' in race(impute(m1,s1,700),impute(m1,s2,700))
 assert 'overallocated' in race(impute(m2,s2,700),impute(m2,s1,700))
 # Credit insert shares source-row lock with raw MP imputation.
 result=run(f"UPDATE public.pagos_imputaciones SET anulado_at=now() WHERE pago_origen_id IN('{m1}','{m2}')");assert result.returncode==0,result.stderr
 credit=f"INSERT INTO public.cuenta_ajustes(id,alumno_id,tipo,monto,moneda,referencia_externa,cuenta_mp_id) VALUES(gen_random_uuid(),'{a}','credito',800,'ars','qa:race1','{account}')"
 assert 'overallocated' in race(credit,impute(m1,s1,500))
 print('PASS source/source, target/target, credit/imputation concurrency')
finally:
 result=run(f"DELETE FROM public.pagos_imputaciones WHERE pago_origen_id IN('{m1}','{m2}'); DELETE FROM public.cuenta_ajustes WHERE alumno_id='{a}'; DELETE FROM public.mp_account_movements WHERE id IN('{m1}','{m2}'); DELETE FROM public.suscripciones WHERE alumno_id='{a}'; DELETE FROM public.planes WHERE id='{plan}'; DROP TRIGGER trg_guard_pagos_imputaciones ON public.pagos_imputaciones;");assert result.returncode==0,result.stderr
