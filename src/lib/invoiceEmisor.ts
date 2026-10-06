/**
 * Emisor sugerido para emitir una factura desde el modal "Generar factura AFIP".
 * Precedencia: override del cobro > emisor resuelto del cobro (regla central SQL)
 * > resolver_emisor_facturacion en vivo. Nunca usa facturas.emisor_id ni "el primero activo":
 * ese campo pudo quedar con un emisor por defecto en registros viejos.
 */
export interface ColaEmisorInfo {
  emisor_override_id?: string | null;
  emisor_resuelto_id?: string | null;
}

export type EmisorSugerido =
  | { emisorId: string; origen: "override" | "cobro" | "regla" }
  | { emisorId: null; motivo: string };

export function elegirEmisorSugerido(
  cola: ColaEmisorInfo | null,
  resolver: { emisor_id?: string | null; motivo?: string | null } | null,
  activos: string[],
): EmisorSugerido {
  const ok = (id?: string | null): id is string => !!id && activos.includes(id);
  if (ok(cola?.emisor_override_id)) return { emisorId: cola!.emisor_override_id!, origen: "override" };
  if (ok(cola?.emisor_resuelto_id)) return { emisorId: cola!.emisor_resuelto_id!, origen: "cobro" };
  if (ok(resolver?.emisor_id)) return { emisorId: resolver!.emisor_id!, origen: "regla" };
  return { emisorId: null, motivo: resolver?.motivo || "No se pudo determinar la cuenta receptora del cobro" };
}
