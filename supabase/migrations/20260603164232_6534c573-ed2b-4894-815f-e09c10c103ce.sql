-- Cierra agujeros de seguridad: PII expuesta a anon en flujo /viaje?token=
-- y view SECURITY DEFINER. El acceso por token ahora pasa por la edge function
-- get-event-participant-by-token (service role, valida token server-side).

-- 1) event_external_participants: remover SELECT abierto a anon
DROP POLICY IF EXISTS "Anon can view external participants" ON public.event_external_participants;

-- 2) event_reservations: remover SELECT abierto a anon
DROP POLICY IF EXISTS "Anon can view reservation by token" ON public.event_reservations;

-- 3) reservation_checklist_data: remover SELECT/UPDATE/INSERT abiertos a anon
DROP POLICY IF EXISTS "Anon can view checklist data" ON public.reservation_checklist_data;
DROP POLICY IF EXISTS "Anon can update checklist data" ON public.reservation_checklist_data;
DROP POLICY IF EXISTS "Anon can insert checklist data" ON public.reservation_checklist_data;

-- 4) View vw_cuenta_corriente_movimientos: forzar SECURITY INVOKER
--    para que respete las policies del usuario que consulta.
ALTER VIEW public.vw_cuenta_corriente_movimientos SET (security_invoker = true);
