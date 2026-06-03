
-- Flag de exclusión por producto
ALTER TABLE public.store_products
  ADD COLUMN IF NOT EXISTS no_admite_cambio boolean NOT NULL DEFAULT false;

-- Enums
DO $$ BEGIN
  CREATE TYPE public.cambio_estado AS ENUM (
    'solicitado','aprobado','en_deposito','listo_retiro','entregado',
    'rechazado','cancelado','devolucion_solicitada'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.cambio_motivo AS ENUM ('talle','color','defecto','otro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.cambio_iniciador AS ENUM ('alumno','admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Tabla principal
CREATE TABLE IF NOT EXISTS public.store_cambios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alumno_id uuid NOT NULL REFERENCES public.alumnos(id) ON DELETE RESTRICT,
  producto_id uuid NOT NULL REFERENCES public.store_products(id) ON DELETE RESTRICT,
  origen_tipo text NOT NULL CHECK (origen_tipo IN ('compra','preorder')),
  compra_id uuid,
  preorder_id uuid,
  variante_origen jsonb NOT NULL DEFAULT '{}'::jsonb,
  variante_destino jsonb,
  motivo public.cambio_motivo NOT NULL,
  comentario text,
  fotos text[] NOT NULL DEFAULT ARRAY[]::text[],
  estado public.cambio_estado NOT NULL DEFAULT 'solicitado',
  diferencia_precio numeric NOT NULL DEFAULT 0,
  moneda text NOT NULL DEFAULT 'ARS',
  estado_pago_diferencia text NOT NULL DEFAULT 'no_aplica'
    CHECK (estado_pago_diferencia IN ('no_aplica','pendiente','pagado')),
  mp_payment_id text,
  iniciado_por public.cambio_iniciador NOT NULL DEFAULT 'alumno',
  admin_iniciador_id uuid,
  motivo_admin text,
  responsable_admin_id uuid,
  responsable_deposito_id uuid,
  historial jsonb NOT NULL DEFAULT '[]'::jsonb,
  notificar_alumno boolean NOT NULL DEFAULT true,
  aprobado_at timestamptz,
  en_deposito_at timestamptz,
  listo_retiro_at timestamptz,
  entregado_at timestamptz,
  cerrado_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_store_cambios_alumno ON public.store_cambios(alumno_id);
CREATE INDEX IF NOT EXISTS idx_store_cambios_estado ON public.store_cambios(estado);
CREATE INDEX IF NOT EXISTS idx_store_cambios_producto ON public.store_cambios(producto_id);

GRANT SELECT, INSERT, UPDATE ON public.store_cambios TO authenticated;
GRANT ALL ON public.store_cambios TO service_role;

ALTER TABLE public.store_cambios ENABLE ROW LEVEL SECURITY;

-- Alumno ve sus propios cambios
CREATE POLICY "Alumno ve sus cambios" ON public.store_cambios
  FOR SELECT TO authenticated
  USING (
    alumno_id IN (SELECT id FROM public.alumnos WHERE user_id = auth.uid())
  );

-- Alumno inserta sus propios cambios
CREATE POLICY "Alumno crea sus cambios" ON public.store_cambios
  FOR INSERT TO authenticated
  WITH CHECK (
    alumno_id IN (SELECT id FROM public.alumnos WHERE user_id = auth.uid())
    AND iniciado_por = 'alumno'
  );

-- Alumno cancela sus propios cambios (solo si está solicitado)
CREATE POLICY "Alumno cancela sus cambios" ON public.store_cambios
  FOR UPDATE TO authenticated
  USING (
    alumno_id IN (SELECT id FROM public.alumnos WHERE user_id = auth.uid())
  )
  WITH CHECK (
    alumno_id IN (SELECT id FROM public.alumnos WHERE user_id = auth.uid())
  );

-- Admin gestión total
CREATE POLICY "Admin gestiona cambios" ON public.store_cambios
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Depósito gestión total
CREATE POLICY "Deposito gestiona cambios" ON public.store_cambios
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'deposito'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'deposito'::app_role));

-- Trigger updated_at
CREATE TRIGGER trg_store_cambios_updated_at
  BEFORE UPDATE ON public.store_cambios
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger: append historial + timestamps en cambio de estado
CREATE OR REPLACE FUNCTION public.store_cambios_track_estado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.historial := jsonb_build_array(jsonb_build_object(
      'estado', NEW.estado, 'at', now(), 'by', auth.uid(), 'nota', 'Creación'
    ));
    RETURN NEW;
  END IF;

  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    NEW.historial := COALESCE(OLD.historial, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'estado', NEW.estado, 'at', now(), 'by', auth.uid()
    ));
    IF NEW.estado = 'aprobado' AND NEW.aprobado_at IS NULL THEN NEW.aprobado_at := now(); END IF;
    IF NEW.estado = 'en_deposito' AND NEW.en_deposito_at IS NULL THEN NEW.en_deposito_at := now(); END IF;
    IF NEW.estado = 'listo_retiro' AND NEW.listo_retiro_at IS NULL THEN NEW.listo_retiro_at := now(); END IF;
    IF NEW.estado = 'entregado' AND NEW.entregado_at IS NULL THEN NEW.entregado_at := now(); END IF;
    IF NEW.estado IN ('entregado','rechazado','cancelado') AND NEW.cerrado_at IS NULL THEN
      NEW.cerrado_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_store_cambios_track
  BEFORE INSERT OR UPDATE ON public.store_cambios
  FOR EACH ROW EXECUTE FUNCTION public.store_cambios_track_estado();

-- RPC: alumno solicita cambio
CREATE OR REPLACE FUNCTION public.request_cambio_indumentaria(
  p_producto_id uuid,
  p_origen_tipo text,
  p_compra_id uuid,
  p_preorder_id uuid,
  p_variante_origen jsonb,
  p_variante_destino jsonb,
  p_motivo public.cambio_motivo,
  p_comentario text,
  p_fotos text[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alumno_id uuid;
  v_producto record;
  v_id uuid;
  v_existing int;
BEGIN
  SELECT id INTO v_alumno_id FROM public.alumnos WHERE user_id = auth.uid() LIMIT 1;
  IF v_alumno_id IS NULL THEN RAISE EXCEPTION 'No autorizado'; END IF;

  SELECT * INTO v_producto FROM public.store_products WHERE id = p_producto_id;
  IF v_producto IS NULL THEN RAISE EXCEPTION 'Producto no encontrado'; END IF;
  IF v_producto.no_admite_cambio THEN RAISE EXCEPTION 'Este producto no admite cambios'; END IF;

  SELECT count(*) INTO v_existing
  FROM public.store_cambios
  WHERE alumno_id = v_alumno_id
    AND producto_id = p_producto_id
    AND estado IN ('solicitado','aprobado','en_deposito','listo_retiro','devolucion_solicitada');
  IF v_existing > 0 THEN RAISE EXCEPTION 'Ya tenés una solicitud de cambio abierta para este producto'; END IF;

  INSERT INTO public.store_cambios (
    alumno_id, producto_id, origen_tipo, compra_id, preorder_id,
    variante_origen, variante_destino, motivo, comentario, fotos,
    iniciado_por
  ) VALUES (
    v_alumno_id, p_producto_id, p_origen_tipo, p_compra_id, p_preorder_id,
    COALESCE(p_variante_origen, '{}'::jsonb), p_variante_destino,
    p_motivo, p_comentario, COALESCE(p_fotos, ARRAY[]::text[]),
    'alumno'
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- RPC: admin crea cambio en nombre de alumno
CREATE OR REPLACE FUNCTION public.admin_create_cambio_indumentaria(
  p_alumno_id uuid,
  p_producto_id uuid,
  p_origen_tipo text,
  p_compra_id uuid,
  p_preorder_id uuid,
  p_variante_origen jsonb,
  p_variante_destino jsonb,
  p_motivo public.cambio_motivo,
  p_comentario text,
  p_motivo_admin text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Solo admin';
  END IF;
  IF p_motivo_admin IS NULL OR length(trim(p_motivo_admin)) < 3 THEN
    RAISE EXCEPTION 'Debés indicar el motivo administrativo';
  END IF;

  INSERT INTO public.store_cambios (
    alumno_id, producto_id, origen_tipo, compra_id, preorder_id,
    variante_origen, variante_destino, motivo, comentario,
    iniciado_por, admin_iniciador_id, motivo_admin, estado
  ) VALUES (
    p_alumno_id, p_producto_id, p_origen_tipo, p_compra_id, p_preorder_id,
    COALESCE(p_variante_origen, '{}'::jsonb), p_variante_destino,
    p_motivo, p_comentario,
    'admin', auth.uid(), p_motivo_admin, 'aprobado'
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- RPC: transición de estado con guardas por rol
CREATE OR REPLACE FUNCTION public.transition_cambio_estado(
  p_id uuid,
  p_nuevo_estado public.cambio_estado,
  p_nota text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cambio record;
  v_is_admin boolean;
  v_is_deposito boolean;
  v_is_owner boolean;
BEGIN
  SELECT * INTO v_cambio FROM public.store_cambios WHERE id = p_id;
  IF v_cambio IS NULL THEN RAISE EXCEPTION 'Cambio no encontrado'; END IF;

  v_is_admin := public.has_role(auth.uid(), 'admin'::app_role);
  v_is_deposito := public.has_role(auth.uid(), 'deposito'::app_role);
  v_is_owner := EXISTS (SELECT 1 FROM public.alumnos WHERE id = v_cambio.alumno_id AND user_id = auth.uid());

  -- Alumno solo puede cancelar mientras está solicitado
  IF v_is_owner AND NOT v_is_admin AND NOT v_is_deposito THEN
    IF p_nuevo_estado <> 'cancelado' OR v_cambio.estado <> 'solicitado' THEN
      RAISE EXCEPTION 'No autorizado';
    END IF;
  ELSIF NOT v_is_admin AND NOT v_is_deposito THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  -- Depósito solo puede mover entre estados operativos
  IF v_is_deposito AND NOT v_is_admin THEN
    IF p_nuevo_estado NOT IN ('en_deposito','listo_retiro') THEN
      RAISE EXCEPTION 'Depósito no puede cambiar a ese estado';
    END IF;
  END IF;

  UPDATE public.store_cambios
  SET estado = p_nuevo_estado,
      responsable_admin_id = CASE WHEN v_is_admin AND p_nuevo_estado IN ('aprobado','rechazado','entregado')
                                  THEN auth.uid() ELSE responsable_admin_id END,
      responsable_deposito_id = CASE WHEN v_is_deposito AND p_nuevo_estado IN ('en_deposito','listo_retiro')
                                     THEN auth.uid() ELSE responsable_deposito_id END,
      historial = historial || jsonb_build_array(jsonb_build_object(
        'estado', p_nuevo_estado, 'at', now(), 'by', auth.uid(), 'nota', p_nota
      ))
  WHERE id = p_id;
END;
$$;
