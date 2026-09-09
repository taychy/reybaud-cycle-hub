-- 1) alumno_id en cobros de listas de entrega
ALTER TABLE public.delivery_list_payments
  ADD COLUMN IF NOT EXISTS alumno_id uuid REFERENCES public.alumnos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_delivery_list_payments_alumno
  ON public.delivery_list_payments (alumno_id);

-- 2) Backfill seguro: solo cuando (list_id, cliente_nombre) resuelve a un único alumno_id no nulo
WITH resolved AS (
  SELECT list_id, cliente_nombre,
         MIN(alumno_id::text)::uuid AS alumno_id
  FROM public.delivery_list_items
  WHERE alumno_id IS NOT NULL
  GROUP BY list_id, cliente_nombre
  HAVING COUNT(DISTINCT alumno_id) = 1
     AND COUNT(*) FILTER (WHERE alumno_id IS NULL) = 0
)
UPDATE public.delivery_list_payments p
SET alumno_id = r.alumno_id
FROM resolved r
WHERE p.alumno_id IS NULL
  AND p.list_id = r.list_id
  AND p.cliente_nombre = r.cliente_nombre;

-- 3) RPC de reasignación de comprador (por ítem, con auditoría)
CREATE OR REPLACE FUNCTION public.reasignar_comprador_entrega(
  _item_id uuid,
  _alumno_id uuid DEFAULT NULL,
  _cliente_nombre text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_item record;
  v_nuevo_nombre text;
  v_alumno record;
  v_cobros_previos int := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT * INTO v_item FROM public.delivery_list_items WHERE id = _item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'item_not_found'; END IF;

  IF _alumno_id IS NOT NULL THEN
    SELECT id, nombre, apellido INTO v_alumno FROM public.alumnos WHERE id = _alumno_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'alumno_not_found'; END IF;
    v_nuevo_nombre := btrim(COALESCE(v_alumno.nombre,'') || ' ' || COALESCE(v_alumno.apellido,''));
  ELSE
    v_nuevo_nombre := NULLIF(btrim(COALESCE(_cliente_nombre, '')), '');
    IF v_nuevo_nombre IS NULL THEN RAISE EXCEPTION 'alumno_o_nombre_requerido'; END IF;
  END IF;

  SELECT COUNT(*) INTO v_cobros_previos
  FROM public.delivery_list_payments
  WHERE list_id = v_item.list_id
    AND cliente_nombre = v_item.cliente_nombre;

  UPDATE public.delivery_list_items
  SET alumno_id = _alumno_id,
      cliente_alumno_id = _alumno_id,
      cliente_nombre = v_nuevo_nombre,
      updated_at = now()
  WHERE id = _item_id;

  INSERT INTO public.audit_log (user_id, user_email, user_role, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(), auth.email(), 'admin', 'reasignar_comprador_entrega', 'delivery_list_items', _item_id::text,
    jsonb_build_object(
      'item_id', _item_id,
      'list_id', v_item.list_id,
      'comprador_anterior_nombre', v_item.cliente_nombre,
      'comprador_anterior_alumno_id', v_item.alumno_id,
      'comprador_nuevo_nombre', v_nuevo_nombre,
      'comprador_nuevo_alumno_id', _alumno_id,
      'producto', v_item.producto,
      'variante', v_item.variante,
      'cantidad', v_item.cantidad,
      'precio', v_item.precio_venta,
      'moneda', v_item.moneda,
      'cobros_previos_comprador_anterior', v_cobros_previos,
      'nota_alcance', 'No se mueven cobros existentes del comprador anterior.'
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'item_id', _item_id,
    'cliente_nombre', v_nuevo_nombre,
    'alumno_id', _alumno_id,
    'cobros_previos_comprador_anterior', v_cobros_previos
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reasignar_comprador_entrega(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reasignar_comprador_entrega(uuid, uuid, text) TO authenticated;

-- 4) Cuenta corriente: cargo_entrega + pago_entrega (idempotente)
DO $do$
DECLARE v text;
BEGIN
  SELECT pg_get_viewdef('public.vw_cuenta_corriente_movimientos'::regclass, true) INTO v;
  IF position('cargo_entrega' in v) > 0 THEN
    RETURN;
  END IF;
  v := rtrim(btrim(v), ';');

  EXECUTE 'CREATE OR REPLACE VIEW public.vw_cuenta_corriente_movimientos AS ' || v || $q$
UNION ALL
 SELECT dli.alumno_id,
    COALESCE(dl.fecha_entrega, dli.created_at::date) AS fecha,
    'cargo_entrega'::text AS tipo,
    (('Entrega — '::text || COALESCE(dl.titulo, '—'::text)) || ' — '::text || dli.producto) ||
        CASE WHEN COALESCE(dli.variante, ''::text) <> ''::text THEN (' ('::text || dli.variante) || ')'::text ELSE ''::text END AS concepto,
    'delivery_list_items'::text AS fuente_tabla,
    dli.id AS fuente_id,
    round(dli.precio_venta * COALESCE(dli.cantidad, 1::numeric), 2) AS debe,
    0::numeric AS haber,
    COALESCE(dli.moneda, 'ARS'::text) AS moneda,
    CASE WHEN dli.preparado THEN 'entregado'::text ELSE 'pendiente'::text END AS estado,
    jsonb_build_object('list_id', dli.list_id, 'list_title', dl.titulo, 'item_id', dli.id, 'producto', dli.producto,
      'variante', dli.variante, 'cantidad', dli.cantidad, 'precio_unitario', dli.precio_venta,
      'cliente_nombre', dli.cliente_nombre, 'alumno_id', dli.alumno_id, 'preparado', dli.preparado,
      'fecha_entrega', dl.fecha_entrega, 'notas', dli.notas, 'source_type', dli.source_type) AS referencia_extra
   FROM delivery_list_items dli
     JOIN delivery_lists dl ON dl.id = dli.list_id
  WHERE dli.alumno_id IS NOT NULL
    AND COALESCE(dli.precio_venta, 0::numeric) > 0::numeric
    AND dli.source_order_id IS NULL
    AND dli.source_preorder_id IS NULL
    AND COALESCE(dli.source_type, 'manual'::text) <> ALL (ARRAY['store_order'::text, 'store_preorder'::text, 'preventa'::text, 'orden_tienda'::text])
    AND COALESCE(dl.estado, ''::text) <> 'cancelada'::text
UNION ALL
 SELECT dlp.alumno_id,
    COALESCE(dlp.validado_at::date, dlp.created_at::date) AS fecha,
    'pago_entrega'::text AS tipo,
    ('Pago entrega — '::text || COALESCE(dl.titulo, '—'::text)) ||
        CASE WHEN dlp.forma_pago IS NOT NULL THEN (' ('::text || dlp.forma_pago) || ')'::text ELSE ''::text END AS concepto,
    'delivery_list_payments'::text AS fuente_tabla,
    dlp.id AS fuente_id,
    0::numeric AS debe,
    COALESCE(dlp.monto, 0::numeric) AS haber,
    COALESCE(dlp.moneda, 'ARS'::text) AS moneda,
    'validado'::text AS estado,
    jsonb_build_object('list_id', dlp.list_id, 'list_title', dl.titulo, 'cliente_nombre', dlp.cliente_nombre,
      'alumno_id', dlp.alumno_id, 'forma_pago', dlp.forma_pago, 'medio_pago', dlp.forma_pago,
      'comprobante_path', dlp.comprobante_path, 'notas', dlp.notas, 'cargado_por_nombre', dlp.cargado_por_nombre,
      'origen', dlp.origen, 'fecha_pago', COALESCE(dlp.validado_at, dlp.created_at), 'created_at', dlp.created_at,
      'validado', dlp.validado, 'validado_at', dlp.validado_at, 'validado_notas', dlp.validado_notas) AS referencia_extra
   FROM delivery_list_payments dlp
     JOIN delivery_lists dl ON dl.id = dlp.list_id
  WHERE dlp.alumno_id IS NOT NULL
    AND dlp.validado = true
    AND dlp.rechazado IS DISTINCT FROM true
$q$;
END
$do$;