-- Plantilla maestra Training Camp (idempotente por nombre)
DO $$
DECLARE
  v_tpl_id uuid;
BEGIN
  SELECT id INTO v_tpl_id FROM public.process_templates
   WHERE nombre = 'Training Camp' LIMIT 1;

  IF v_tpl_id IS NULL THEN
    INSERT INTO public.process_templates (nombre, descripcion, rol_destino, icono, activo)
    VALUES (
      'Training Camp',
      'Plantilla maestra para organizar un training camp de punta a punta. Duplicala y renombrala con el nombre del camp (ej: "Training Camp San Luis - Oct 2026").',
      'admin',
      'MapPin',
      true
    )
    RETURNING id INTO v_tpl_id;

    INSERT INTO public.process_template_stages
      (template_id, orden, titulo, instrucciones, requiere_foto, requiere_nota, entidad_control, accion_final)
    VALUES
      (v_tpl_id, 1, 'Diseño del camp',
        'Definir fechas, sede, capacidad, paquetes con etapas de precio, cuotas, habitaciones, addons y roadbook. Cargar el evento en estado Borrador.',
        false, true, 'none', 'none'),
      (v_tpl_id, 2, 'Publicar como Próximamente + abrir waitlist',
        'Pasar el evento a estado Próximamente. Configurar preguntas de waitlist (usar plantilla o crear una nueva). Verificar mensaje público.',
        false, true, 'none', 'none'),
      (v_tpl_id, 3, 'Difusión inicial',
        'Enviar email masivo a la base + waitlist previa. Publicar en redes (Instagram, TikTok). Enviar WhatsApp a interesados históricos. Registrar canales usados.',
        false, true, 'none', 'none'),
      (v_tpl_id, 4, 'Apertura de ventas',
        'Cambiar estado del evento a Publicado. Verificar que reservas y pagos funcionen (MP, transferencia, efectivo). Notificar a la waitlist que se abrieron las reservas.',
        false, true, 'none', 'none'),
      (v_tpl_id, 5, 'Go / No-go: confirmar cupo mínimo',
        'Revisar reservas confirmadas al deadline interno. Si se alcanza el mínimo → seguir. Si no → decidir postergar/cancelar y comunicar a inscriptos.',
        false, true, 'none', 'none'),
      (v_tpl_id, 6, 'Reservas de logística',
        'Reservar hotel, transporte, catering. Confirmar coaches y honorarios acordados. Guardar contratos/comprobantes en carpeta compartida.',
        false, true, 'none', 'none'),
      (v_tpl_id, 7, 'Cierre de inscripciones',
        'Marcar el evento como Agotado (o cerrar según fecha límite de pago). Habilitar waitlist para el próximo camp. Cortar el flujo de nuevas reservas.',
        false, true, 'none', 'none'),
      (v_tpl_id, 8, 'Pre-camp',
        'Armar rooming list (event_room_assignments). Verificar checklist de cada alumno (talle de bici, docs, seguro). Enviar comunicado pre-viaje. Briefing interno con el equipo.',
        false, true, 'none', 'none'),
      (v_tpl_id, 9, 'Ejecución del camp',
        'Check-in en el hotel. Envío diario de comunicados/roadbook. Registro de participación, fotos y resultados. Resolver incidencias en el momento.',
        true, true, 'none', 'none'),
      (v_tpl_id, 10, 'Post-camp y cierre',
        'Enviar encuesta NPS. Liquidar honorarios de coaches. Emitir facturas pendientes. Reunión de aprendizajes con el equipo. Archivar esta instancia y desactivar la plantilla del camp cuando esté todo cobrado y facturado.',
        false, true, 'none', 'none');
  END IF;
END $$;