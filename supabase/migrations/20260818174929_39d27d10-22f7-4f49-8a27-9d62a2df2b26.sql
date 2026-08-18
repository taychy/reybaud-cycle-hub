DO $$
DECLARE v_cuenta uuid;
BEGIN
  PERFORM set_config('app.sub_internal','on',true);

  -- ══════════ 1) GASTON LAYA — stale 0bf4e5f7 (jun) / correcto eec7c9aa (ago) / MP 171612288011 ══════════
  SELECT cuenta_mp_id INTO v_cuenta FROM mp_account_movements WHERE mp_payment_id='171612288011';
  UPDATE suscripciones SET
    estado='cancelada', cancelada_at=now(),
    cancelada_motivo='Anulada por auditoría EARLY_RENEWAL_PERIODO_STALE',
    metodo_pago='pendiente', mp_payment_id=NULL, mp_status=NULL, auto_renovacion=false,
    notas=coalesce(notas,'')||E'\n[2026-08-18] Auditoría: creada con período de junio por contexto stale de renovación anticipada. El pago MP 171612288011 correspondía a agosto y se reimputó a la suscripción eec7c9aa-28bd-4ed7-aa07-669169b78ad4.'
  WHERE id='0bf4e5f7-96d5-4aa6-ac26-acc4378d8b2d' AND estado='finalizada';
  UPDATE mp_account_movements SET suscripcion_id='eec7c9aa-28bd-4ed7-aa07-669169b78ad4', updated_at=now(),
    assign_notes=coalesce(assign_notes,'')||'[2026-08-18] Reimputado desde sub stale 0bf4e5f7 (junio) a la mensualidad de agosto.'
  WHERE mp_payment_id='171612288011';
  UPDATE suscripciones SET metodo_pago='mercadopago', mp_status='approved', mp_payment_id='171612288011',
    cuenta_mp_id=coalesce(cuenta_mp_id,v_cuenta),
    notas=coalesce(notas,'')||E'\n[2026-08-18] Auditoría: se vincula el pago real MP 171612288011 (07/08, $65.500).'
  WHERE id='eec7c9aa-28bd-4ed7-aa07-669169b78ad4';

  -- ══════════ 2) LUCIANA ALVAREZ — stale 1178c6b1 (jun) / correcto ba931658 (ago) / MP 171179050801 ══════════
  SELECT cuenta_mp_id INTO v_cuenta FROM mp_account_movements WHERE mp_payment_id='171179050801';
  UPDATE suscripciones SET
    estado='cancelada', cancelada_at=now(),
    cancelada_motivo='Anulada por auditoría EARLY_RENEWAL_PERIODO_STALE',
    metodo_pago='pendiente', mp_payment_id=NULL, mp_status=NULL, auto_renovacion=false,
    notas=coalesce(notas,'')||E'\n[2026-08-18] Auditoría: creada con período de junio por contexto stale de renovación anticipada (junio ya estaba pago por c627c9a0). El pago MP 171179050801 correspondía a agosto y se reimputó a ba931658-a676-451b-8eb8-8a936d94b537.'
  WHERE id='1178c6b1-7df3-4523-8663-1f19fff07033' AND estado='finalizada';
  UPDATE mp_account_movements SET suscripcion_id='ba931658-a676-451b-8eb8-8a936d94b537', updated_at=now(),
    assign_notes=coalesce(assign_notes,'')||'[2026-08-18] Reimputado desde sub stale 1178c6b1 (junio) a la mensualidad de agosto.'
  WHERE mp_payment_id='171179050801';
  UPDATE suscripciones SET metodo_pago='mercadopago', mp_status='approved', mp_payment_id='171179050801',
    cuenta_mp_id=coalesce(cuenta_mp_id,v_cuenta),
    notas=coalesce(notas,'')||E'\n[2026-08-18] Auditoría: se vincula el pago real MP 171179050801 (04/08, $83.500).'
  WHERE id='ba931658-a676-451b-8eb8-8a936d94b537';

  -- ══════════ 3) MERCEDES CARLÉS — stale 724fc3d3 (jul) / correcto 260fca1a (ago) / MP 171147087281 ══════════
  SELECT cuenta_mp_id INTO v_cuenta FROM mp_account_movements WHERE mp_payment_id='171147087281';
  UPDATE suscripciones SET
    estado='cancelada', cancelada_at=now(),
    cancelada_motivo='Anulada por auditoría EARLY_RENEWAL_PERIODO_STALE',
    metodo_pago='pendiente', mp_payment_id=NULL, mp_status=NULL, auto_renovacion=false,
    notas=coalesce(notas,'')||E'\n[2026-08-18] Auditoría: creada con período de julio por contexto stale de renovación anticipada (julio ya estaba pago por bb4ad5b6). El pago MP 171147087281 correspondía a agosto y se reimputó a 260fca1a-d314-4748-aa49-39f969c31ba9.'
  WHERE id='724fc3d3-784c-425c-a62b-1a46113a5509' AND estado='finalizada';
  UPDATE mp_account_movements SET suscripcion_id='260fca1a-d314-4748-aa49-39f969c31ba9', updated_at=now(),
    assign_notes=coalesce(assign_notes,'')||'[2026-08-18] Reimputado desde sub stale 724fc3d3 (julio) a la mensualidad de agosto.'
  WHERE mp_payment_id='171147087281';
  UPDATE suscripciones SET metodo_pago='mercadopago', mp_status='approved', mp_payment_id='171147087281',
    cuenta_mp_id=coalesce(cuenta_mp_id,v_cuenta),
    notas=coalesce(notas,'')||E'\n[2026-08-18] Auditoría: se vincula el pago real MP 171147087281 (04/08, $83.500).'
  WHERE id='260fca1a-d314-4748-aa49-39f969c31ba9';

  -- ══════════ 4) DANIEL POZO — stale 7ab53aee (jul) + duplicado a6dd4752 (jul) / correcto 66da81aa (ago) / MP 171083932863 ══════════
  SELECT cuenta_mp_id INTO v_cuenta FROM mp_account_movements WHERE mp_payment_id='171083932863';
  UPDATE suscripciones SET
    estado='cancelada', cancelada_at=now(),
    cancelada_motivo='Anulada por auditoría EARLY_RENEWAL_PERIODO_STALE',
    metodo_pago='pendiente', mp_payment_id=NULL, mp_status=NULL, auto_renovacion=false,
    notas=coalesce(notas,'')||E'\n[2026-08-18] Auditoría: creada con período de julio por contexto stale (julio ya estaba pago por 6cd50f90). El pago MP 171083932863 correspondía a agosto y se reimputó a 66da81aa-bf40-41cd-8691-ed1850fc1c18.'
  WHERE id='7ab53aee-d241-4a81-9560-17961fbeee27' AND estado='finalizada';
  UPDATE suscripciones SET
    estado='cancelada', cancelada_at=now(),
    cancelada_motivo='Anulada por auditoría: tercera mensualidad de julio duplicada (informe manual del alumno del 05/08 sobre un pago ya registrado)',
    auto_renovacion=false,
    notas=coalesce(notas,'')||E'\n[2026-08-18] Auditoría: cargo de julio duplicado sin pago propio; julio ya estaba cubierto por 6cd50f90.'
  WHERE id='a6dd4752-7292-4995-b0d5-e2911e4f2a3d' AND estado='finalizada';
  UPDATE mp_account_movements SET suscripcion_id='66da81aa-bf40-41cd-8691-ed1850fc1c18', updated_at=now(),
    assign_notes=coalesce(assign_notes,'')||'[2026-08-18] Reimputado desde sub stale 7ab53aee (julio) a la mensualidad de agosto.'
  WHERE mp_payment_id='171083932863';
  UPDATE suscripciones SET metodo_pago='mercadopago', mp_status='approved', mp_payment_id='171083932863',
    cuenta_mp_id=coalesce(cuenta_mp_id,v_cuenta),
    notas=coalesce(notas,'')||E'\n[2026-08-18] Auditoría: se vincula el pago real MP 171083932863 (04/08, $80.030). Queda saldo pendiente de $3.470 sobre el precio de agosto ($83.500).'
  WHERE id='66da81aa-bf40-41cd-8691-ed1850fc1c18';
END $$;