import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM = `Sos un contador experto en categorización automática de egresos de Mercado Pago para una escuela de ciclismo argentina (Reybaud).

Recibís:
1. "movimientos": egresos de MP sin categorizar (concepto, contraparte, operación, medio, monto, fecha).
2. "catalogo": gastos recurrentes planificados (concepto, categoría, proveedor, ámbito) con sus ejecuciones abiertas (id, mes, previsto, pagado, saldo).
3. "categorias": categorías válidas para gastos nuevos.
4. "unidades": unidades de negocio válidas.

Tu trabajo:
A) Para CADA movimiento devolver una sugerencia:
   - Si corresponde claramente a una ejecución de la agenda (mismo proveedor/concepto y monto compatible), tipo="agenda" con ejecucion_id.
   - Si no, tipo="nuevo" con categoria, subcategoria, descripcion (corta y clara), proveedor y unidad_negocio.
   - confianza: 0 a 1. motivo: 1 frase.

B) "renombres": sugerencias de RENOMBRAR conceptos/proveedores del catálogo (o normalizar la descripción de un gasto) de modo que en el futuro el match con el texto que llega de Mercado Pago sea AUTOMÁTICO por simple regla de texto, sin IA. Priorizá la economía del sistema: pocas reglas, nombres que contengan el literal exacto que MP envía (ej: si MP siempre dice "ENAUSA SA", conviene que el proveedor del catálogo se llame "ENAUSA SA"). Cada renombre: tipo ("recurrente_concepto" | "recurrente_proveedor" | "categoria"), actual, sugerido, patron_mp (el texto literal que aparece en MP), impacto (cuántos movimientos de los recibidos quedarían automáticos) y motivo.

Respondé SOLO JSON válido con la forma:
{"sugerencias":[{"movement_id":"...","tipo":"agenda|nuevo","ejecucion_id":null,"categoria":"","subcategoria":"","descripcion":"","proveedor":"","unidad_negocio":"","confianza":0.0,"motivo":""}],"renombres":[{"tipo":"","actual":"","sugerido":"","patron_mp":"","impacto":0,"motivo":""}]}`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY no configurada" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => null);
    const movimientos = Array.isArray(body?.movimientos) ? body.movimientos.slice(0, 60) : [];
    const catalogo = Array.isArray(body?.catalogo) ? body.catalogo.slice(0, 200) : [];
    const categorias = Array.isArray(body?.categorias) ? body.categorias : [];
    const unidades = Array.isArray(body?.unidades) ? body.unidades : [];

    if (movimientos.length === 0) {
      return new Response(JSON.stringify({ error: "Sin movimientos para analizar" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-3.6-flash",
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: JSON.stringify({ movimientos, catalogo, categorias, unidades }),
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      const msg =
        res.status === 429
          ? "Límite de uso de IA alcanzado. Probá de nuevo en unos minutos."
          : res.status === 402
          ? "Se agotaron los créditos de IA del workspace."
          : `Error de IA (${res.status}): ${text.slice(0, 300)}`;
      return new Response(JSON.stringify({ error: msg }), {
        status: res.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content ?? "{}";
    let parsed: any = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      const m = String(raw).match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : {};
    }

    return new Response(
      JSON.stringify({
        sugerencias: Array.isArray(parsed.sugerencias) ? parsed.sugerencias : [],
        renombres: Array.isArray(parsed.renombres) ? parsed.renombres : [],
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
