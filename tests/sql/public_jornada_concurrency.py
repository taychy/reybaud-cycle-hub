import concurrent.futures
import os
import subprocess

base = ['psql', '-X', '-h', os.environ['JORNADA_LOCAL_SOCKET'], '-p', os.environ['JORNADA_LOCAL_PORT'], '-U', 'lovable', '-d', os.environ['JORNADA_LOCAL_DB'], '-v', 'ON_ERROR_STOP=1', '-At']
def sql(query):
    return subprocess.run(base + ['-c', query], text=True, capture_output=True)
setup = sql("INSERT INTO public.public_jornadas(slug,title,activity_date) VALUES('race','QA concurrent','2026-11-28'); SELECT public.submit_public_jornada('race',lpad(to_hex(i),64,'0'),'QA','Race','54911'||lpad(i::text,8,'0'),'voy') FROM generate_series(1,19) i;")
assert setup.returncode == 0, setup.stderr
def vote(i):
    return sql(f"SELECT public.submit_public_jornada('race',lpad(to_hex({i}),64,'0'),'QA','Race','54911'||lpad('{i}',8,'0'),'voy');")
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    results = list(pool.map(vote, [20,21]))
assert sum(r.returncode == 0 for r in results) == 1, [r.stderr for r in results]
assert any('Cupos completos' in r.stderr for r in results)
assert sql("SELECT count(*) FROM public.public_jornada_attendees WHERE response='voy'").stdout.strip() == '20'
winner = 20 if results[0].returncode == 0 else 21
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    results = list(pool.map(vote, [winner,winner]))
assert all(r.returncode == 0 for r in results), [r.stderr for r in results]
assert sql("SELECT count(*) FROM public.public_jornada_attendees WHERE response='voy'").stdout.strip() == '20'
print('Concurrency: one last seat / concurrent double-click OK')