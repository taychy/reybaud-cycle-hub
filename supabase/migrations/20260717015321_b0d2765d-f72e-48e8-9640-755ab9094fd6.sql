-- 1. Columna de subtareas en la plantilla
ALTER TABLE public.process_template_stages
  ADD COLUMN IF NOT EXISTS subtasks jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 2. Estado de subtareas por corrida
ALTER TABLE public.process_instance_stages
  ADD COLUMN IF NOT EXISTS subtasks_state jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 3. Rellenar plantilla Training Camp con subtareas
DO $$
DECLARE
  v_tpl_id uuid;
  v_stage_id uuid;
BEGIN
  SELECT id INTO v_tpl_id FROM public.process_templates WHERE nombre = 'Training Camp' LIMIT 1;
  IF v_tpl_id IS NULL THEN RETURN; END IF;

  -- Helper: por orden
  FOR v_stage_id, v_tpl_id IN
    SELECT id, template_id FROM public.process_template_stages WHERE template_id = v_tpl_id
  LOOP END LOOP;

  UPDATE public.process_template_stages SET subtasks =
    '[
      {"id":"s1-1","titulo":"Definir fechas y sede"},
      {"id":"s1-2","titulo":"Definir capacidad total (cupo mín. y máx.)"},
      {"id":"s1-3","titulo":"Cargar paquetes con etapas de precio"},
      {"id":"s1-4","titulo":"Definir cuotas y plan de pagos"},
      {"id":"s1-5","titulo":"Cargar habitaciones y capacidades"},
      {"id":"s1-6","titulo":"Cargar addons (excursiones, alquileres, etc.)"},
      {"id":"s1-7","titulo":"Redactar roadbook base"},
      {"id":"s1-8","titulo":"Crear el evento en Borrador con toda la info"}
    ]'::jsonb
   WHERE template_id = (SELECT id FROM public.process_templates WHERE nombre='Training Camp') AND orden = 1;

  UPDATE public.process_template_stages SET subtasks =
    '[
      {"id":"s2-1","titulo":"Pasar el evento a estado Próximamente"},
      {"id":"s2-2","titulo":"Elegir/armar plantilla de preguntas de waitlist"},
      {"id":"s2-3","titulo":"Redactar mensaje público de la waitlist"},
      {"id":"s2-4","titulo":"Verificar CTA \"Anotarme\" en la vista pública"}
    ]'::jsonb
   WHERE template_id = (SELECT id FROM public.process_templates WHERE nombre='Training Camp') AND orden = 2;

  UPDATE public.process_template_stages SET subtasks =
    '[
      {"id":"s3-1","titulo":"Email masivo a base histórica"},
      {"id":"s3-2","titulo":"Post en feed de Instagram"},
      {"id":"s3-3","titulo":"Historias / reels en Instagram"},
      {"id":"s3-4","titulo":"Post en TikTok"},
      {"id":"s3-5","titulo":"WhatsApp a interesados históricos / waitlist previa"},
      {"id":"s3-6","titulo":"Registrar alcance e inscripciones a waitlist"}
    ]'::jsonb
   WHERE template_id = (SELECT id FROM public.process_templates WHERE nombre='Training Camp') AND orden = 3;

  UPDATE public.process_template_stages SET subtasks =
    '[
      {"id":"s4-1","titulo":"Cambiar estado del evento a Publicado"},
      {"id":"s4-2","titulo":"Prueba de reserva con Mercado Pago"},
      {"id":"s4-3","titulo":"Prueba de reserva con transferencia"},
      {"id":"s4-4","titulo":"Email a la waitlist: \"Ya podés reservar\""},
      {"id":"s4-5","titulo":"Anuncio en redes con link directo"}
    ]'::jsonb
   WHERE template_id = (SELECT id FROM public.process_templates WHERE nombre='Training Camp') AND orden = 4;

  UPDATE public.process_template_stages SET subtasks =
    '[
      {"id":"s5-1","titulo":"Contar reservas confirmadas al deadline interno"},
      {"id":"s5-2","titulo":"Comparar contra el cupo mínimo"},
      {"id":"s5-3","titulo":"Decisión: seguir / postergar / cancelar"},
      {"id":"s5-4","titulo":"Comunicar decisión a inscriptos (si aplica)"}
    ]'::jsonb
   WHERE template_id = (SELECT id FROM public.process_templates WHERE nombre='Training Camp') AND orden = 5;

  UPDATE public.process_template_stages SET subtasks =
    '[
      {"id":"s6-1","titulo":"Reservar hotel (fechas + habitaciones)"},
      {"id":"s6-2","titulo":"Reservar transporte"},
      {"id":"s6-3","titulo":"Reservar catering"},
      {"id":"s6-4","titulo":"Confirmar coaches y honorarios"},
      {"id":"s6-5","titulo":"Guardar contratos y comprobantes en carpeta compartida"}
    ]'::jsonb
   WHERE template_id = (SELECT id FROM public.process_templates WHERE nombre='Training Camp') AND orden = 6;

  UPDATE public.process_template_stages SET subtasks =
    '[
      {"id":"s7-1","titulo":"Marcar el evento como Agotado (o cerrar por fecha)"},
      {"id":"s7-2","titulo":"Habilitar waitlist para el próximo camp"},
      {"id":"s7-3","titulo":"Cortar el flujo de nuevas reservas"},
      {"id":"s7-4","titulo":"Avisar a quienes quedan en waitlist"}
    ]'::jsonb
   WHERE template_id = (SELECT id FROM public.process_templates WHERE nombre='Training Camp') AND orden = 7;

  UPDATE public.process_template_stages SET subtasks =
    '[
      {"id":"s8-1","titulo":"Armar rooming list (asignar habitaciones)"},
      {"id":"s8-2","titulo":"Verificar checklist de cada alumno (talle bici, docs, seguro)"},
      {"id":"s8-3","titulo":"Enviar comunicado pre-viaje con logística"},
      {"id":"s8-4","titulo":"Briefing interno con el equipo"},
      {"id":"s8-5","titulo":"Preparar kit de bienvenida / merchandising"}
    ]'::jsonb
   WHERE template_id = (SELECT id FROM public.process_templates WHERE nombre='Training Camp') AND orden = 8;

  UPDATE public.process_template_stages SET subtasks =
    '[
      {"id":"s9-1","titulo":"Check-in en el hotel día 1"},
      {"id":"s9-2","titulo":"Envío diario de comunicado / roadbook"},
      {"id":"s9-3","titulo":"Registrar fotos y momentos clave"},
      {"id":"s9-4","titulo":"Cargar resultados / participación"},
      {"id":"s9-5","titulo":"Resolver incidencias que surjan"}
    ]'::jsonb
   WHERE template_id = (SELECT id FROM public.process_templates WHERE nombre='Training Camp') AND orden = 9;

  UPDATE public.process_template_stages SET subtasks =
    '[
      {"id":"s10-1","titulo":"Enviar encuesta NPS a los participantes"},
      {"id":"s10-2","titulo":"Recolectar feedback interno del equipo"},
      {"id":"s10-3","titulo":"Liquidar honorarios de coaches"},
      {"id":"s10-4","titulo":"Emitir facturas pendientes"},
      {"id":"s10-5","titulo":"Reunión de aprendizajes / debrief"},
      {"id":"s10-6","titulo":"Archivar la plantilla del camp (desactivar) cuando esté todo cobrado"}
    ]'::jsonb
   WHERE template_id = (SELECT id FROM public.process_templates WHERE nombre='Training Camp') AND orden = 10;
END $$;