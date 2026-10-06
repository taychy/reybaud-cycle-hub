import { supabase } from "@/integrations/supabase/client";
import { elegirEmisorSugerido, type EmisorSugerido } from "./invoiceEmisor";

/**
 * Resuelve el emisor de UN cobro con la precedencia única de facturación
 * (override > resuelto en cola > resolver_emisor_facturacion). Lo usan el modal
 * individual y la facturación masiva: no duplicar reglas.
 */
export async function resolverEmisorCobro(
  ref: { facturacion_cola_id?: string | null; segmento?: string | null },
  activos: string[],
): Promise<EmisorSugerido> {
  let cola: any = null;
  if (ref.facturacion_cola_id) {
    const { data } = await supabase
      .from("facturacion_cola")
      .select("emisor_override_id, emisor_resuelto_id, emisor_id, segmento, metodo_pago, cuenta_mp_id")
      .eq("id", ref.facturacion_cola_id)
      .maybeSingle();
    cola = data;
  }
  let resolver: any = null;
  if (!cola?.emisor_override_id && !cola?.emisor_resuelto_id) {
    const { data } = await supabase.rpc("resolver_emisor_facturacion" as any, {
      p_segmento: cola?.segmento ?? ref.segmento ?? null,
      p_metodo_pago: cola?.metodo_pago ?? null,
      p_cuenta_mp_id: cola?.cuenta_mp_id ?? null,
      p_emisor_explicito: cola?.emisor_id ?? null,
      p_override: null,
    } as any);
    resolver = data;
  }
  return elegirEmisorSugerido(cola, resolver, activos);
}

/** Igual que resolverEmisorCobro, para varios cobros (secuencial, acotado). */
export async function resolverEmisoresCobros(
  refs: { key: string; facturacion_cola_id?: string | null; segmento?: string | null }[],
  activos: string[],
): Promise<Map<string, EmisorSugerido>> {
  const out = new Map<string, EmisorSugerido>();
  for (const r of refs) out.set(r.key, await resolverEmisorCobro(r, activos));
  return out;
}
