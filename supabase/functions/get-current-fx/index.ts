// Devuelve la Cotización Reybaud vigente (Compra/Venta por moneda). Solo admins.
// Body opcional: { force?: boolean }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ensureCurrentFxBook } from "../_shared/fx-rates.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "No autenticado" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: userData } = await supabase.auth.getUser(jwt);
    const uid = userData?.user?.id;
    if (!uid) return json({ error: "Sesión inválida" }, 401);

    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", uid);
    const allowed = new Set(["admin", "super_admin", "soporte", "deposito"]);
    if (!(roles || []).some((r: any) => allowed.has(String(r.role)))) {
      return json({ error: "Solo personal autorizado" }, 403);
    }

    let force = false;
    try {
      const body = req.method === "POST" ? await req.json() : {};
      force = body?.force === true;
    } catch (_) {
      force = false;
    }

    const book = await ensureCurrentFxBook(supabase, { force });
    return json({ ok: true, book });
  } catch (err) {
    console.error("get-current-fx error:", err);
    return json({ error: (err as Error)?.message || "No hay cotización disponible" }, 503);
  }
});
