
DO $$ BEGIN CREATE TYPE public.process_entidad_control AS ENUM ('none','store_preorder','supplier_order'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.process_accion_final AS ENUM ('none','send_report'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.process_instance_estado AS ENUM ('en_curso','completada','cancelada'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.process_stage_estado AS ENUM ('pendiente','en_curso','completada'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.process_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  descripcion text,
  rol_destino text NOT NULL DEFAULT 'deposito',
  icono text,
  activo boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.process_templates TO authenticated;
GRANT ALL ON public.process_templates TO service_role;
ALTER TABLE public.process_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage templates" ON public.process_templates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.is_super_admin(auth.uid()));
CREATE POLICY "deposito reads active templates" ON public.process_templates FOR SELECT TO authenticated
  USING (activo = true AND public.has_role(auth.uid(),'deposito'));

CREATE TABLE public.process_template_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.process_templates(id) ON DELETE CASCADE,
  orden int NOT NULL,
  titulo text NOT NULL,
  instrucciones text,
  requiere_foto boolean NOT NULL DEFAULT false,
  requiere_nota boolean NOT NULL DEFAULT false,
  entidad_control public.process_entidad_control NOT NULL DEFAULT 'none',
  accion_final public.process_accion_final NOT NULL DEFAULT 'none',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, orden)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.process_template_stages TO authenticated;
GRANT ALL ON public.process_template_stages TO service_role;
ALTER TABLE public.process_template_stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage template stages" ON public.process_template_stages FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.is_super_admin(auth.uid()));
CREATE POLICY "deposito reads stages of active templates" ON public.process_template_stages FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'deposito') AND EXISTS (
    SELECT 1 FROM public.process_templates t WHERE t.id = template_id AND t.activo = true
  ));

CREATE TABLE public.process_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.process_templates(id) ON DELETE RESTRICT,
  iniciado_por uuid NOT NULL,
  asignado_a uuid,
  destinatario_reporte_email text,
  estado public.process_instance_estado NOT NULL DEFAULT 'en_curso',
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.process_instances TO authenticated;
GRANT ALL ON public.process_instances TO service_role;
ALTER TABLE public.process_instances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage instances" ON public.process_instances FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.is_super_admin(auth.uid()));
CREATE POLICY "deposito reads own/role instances" ON public.process_instances FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'deposito') AND (
    iniciado_por = auth.uid() OR asignado_a = auth.uid() OR asignado_a IS NULL
  ));
CREATE POLICY "deposito creates instances" ON public.process_instances FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'deposito') AND iniciado_por = auth.uid());
CREATE POLICY "deposito updates own instances" ON public.process_instances FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'deposito') AND (iniciado_por = auth.uid() OR asignado_a = auth.uid()))
  WITH CHECK (public.has_role(auth.uid(),'deposito') AND (iniciado_por = auth.uid() OR asignado_a = auth.uid()));

CREATE TABLE public.process_instance_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NOT NULL REFERENCES public.process_instances(id) ON DELETE CASCADE,
  template_stage_id uuid NOT NULL REFERENCES public.process_template_stages(id) ON DELETE RESTRICT,
  orden int NOT NULL,
  estado public.process_stage_estado NOT NULL DEFAULT 'pendiente',
  foto_url text,
  nota text,
  entidad_ref_id uuid,
  entidad_ref_texto text,
  completed_by uuid,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (instance_id, orden)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.process_instance_stages TO authenticated;
GRANT ALL ON public.process_instance_stages TO service_role;
ALTER TABLE public.process_instance_stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage instance stages" ON public.process_instance_stages FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.is_super_admin(auth.uid()));
CREATE POLICY "deposito reads stages of own instances" ON public.process_instance_stages FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'deposito') AND EXISTS (
    SELECT 1 FROM public.process_instances i WHERE i.id = instance_id
      AND (i.iniciado_por = auth.uid() OR i.asignado_a = auth.uid() OR i.asignado_a IS NULL)
  ));
CREATE POLICY "deposito updates stages of own instances" ON public.process_instance_stages FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'deposito') AND EXISTS (
    SELECT 1 FROM public.process_instances i WHERE i.id = instance_id
      AND (i.iniciado_por = auth.uid() OR i.asignado_a = auth.uid())
  ))
  WITH CHECK (public.has_role(auth.uid(),'deposito') AND EXISTS (
    SELECT 1 FROM public.process_instances i WHERE i.id = instance_id
      AND (i.iniciado_por = auth.uid() OR i.asignado_a = auth.uid())
  ));

CREATE OR REPLACE FUNCTION public.tg_process_instance_seed_stages()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.process_instance_stages (instance_id, template_stage_id, orden, estado)
  SELECT NEW.id, s.id, s.orden,
         CASE WHEN s.orden = 1 THEN 'en_curso'::process_stage_estado ELSE 'pendiente'::process_stage_estado END
  FROM public.process_template_stages s
  WHERE s.template_id = NEW.template_id
  ORDER BY s.orden;
  RETURN NEW;
END; $$;

CREATE TRIGGER process_instance_seed_stages
AFTER INSERT ON public.process_instances
FOR EACH ROW EXECUTE FUNCTION public.tg_process_instance_seed_stages();

CREATE TRIGGER process_templates_updated BEFORE UPDATE ON public.process_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER process_template_stages_updated BEFORE UPDATE ON public.process_template_stages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER process_instances_updated BEFORE UPDATE ON public.process_instances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER process_instance_stages_updated BEFORE UPDATE ON public.process_instance_stages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "admins read process-photos" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'process-photos' AND (public.has_role(auth.uid(),'admin') OR public.is_super_admin(auth.uid())));
CREATE POLICY "deposito read own process-photos" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'process-photos' AND public.has_role(auth.uid(),'deposito')
         AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "deposito insert process-photos" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'process-photos' AND (
    (public.has_role(auth.uid(),'deposito') AND (storage.foldername(name))[1] = auth.uid()::text)
    OR public.has_role(auth.uid(),'admin') OR public.is_super_admin(auth.uid())
  ));

DO $$
DECLARE t1 uuid; t2 uuid; t3 uuid;
BEGIN
  INSERT INTO public.process_templates (nombre, descripcion, rol_destino, icono, activo)
  VALUES ('Ingreso de mercadería al depósito',
          'Recepción, control y reporte de mercadería recibida del proveedor.',
          'deposito','PackagePlus', true) RETURNING id INTO t1;
  INSERT INTO public.process_template_stages (template_id, orden, titulo, instrucciones, requiere_foto, requiere_nota, entidad_control, accion_final) VALUES
    (t1, 1, 'Recepción de mercadería', 'Controlá que todo lo que aparece en la factura del proveedor esté físicamente en la caja. Sacá una foto clara de la factura.', true, true, 'none', 'none'),
    (t1, 2, 'Control contra pedido', 'Verificá que la factura coincida con el pedido original (preventa o pedido al proveedor). Anotá cualquier diferencia.', false, true, 'store_preorder', 'none'),
    (t1, 3, 'Reporte final', 'Confirmá el ingreso. Se enviará un reporte por mail al destinatario elegido al iniciar el proceso.', false, true, 'none', 'send_report');

  INSERT INTO public.process_templates (nombre, descripcion, rol_destino, icono, activo)
  VALUES ('Devolución a proveedor',
          'Identificación, preparación y envío de mercadería a devolver al proveedor.',
          'deposito','PackageMinus', true) RETURNING id INTO t2;
  INSERT INTO public.process_template_stages (template_id, orden, titulo, instrucciones, requiere_foto, requiere_nota, entidad_control, accion_final) VALUES
    (t2, 1, 'Identificación de productos', 'Listá los productos a devolver y el motivo. Foto opcional del estado del producto.', false, true, 'none', 'none'),
    (t2, 2, 'Preparación y empaque', 'Empaquetá los productos y sacá una foto del paquete listo para enviar.', true, true, 'none', 'none'),
    (t2, 3, 'Reporte final', 'Confirmá la devolución. Se enviará un reporte por mail al destinatario elegido.', false, true, 'none', 'send_report');

  INSERT INTO public.process_templates (nombre, descripcion, rol_destino, icono, activo)
  VALUES ('Conteo de stock',
          'Conteo físico, comparación con sistema y reporte de diferencias.',
          'deposito','ClipboardList', true) RETURNING id INTO t3;
  INSERT INTO public.process_template_stages (template_id, orden, titulo, instrucciones, requiere_foto, requiere_nota, entidad_control, accion_final) VALUES
    (t3, 1, 'Conteo físico por categoría', 'Contá físicamente el stock por categoría y registrá los totales en la nota.', false, true, 'none', 'none'),
    (t3, 2, 'Comparación con sistema', 'Compará lo contado contra el stock del sistema y registrá las diferencias encontradas.', false, true, 'none', 'none'),
    (t3, 3, 'Reporte final', 'Confirmá el conteo. Se enviará el resumen por mail al destinatario elegido.', false, true, 'none', 'send_report');
END $$;
