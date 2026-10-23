export interface BillingQueueStatus {
  estado: string;
  auto_estado?: string | null;
  excluida_facturacion?: boolean;
  factura_estado?: string | null;
  factura_cae?: string | null;
}

export function isBillingExcluded(row: BillingQueueStatus): boolean {
  return row.excluida_facturacion === true || row.estado === "excluida";
}

export function canChangeBillingExclusion(row: BillingQueueStatus): boolean {
  return !["facturada", "anulada"].includes(row.estado)
    && !["emitiendo", "facturada"].includes(row.auto_estado ?? "")
    && !["emitida", "emitiendo"].includes(row.factura_estado ?? "")
    && !row.factura_cae;
}

export function canInvoiceQueueRow(row: BillingQueueStatus): boolean {
  return !isBillingExcluded(row) && canChangeBillingExclusion(row);
}