-- Isolated fixture only, no application credentials or real rows.
SET check_function_bodies=off;
CREATE SCHEMA auth;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
END $$;
CREATE TYPE public.app_role AS ENUM('admin','alumno','coach','deposito');
CREATE TABLE public.user_roles(user_id uuid,role public.app_role);
INSERT INTO public.user_roles VALUES('00000000-0000-0000-0000-000000000001','admin');
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE FUNCTION public.has_role(u uuid,r public.app_role) RETURNS boolean LANGUAGE sql AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=u AND role=r) $$;
CREATE FUNCTION public.is_super_admin(u uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
CREATE TABLE public.cuenta_ajustes (id uuid, alumno_id uuid, tipo text, concepto text, monto numeric, moneda text, fecha date, notas text, created_by uuid, created_at timestamp with time zone, updated_at timestamp with time zone, medio_pago text, cuenta_mp_id uuid, referencia_externa text, aplicado_a_fuente_tabla text, aplicado_a_fuente_id uuid, comprobante_url text);
CREATE TABLE public.delivery_list_items (id uuid, list_id uuid, cliente_nombre text, cliente_alumno_id uuid, producto text, variante text, cantidad numeric, notas text, preparado boolean, preparado_at timestamp with time zone, preparado_by uuid, source_type text, source_order_id uuid, source_order_item_id uuid, source_preorder_id uuid, posicion integer, created_at timestamp with time zone, updated_at timestamp with time zone, alumno_id uuid, aviso_retiro_enviado_at timestamp with time zone, aviso_retiro_channel text, aviso_retiro_enviado_por uuid, costo_unitario numeric, precio_venta numeric, moneda text, store_product_id uuid, modalidad_retiro text, sede_retiro_id uuid);
CREATE TABLE public.delivery_list_payments (id uuid, list_id uuid, cliente_nombre text, monto numeric(14,2), moneda text, forma_pago text, monto_esperado numeric(14,2), moneda_esperada text, forma_pago_esperada text, comprobante_path text, notas text, cargado_por_nombre text, cargado_por_email text, cargado_por_user_id uuid, origen text, validado boolean, validado_at timestamp with time zone, validado_por uuid, validado_notas text, created_at timestamp with time zone, updated_at timestamp with time zone, rechazado boolean, rechazado_at timestamp with time zone, rechazado_por uuid, rechazado_motivo text, alumno_id uuid);
CREATE TABLE public.delivery_lists (id uuid, titulo text, descripcion text, fecha_entrega date, estado text, origen text, public_token text, public_editable boolean, created_by uuid, created_at timestamp with time zone, updated_at timestamp with time zone, caja_estado text, caja_abierta_at timestamp with time zone, caja_abierta_por uuid, caja_cerrada_at timestamp with time zone, caja_cerrada_por uuid, costo_total_mercaderia numeric, pagado_a_proveedor numeric, moneda_costo text, notas_cierre text, proveedor_nombre text, tc_usd numeric);
CREATE TABLE public.devoluciones (id uuid, alumno_id uuid, suscripcion_id uuid, monto numeric, moneda text, fecha date, metodo text, referencia text, motivo text, notas text, ajuste_id uuid, baja_solicitud_id uuid, created_by uuid, created_at timestamp with time zone, updated_at timestamp with time zone, mp_movement_id uuid, cuenta_mp_id uuid, reservation_id uuid, reservation_payment_id uuid, store_order_id uuid, gasto_id uuid);
CREATE TABLE public.event_reservations (id uuid, event_id uuid, alumno_id uuid, estado text, metodo_pago text, monto numeric, moneda text, notas text, created_at timestamp with time zone, updated_at timestamp with time zone, reservation_status text, payment_status text, amount_total numeric, amount_paid numeric, balance_due numeric, price_snapshot numeric, currency_snapshot text, next_due_date date, confirmed_at timestamp with time zone, cancelled_at timestamp with time zone, created_by text, admin_notes text, participant_notes text, accepted_terms boolean, cancellation_reason text, cancellation_requested_at timestamp with time zone, external_participant_id uuid, access_token text, origin text, checkin_at timestamp with time zone, external_email text, external_first_name text, external_last_name text, external_team_name text, event_participant_id uuid, package_id uuid, package_nombre_snapshot text, genero_habitacion text, tipo_vinculo text, prefiere_asignacion boolean, terminos_aceptados_at timestamp with time zone, terminos_version_aceptada text, terminos_snapshot jsonb, payment_plan_id uuid, payment_plan_name_snapshot text, payment_plan_snapshot jsonb, confirmation_payment_email_queued_at timestamp with time zone, confirmation_payment_email_sent_at timestamp with time zone, confirmation_payment_email_failed_at timestamp with time zone, confirmation_payment_email_attempts integer, confirmation_payment_email_last_error text, terminos_pendientes boolean, terminos_token text, terminos_token_expires_at timestamp with time zone, rooming_asignacion_estado text, rooming_acompanante_nombre text, rooming_asignacion_consentimiento jsonb, rooming_asignacion_updated_at timestamp with time zone);
CREATE TABLE public.events (id uuid, title text, description text, date date, start_time time without time zone, end_time time without time zone, type text, is_active boolean, visible_to_students boolean, created_at timestamp with time zone, updated_at timestamp with time zone, image_url text, location text, price numeric, currency text, duration_days integer, duration_nights integer, max_capacity integer, spots_taken integer, level text, is_own_event boolean, end_date date, metadata jsonb, short_description text, same_day boolean, status text, show_public boolean, payment_mode text, incluye text[], no_incluye text[], roadbook jsonb, admin_alert_emails text[], precio_aviso_texto text, precio_aviso_tipo text, precio_aviso_hasta timestamp with time zone, precio_aviso_activo boolean, permite_cambio_paquete_alumno boolean, dias_limite_cambio_alumno integer, permitir_downgrade boolean, politica_precio_cambio text, credito_valido_solo_en_evento boolean, bloquear_cambios_despues_de_inicio boolean, estado_publicacion text, waitlist_habilitada boolean, waitlist_mensaje text, waitlist_questions jsonb, fecha_lanzamiento_comercial date);
CREATE TABLE public.mp_account_movements (id uuid, cuenta_mp_id uuid, mp_payment_id text, tipo text, status text, status_detail text, payment_method text, payment_type text, amount numeric(14,2), net_received numeric(14,2), fee_amount numeric(14,2), currency text, description text, payer_email text, payer_name text, payer_document text, external_reference text, fecha_movimiento timestamp with time zone, raw jsonb, alumno_id uuid, reservation_payment_id uuid, suscripcion_id uuid, assigned_manually boolean, assigned_by uuid, assigned_at timestamp with time zone, assign_notes text, created_at timestamp with time zone, updated_at timestamp with time zone, direccion text, gasto_id uuid, categorizado_at timestamp with time zone, categorizado_por uuid, coach_id uuid, coach_match_estado text, coach_match_confirmado_por uuid, coach_match_confirmado_at timestamp with time zone, liquidacion_id uuid);
CREATE TABLE public.pagos_imputaciones (id uuid, pago_origen_tipo text, pago_origen_id uuid, obligacion_tipo text, obligacion_id uuid, alumno_id uuid, monto numeric, moneda text, created_at timestamp with time zone, created_by uuid, anulado_at timestamp with time zone, anulado_por uuid, motivo_anulacion text, metadata jsonb);
CREATE TABLE public.planes (id uuid, nombre text, descripcion text, precio numeric(10,2), frecuencia text, activo boolean, created_at timestamp with time zone, descripcion_corta text, moneda text, clases_por_semana integer, acceso_entrenamientos boolean, acceso_eventos boolean, acceso_beneficios boolean, renovacion_auto_permitida boolean, visibilidad text, updated_at timestamp with time zone, tipo text, precio_promocional numeric, cuotas_cantidad integer, cuota_valor numeric, whatsapp_url text, max_inscripciones integer, imagen_url text, inscripciones_actuales integer, acceso_whatsapp boolean, features jsonb, categoria text, permite_auto_cobro boolean, tipo_consumo text, clases_incluidas integer, vigencia_dias integer, es_programa_cerrado boolean, fecha_inicio_programa date, fecha_fin_programa date, fecha_cierre_inscripcion date, cohort_slug text, landing_public boolean, fecha_inicio_preinscripcion date, fecha_fin_preinscripcion date, fecha_inicio_inscripcion date, fecha_fin_inscripcion date, preinscripcion_slug text);
CREATE TABLE public.reservas_turnera (id uuid, servicio_id uuid, coach_id uuid, alumno_id uuid, fecha date, hora_inicio time without time zone, hora_fin time without time zone, sede_id uuid, nombre text, apellido text, email text, celular text, documento text, fecha_nacimiento date, nota text, acepto_politica boolean, estado_operativo text, estado_economico text, precio_snapshot numeric, moneda_snapshot text, origen_link text, created_at timestamp with time zone, updated_at timestamp with time zone, form_responses jsonb, pago_estado text, pago_mp_preference_id text, pago_mp_payment_id text, pago_monto numeric, recordatorio_enviado_at timestamp with time zone, metodo_pago text, hold_expira_at timestamp with time zone, comprobante_url text, comprobante_subido_at timestamp with time zone, verificado_por uuid, verificado_at timestamp with time zone, motivo_rechazo text, upload_token uuid, email_instrucciones_enviado_at timestamp with time zone, recordatorio_15min_enviado_at timestamp with time zone, email_expiracion_enviado_at timestamp with time zone, admin_visto_at timestamp with time zone, google_event_id text, google_sync_status text, google_sync_error text, google_synced_at timestamp with time zone, coach_recordatorio_enviado_at timestamp with time zone, confirmacion_enviado_at timestamp with time zone, coach_aviso_enviado_at timestamp with time zone);
CREATE TABLE public.reservation_addons (id uuid, reservation_id uuid, addon_id uuid, cantidad integer, precio_unitario numeric, subtotal numeric, currency text, notas text, added_by uuid, created_at timestamp with time zone, updated_at timestamp with time zone, noche_timing text);
CREATE TABLE public.reservation_payments (id uuid, reservation_id uuid, alumno_id uuid, amount numeric, currency text, payment_date date, payment_method text, payment_reference text, proof_url text, notes text, status text, created_at timestamp with time zone, reviewed_at timestamp with time zone, reviewed_by uuid, original_amount numeric, original_currency text, exchange_rate_to_event_currency numeric, equivalent_amount_event_currency numeric, event_currency text, review_action text, review_notes text, manual_override boolean, installment_id uuid, installment_number integer, anulado_at timestamp with time zone, anulado_por uuid, anulado_motivo text, cuenta_mp_id uuid, mp_payment_id text, comision_mp numeric, iibb numeric, otros_fees numeric, neto_recibido numeric, fees_synced_at timestamp with time zone, obligation_amount_contract numeric, fx_reference_rate numeric, fx_base_amount numeric, fx_surcharge_pct numeric, fx_surcharge_amount numeric, payment_policy_snapshot jsonb);
CREATE TABLE public.reservation_transfer_direct_payments (id uuid, transfer_id uuid, replacement_reservation_id uuid, original_reservation_id uuid, amount numeric, currency text, paid_at date, proof_path text, notes text, status text, created_by uuid, created_at timestamp with time zone, updated_at timestamp with time zone, voided_at timestamp with time zone, voided_by uuid, void_reason text);
CREATE TABLE public.servicios_turnera (id uuid, slug text, nombre text, descripcion text, duracion_minutos integer, precio numeric, moneda text, modalidad text, politica_cancelacion text, activo boolean, sede_id uuid, created_at timestamp with time zone, updated_at timestamp with time zone, tipo_actividad text, form_fields jsonb, email_confirmacion_enabled boolean, email_recordatorio_enabled boolean, recordatorio_horas_antes integer, ics_adjunto boolean, pago_modo text, pago_monto_sena numeric, email_coach_enabled boolean, anticipacion_horas_minima integer, archivado boolean, email_coach_recordatorio_enabled boolean, coach_recordatorio_horas_antes integer, whatsapp_recordatorio_enabled boolean, whatsapp_coach_recordatorio_enabled boolean, honorario_id uuid);
CREATE TABLE public.store_order_items (id uuid, order_id uuid, product_id uuid, product_name text, quantity integer, unit_price numeric, created_at timestamp with time zone, variant_selection jsonb, combo_item_id uuid, internal_component_idx integer, supplier_order_item_id uuid, supplier_ordered_at timestamp with time zone, precio_lista numeric, precio_cobrado numeric, campaign_id uuid, campaign_nombre text, discount_pct numeric);
CREATE TABLE public.store_orders (id uuid, order_number integer, alumno_id uuid, customer_name text, customer_email text, total numeric, status text, shipping_tracking text, notes text, created_at timestamp with time zone, updated_at timestamp with time zone, currency text, mp_payment_id text, mp_status text, mp_preference_id text, mp_external_reference text, metodo_pago text, origen_registro text, pagado_at timestamp with time zone, tienda_emisor_id uuid, cuenta_mp_id uuid, delivered_at timestamp with time zone, entrega_metodo text, sede_retiro_id uuid, envio_direccion text, envio_contacto text, envio_notas text, envio_costo numeric, envio_estado text, cancelled_at timestamp with time zone, cancel_reason text, stock_restored_at timestamp with time zone, comision_mp numeric, iibb numeric, otros_fees numeric, neto_recibido numeric, fees_synced_at timestamp with time zone, customer_phone text, es_externo boolean, supplier_notified_at timestamp with time zone, supplier_notified_by uuid, supplier_order_ref text, verificado_admin boolean, verificado_admin_at timestamp with time zone, verificado_admin_by uuid, verificado_nota text, aviso_camioneta_enviado_at timestamp with time zone, aviso_camioneta_enviado_por uuid, aviso_camioneta_enviado_por_email text);
CREATE TABLE public.store_preorders (id uuid, alumno_id uuid, product_id uuid, cantidad integer, variante jsonb, producto_nombre text, precio_unitario numeric, moneda text, sena_monto numeric, precio_total numeric, saldo_pendiente numeric, estado text, estado_pago_sena text, forma_pago_sena text, mp_payment_id text, mp_external_reference text, notas text, cancelada_at timestamp with time zone, cancelada_motivo text, entregada_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone, mp_preference_id text, sena_pagada_at timestamp with time zone, modalidad text, items jsonb, entrega_metodo text, sede_retiro_id uuid, envio_direccion text, envio_contacto text, envio_notas text, envio_costo numeric, envio_estado text, alumno_nombre text, alumno_email text, alumno_telefono text, alumno_dni text, cuenta_mp_id uuid, delivered_at timestamp with time zone, sena_reminder_count integer, sena_last_reminder_at timestamp with time zone);
CREATE TABLE public.suscripciones (id uuid, alumno_id uuid, plan_id uuid, estado text, fecha_inicio date, fecha_fin date, mp_preference_id text, mp_payment_id text, mp_status text, created_at timestamp with time zone, updated_at timestamp with time zone, auto_renovacion boolean, cancelada_at timestamp with time zone, cancelada_motivo text, descuento_id uuid, precio_base numeric, precio_final numeric, metodo_pago text, origen_registro text, notas text, mp_preapproval_id text, mp_preapproval_status text, auto_cobro_activo boolean, ultimo_intento_cobro_at timestamp with time zone, intentos_cobro_fallidos integer, chequeado_admin boolean, chequeado_admin_at timestamp with time zone, chequeado_admin_by uuid, baja_nota text, baja_chequeada boolean, baja_chequeada_at timestamp with time zone, baja_chequeada_by uuid, cuenta_mp_id uuid, clases_totales integer, clases_consumidas integer, clases_vencimiento date, comision_mp numeric, iibb numeric, otros_fees numeric, neto_recibido numeric, fees_synced_at timestamp with time zone, precio_excepcion_motivo text, precio_excepcion_autorizado_por uuid, precio_excepcion_at timestamp with time zone, precio_excepcion_tipo text, precio_excepcion_valor numeric, precio_excepcion_vigencia_hasta date, mp_status_detail text, mp_error_code text, mp_error_message text, programa_sede_id uuid, pago_confirmado_at timestamp with time zone, pago_confirmado_por uuid);
CREATE OR REPLACE FUNCTION public.is_subscription_paid(_sub_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT public.is_subscription_paid(s.id, s.metodo_pago, s.mp_status, s.origen_registro, s.chequeado_admin, s.mp_payment_id)
  FROM public.suscripciones s WHERE s.id = _sub_id
$function$;
CREATE OR REPLACE FUNCTION public.is_subscription_paid(_sub_id uuid, _metodo_pago text, _mp_status text, _origen_registro text, _chequeado_admin boolean, _mp_payment_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT
    -- Evidencia Mercado Pago real
    (
      COALESCE(_mp_status, '') = 'approved'
      OR EXISTS (
        SELECT 1 FROM public.mp_account_movements mp
        WHERE mp.suscripcion_id = _sub_id AND mp.status = 'approved'
      )
    )
    OR
    -- Evidencia manual: medio de pago explícito y real (nunca 'pendiente'/null)
    (
      COALESCE(_metodo_pago, 'pendiente') NOT IN ('pendiente', 'mercadopago')
      AND (
        COALESCE(_origen_registro, '') IN ('automatico', 'cargado_admin')
        OR COALESCE(_chequeado_admin, false) = true   -- informado por alumno + aprobado por admin
      )
    )
$function$;
CREATE OR REPLACE FUNCTION public.obligacion_alumno(_tipo text, _id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE public.obligacion_tipo_normalizado(_tipo)
    WHEN 'suscripcion' THEN (SELECT s.alumno_id FROM public.suscripciones s WHERE s.id = _id)
    WHEN 'reserva'     THEN (SELECT r.alumno_id FROM public.event_reservations r WHERE r.id = _id)
    WHEN 'store_order' THEN (SELECT o.alumno_id FROM public.store_orders o WHERE o.id = _id)
    WHEN 'turnera'     THEN (SELECT t.alumno_id FROM public.reservas_turnera t WHERE t.id = _id)
    WHEN 'otro'        THEN (SELECT c.alumno_id FROM public.cuenta_ajustes c WHERE c.id = _id)
    ELSE NULL
  END;
$function$;
CREATE OR REPLACE FUNCTION public.obligacion_moneda(_tipo text, _id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE public.obligacion_tipo_normalizado(_tipo)
    WHEN 'suscripcion' THEN (SELECT COALESCE(p.moneda, 'ARS') FROM public.suscripciones s
                              LEFT JOIN public.planes p ON p.id = s.plan_id WHERE s.id = _id)
    WHEN 'reserva'     THEN (SELECT COALESCE(r.currency_snapshot, r.moneda, 'ARS') FROM public.event_reservations r WHERE r.id = _id)
    WHEN 'store_order' THEN (SELECT COALESCE(o.currency, 'ARS') FROM public.store_orders o WHERE o.id = _id)
    WHEN 'turnera'     THEN 'ARS'
    WHEN 'otro'        THEN (SELECT COALESCE(c.moneda, 'ARS') FROM public.cuenta_ajustes c WHERE c.id = _id)
    ELSE NULL
  END;
$function$;
CREATE OR REPLACE FUNCTION public.obligacion_tipo_normalizado(_tipo text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE lower(trim(coalesce(_tipo, '')))
    WHEN 'reservation' THEN 'reserva'
    WHEN 'reserva'     THEN 'reserva'
    WHEN 'cargo'       THEN 'otro'
    WHEN 'ajuste'      THEN 'otro'
    WHEN 'cuenta_ajuste' THEN 'otro'
    WHEN 'suscripcion' THEN 'suscripcion'
    WHEN 'subscription' THEN 'suscripcion'
    WHEN 'store_order' THEN 'store_order'
    WHEN 'turnera'     THEN 'turnera'
    WHEN 'otro'        THEN 'otro'
    ELSE NULL
  END;
$function$;
CREATE OR REPLACE FUNCTION public.pago_monto_bruto(_tipo text, _id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE _tipo
    WHEN 'mp_movement' THEN (SELECT amount FROM public.mp_account_movements WHERE id = _id)
    WHEN 'reservation_payment' THEN (SELECT amount FROM public.reservation_payments WHERE id = _id)
    WHEN 'cuenta_ajuste' THEN (SELECT monto FROM public.cuenta_ajustes WHERE id = _id)
    ELSE NULL
  END;
$function$;
CREATE OR REPLACE FUNCTION public.obligacion_imputado(_tipo text, _id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(SUM(pi.monto), 0)
  FROM public.pagos_imputaciones pi
  WHERE pi.obligacion_tipo = public.obligacion_tipo_normalizado(_tipo)
    AND pi.obligacion_id = _id
    AND pi.anulado_at IS NULL;
$function$;
CREATE OR REPLACE FUNCTION public.obligacion_monto(_tipo text, _id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE _tipo
    WHEN 'suscripcion' THEN (SELECT COALESCE(s.precio_final, s.precio_base, p.precio, 0)
                               FROM public.suscripciones s LEFT JOIN public.planes p ON p.id = s.plan_id
                              WHERE s.id = _id)
    WHEN 'reserva' THEN (SELECT COALESCE(amount_total, 0) FROM public.event_reservations WHERE id = _id)
    WHEN 'store_order' THEN (SELECT COALESCE(total, 0) FROM public.store_orders WHERE id = _id)
    WHEN 'turnera' THEN (SELECT COALESCE(precio_snapshot, 0) FROM public.reservas_turnera WHERE id = _id)
    WHEN 'otro' THEN (SELECT monto FROM public.cuenta_ajustes WHERE id = _id)
    ELSE NULL
  END;
$function$;
CREATE OR REPLACE FUNCTION public.pago_monto_imputado(_tipo text, _id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(SUM(monto), 0) FROM public.pagos_imputaciones
  WHERE pago_origen_tipo = _tipo AND pago_origen_id = _id AND anulado_at IS NULL;
$function$;
ALTER TABLE public.pagos_imputaciones ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.pagos_imputaciones ALTER COLUMN created_at SET DEFAULT now();
