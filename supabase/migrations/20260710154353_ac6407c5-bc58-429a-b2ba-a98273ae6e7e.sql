
DELETE FROM public.cuenta_ajustes
WHERE id = 'fd927f7b-8f77-4ac3-a8b5-55a53d8a9dd6';

SET LOCAL session_replication_role = replica;

UPDATE public.suscripciones
   SET estado = 'activa',
       metodo_pago = 'mp_externo_claudio',
       mp_status = 'approved',
       updated_at = now()
 WHERE id = 'c5ea3417-cd36-47a8-9f56-f7ae622a3b42';

SET LOCAL session_replication_role = origin;
