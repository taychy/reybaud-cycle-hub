// Consulta "Constancia de Inscripción" de ARCA (ws_sr_constancia_inscripcion,
// getPersona_v2) para un CUIT/CUIL. SOLO LECTURA: nunca escribe en la base.
// Solo admins. Reutiliza los certificados de emisores_fiscales (WSAA); los
// certificados nunca salen del servidor.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";
import forge from "https://esm.sh/node-forge@1.3.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const WSAA_URL = "https://wsaa.afip.gov.ar/ws/services/LoginCms";
const PADRON_URL = "https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA5";
const SERVICE_NAME = "ws_sr_constancia_inscripcion";

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function isCuitValido(d: string): boolean {
  if (!/^\d{11}$/.test(d)) return false;
  const w = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let s = 0;
  for (let i = 0; i < 10; i++) s += Number(d[i]) * w[i];
  let dv = 11 - (s % 11);
  if (dv === 11) dv = 0;
  if (dv === 10) return false;
  return dv === Number(d[10]);
}

// Cache en memoria del TA por emisor (WSAA rechaza pedir otro mientras uno sigue vigente).
const taCache = new Map<string, { token: string; sign: string; exp: number }>();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(authHeader.slice(7));
    if (claimsErr || !claims?.claims?.sub) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: claims.claims.sub, _role: "admin" });
    if (!isAdmin) return json({ error: "Solo administradores" }, 403);

    let body: { cuit?: unknown };
    try { body = await req.json(); } catch { return json({ error: "Body inválido" }, 400); }
    const cuit = String(body?.cuit ?? "").replace(/\D/g, "");
    if (!isCuitValido(cuit)) return json({ error: "CUIT/CUIL inválido (11 dígitos con dígito verificador)." }, 400);

    const { data: emisores } = await admin
      .from("emisores_fiscales")
      .select("id, cuit, nombre_fiscal, cert_pem, key_pem, es_predeterminado")
      .eq("activo", true)
      .order("es_predeterminado", { ascending: false })
      .order("created_at", { ascending: true });
    const usable = (emisores || []).filter((e: any) => e.cert_pem && e.key_pem);
    if (usable.length === 0) {
      return json({ ok: false, code: "sin_certificado", error: "Ningún emisor tiene certificado ARCA cargado." }, 200);
    }

    // Probar cada emisor hasta que uno esté autorizado para el servicio.
    const intentos: { emisor: string; error: string }[] = [];
    for (const e of usable) {
      const ta = await getTA(e.id, e.cert_pem, e.key_pem);
      if (ta.error) { intentos.push({ emisor: e.nombre_fiscal, error: ta.error }); continue; }
      const rep = String(e.cuit || "").replace(/\D/g, "");
      const r = await getPersonaV2(ta.token!, ta.sign!, rep, cuit);
      if (r.error) { intentos.push({ emisor: e.nombre_fiscal, error: r.error }); continue; }
      return json({ ok: true, found: !!r.persona, persona: r.persona ?? null, consultado_con: e.nombre_fiscal });
    }
    console.warn("[validar-cuit-arca] sin autorización", JSON.stringify(intentos));
    return json({ ok: false, code: "no_autorizado", error: "ARCA no autorizó la consulta.", intentos }, 200);
  } catch (err) {
    console.error("[validar-cuit-arca]", err);
    return json({ error: (err as Error).message }, 500);
  }
});

async function getTA(key: string, certPem: string, keyPem: string): Promise<{ token?: string; sign?: string; error?: string }> {
  const c = taCache.get(key);
  if (c && c.exp > Date.now() + 60_000) return c;
  try {
    const now = Date.now();
    const tra = `<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0"><header><uniqueId>${Math.floor(now / 1000)}</uniqueId>
<generationTime>${new Date(now - 600_000).toISOString()}</generationTime>
<expirationTime>${new Date(now + 600_000).toISOString()}</expirationTime></header>
<service>${SERVICE_NAME}</service></loginTicketRequest>`;
    const cms = signCMS(tra, certPem, keyPem);
    const resp = await fetch(WSAA_URL, {
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: "" },
      body: `<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov"><soapenv:Body><wsaa:loginCms><wsaa:in0>${cms}</wsaa:in0></wsaa:loginCms></soapenv:Body></soapenv:Envelope>`,
    });
    const text = await resp.text();
    const m = text.match(/<loginCmsReturn>([^]*?)<\/loginCmsReturn>/);
    if (m) {
      const d = m[1].replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"');
      const t = d.match(/<token>([^<]+)<\/token>/)?.[1];
      const s = d.match(/<sign>([^<]+)<\/sign>/)?.[1];
      const exp = d.match(/<expirationTime>([^<]+)<\/expirationTime>/)?.[1];
      if (t && s) {
        const v = { token: t, sign: s, exp: exp ? Date.parse(exp) : now + 3600_000 };
        taCache.set(key, v);
        return v;
      }
    }
    const fault = text.match(/<faultstring[^>]*>([^<]+)<\/faultstring>/)?.[1];
    return { error: `WSAA: ${fault || `HTTP ${resp.status}`}` };
  } catch (err) {
    return { error: `WSAA: ${(err as Error).message}` };
  }
}

function signCMS(data: string, certPem: string, keyPem: string): string {
  const cert = forge.pki.certificateFromPem(certPem);
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(data, "utf8");
  p7.addCertificate(cert);
  p7.addSigner({
    key: forge.pki.privateKeyFromPem(keyPem),
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() as any },
    ],
  });
  p7.sign({ detached: false });
  const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
  const bytes = new Uint8Array(der.length);
  for (let i = 0; i < der.length; i++) bytes[i] = der.charCodeAt(i) & 0xff;
  return encodeBase64(bytes);
}

interface PersonaArca {
  cuit: string;
  tipo_persona: string | null;
  nombre: string | null;
  apellido: string | null;
  razon_social: string | null;
  estado_clave: string | null;
  domicilio: string | null;
  error_constancia: string | null;
}

async function getPersonaV2(token: string, sign: string, rep: string, cuit: string): Promise<{ persona?: PersonaArca; error?: string }> {
  try {
    const resp = await fetch(PADRON_URL, {
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: "" },
      body: `<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:a5="http://a5.soap.ws.server.puc.sr/"><soapenv:Body><a5:getPersona_v2><token>${token}</token><sign>${sign}</sign><cuitRepresentada>${rep}</cuitRepresentada><idPersona>${cuit}</idPersona></a5:getPersona_v2></soapenv:Body></soapenv:Envelope>`,
    });
    const xml = await resp.text();
    const fault = xml.match(/<faultstring[^>]*>([^<]+)<\/faultstring>/)?.[1];
    if (fault) {
      if (/no existe|sin datos|no encontrad|inexistente/i.test(fault)) return { persona: undefined };
      return { error: `Padrón: ${fault}` };
    }
    if (!resp.ok) return { error: `Padrón: HTTP ${resp.status}` };
    const gen = xml.match(/<datosGenerales>([^]*?)<\/datosGenerales>/)?.[1] || "";
    const pick = (src: string, tag: string) => src.match(new RegExp(`<${tag}>([^<]+)</${tag}>`))?.[1]?.trim() || null;
    const errC = [...xml.matchAll(/<errorConstancia>[^]*?<error>([^<]+)<\/error>/g)].map((m) => m[1]).join("; ") || null;
    if (!gen && !errC) return { persona: undefined };
    const dom = gen.match(/<domicilioFiscal>([^]*?)<\/domicilioFiscal>/)?.[1] || "";
    const domParts = [pick(dom, "direccion"), pick(dom, "localidad"), pick(dom, "descripcionProvincia"), pick(dom, "codPostal")].filter(Boolean);
    return {
      persona: {
        cuit,
        tipo_persona: pick(gen, "tipoPersona"),
        nombre: pick(gen, "nombre"),
        apellido: pick(gen, "apellido"),
        razon_social: pick(gen, "razonSocial"),
        estado_clave: pick(gen, "estadoClave"),
        domicilio: domParts.length ? domParts.join(", ") : null,
        error_constancia: errC,
      },
    };
  } catch (err) {
    return { error: `Padrón: ${(err as Error).message}` };
  }
}
