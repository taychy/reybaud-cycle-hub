import concurrent.futures, os, subprocess
base=['psql','-X','-h',os.environ['CAPACITY_LOCAL_SOCKET'],'-p',os.environ['CAPACITY_LOCAL_PORT'],'-U','lovable','-d',os.environ['CAPACITY_LOCAL_DB'],'-v','ON_ERROR_STOP=1','-At']
def sql(q): return subprocess.run(base+['-c',q],capture_output=True,text=True)
def hold(i): return sql("SELECT set_config('test.actor','00000000-0000-4000-8000-000000000001',false); SELECT public.admin_hold_trip_request_capacity(md5('%s')::uuid,false,'hotel confirmado');"%i)
def race(ids,successes):
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as p: results=list(p.map(hold,ids))
 assert sum(r.returncode==0 for r in results)==successes,[r.stderr for r in results]
 for r in results:
  if r.returncode: assert 'No hay plazas suficientes' in r.stderr,r.stderr
# Clear isolated QA holds, fill 9/10 individual places shared between camps.
assert sql('DELETE FROM public.trip_capacity_holds;').returncode==0
for i,n in [(10,6),(11,3),(12,1),(13,1)]:
 assert sql("SELECT public.qa_request(%s,'00000000-0000-4000-8000-000000000010',%s);"%(i,n)).returncode==0
assert hold(10).returncode==0; assert hold(11).returncode==0
race([12,13],1)
assert sql("SELECT sum(people_count) FROM public.trip_capacity_holds WHERE released_at IS NULL").stdout.strip()=='10'
winner=12 if sql("SELECT count(*) FROM public.trip_capacity_holds WHERE request_id=md5('12')::uuid").stdout.strip()=='1' else 13
race([winner,winner],2)
assert sql("SELECT sum(people_count) FROM public.trip_capacity_holds WHERE released_at IS NULL").stdout.strip()=='10'
# Full cap30, mini cap15 and global39 are independently enforced.
assert sql('DELETE FROM public.trip_capacity_holds;').returncode==0
for i in range(20,25):
 assert sql("SELECT public.qa_request(%s,'00000000-0000-4000-8000-000000000050',6);"%i).returncode==0
# 20 double + 10 single = full30.
for i,n,pkg in [(30,6,50),(31,6,50),(32,6,50),(33,2,50),(34,6,10),(35,4,10),(36,1,30),(37,6,40),(38,2,40),(39,1,40),(40,1,40)]:
 assert sql("SELECT public.qa_request(%s,'00000000-0000-4000-8000-%012d',%s);"%(i,pkg,n)).returncode==0
for i in range(30,36): assert hold(i).returncode==0
assert hold(36).returncode!=0
assert hold(37).returncode==0; assert hold(38).returncode==0
race([39,40],1)
assert sql('SELECT sum(people_count) FROM public.trip_capacity_holds WHERE released_at IS NULL').stdout.strip()=='39'
# Mini15 cap independent of global39.
assert sql('DELETE FROM public.trip_capacity_holds;').returncode==0
for i,n,pkg in [(50,6,60),(51,6,60),(52,3,20),(53,1,40)]:
 assert sql("SELECT public.qa_request(%s,'00000000-0000-4000-8000-%012d',%s);"%(i,pkg,n)).returncode==0
for i in [50,51,52]: assert hold(i).returncode==0
assert hold(53).returncode!=0
print('PASS concurrency last place, refresh, full30, mini15, shared39, individual10/double20/cabin9')
