-- Control observacional de una única camioneta con varias cargas internas por sede.
-- No convierte ausencias en entregas ni modifica stock o cobros.
CREATE TABLE IF NOT EXISTS public.vehiculo_entrega_consultas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.vehiculo_carga_items(id) ON DELETE CASCADE,
  canal text NOT NULL DEFAULT 'whatsapp',
  mensaje text NOT NULL,
  consultado_por uuid,
  consultado_at timestamptz NOT NULL DEFAULT now(),
  respuesta text NOT NULL DEFAULT 'pendiente'
    CHECK (respuesta IN ('pendiente','recibido','no_recibido','sin_confirmar')),
  gusto text NULL CHECK (gusto IN ('si','no','sin_opinion')),
  comentario text,
  respondido_por uuid,
  respondido_at timestamptz
);
CREATE INDEX IF NOT EXISTS vehiculo_entrega_consultas_item_idx
  ON public.vehiculo_entrega_consultas(item_id,consultado_at DESC);
ALTER TABLE public.vehiculo_entrega_consultas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "personal_deposito_lee_consultas" ON public.vehiculo_entrega_consultas;
CREATE POLICY "personal_deposito_lee_consultas" ON public.vehiculo_entrega_consultas
 FOR SELECT TO authenticated USING (
   public.has_role(auth.uid(),'admin'::app_role)
   OR public.has_role(auth.uid(),'deposito'::app_role)
 );
REVOKE ALL ON public.vehiculo_entrega_consultas FROM anon;
GRANT SELECT ON public.vehiculo_entrega_consultas TO authenticated;

CREATE OR REPLACE FUNCTION public.registrar_consulta_entrega_camioneta(
 p_item_id uuid, p_mensaje text, p_canal text DEFAULT 'whatsapp'
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_role(auth.uid(),'admin'::app_role) OR
    public.has_role(auth.uid(),'deposito'::app_role)) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF trim(COALESCE(p_mensaje,''))='' THEN RAISE EXCEPTION 'Falta el mensaje'; END IF;
  IF p_canal NOT IN ('whatsapp','otro') THEN RAISE EXCEPTION 'Canal inválido'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.vehiculo_carga_items WHERE id=p_item_id) THEN
    RAISE EXCEPTION 'Ítem de carga no encontrado';
  END IF;
  INSERT INTO public.vehiculo_entrega_consultas (item_id,canal,mensaje,consultado_por)
  VALUES (p_item_id,p_canal,left(p_mensaje,2000),auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
CREATE OR REPLACE FUNCTION public.registrar_respuesta_entrega_camioneta(
 p_consulta_id uuid, p_respuesta text, p_gusto text DEFAULT NULL, p_comentario text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_role(auth.uid(),'admin'::app_role) OR
    public.has_role(auth.uid(),'deposito'::app_role)) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF p_respuesta NOT IN ('pendiente','recibido','no_recibido','sin_confirmar') THEN
    RAISE EXCEPTION 'Respuesta inválida';
  END IF;
  IF p_gusto IS NOT NULL AND p_gusto NOT IN ('si','no','sin_opinion') THEN
    RAISE EXCEPTION 'Valor de satisfacción inválido';
  END IF;
  UPDATE public.vehiculo_entrega_consultas
  SET respuesta=p_respuesta,gusto=p_gusto,
      comentario=nullif(left(trim(COALESCE(p_comentario,'')),1000),''),
      respondido_por=auth.uid(),respondido_at=now()
  WHERE id=p_consulta_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Consulta no encontrada'; END IF;
  -- La respuesta del alumno NO cambia estados de entrega automáticamente.
END;
$$;

-- Finaliza una ronda que engloba todas las subcargas activas de la camioneta.
-- Lo no escaneado se marca como "faltante", JAMÁS como "entregado".
CREATE OR REPLACE FUNCTION public.finalizar_control_camioneta_total(p_chequeo_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_row record; v_ids uuid[]; v_faltantes int:=0;
        v_controlados int:=0; v_total int:=0; v_r jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_role(auth.uid(),'admin'::app_role) OR
    public.has_role(auth.uid(),'deposito'::app_role)) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF array_length(p_chequeo_ids,1) IS NULL THEN RAISE EXCEPTION 'No hay controles para cerrar'; END IF;
  SELECT array_agg(DISTINCT x) INTO v_ids FROM unnest(p_chequeo_ids) x;
  IF (SELECT count(*) FROM public.vehiculo_chequeos
      WHERE id=ANY(v_ids) AND estado='en_curso') <>
     (SELECT count(*) FROM unnest(v_ids)) THEN
    RAISE EXCEPTION 'Alguna ronda ya fue cerrada o no existe';
  END IF;

  FOR v_row IN
    SELECT id,carga_id FROM public.vehiculo_chequeos
    WHERE id=ANY(v_ids) AND estado='en_curso' FOR UPDATE
  LOOP
    -- Completar con cero únicamente los ítems que nunca se verificaron.
    INSERT INTO public.vehiculo_chequeo_scans
      (chequeo_id,item_id,cantidad_vista,scanned_by,scanned_at)
    SELECT v_row.id,i.id,0,auth.uid(),now()
    FROM public.vehiculo_carga_items i
    WHERE i.carga_id=v_row.carga_id AND i.estado='cargado'
      AND NOT EXISTS(
        SELECT 1 FROM public.vehiculo_chequeo_scans x
        WHERE x.chequeo_id=v_row.id AND x.item_id=i.id
      )
    ON CONFLICT (chequeo_id,item_id) DO NOTHING;

    SELECT count(*) INTO v_controlados
    FROM public.vehiculo_chequeo_scans x JOIN public.vehiculo_carga_items i ON i.id=x.item_id
    WHERE x.chequeo_id=v_row.id AND i.estado='cargado' AND x.cantidad_vista>0;
    SELECT count(*) INTO v_total
    FROM public.vehiculo_carga_items WHERE carga_id=v_row.carga_id AND estado='cargado';

    -- No etiquetar como "faltante" si Administración ya registró pedido entregado.
    WITH faltantes AS (
      UPDATE public.vehiculo_carga_items i
      SET estado='faltante', chequeado_at=NULL, chequeado_by=NULL, updated_at=now()
      FROM public.vehiculo_chequeo_scans x
      WHERE x.chequeo_id=v_row.id AND x.item_id=i.id
        AND x.cantidad_vista < GREATEST(COALESCE(i.cantidad,1),1) AND i.estado='cargado'
        AND NOT (
          i.source_table='store_order_items' AND EXISTS (
             SELECT 1 FROM public.store_order_items oi
             JOIN public.store_orders o ON o.id=oi.order_id
             WHERE oi.id=i.source_id AND o.status='entregado'
          )
        )
      RETURNING i.id
    )
    SELECT count(*) INTO v_faltantes FROM faltantes;

    v_r := public.close_vehiculo_chequeo_observacional(v_row.id,NULL);
  END LOOP;

  RETURN jsonb_build_object('ok',true,
    'nota','Control físico cerrado. Lo no encontrado queda pendiente de investigar, nunca entregado.');
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_consulta_entrega_camioneta(uuid,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.registrar_respuesta_entrega_camioneta(uuid,text,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.finalizar_control_camioneta_total(uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.registrar_consulta_entrega_camioneta(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_respuesta_entrega_camioneta(uuid,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalizar_control_camioneta_total(uuid[]) TO authenticated;
