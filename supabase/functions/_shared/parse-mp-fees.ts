// Helper compartido: dado un objeto payment de Mercado Pago (respuesta de
// GET /v1/payments/{id}), devuelve el desglose de comisiones para persistir.
//
// MP devuelve `fee_details: [{ type, amount, fee_payer }, ...]`.
// - type = 'mercadopago_fee' → comisión operativa
// - type = 'financing_fee'   → cuando el cliente pagó en cuotas y absorbimos
// - type = 'application_fee' → marketplace
// - type = 'discount'        → ajustes
// Los IIBB llegan como `taxes_amount` o dentro de `taxes: [{ type: 'IIBB'... }]`.

export interface MpFeesBreakdown {
  bruto: number;
  comision_mp: number;
  iibb: number;
  otros_fees: number;
  neto_recibido: number;
}

export function parseMpFees(mpPayment: any): MpFeesBreakdown {
  const bruto = Number(mpPayment?.transaction_amount ?? 0);
  const fees = Array.isArray(mpPayment?.fee_details) ? mpPayment.fee_details : [];

  let comision_mp = 0;
  let otros_fees = 0;
  for (const f of fees) {
    const amt = Number(f?.amount ?? 0);
    if (!Number.isFinite(amt) || amt === 0) continue;
    const type = String(f?.type ?? "").toLowerCase();
    if (type === "mercadopago_fee" || type === "financing_fee") {
      comision_mp += amt;
    } else {
      otros_fees += amt;
    }
  }

  // IIBB: MP suele reportarlo en `taxes` o `taxes_amount`
  let iibb = 0;
  const taxes = Array.isArray(mpPayment?.taxes) ? mpPayment.taxes : [];
  for (const t of taxes) {
    const amt = Number(t?.value ?? t?.amount ?? 0);
    if (!Number.isFinite(amt) || amt === 0) continue;
    const type = String(t?.type ?? "").toUpperCase();
    if (type.includes("IIBB") || type.includes("IB")) {
      iibb += amt;
    } else {
      otros_fees += amt;
    }
  }
  if (iibb === 0 && Number.isFinite(Number(mpPayment?.taxes_amount))) {
    iibb = Number(mpPayment.taxes_amount);
  }

  // net_received_amount viene en algunos payloads; si no, calculamos.
  const netFromMp = Number(mpPayment?.transaction_details?.net_received_amount);
  const neto_recibido = Number.isFinite(netFromMp) && netFromMp > 0
    ? netFromMp
    : Math.max(0, bruto - comision_mp - iibb - otros_fees);

  return {
    bruto: round2(bruto),
    comision_mp: round2(comision_mp),
    iibb: round2(iibb),
    otros_fees: round2(otros_fees),
    neto_recibido: round2(neto_recibido),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Consulta detalle del pago en MP con token
export async function fetchMpPayment(paymentId: string, accessToken: string): Promise<any> {
  const r = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!r.ok) {
    throw new Error(`MP API ${r.status}: ${await r.text()}`);
  }
  return await r.json();
}
