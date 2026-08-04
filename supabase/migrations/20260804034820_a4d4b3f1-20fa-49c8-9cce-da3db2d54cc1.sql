DO $migration$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_get_viewdef('public.vw_cuenta_corriente_movimientos'::regclass, true)
  INTO v_definition;

  v_definition := replace(
    v_definition,
    'WHEN s.metodo_pago = ''mercadopago''::text THEN COALESCE(( SELECT sum(mp.amount) AS sum
               FROM mp_account_movements mp
              WHERE mp.suscripcion_id = s.id AND mp.status = ''approved''::text), 0::numeric)',
    'WHEN s.metodo_pago = ''mercadopago''::text THEN COALESCE(( SELECT sum(mp.amount) AS sum
               FROM mp_account_movements mp
              WHERE mp.suscripcion_id = s.id AND mp.status = ''approved''::text), CASE WHEN s.mp_status = ''approved''::text THEN COALESCE(s.precio_final, s.precio_base, p.precio, 0::numeric) ELSE 0::numeric END)'
  );

  v_definition := replace(
    v_definition,
    'AND (s.metodo_pago <> ''mercadopago''::text OR (EXISTS ( SELECT 1
           FROM mp_account_movements mp
          WHERE mp.suscripcion_id = s.id AND mp.status = ''approved''::text)))',
    'AND (s.metodo_pago <> ''mercadopago''::text OR s.mp_status = ''approved''::text OR (EXISTS ( SELECT 1
           FROM mp_account_movements mp
          WHERE mp.suscripcion_id = s.id AND mp.status = ''approved''::text)))'
  );

  EXECUTE 'CREATE OR REPLACE VIEW public.vw_cuenta_corriente_movimientos AS ' || v_definition;
END;
$migration$;