-- Ejecutar únicamente DENTRO de BEGIN ... ROLLBACK junto a las migraciones.
-- No altera datos ni envía comunicaciones. Cambios temporales revertidos.
SELECT set_config('request.jwt.claim.sub','988fd721-28d3-4d90-a0ab-b90692513f4b',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
DO $test$
DECLARE
 a uuid; b uuid; antes_l integer; despues_l integer; antes_xl integer; despues_xl integer;
 v_prod uuid:='0cc4e7c5-f02c-4840-9b3b-d41049df8f49';
 v_original jsonb:='{"Talle":"L","Color":"Blanco"}'::jsonb;
 v_new jsonb:='{"Talle":"XL","Color":"Blanco"}'::jsonb;
 state text; dev timestamptz; ing timestamptz; eg timestamptz;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin'::app_role) THEN RAISE EXCEPTION 'No hay rol de prueba autorizado'; END IF;
 SELECT (variant_stock->>'Talle:L|Color:Blanco')::integer,
 (variant_stock->>'Talle:XL|Color:Blanco')::integer INTO antes_l,antes_xl
 FROM public.store_products WHERE id=v_prod;
 INSERT INTO public.store_cambios(id,alumno_id,producto_id,origen_tipo,compra_id,order_id,
     variante_origen,variante_destino,motivo,comentario,iniciado_por,origen_solicitud,estado,tipo)
 SELECT gen_random_uuid(),alumno_id,producto_id,origen_tipo,compra_id,order_id,
     variante_origen,variante_destino,motivo,'PRUEBA SOLO TRANSACCIÓN','admin','presencial','aprobado','cambio'
 FROM public.store_cambios WHERE id='804003df-4d5b-4d89-9d69-7b9db6d1043b'::uuid
 RETURNING id INTO a;
 IF a IS NULL THEN RAISE EXCEPTION 'No se creó prueba A'; END IF;
 IF EXISTS(SELECT 1 FROM public.store_cambios WHERE id=a AND stock_devuelto_at IS NOT NULL)
 THEN RAISE EXCEPTION 'Aprobar cambió stock'; END IF;
 PERFORM public.deposito_preparar_reemplazo(a,'manual'::cambio_metodo,v_prod,v_new);
 PERFORM public.deposito_preparar_reemplazo(a,'manual'::cambio_metodo,v_prod,v_new);
 SELECT estado::text,recibido_en,stock_devuelto_at,stock_descontado_at
   INTO state,dev,ing,eg FROM public.store_cambios WHERE id=a;
 IF state<>'aprobado' OR dev IS NOT NULL OR ing IS NOT NULL OR eg IS NULL THEN
   RAISE EXCEPTION 'Preparación anterior a devolución falló'; END IF;
 BEGIN
   PERFORM public.transition_cambio_estado(a,'entregado'::cambio_estado,'TEST');
   RAISE EXCEPTION 'ERROR: se permitió entrega incompleta';
 EXCEPTION WHEN others THEN
   IF SQLERRM LIKE 'ERROR: se permitió entrega%' THEN RAISE; END IF;
 END;
 PERFORM public.deposito_recibir_devolucion(a,'manual'::cambio_metodo,v_prod,v_original);
 PERFORM public.deposito_recibir_devolucion(a,'manual'::cambio_metodo,v_prod,v_original);
 SELECT estado::text,recibido_en,stock_devuelto_at
   INTO state,dev,ing FROM public.store_cambios WHERE id=a;
 IF state<>'listo_retiro' OR dev IS NULL OR ing IS NULL THEN RAISE EXCEPTION 'Preparar→Recibir falló'; END IF;
 SELECT (variant_stock->>'Talle:L|Color:Blanco')::int,(variant_stock->>'Talle:XL|Color:Blanco')::int
   INTO despues_l,despues_xl FROM public.store_products WHERE id=v_prod;
 IF despues_l<>antes_l+1 OR despues_xl<>antes_xl-1 THEN
   RAISE EXCEPTION 'Error stock o doble movimiento: L % XL %',despues_l,despues_xl; END IF;
 INSERT INTO public.store_cambios(id,alumno_id,producto_id,origen_tipo,compra_id,order_id,
     variante_origen,variante_destino,motivo,comentario,iniciado_por,origen_solicitud,estado,tipo)
 SELECT gen_random_uuid(),alumno_id,producto_id,origen_tipo,compra_id,order_id,
     variante_origen,variante_destino,motivo,'PRUEBA SOLO TRANSACCIÓN','admin','presencial','aprobado','cambio'
 FROM public.store_cambios WHERE id='804003df-4d5b-4d89-9d69-7b9db6d1043b'::uuid
 RETURNING id INTO b;
 PERFORM public.deposito_recibir_devolucion(b,'manual'::cambio_metodo,v_prod,v_original);
 SELECT estado::text INTO state FROM public.store_cambios WHERE id=b;
 IF state<>'en_deposito' THEN RAISE EXCEPTION 'Recibir primero no llega a en_deposito'; END IF;
 PERFORM public.deposito_preparar_reemplazo(b,'manual'::cambio_metodo,v_prod,v_new);
 SELECT estado::text INTO state FROM public.store_cambios WHERE id=b;
 IF state<>'listo_retiro' THEN RAISE EXCEPTION 'Recibir→Preparar no llega a listo'; END IF;
 RAISE NOTICE 'PASS: aprobación, ambas secuencias, idempotencia, stock y bloqueo de entrega';
END
$test$;