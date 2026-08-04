// Lee la página pública de un producto de un proveedor (Tiendanube / schema.org)
// y devuelve los datos normalizados para cargarlo en nuestra tienda.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const SIZE_RE = /^(x{0,3}s|s|m|l|x{0,3}l|xs\/s|s\/m|m\/l|l\/xl|xl\/xxl|\d{1,2}(\.\d)?|talle.*)$/i;

const decodeEntities = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

const meta = (html: string, prop: string): string | null => {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']`, "i");
  const m = html.match(re);
  if (m) return decodeEntities(m[1]);
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`, "i");
  const m2 = html.match(re2);
  return m2 ? decodeEntities(m2[1]) : null;
};

const unescapeJs = (s: string) =>
  s.replace(/\\u([0-9a-fA-F]{4})/g, (_m, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\'/g, "'");

function optionLabel(values: string[], index: number): string {
  const allSizes = values.every((v) => SIZE_RE.test(v.trim()));
  if (allSizes) return "Talle";
  return index === 0 ? "Color" : `Opción ${index + 1}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: auth } } });
    const { data: claims } = await userClient.auth.getClaims(auth.replace("Bearer ", ""));
    const userId = claims?.claims?.sub;
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const [{ data: isAdmin }, { data: isDeposito }] = await Promise.all([
      sb.rpc("has_role", { _user_id: userId, _role: "admin" }),
      sb.rpc("has_role", { _user_id: userId, _role: "deposito" }),
    ]);
    if (!isAdmin && !isDeposito) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json().catch(() => ({}));
    const rawUrl = String(body?.url ?? "").trim();
    let target: URL;
    try {
      target = new URL(rawUrl.replace(/\u2060/g, ""));
    } catch {
      return new Response(JSON.stringify({ error: "URL inválida" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!["http:", "https:"].includes(target.protocol)) {
      return new Response(JSON.stringify({ error: "URL inválida" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const res = await fetch(target.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "es-AR,es;q=0.9",
      },

      redirect: "follow",
    });
    if (!res.ok) {
      return new Response(JSON.stringify({ error: `El sitio respondió ${res.status}` }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const html = await res.text();

    // --- Nombre / imagen / descripción ---
    let name = meta(html, "og:title") || (html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "").trim();
    const image_url = meta(html, "og:image:secure_url") || meta(html, "og:image") || null;
    const description = meta(html, "og:description") || meta(html, "description") || null;
    let brand: string | null = null;
    let sku: string | null = null;
    let price: number | null = null;
    let currency = "ARS";

    // --- Tiendanube: LS.product + LS.variants ---
    const variantsMatch = html.match(/LS\.variants\s*=\s*(\[[\s\S]*?\]);/);
    const variantRows: any[] = variantsMatch ? JSON.parse(variantsMatch[1]) : [];
    const prodMatch = html.match(/LS\.product\s*=\s*\{([\s\S]*?)\};/);
    if (prodMatch) {
      const nm = prodMatch[1].match(/name\s*:\s*'([^']*)'/);
      if (nm) name = unescapeJs(nm[1]);
      const bm = prodMatch[1].match(/brand\s*:\s*'([^']*)'/);
      if (bm) brand = unescapeJs(bm[1]);
    }

    if (variantRows.length) {
      const prices = variantRows.map((v) => Number(v.price_number)).filter((n) => n > 0);
      if (prices.length) price = Math.min(...prices);
      sku = variantRows[0]?.sku ?? null;
    }

    // --- schema.org JSON-LD (fallback y complemento, soporta @graph) ---
    const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1] || target.toString();
    let ldImage: string | null = null;
    const isType = (t: any, want: string) => t === want || (Array.isArray(t) && t.includes(want));
    for (const raw of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
      let parsed: any;
      try { parsed = JSON.parse(raw[1].trim()); } catch { continue; }
      const nodes: any[] = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.["@graph"]) ? parsed["@graph"] : [parsed]);
      for (const d of nodes) {
        if (!d || !isType(d["@type"], "Product")) continue;
        const offer = Array.isArray(d.offers) ? d.offers[0] : d.offers;
        sku = sku || d.sku || null;
        brand = brand || (typeof d.brand === "string" ? d.brand : d.brand?.name) || null;
        if (!name) name = d.name || name;
        if (!price && offer?.price) price = Number(offer.price);
        if (!price && offer?.priceSpecification?.price) price = Number(offer.priceSpecification.price);
        if (offer?.priceCurrency) currency = offer.priceCurrency;
        if (!ldImage) {
          const img = Array.isArray(d.image) ? d.image[0] : d.image;
          ldImage = typeof img === "string" ? img : (img?.url ?? null);
        }
      }
    }

    // --- WooCommerce: precio en el markup como fallback ---
    if (!price) {
      const wooMeta = html.match(/<meta[^>]+property=["']product:price:amount["'][^>]*content=["']([\d.,]+)["']/i)?.[1]
        || html.match(/"price"\s*:\s*"?([\d.]+)"?/)?.[1]
        || html.match(/woocommerce-Price-amount[^>]*>\s*<bdi>[^\d]*([\d.,]+)/i)?.[1];
      if (wooMeta) {
        const normalized = wooMeta.includes(",") ? wooMeta.replace(/\./g, "").replace(",", ".") : wooMeta;
        const n = Number(normalized);
        if (n > 0) price = n;
      }
    }


    // --- Variantes normalizadas ---
    const optionCols = [0, 1, 2]
      .map((i) => variantRows.map((v) => v[`option${i}`]).filter((x): x is string => Boolean(x)))
      .map((vals, i) => (vals.length ? { name: optionLabel(vals, i), values: Array.from(new Set(vals)) } : null))
      .filter(Boolean) as { name: string; values: string[] }[];

    const supplier_variants = variantRows.map((v) => ({
      sku: v.sku ?? null,
      options: [v.option0, v.option1, v.option2].filter(Boolean),
      stock: Number(v.stock ?? 0) || 0,
      available: Boolean(v.available),
      price: Number(v.price_number) || null,
    }));

    if (!name || !price) {
      return new Response(JSON.stringify({ error: "No pudimos leer nombre y precio de esa página. Cargalo manualmente." }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      ok: true,
      source_url: canonical,
      name,
      description,
      image_url: image_url?.startsWith("//") ? `https:${image_url}` : image_url,
      brand,
      sku,
      precio_oficial: price,
      currency,
      variants: optionCols,
      supplier_variants,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? "Error inesperado" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
