/**
 * Extrae información legible de un movimiento de Mercado Pago (campo `raw`)
 * para ayudar a identificar el gasto/transferencia al categorizar.
 */

export interface MpMovementDetail {
  contraparte: string | null;
  operacion: string | null;
  medio: string | null;
  referencia: string | null;
  concepto: string | null;
}

const BRANCH_LABELS: Record<string, string> = {
  "AM-to-POT - Partition Transfer": "Transferencia a bolsillo (Reservas/Inversiones)",
  "POT-to-AM-Partition Transfer": "Retiro de bolsillo a Disponible",
  "Intra MP": "Transferencia entre cuentas MP",
  "Transfers Intra MP Web": "Transferencia MP (web)",
  "Transport - Tolls paygo": "Peajes / transporte",
  "Collections Forzado - Facturacion Pospaga": "Débito de facturación MP",
  "Bill payments": "Pago de factura / servicio",
  "Bill Payments - Agenda": "Pago de servicio agendado",
  "Merchant Services": "Compra en comercio",
  Marketplace: "Compra en Marketplace",
  QR: "Pago con QR",
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  account_money: "Dinero en cuenta",
  debin_transfer: "Transferencia (DEBIN)",
  cvu: "Transferencia CVU",
  master: "Mastercard",
  visa: "Visa",
  amex: "Amex",
};

const firstString = (...vals: unknown[]): string | null => {
  for (const v of vals) {
    if (typeof v === "string" && v.trim() && v.trim().toLowerCase() !== "varios") return v.trim();
  }
  return null;
};

export function getMpMovementDetail(m: {
  raw?: any;
  description?: string | null;
  payer_name?: string | null;
  payer_email?: string | null;
  payment_method?: string | null;
  payment_type?: string | null;
  external_reference?: string | null;
}): MpMovementDetail {
  const raw = m.raw ?? {};
  const poi = raw?.point_of_interaction ?? {};
  const bank = poi?.transaction_data?.bank_info ?? {};
  const branch = poi?.business_info?.branch as string | undefined;

  const contraparte = firstString(
    bank?.collector?.account_holder_name,
    bank?.collector?.long_name,
    bank?.collector?.account_alias,
    raw?.additional_info?.payer?.first_name &&
      `${raw.additional_info.payer.first_name} ${raw?.additional_info?.payer?.last_name ?? ""}`,
    m.payer_name,
    raw?.collector?.first_name && `${raw.collector.first_name} ${raw?.collector?.last_name ?? ""}`,
    raw?.additional_info?.items?.[0]?.title,
    m.payer_email,
  );

  const operacion = firstString(branch ? BRANCH_LABELS[branch] ?? branch : null, poi?.business_info?.unit);

  const rawMethod = firstString(raw?.payment_method_id, m.payment_method, m.payment_type);
  const medio = rawMethod ? PAYMENT_METHOD_LABELS[rawMethod] ?? rawMethod : null;

  const referencia = firstString(
    m.external_reference,
    raw?.external_reference,
    raw?.statement_descriptor,
    bank?.collector?.account_id,
  );

  const concepto = firstString(m.description, raw?.description, raw?.additional_info?.items?.[0]?.title);

  return { contraparte, operacion, medio, referencia, concepto };
}

/** Nombre sugerido para el gasto a crear. */
export function suggestGastoDescripcion(
  m: Parameters<typeof getMpMovementDetail>[0] & { mp_payment_id: string },
): string {
  const d = getMpMovementDetail(m);
  return d.concepto ?? d.contraparte ?? d.operacion ?? `Egreso MP ${m.mp_payment_id}`;
}
