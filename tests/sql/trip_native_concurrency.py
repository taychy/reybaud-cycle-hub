import os,subprocess
from concurrent.futures import ThreadPoolExecutor
args=['psql','-X','-qAt','-h',os.environ['CAPACITY_LOCAL_SOCKET'],'-p',os.environ['CAPACITY_LOCAL_PORT'],'-U','lovable','-d',os.environ['CAPACITY_LOCAL_DB'],'-v','ON_ERROR_STOP=1']
def sql(s): return subprocess.run(args+['-c',s],text=True,capture_output=True)
def run(s):
 r=sql(s)
 assert r.returncode==0,r.stderr
 return r.stdout.strip()
actor="SELECT set_config('test.actor','00000000-0000-4000-8000-000000000001',false);"
# New cases in a separate transaction; clean only disposable fixture rows.
# Existing cabin occupant leaves exactly eight capacity slots; convert seven to native reservations to leave one.
run(actor+"SELECT public.admin_hold_trip_request_capacity(public.qa_native_request(201,'00000000-0000-4000-8000-000000000030',6),false,'hotel confirmado'); SELECT public.admin_hold_trip_request_capacity(public.qa_native_request(204,'00000000-0000-4000-8000-000000000040',1),false,'hotel confirmado'); SELECT public.admin_prepare_trip_native_reservations(md5('201')::uuid,public.qa_emails(201,6),'identidades y hotel validados'); SELECT public.admin_prepare_trip_native_reservations(md5('204')::uuid,public.qa_emails(204,1),'identidad y hotel validados'); SELECT public.qa_native_request(202,'00000000-0000-4000-8000-000000000030',1); SELECT public.qa_native_request(203,'00000000-0000-4000-8000-000000000040',1);")
def hold(i): return sql(actor+f"SELECT public.admin_hold_trip_request_capacity(md5('{i}')::uuid,false,'hotel confirmado');")
with ThreadPoolExecutor(max_workers=2) as ex: results=list(ex.map(hold,[202,203]))
assert sum(r.returncode==0 for r in results)==1,[r.stderr for r in results]
assert any('No hay plazas' in r.stderr for r in results)
winner=202 if results[0].returncode==0 else 203
def convert(i): return sql(actor+f"SELECT public.admin_prepare_trip_native_reservations(md5('{i}')::uuid,public.qa_emails({i},1),'identidad y hotel validados');")
with ThreadPoolExecutor(max_workers=2) as ex: results=list(ex.map(convert,[winner,winner]))
assert all(r.returncode==0 for r in results),[r.stderr for r in results]
assert sum('"duplicate": true' in r.stdout for r in results)==1
assert run(f"SELECT count(*) FROM public.trip_capacity_reservation_links WHERE request_id=md5('{winner}')::uuid")=='1'
assert run("SELECT public.get_trip_request_capacity('5380df24-6bbf-4d25-81cd-a1ab2b41bd94','00000000-0000-4000-8000-000000000040')->>'remaining'")=='0'
assert run('SELECT count(*) FROM public.reservation_payments')=='0'
print('PASS: two concurrent buyers for last shared cabin place; one winner; concurrent double handoff creates one native reservation; zero payments')
