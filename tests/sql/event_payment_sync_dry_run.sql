-- Dry run SOLO LECTURA de 0112 (no escribe nada). Simula, por reserva con cuotas, el reparto
-- de la línea base productiva (todos los validados, FIFO) y del candidato (excluye anulados;
-- en la activación ningún pago histórico tiene la marca de destino explícito => FIFO puro),
-- y lo compara con lo almacenado hoy. Se ejecuta con una consulta de lectura.
WITH cur AS (
  SELECT r.id, COALESCE(r.currency_snapshot, e.currency, 'ARS') c, r.amount_paid
  FROM event_reservations r LEFT JOIN events e ON e.id = r.event_id
  WHERE EXISTS (SELECT 1 FROM reservation_installments i WHERE i.reservation_id = r.id)
), pay AS (
  SELECT cur.id,
    COALESCE(SUM(COALESCE(p.equivalent_amount_event_currency, CASE WHEN COALESCE(p.currency, cur.c) = cur.c THEN p.amount END, 0)) FILTER (WHERE p.status='validado'),0) base_paid,
    COALESCE(SUM(COALESCE(p.equivalent_amount_event_currency, CASE WHEN COALESCE(p.currency, cur.c) = cur.c THEN p.amount END, 0)) FILTER (WHERE p.status='validado' AND p.anulado_at IS NULL),0) cand_paid,
    count(*) FILTER (WHERE p.installment_id IS NOT NULL AND p.status='validado') pagos_con_cuota
  FROM cur LEFT JOIN reservation_payments p ON p.reservation_id = cur.id GROUP BY cur.id
), inst AS (
  SELECT i.*, GREATEST(i.amount - COALESCE(i.condoned_amount,0),0) owe,
    (i.status IS DISTINCT FROM 'reprogramada' AND COALESCE(i.condoned_amount,0) < i.amount) elig
  FROM reservation_installments i JOIN cur ON cur.id = i.reservation_id
), cum AS (
  SELECT inst.*, COALESCE(SUM(owe) FILTER (WHERE elig) OVER (PARTITION BY reservation_id ORDER BY installment_number, due_date NULLS LAST, id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) before
  FROM inst
), sim AS (
  SELECT c.*, pay.base_paid, pay.cand_paid,
    CASE WHEN NOT elig THEN 0 ELSE LEAST(owe, GREATEST(pay.base_paid - before,0)) END base_apply,
    CASE WHEN NOT elig THEN 0 ELSE LEAST(owe, GREATEST(pay.cand_paid - before,0)) END cand_apply
  FROM cum c JOIN pay ON pay.id = c.reservation_id
)
SELECT
  (SELECT count(*) FROM cur) reservas_con_cuotas,
  (SELECT count(*) FROM pay WHERE pagos_con_cuota > 0) reservas_con_pagos_de_cuota,
  (SELECT sum(pagos_con_cuota) FROM pay) pagos_validados_con_cuota,
  (SELECT count(*) FROM pay WHERE base_paid <> cand_paid) reservas_total_cambia_por_anulados,
  count(*) FILTER (WHERE base_apply <> cand_apply) cuotas_reparto_candidato_vs_base,
  count(DISTINCT reservation_id) FILTER (WHERE base_apply <> cand_apply) reservas_reparto_candidato_vs_base,
  count(*) FILTER (WHERE elig AND COALESCE(paid_amount,0) <> base_apply) cuotas_hoy_desfasadas_vs_base,
  count(DISTINCT reservation_id) FILTER (WHERE elig AND COALESCE(paid_amount,0) <> base_apply) reservas_hoy_desfasadas_vs_base,
  count(*) FILTER (WHERE elig AND COALESCE(paid_amount,0) <> cand_apply) cuotas_cambiarian_al_recalcular,
  count(DISTINCT reservation_id) FILTER (WHERE elig AND COALESCE(paid_amount,0) <> cand_apply) reservas_cambiarian_al_recalcular,
  count(*) FILTER (WHERE monto_pagado IS DISTINCT FROM paid_amount OR saldo_pendiente IS DISTINCT FROM balance_due) cuotas_espejo_desalineado,
  count(DISTINCT reservation_id) FILTER (WHERE monto_pagado IS DISTINCT FROM paid_amount OR saldo_pendiente IS DISTINCT FROM balance_due) reservas_espejo_desalineado
FROM sim;
