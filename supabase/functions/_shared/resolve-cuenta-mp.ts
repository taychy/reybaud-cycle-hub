// Helper para resolver qué cuenta MP usar según la unidad de negocio.
// Fase 1: helper creado pero NO conectado a las edge functions de cobro.
// Las funciones siguen usando MP_ACCESS_TOKEN legacy hasta Fase 2.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type UnidadNegocioMP =
  | "suscripcion_escuela"
  | "viaje_camp"
  | "evento"
  | "tienda"
  | "preventa"
  | "personalizado"
  | "turnera"
  | "otro";

export interface ResolvedCuentaMP {
  cuenta_id: string | null;
  slug: string | null;
  nombre: string | null;
  access_token: string;
  public_key: string | null;
  webhook_secret: string | null;
  emisor_fiscal_id: string | null;
  source: "routing" | "default_global" | "legacy";
}

export async function resolveCuentaMP(
  supabaseAdmin: SupabaseClient,
  opts: { unidad_negocio: UnidadNegocioMP },
): Promise<ResolvedCuentaMP> {
  // 1) Buscar ruta activa para la unidad de negocio (menor prioridad gana)
  const { data: routing } = await supabaseAdmin
    .from("cuenta_mp_routing")
    .select("emisor_fiscal_id, cuenta_mp_id, cuentas_mp:cuenta_mp_id(*)")
    .eq("unidad_negocio", opts.unidad_negocio)
    .eq("activa", true)
    .order("prioridad", { ascending: true })
    .limit(1)
    .maybeSingle();

  let cuenta: any = null;
  let emisorOverride: string | null = null;
  let source: ResolvedCuentaMP["source"] = "legacy";

  if (routing?.cuentas_mp && (routing.cuentas_mp as any).activa) {
    cuenta = routing.cuentas_mp;
    emisorOverride = routing.emisor_fiscal_id ?? null;
    source = "routing";
  } else {
    // 2) Fallback a la cuenta default global
    const { data: def } = await supabaseAdmin
      .from("cuentas_mp")
      .select("*")
      .eq("activa", true)
      .eq("es_default_global", true)
      .maybeSingle();
    if (def) {
      cuenta = def;
      source = "default_global";
    }
  }

  if (cuenta) {
    const token = Deno.env.get(cuenta.secret_name_token);
    if (token) {
      return {
        cuenta_id: cuenta.id,
        slug: cuenta.slug,
        nombre: cuenta.nombre,
        access_token: token,
        public_key: cuenta.secret_name_pubkey ? Deno.env.get(cuenta.secret_name_pubkey) ?? null : null,
        webhook_secret: cuenta.secret_name_webhook ? Deno.env.get(cuenta.secret_name_webhook) ?? null : null,
        emisor_fiscal_id: emisorOverride ?? cuenta.emisor_fiscal_default_id ?? null,
        source,
      };
    }
  }

  // 3) Fallback legacy
  return {
    cuenta_id: null,
    slug: null,
    nombre: null,
    access_token: Deno.env.get("MP_ACCESS_TOKEN") ?? "",
    public_key: Deno.env.get("MP_PUBLIC_KEY") ?? null,
    webhook_secret: Deno.env.get("MP_WEBHOOK_SECRET") ?? null,
    emisor_fiscal_id: null,
    source: "legacy",
  };
}
