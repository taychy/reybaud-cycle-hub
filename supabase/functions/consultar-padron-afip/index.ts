// Consulta el padrón AFIP (ws_sr_padron_a5 / getPersona) usando el
// certificado del emisor fiscal predeterminado. Devuelve nombre,
// condición fiscal, domicilio fiscal y actividades para un CUIT.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";
import forge from "npm:node-forge@1.3.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const WSAA_URL = "https://wsaa.afip.gov.ar/ws/services/LoginCms";
const PADRON_URL =
  "https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA5";
const SERVICE_NAME = "ws_sr_padron_a5";

interface Body {
  cuit: string;
  alumno_id?: string; // opcional, para persistir verificado_at + snapshot
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claims?.claims) return json({ error: "Unauthorized" }, 401);

    const body = (await req.json()) as Body;
    const cuitClean = (body?.cuit || "").replace(/\D/g, "");
    if (cuitClean.length !== 11) {
      return json({ error: "CUIT inválido. Debe tener 11 dígitos." }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Emisor predeterminado (o el primero disponible con cert)
    const { data: emisor, error: emisorErr } = await admin
      .from("emisores_fiscales")
      .select("*")
      .eq("activo", true)
      .order("es_predeterminado", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (emisorErr || !emisor) {
      return json({ error: "No hay emisor fiscal configurado para consultar AFIP." }, 400);
    }
    if (!emisor.cert_pem || !emisor.key_pem) {
      return json({ error: "El emisor no tiene certificado AFIP cargado." }, 400);
    }

    // 1) WSAA
    const wsaa = await authenticateWSAA(emisor.cert_pem, emisor.key_pem);
    if (wsaa.error || !wsaa.token || !wsaa.sign) {
      return json({ error: `WSAA: ${wsaa.error || "sin token"}` }, 502);
    }

    // 2) Padron getPersona
    const repCuit = (emisor.cuit || "").replace(/\D/g, "");
    const padron = await getPersona(wsaa.token, wsaa.sign, repCuit, cuitClean);
    if (padron.error) {
      return json({ error: padron.error }, 502);
    }
    if (!padron.persona) {
      return json({ error: "El CUIT no figura en el padrón AFIP." }, 404);
    }

    // 3) Persistir verificación si nos pasaron alumno_id (solo si es el propio alumno)
    if (body.alumno_id) {
      try {
        await supabase
          .from("alumnos")
          .update({
            documento: cuitClean,
            tipo_documento: "cuit",
            nombre_fiscal: padron.persona.nombre || null,
            condicion_fiscal: padron.persona.condicion_fiscal || "consumidor_final",
            domicilio_fiscal: padron.persona.domicilio || null,
            afip_verificado_at: new Date().toISOString(),
            afip_padron_snapshot: padron.persona as any,
          } as any)
          .eq("id", body.alumno_id);
      } catch (e) {
        console.warn("No se pudo persistir verificación:", (e as Error).message);
      }
    }

    return json({ ok: true, persona: padron.persona });
  } catch (err) {
    console.error("Unexpected error:", err);
    return json({ error: `Error inesperado: ${(err as Error).message}` }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ============================================================
// WSAA — login CMS firmado (idéntico a emit-factura-afip pero para ws_sr_padron_a5)
// ============================================================
async function authenticateWSAA(
  certPem: string,
  keyPem: string,
): Promise<{ token?: string; sign?: string; error?: string }> {
  try {
    const now = new Date();
    const genTime = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
    const expTime = new Date(now.getTime() + 10 * 60 * 1000).toISOString();
    const tra = `<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0">
  <header>
    <uniqueId>${Math.floor(Date.now() / 1000)}</uniqueId>
    <generationTime>${genTime}</generationTime>
    <expirationTime>${expTime}</expirationTime>
  </header>
  <service>${SERVICE_NAME}</service>
</loginTicketRequest>`;

    const cms = signCMS(tra, certPem, keyPem);
    const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">
  <soapenv:Body>
    <wsaa:loginCms>
      <wsaa:in0>${cms}</wsaa:in0>
    </wsaa:loginCms>
  </soapenv:Body>
</soapenv:Envelope>`;

    const resp = await fetch(WSAA_URL, {
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: "" },
      body: soapBody,
    });
    const respText = await resp.text();
    if (!resp.ok) return { error: `HTTP ${resp.status}` };

    const returnMatch = respText.match(/<loginCmsReturn>([^]*?)<\/loginCmsReturn>/);
    if (returnMatch) {
      const decoded = returnMatch[1]
        .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&").replace(/&quot;/g, '"');
      const tM = decoded.match(/<token>([^<]+)<\/token>/);
      const sM = decoded.match(/<sign>([^<]+)<\/sign>/);
      if (tM && sM) return { token: tM[1], sign: sM[1] };
    }
    // Algunos endpoints devuelven errores tipo "ns1:coe.alreadyAuthenticated"
    const faultMatch = respText.match(/<faultstring[^>]*>([^<]+)<\/faultstring>/);
    if (faultMatch) return { error: faultMatch[1] };

    return { error: "No se pudo obtener token/sign de WSAA" };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

function signCMS(data: string, certPem: string, keyPem: string): string {
  const cert = forge.pki.certificateFromPem(certPem);
  const privateKey = forge.pki.privateKeyFromPem(keyPem);
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(data, "utf8");
  p7.addCertificate(cert);
  p7.addSigner({
    key: privateKey,
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() as any },
    ],
  });
  p7.sign({ detached: false });
  const derBytes = forge.asn1.toDer(p7.toAsn1()).getBytes();
  const bytes = new Uint8Array(derBytes.length);
  for (let i = 0; i < derBytes.length; i++) bytes[i] = derBytes.charCodeAt(i) & 0xff;
  return encodeBase64(bytes);
}

// ============================================================
// ws_sr_padron_a5 getPersona
// ============================================================
async function getPersona(
  token: string,
  sign: string,
  cuitRepresentada: string,
  cuitConsultado: string,
): Promise<{ persona?: PersonaPadron; error?: string }> {
  const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:a5="http://a5.soap.ws.server.puc.sr/">
  <soapenv:Body>
    <a5:getPersona>
      <token>${token}</token>
      <sign>${sign}</sign>
      <cuitRepresentada>${cuitRepresentada}</cuitRepresentada>
      <idPersona>${cuitConsultado}</idPersona>
    </a5:getPersona>
  </soapenv:Body>
</soapenv:Envelope>`;

  try {
    const resp = await fetch(PADRON_URL, {
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: "" },
      body: soapBody,
    });
    const text = await resp.text();
    if (!resp.ok) {
      const fault = text.match(/<faultstring[^>]*>([^<]+)<\/faultstring>/)?.[1];
      return { error: fault || `HTTP ${resp.status}` };
    }

    const fault = text.match(/<faultstring[^>]*>([^<]+)<\/faultstring>/)?.[1];
    if (fault) {
      if (/no.*existe|sin datos|no encontrad/i.test(fault)) {
        return { persona: undefined };
      }
      return { error: fault };
    }

    return { persona: parsePersona(text) };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

interface PersonaPadron {
  cuit: string;
  nombre: string;
  tipo_persona: string | null;     // FISICA | JURIDICA
  estado: string | null;           // ACTIVO | INACTIVO
  condicion_fiscal: string;        // monotributo | responsable_inscripto | exento | consumidor_final
  domicilio: string | null;
  actividades: string[];
  raw: string;
}

function parsePersona(xml: string): PersonaPadron | undefined {
  const pick = (tag: string) =>
    xml.match(new RegExp(`<${tag}[^>]*>([^<]+)<\\/${tag}>`))?.[1]?.trim();

  const idPersona = pick("idPersona");
  if (!idPersona) return undefined;

  const tipoPersona = pick("tipoPersona") || null;
  const estadoClave = pick("estadoClave") || null;
  const nombre =
    pick("razonSocial") ||
    [pick("nombre"), pick("apellido")].filter(Boolean).join(" ").trim() ||
    "";

  // Condición fiscal: monotributo (impuesto 20 o categoría), IVA inscripto (impuesto 30),
  // exento (impuesto 32).
  const text = xml;
  let condicion: PersonaPadron["condicion_fiscal"] = "consumidor_final";
  const hasMonotributo = /<idImpuesto>20<\/idImpuesto>/.test(text) ||
    /<categoriaMonotributo>/.test(text);
  const hasIvaInscripto = /<idImpuesto>30<\/idImpuesto>/.test(text);
  const hasExento = /<idImpuesto>32<\/idImpuesto>/.test(text);
  if (hasMonotributo) condicion = "monotributo";
  else if (hasIvaInscripto) condicion = "responsable_inscripto";
  else if (hasExento) condicion = "exento";

  // Domicilio fiscal — tomamos el primero que parezca el "fiscal"
  const domBlock = xml.match(/<domicilioFiscal>([^]*?)<\/domicilioFiscal>/)?.[1]
    || xml.match(/<domicilio[^>]*>([^]*?)<\/domicilio>/)?.[1] || "";
  const parts = [
    pick.call(null, "direccion") || domBlock.match(/<direccion>([^<]+)<\/direccion>/)?.[1],
    domBlock.match(/<localidad>([^<]+)<\/localidad>/)?.[1],
    domBlock.match(/<descripcionProvincia>([^<]+)<\/descripcionProvincia>/)?.[1],
    domBlock.match(/<codPostal>([^<]+)<\/codPostal>/)?.[1],
  ].filter(Boolean);
  const domicilio = parts.length ? parts.join(", ") : null;

  // Actividades
  const actividades = [...text.matchAll(/<descripcionActividad>([^<]+)<\/descripcionActividad>/g)]
    .map((m) => m[1]);

  return {
    cuit: idPersona,
    nombre,
    tipo_persona: tipoPersona,
    estado: estadoClave,
    condicion_fiscal: condicion,
    domicilio,
    actividades,
    raw: xml.length > 8000 ? xml.slice(0, 8000) : xml,
  };
}
