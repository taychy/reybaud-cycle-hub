# Dos webhooks simultáneos con el mismo pago MP: debe quedar un solo registro y un solo ingreso.
import subprocess, sys, threading
db = sys.argv[1]
base = ["psql","-X","-qAt","-h","/tmp/evpay-pg","-p","55442","-U","lovable","-d",db,"-v","ON_ERROR_STOP=1","-c"]
subprocess.run(base+["SELECT t_res('00000000-0000-0000-0000-0000000000c1', 500, ARRAY[250,250])"], check=True, capture_output=True)
out=[]
def go():
    r=subprocess.run(base+["BEGIN; SELECT register_event_mp_payment('00000000-0000-0000-0000-0000000000c1','MP-RACE','approved',500,NULL)->>'action'; SELECT pg_sleep(0.5); COMMIT;"],capture_output=True,text=True)
    out.append((r.returncode, r.stdout.strip(), r.stderr.strip()))
ts=[threading.Thread(target=go) for _ in range(4)]
[t.start() for t in ts]; [t.join() for t in ts]
q=subprocess.run(base+["SELECT (SELECT count(*) FROM reservation_payments WHERE mp_payment_id='MP-RACE')||'|'||amount_paid||'|'||balance_due FROM event_reservations WHERE id='00000000-0000-0000-0000-0000000000c1'"],capture_output=True,text=True).stdout.strip()
acts=sorted(o[1].splitlines()[0] if o[1] else 'ERR' for o in out)
ok = q=="1|500|0" and acts.count('inserted')==1 and acts.count('duplicate')==3
print(("PASS" if ok else "FAIL"), "concurrencia_4_webhooks", q, acts)
sys.exit(0 if ok else 1)
