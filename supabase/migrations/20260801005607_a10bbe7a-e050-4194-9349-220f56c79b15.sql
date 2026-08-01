CREATE OR REPLACE FUNCTION public.validate_suscripcion_precio()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.precio_base IS NOT NULL
     AND NEW.precio_final IS NOT NULL
     AND NEW.precio_final < NEW.precio_base - 0.01
     AND NEW.descuento_id IS NULL
     AND (NEW.precio_excepcion_motivo IS NULL OR btrim(NEW.precio_excepcion_motivo) = '')
  THEN
    IF current_setting('app.price_sync', true) = 'on' THEN
      NEW.precio_final := NEW.precio_base;
    ELSE
      RAISE EXCEPTION 'El precio final (%) es menor al precio base (%) sin descuento ni excepción autorizada. Cargá un descuento o completá precio_excepcion_motivo.',
        NEW.precio_final, NEW.precio_base;
    END IF;
  END IF;

  IF NEW.precio_excepcion_motivo IS NOT NULL
     AND btrim(NEW.precio_excepcion_motivo) <> ''
     AND (TG_OP = 'INSERT' OR NEW.precio_excepcion_motivo IS DISTINCT FROM OLD.precio_excepcion_motivo
          OR NEW.precio_final IS DISTINCT FROM OLD.precio_final) THEN
    NEW.precio_excepcion_at := COALESCE(NEW.precio_excepcion_at, now());
    NEW.precio_excepcion_autorizado_por := COALESCE(NEW.precio_excepcion_autorizado_por, auth.uid());

    INSERT INTO public.audit_log (user_id, user_role, action, entity_type, entity_id, details)
    VALUES (
      auth.uid(),
      'system',
      'precio_excepcion',
      'suscripciones',
      NEW.id::text,
      jsonb_build_object(
        'precio_base', NEW.precio_base,
        'precio_final', NEW.precio_final,
        'motivo', NEW.precio_excepcion_motivo,
        'tipo', NEW.precio_excepcion_tipo,
        'valor', NEW.precio_excepcion_valor,
        'vigencia_hasta', NEW.precio_excepcion_vigencia_hasta,
        'autorizado_por', NEW.precio_excepcion_autorizado_por
      )
    );
  END IF;

  RETURN NEW;
END;
$function$;