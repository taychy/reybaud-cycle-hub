-- Edición segura de gastos asociados a eventos.
-- Los movimientos conciliados con Mercado Pago conservan monto, fecha, moneda
-- y medio de pago como datos autoritativos. Sólo se editan campos descriptivos.

CREATE OR REPLACE FUNCTION public.update_event_gasto(
  p_gasto_id uuid,
  p_event_id uuid,
  p_categoria text,
  p_descripcion text,
  p_proveedor text DEFAULT NULL,
  p_notas text DEFAULT NULL,
  p_fecha date DEFAULT NULL,
  p_monto numeric DEFAULT NULL,
  p_moneda text DEFAULT NULL,
  p_forma_pago text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  g public.gastos%ROWTYPE;
  v_linked_mp boolean;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin'::public.app_role) OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Solo un admin puede editar gastos del evento';
  END IF;

  SELECT * INTO g
  FROM public.gastos
  WHERE id=p_gasto_id AND event_id=p_event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Gasto no encontrado en este evento';
  END IF;

  v_linked_mp := g.mp_payment_id IS NOT NULL OR g.origen_registro LIKE 'mp_%';

  IF NULLIF(trim(COALESCE(p_descripcion,'')),'') IS NULL THEN
    RAISE EXCEPTION 'La descripción es obligatoria';
  END IF;

  IF v_linked_mp THEN
    UPDATE public.gastos
    SET categoria = COALESCE(NULLIF(trim(p_categoria),''), categoria),
        descripcion = trim(p_descripcion),
        proveedor = NULLIF(trim(COALESCE(p_proveedor,'')),''),
        notas = NULLIF(trim(COALESCE(p_notas,'')),''),
        unidad_negocio = 'viajes',
        updated_at = now()
    WHERE id=p_gasto_id;
  ELSE
    IF COALESCE(p_monto,0) <= 0 THEN
      RAISE EXCEPTION 'El monto debe ser mayor a cero';
    END IF;

    UPDATE public.gastos
    SET categoria = COALESCE(NULLIF(trim(p_categoria),''), categoria),
        descripcion = trim(p_descripcion),
        proveedor = NULLIF(trim(COALESCE(p_proveedor,'')),''),
        notas = NULLIF(trim(COALESCE(p_notas,'')),''),
        fecha = COALESCE(p_fecha, fecha),
        monto = p_monto,
        moneda = COALESCE(NULLIF(trim(COALESCE(p_moneda,'')),''), moneda),
        forma_pago = COALESCE(NULLIF(trim(COALESCE(p_forma_pago,'')),''), forma_pago),
        updated_at = now()
    WHERE id=p_gasto_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'gasto_id', p_gasto_id,
    'linked_mp', v_linked_mp
  );
END;
$function$;
