-- Only execute in a new empty LOCAL database; never application data.
\set ON_ERROR_STOP on
DO $$ BEGIN IF to_regclass('public.store_cambios') IS NOT NULL THEN RAISE EXCEPTION 'Requires empty isolated database'; END IF; END $$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.actor',true),'')::uuid $$;
CREATE TYPE public.app_role AS ENUM ('admin','deposito');
CREATE TYPE public.admin_role AS ENUM ('admin','super_admin','support','deposito');
CREATE TYPE public.cambio_metodo AS ENUM ('manual','qr');
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF; IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF; IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF; END $$;
CREATE TABLE user_roles(user_id uuid,role app_role);
CREATE TABLE admin_profiles(user_id uuid,role admin_role,status text,first_name text,last_name text);
CREATE FUNCTION has_role(uuid,app_role) RETURNS boolean LANGUAGE sql AS $$ SELECT EXISTS(SELECT 1 FROM user_roles WHERE user_id=$1 AND role=$2) $$;
CREATE TABLE store_products(id uuid PRIMARY KEY,name text,variants jsonb,stock integer,variant_stock jsonb,updated_at timestamptz DEFAULT now());
CREATE TABLE store_cambios(id uuid PRIMARY KEY,tipo text,producto_id uuid,producto_reemplazo_id uuid,variante_origen jsonb,variante_destino jsonb,producto_recibido_id uuid,variante_recibida jsonb,recibido_en timestamptz,stock_devuelto_at timestamptz,stock_descontado_at timestamptz,preparado_at timestamptz,reemplazo_entregado_at timestamptz,estado text,comentario text,motivo_admin text,historial jsonb DEFAULT '[]',updated_at timestamptz DEFAULT now());
CREATE TABLE stock_movements(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),product_id uuid,tipo text,cantidad int,stock_anterior int,stock_nuevo int,motivo text,registrado_por uuid,created_at timestamptz DEFAULT now(),variante text,order_id uuid,order_item_id uuid,reversa_de_movimiento_id uuid,metodo cambio_metodo,cambio_id uuid);
CREATE FUNCTION _build_variant_key(uuid,jsonb) RETURNS text LANGUAGE sql AS $$ SELECT CASE WHEN $2='{}'::jsonb THEN NULL ELSE 'Talle:'||($2->>'Talle') END $$;
-- Actual production stock function extracted by the local runner before migration.
\i /tmp/store-correction-stock-function.sql
\i /dev-server/drizzle/migrations/0093_store_cambio_audited_corrections.sql
ALTER TABLE store_cambios ADD COLUMN motivo text, ADD COLUMN recibido_por uuid, ADD COLUMN reemplazo_estado text, ADD COLUMN order_id uuid, ADD COLUMN compra_id uuid, ADD COLUMN preorder_id uuid, ADD COLUMN order_item_id uuid;
\i /dev-server/drizzle/migrations/0094_store_cambio_closed_record_guard.sql
INSERT INTO user_roles VALUES('00000000-0000-0000-0000-000000000001','admin'),('00000000-0000-0000-0000-000000000002','deposito'),('00000000-0000-0000-0000-000000000003','admin'),('00000000-0000-0000-0000-000000000004','admin');
INSERT INTO admin_profiles VALUES('00000000-0000-0000-0000-000000000001','super_admin','active','Test','Admin'),('00000000-0000-0000-0000-000000000003','support','active','Test','Support'),('00000000-0000-0000-0000-000000000004','admin','active','Test','Admin');
INSERT INTO store_products VALUES('10000000-0000-0000-0000-000000000001','Original','[{"name":"Talle","options":["L","M","XL"]}]',20,'{"Talle:L":2,"Talle:M":3,"Talle:XL":2}',now()),('10000000-0000-0000-0000-000000000002','Replacement','[{"name":"Talle","options":["L","M","XL"]}]',10,'{"Talle:L":2,"Talle:M":3,"Talle:XL":2}',now());
INSERT INTO store_cambios(id,tipo,producto_id,variante_origen,variante_destino,estado,recibido_en,stock_devuelto_at,stock_descontado_at,historial) VALUES('20000000-0000-0000-0000-000000000001','cambio','10000000-0000-0000-0000-000000000001','{"Talle":"L"}','{"Talle":"XL"}','entregado',now(),now(),now(),'[{"evento":"historia_original"}]'),('20000000-0000-0000-0000-000000000002','cambio','10000000-0000-0000-0000-000000000001','{}','{"Talle":"M"}','entregado',now(),now(),now(),'[{"evento":"historia_original"}]');
INSERT INTO stock_movements(id,product_id,tipo,cantidad,motivo,variante,cambio_id) VALUES('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','ingreso',1,'cambio_in','Talle:L','20000000-0000-0000-0000-000000000001'),('30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','ingreso',1,'cambio_in',null,'20000000-0000-0000-0000-000000000002');
CREATE FUNCTION assert_true(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF; RAISE NOTICE 'PASS: %',label; END $$;
CREATE FUNCTION expect_error(q text,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN BEGIN EXECUTE q; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'PASS: % (%)',label,SQLERRM; RETURN; END; RAISE EXCEPTION 'FAIL accepted: %',label; END $$;
SELECT set_config('test.actor','00000000-0000-0000-0000-000000000001',false);
DO $$ DECLARE c store_cambios%ROWTYPE; r jsonb; stock_before jsonb; BEGIN
 SELECT * INTO c FROM store_cambios WHERE id='20000000-0000-0000-0000-000000000001';
 SELECT variant_stock INTO stock_before FROM store_products WHERE id=c.producto_id;
 r:=admin_correct_store_cambio(c.id,'{"variante_destino":{"Talle":"M"},"comentario":"Correction fixture"}','Error documentado',true,'40000000-0000-0000-0000-000000000001',c.updated_at);
 PERFORM assert_true((SELECT variante_destino FROM store_cambios WHERE id=c.id)=c.variante_destino,'closed historical XL preserved');
 PERFORM assert_true((SELECT correccion_administrativa->'variante_destino' FROM store_cambios WHERE id=c.id)='{"Talle":"M"}','declaration stored separately');
 PERFORM assert_true((SELECT variant_stock FROM store_products WHERE id=c.producto_id)=stock_before AND (SELECT count(*) FROM stock_movements)=2,'administrative correction no stock');
 PERFORM admin_correct_store_cambio(c.id,'{"variante_destino":{"Talle":"M"},"comentario":"Correction fixture"}','Error documentado',true,'40000000-0000-0000-0000-000000000001',c.updated_at);
 PERFORM assert_true((SELECT count(*) FROM store_cambio_corrections)=1,'same request exactly once');
 END $$;
SELECT expect_error($q$SELECT admin_correct_store_cambio('20000000-0000-0000-0000-000000000001','{"comentario":"x"}','',true,gen_random_uuid(),now())$q$,'mandatory reason');
SELECT expect_error($q$SELECT admin_correct_store_cambio('20000000-0000-0000-0000-000000000001','{"comentario":"x"}','why',false,gen_random_uuid(),now())$q$,'mandatory confirmation');
SELECT expect_error($q$SELECT admin_correct_store_cambio(id,'{"estado":"aprobado"}','why',true,gen_random_uuid(),updated_at) FROM store_cambios LIMIT 1$q$,'workflow state not silently changed');
SELECT expect_error($q$SELECT admin_correct_store_cambio(id,'{"order_id":null}','why',true,gen_random_uuid(),updated_at) FROM store_cambios LIMIT 1$q$,'order relationship protected');
SELECT expect_error($q$SELECT admin_correct_store_cambio(id,'{"variante_destino":{"Talle":"ZZ"}}','why',true,gen_random_uuid(),updated_at) FROM store_cambios LIMIT 1$q$,'invalid variant rejected');
SELECT expect_error($q$SELECT admin_correct_store_cambio(id,'{"comentario":"x"}','why',true,gen_random_uuid(),'2000-01-01') FROM store_cambios LIMIT 1$q$,'stale request rejected');
SELECT expect_error($q$UPDATE store_cambio_corrections SET reason='tamper'$q$,'immutable audit update');
SELECT expect_error($q$DELETE FROM store_cambio_corrections$q$,'immutable audit delete');
SELECT expect_error($q$UPDATE store_cambios SET historial='[]'$q$,'immutable workflow history');
SELECT expect_error($q$UPDATE store_cambios SET variante_destino='{"Talle":"L"}'$q$,'historical replacement protected');
SELECT expect_error($q$UPDATE store_cambios SET stock_devuelto_at=null$q$,'stock marker protected');
SELECT expect_error($q$UPDATE store_cambios SET recibido_en=null$q$,'physical receipt protected');
SELECT expect_error($q$UPDATE store_cambios SET correccion_administrativa='{}',correccion_revision=4$q$,'direct overlay edit prohibited');
SELECT expect_error($q$UPDATE store_cambios SET estado='aprobado'$q$,'closed case cannot reopen silently');
SELECT expect_error($q$UPDATE store_cambios SET comentario='silent'$q$,'closed description cannot change silently');
SELECT expect_error($q$UPDATE store_cambios SET order_id=gen_random_uuid()$q$,'closed order reference immutable');
SELECT set_config('test.actor','00000000-0000-0000-0000-000000000002',false);
SELECT assert_true(NOT can_correct_store_cambio(),'warehouse denied');
SELECT expect_error($q$SELECT admin_correct_store_cambio(id,'{"comentario":"x"}','why',true,gen_random_uuid(),updated_at) FROM store_cambios LIMIT 1$q$,'warehouse RPC denied');
SELECT set_config('test.actor','00000000-0000-0000-0000-000000000003',false);
SELECT assert_true(NOT can_correct_store_cambio(),'support denied despite app admin');
SELECT set_config('test.actor','00000000-0000-0000-0000-000000000004',false);
SELECT assert_true(can_correct_store_cambio(),'admin allowed');
SELECT set_config('test.actor','00000000-0000-0000-0000-000000000001',false);
DO $$ DECLARE c store_cambios%ROWTYPE; r jsonb; BEGIN
SELECT * INTO c FROM store_cambios WHERE id='20000000-0000-0000-0000-000000000001';
r:=admin_compensate_store_cambio(c.id,'30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','{"Talle":"M"}','Physical fixture discrepancy',true,'40000000-0000-0000-0000-000000000002',c.updated_at);
PERFORM assert_true((SELECT count(*) FROM stock_movements)=4,'compensation exactly two movements');
PERFORM assert_true((SELECT (variant_stock->>'Talle:L')::int FROM store_products WHERE id=c.producto_id)=1,'source unit reversed');
PERFORM assert_true((SELECT (variant_stock->>'Talle:M')::int FROM store_products WHERE id='10000000-0000-0000-0000-000000000002')=4,'correct unit added');
PERFORM assert_true((SELECT to_jsonb(s)-'correccion_administrativa'-'correccion_revision' FROM store_cambios s WHERE id=c.id)=(to_jsonb(c)-'correccion_administrativa'-'correccion_revision'),'compensation preserves workflow and identity');
PERFORM admin_compensate_store_cambio(c.id,'30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','{"Talle":"M"}','Physical fixture discrepancy',true,'40000000-0000-0000-0000-000000000002',c.updated_at);
PERFORM assert_true((SELECT count(*) FROM stock_movements)=4,'compensation retry no duplicate');
END $$;
SELECT expect_error($q$SELECT admin_compensate_store_cambio(id,'30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','{"Talle":"L"}','again',true,gen_random_uuid(),updated_at) FROM store_cambios WHERE id='20000000-0000-0000-0000-000000000001'$q$,'source compensated only once');
UPDATE store_products SET stock=0 WHERE id='10000000-0000-0000-0000-000000000001';
SELECT expect_error($q$SELECT admin_compensate_store_cambio(id,'30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','{"Talle":"M"}','insufficient source',true,gen_random_uuid(),updated_at) FROM store_cambios WHERE id='20000000-0000-0000-0000-000000000002'$q$,'insufficient source stock blocks whole compensation');
SELECT assert_true((SELECT count(*) FROM stock_movements)=4,'failed compensation leaves no partial movement');
SELECT assert_true(NOT has_table_privilege('authenticated','store_cambio_corrections','INSERT'),'no direct audit insertion');
SELECT assert_true(NOT has_function_privilege('anon','admin_correct_store_cambio(uuid,jsonb,text,boolean,uuid,timestamptz)','EXECUTE'),'anonymous correction denied');