
DO $$
BEGIN
  PERFORM set_config('role', 'service_role', true);

  UPDATE public.suscripciones
  SET estado = 'cancelada',
      cancelada_at = now(),
      cancelada_motivo = 'Pago MP 163874916165 reimputado manualmente a la sub de junio (03e0ff21-4cba-45c1-909e-3bf1ccb8a7f2). Sub generada por bug del flujo Pagar este plan que creaba renovacion anticipada en vez de cobrar la sub pendiente del periodo vigente.',
      notas = COALESCE(notas, '') || ' | REVERSED:imputado_a:03e0ff21-4cba-45c1-909e-3bf1ccb8a7f2'
  WHERE id = 'fe1e6dab-7cd4-46d6-bb98-2acc10ff3ee4';

  UPDATE public.suscripciones
  SET estado = 'activa',
      mp_payment_id = '163874916165',
      mp_status = 'approved',
      metodo_pago = 'mercadopago',
      origen_registro = 'automatico',
      precio_final = 80030,
      notas = 'Pago MP 163874916165 originalmente acreditado en sub de julio fe1e6dab-7cd4-46d6-bb98-2acc10ff3ee4 (anulada). Reimputado a esta cuota de junio. Monto cobrado: 80030 (precio base previo: 75500).'
  WHERE id = '03e0ff21-4cba-45c1-909e-3bf1ccb8a7f2';

  UPDATE public.alumnos
  SET estado = 'activo'
  WHERE id = '2f0a26ff-0e42-483d-8f38-eab211fb63d0';

  PERFORM set_config('role', 'postgres', true);
END $$;
RESET ROLE;
