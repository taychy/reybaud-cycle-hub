
-- 1) delivered_at columns
ALTER TABLE public.store_orders ADD COLUMN IF NOT EXISTS delivered_at timestamptz;
ALTER TABLE public.store_preorders ADD COLUMN IF NOT EXISTS delivered_at timestamptz;

-- backfill for existing delivered rows so the 30-day window starts now (best-effort)
UPDATE public.store_orders SET delivered_at = COALESCE(updated_at, created_at)
  WHERE status = 'entregado' AND delivered_at IS NULL;
UPDATE public.store_preorders SET delivered_at = COALESCE(updated_at, created_at)
  WHERE estado = 'entregada' AND delivered_at IS NULL;

-- 2) triggers to set delivered_at on status change
CREATE OR REPLACE FUNCTION public.set_store_order_delivered_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status = 'entregado' AND (OLD.status IS DISTINCT FROM 'entregado') AND NEW.delivered_at IS NULL THEN
    NEW.delivered_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_store_order_delivered_at ON public.store_orders;
CREATE TRIGGER trg_set_store_order_delivered_at
BEFORE UPDATE ON public.store_orders
FOR EACH ROW EXECUTE FUNCTION public.set_store_order_delivered_at();

CREATE OR REPLACE FUNCTION public.set_store_preorder_delivered_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.estado = 'entregada' AND (OLD.estado IS DISTINCT FROM 'entregada') AND NEW.delivered_at IS NULL THEN
    NEW.delivered_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_store_preorder_delivered_at ON public.store_preorders;
CREATE TRIGGER trg_set_store_preorder_delivered_at
BEFORE UPDATE ON public.store_preorders
FOR EACH ROW EXECUTE FUNCTION public.set_store_preorder_delivered_at();

-- 3) Email al alumno cuando el cambio queda "listo_retiro"
CREATE OR REPLACE FUNCTION public.notify_cambio_listo_retiro()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_alumno record;
  v_product_name text;
  v_message_id uuid;
  v_html text;
  v_variante_str text;
BEGIN
  IF NEW.estado = 'listo_retiro' AND (OLD.estado IS DISTINCT FROM 'listo_retiro') THEN
    SELECT a.nombre, a.apellido, a.email INTO v_alumno
      FROM public.alumnos a WHERE a.id = NEW.alumno_id;

    IF v_alumno.email IS NULL OR v_alumno.email = '' THEN
      RETURN NEW;
    END IF;

    SELECT name INTO v_product_name FROM public.store_products WHERE id = NEW.producto_id;

    v_variante_str := COALESCE(
      (SELECT string_agg(key || ': ' || value, ' · ')
        FROM jsonb_each_text(COALESCE(NEW.variante_destino, '{}'::jsonb))),
      'sin variante'
    );

    v_message_id := gen_random_uuid();
    v_html :=
      '<div style="font-family: -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#ffffff;">'
      || '<h2 style="color:#E8832A;font-family:Oswald,Arial,sans-serif;text-transform:uppercase;letter-spacing:1px;margin:0 0 16px;">Tu cambio está listo para retirar</h2>'
      || '<p style="color:#333;margin:0 0 12px;">Hola ' || COALESCE(v_alumno.nombre,'') || ', tu cambio ya está preparado y te espera en sede.</p>'
      || '<table style="width:100%;border-collapse:collapse;margin:12px 0;">'
      || '<tr><td style="padding:6px 0;color:#666;">Producto</td><td style="padding:6px 0;font-weight:600;">' || COALESCE(v_product_name,'—') || '</td></tr>'
      || '<tr><td style="padding:6px 0;color:#666;">Nueva variante</td><td style="padding:6px 0;font-weight:600;">' || v_variante_str || '</td></tr>'
      || '</table>'
      || '<p style="color:#666;font-size:13px;margin-top:18px;">Pasá por sede en nuestros horarios habituales. Si no podés venir esta semana, escribinos por WhatsApp.</p>'
      || '<p style="color:#999;font-size:11px;margin-top:24px;">Ciclismo Reybaud</p>'
      || '</div>';

    PERFORM public.enqueue_email(
      'transactional_emails',
      jsonb_build_object(
        'message_id', v_message_id,
        'to', v_alumno.email,
        'from', 'Ciclismo Reybaud <noreply@notify.reybaud-app.com>',
        'sender_domain', 'notify.reybaud-app.com',
        'subject', 'Tu cambio está listo para retirar en sede',
        'html', v_html,
        'text', '',
        'purpose', 'transactional',
        'label', 'store_cambio_listo_retiro',
        'idempotency_key', 'cambio_listo_' || NEW.id::text,
        'queued_at', now()
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_cambio_listo_retiro ON public.store_cambios;
CREATE TRIGGER trg_notify_cambio_listo_retiro
AFTER UPDATE ON public.store_cambios
FOR EACH ROW EXECUTE FUNCTION public.notify_cambio_listo_retiro();
