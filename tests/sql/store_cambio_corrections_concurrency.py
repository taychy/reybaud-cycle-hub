"""Explicit local fixture database only. No managed connection or real IDs."""
import os
import subprocess
from concurrent.futures import ThreadPoolExecutor

CMD = ["psql", "-X", "-h", "127.0.0.1", "-p", "55441", "-U", "lovable", "-d", "correction_test", "-At", "-v", "ON_ERROR_STOP=1"]
ENV = {**os.environ, "PGSSLMODE": "disable"}

def sql(query, checked=True):
    return subprocess.run(CMD + ["-c", query], env=ENV, text=True, capture_output=True, check=checked)

sql("UPDATE store_products SET stock=20 WHERE id='10000000-0000-0000-0000-000000000001'")
count_before = int(sql("SELECT count(*) FROM stock_movements").stdout.strip())
def compensate(i):
    return sql(f"""SELECT set_config('test.actor','00000000-0000-0000-0000-000000000001',false);
    SELECT admin_compensate_store_cambio(id,'30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','{{"Talle":"M"}}','Concurrent physical fixture',true,'50000000-0000-0000-0000-00000000000{i}',updated_at) FROM store_cambios WHERE id='20000000-0000-0000-0000-000000000002'""", checked=False)

with ThreadPoolExecutor(max_workers=2) as pool:
    results = list(pool.map(compensate, [1, 2]))
assert sum(r.returncode == 0 for r in results) == 1, "exactly one compensation should succeed"
assert int(sql("SELECT count(*) FROM stock_movements").stdout.strip()) == count_before + 2, "exactly two movements"
assert int(sql("SELECT count(*) FROM store_cambio_corrections WHERE source_movement_id='30000000-0000-0000-0000-000000000002'").stdout.strip()) == 1, "one immutable compensation record"
print("PASS: simultaneous different requests serialize; exactly one compensation, two movements")