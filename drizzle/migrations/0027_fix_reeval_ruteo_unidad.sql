-- Corrige la re-evaluación al cambiar el ruteo: auto_estado es NOT NULL,
-- así que se re-evalúa cada fila pendiente en vez de ponerla en NULL.
CREATE OR REPLACE FUNCTION public.tg_unidad_routing_reeval()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.facturacion_cola%ROWTYPE; v_new public.facturacion_cola%ROWTYPE;
BEGIN
  IF NEW.activa IS DISTINCT FROM OLD.activa
     OR NEW.cuenta_mp_id IS DISTINCT FROM OLD.cuenta_mp_id
     OR NEW.emisor_fiscal_id IS DISTINCT FROM OLD.emisor_fiscal_id THEN
    FOR r IN
      SELECT c.* FROM public.facturacion_cola c
      WHERE c.estado = 'pendiente'
        AND c.auto_estado IN ('requiere_revision_emisor','manual')
        AND public._fact_unidades(public._fact_segmento_norm(c.segmento)) @> ARRAY[NEW.unidad::text]
    LOOP
      v_new := public._fact_cola_evaluar(r);
      UPDATE public.facturacion_cola SET
        auto_estado = v_new.auto_estado,
        auto_motivo = v_new.auto_motivo,
        emisor_resuelto_id = v_new.emisor_resuelto_id,
        cuenta_mp_id = v_new.cuenta_mp_id,
        auto_lock_at = NULL, auto_proximo_intento_at = NULL, auto_intentos = 0
      WHERE id = r.id;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;