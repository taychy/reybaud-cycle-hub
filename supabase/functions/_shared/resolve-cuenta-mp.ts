// Helper para resolver qué cuenta MP usar según la unidad de negocio.
// Fase 2: conectado a las edge functions de cobro. Si el flag
// `mp_routing_enabled` en app_config está en false, vuelve al
// comportamiento legacy (MP_ACCESS_TOKEN único).

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
  source: "routing" | "default_global" | "legacy" | "flag_disabled";
}

function legacyFallback(source: ResolvedCuentaMP["source"] = "legacy"): ResolvedCuentaMP {
  return {
    cuenta_id: null,
    slug: null,
    nombre: null,
    access_token: Deno.env.get("MP_ACCESS_TOKEN") ?? "",
    public_key: Deno.env.get("MP_PUBLIC_KEY") ?? null,
    webhook_secret: Deno.env.get("MP_WEBHOOK_SECRET") ?? null,
    emisor_fiscal_id: null,
    source,
  };
}

async function isRoutingEnabled(supabaseAdmin: SupabaseClient): Promise<boolean> {
  try {
    const { data } = await supabaseAdmin
      .from("app_config")
      .select("value")
      .eq("key", "mp_routing_enabled")
      .maybeSingle();
    // value es jsonb: true / false. Si no existe → asumimos true (Fase 2 activa).
    if (data && typeof data.value !== "undefined") return data.value === true;
    return true;
  } catch {
    return true;
  }
}

export async function resolveCuentaMP(
  supabaseAdmin: SupabaseClient,
  opts: { unidad_negocio: UnidadNegocioMP },
): Promise<ResolvedCuentaMP> {
  // Feature flag de reversión: si está en false, todo va al legacy.
  if (!(await isRoutingEnabled(supabaseAdmin))) {
    return legacyFallback("flag_disabled");
  }

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
    } else {
      console.warn(`[resolve-cuenta-mp] Cuenta ${cuenta.slug} no tiene token en env (${cuenta.secret_name_token}); fallback legacy`);
    }
  }

  // 3) Fallback legacy
  return legacyFallback();
}

// Resolver token de UNA cuenta puntual (por id) — usado por webhooks
// que reciben un mp_payment y necesitan re-consultar MP con el token correcto.
export async function getCuentaMPTokenById(
  supabaseAdmin: SupabaseClient,
  cuenta_id: string | null | undefined,
): Promise<string> {
  if (!cuenta_id) return Deno.env.get("MP_ACCESS_TOKEN") ?? "";
  try {
    const { data: cuenta } = await supabaseAdmin
      .from("cuentas_mp")
      .select("secret_name_token, slug")
      .eq("id", cuenta_id)
      .maybeSingle();
    if (cuenta?.secret_name_token) {
      const tok = Deno.env.get(cuenta.secret_name_token);
      if (tok) return tok;
      console.warn(`[getCuentaMPTokenById] secret ${cuenta.secret_name_token} no está en env`);
    }
  } catch (e) {
    console.warn("[getCuentaMPTokenById] error:", (e as Error).message);
  }
  return Deno.env.get("MP_ACCESS_TOKEN") ?? "";
}
