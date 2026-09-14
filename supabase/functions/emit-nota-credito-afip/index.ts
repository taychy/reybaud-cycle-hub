import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";
import forge from "npm:node-forge@1.3.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const WSAA_URL = "https://wsaa.afip.gov.ar/ws/services/LoginCms";
const WSFEV1_URL = "https://servicios1.afip.gov.ar/wsfev1/service.asmx";
const SERVICE_NAME = "wsfe";

type EmitResult = { cae?: string; caeVto?: string; error?: string };

interface RequestBody {
  factura_id: string;
  monto: number;
  motivo?: string | null;
  idempotency_key: string;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function yyyymmdd(value: Date): string {
  return value.toISOString().split("T")[0].replace(/-/g, "");
}

function parseComprobante(numero: string): { puntoVenta: number; numero: number } | null {
  const m = String(numero || "").trim().match(/^(\d{1,5})-(\d{1,8})$/);
  if (!m) return null;
  const puntoVenta = Number(m[1]);
  const numeroComprobante = Number(m[2]);
  if (!puntoVenta || !numeroComprobante) return null;
  return { puntoVenta, numero: numeroComprobante };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let adminClient: any = null;
  let notaId: string | null = null;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const token = authHeader.replace("Bearer ", "");
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) return json({ error: "Unauthorized" }, 401);
    const callerUserId = String(claimsData.claims.sub);

    adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: isAdmin, error: roleErr } = await adminClient.rpc("has_role", {
      _user_id: callerUserId,
      _role: "admin",
    });
    if (roleErr || !isAdmin) return json({ error: "Forbidden: admin role required" }, 403);

    const body = (await req.json()) as RequestBody;
    const facturaId = String(body.factura_id || "");
    const monto = round2(Number(body.monto));
    const motivo = body.motivo ? String(body.motivo).trim() : null;
    const idempotencyKey = String(body.idempotency_key || "");

    if (!facturaId || !idempotencyKey || !Number.isFinite(monto) || monto <= 0) {
      return json({ error: "factura_id, monto e idempotency_key son requeridos" }, 400);
    }

    const { data: factura, error: facturaErr } = await adminClient
      .from("facturas")
      .select("*")
      .eq("id", facturaId)
      .single();
    if (facturaErr || !factura) return json({ error: "Factura no encontrada" }, 404);

    if (factura.estado !== "emitida" || !factura.cae || !factura.numero_comprobante || !factura.emisor_id) {
      return json({ error: "La factura debe estar emitida con CAE antes de generar una nota de crédito" }, 422);
    }
    if (![1, 6, 11].includes(Number(factura.tipo_comprobante))) {
      return json({ error: "El tipo de factura no admite nota de crédito en este flujo" }, 422);
    }
    if ((factura.moneda || "ARS") !== "ARS") {
      return json({ error: "Por ahora la emisión de notas de crédito está habilitada solo para ARS" }, 422);
    }

    const original = parseComprobante(factura.numero_comprobante);
    if (!original) return json({ error: "No se pudo interpretar el número de la factura original" }, 422);

    // Reserva atómica: valida saldo restante y evita dobles emisiones concurrentes.
    const { data: reservedId, error: reserveErr } = await adminClient.rpc("reserve_nota_credito", {
      p_factura_id: facturaId,
      p_monto: monto,
      p_motivo: motivo,
      p_idempotency_key: idempotencyKey,
      p_usuario_id: callerUserId,
    });
    if (reserveErr || !reservedId) {
      return json({ error: reserveErr?.message || "No se pudo reservar la nota de crédito" }, 409);
    }
    notaId = String(reservedId);

    const { data: nota, error: notaErr } = await adminClient
      .from("notas_credito")
      .select("*")
      .eq("id", notaId)
      .single();
    if (notaErr || !nota) return json({ error: "No se pudo leer la nota de crédito reservada" }, 500);

    if (nota.estado === "emitida" && nota.cae) {
      return json({
        success: true,
        nota_credito_id: nota.id,
        numero_comprobante: nota.numero_comprobante,
        tipo_comprobante: nota.tipo_comprobante,
        letra_comprobante: nota.letra_comprobante,
        cae: nota.cae,
        cae_vencimiento: nota.cae_vencimiento,
        already_emitted: true,
      });
    }

    if (nota.estado === "enviando") {
      return json({ error: "La nota de crédito ya se está enviando a ARCA. Esperá unos segundos y actualizá." }, 409);
    }

    const { data: claimed, error: claimErr } = await adminClient
      .from("notas_credito")
      .update({ estado: "enviando", error_detalle: null, updated_at: new Date().toISOString() })
      .eq("id", notaId)
      .in("estado", ["procesando", "error"])
      .select("id")
      .maybeSingle();
    if (claimErr || !claimed) {
      return json({ error: "La nota de crédito está siendo procesada por otra solicitud" }, 409);
    }

    const { data: emisor, error: emisorErr } = await adminClient
      .from("emisores_fiscales")
      .select("*")
      .eq("id", factura.emisor_id)
      .single();
    if (emisorErr || !emisor) throw new Error("Emisor fiscal no encontrado");
    if (!emisor.cert_pem || !emisor.key_pem) throw new Error("El emisor no tiene certificado ARCA configurado");

    const emisorCuit = String(emisor.cuit || "").replace(/\D/g, "");
    if (emisorCuit.length !== 11) throw new Error("CUIT del emisor inválido");

    const clienteDoc = String(factura.cliente_cuit || "").replace(/\D/g, "");
    if (!clienteDoc) throw new Error("La factura original no tiene documento fiscal del receptor");

    const wsaa = await authenticateWSAA(emisor.cert_pem, emisor.key_pem);
    if (wsaa.error || !wsaa.token || !wsaa.sign) throw new Error(`WSAA: ${wsaa.error || "sin token"}`);

    const tipoNc = Number(nota.tipo_comprobante);
    const last = await getUltimoComprobante(wsaa.token, wsaa.sign, emisorCuit, Number(emisor.punto_venta), tipoNc);
    if (last.error || last.number === undefined) throw new Error(`FECompUltimoAutorizado: ${last.error || "sin número"}`);
    const cbteNro = last.number + 1;

    const originalDate = factura.fecha_emision ? new Date(factura.fecha_emision) : new Date(factura.created_at);
    const result = await emitirNotaCreditoAfip({
      token: wsaa.token,
      sign: wsaa.sign,
      cuit: emisorCuit,
      puntoVenta: Number(emisor.punto_venta),
      cbteNro,
      cbteTipo: tipoNc,
      monto: Number(nota.monto),
      clienteDoc,
      ivaIncluido21: [3, 8].includes(tipoNc),
      facturaTipo: Number(factura.tipo_comprobante),
      facturaPuntoVenta: original.puntoVenta,
      facturaNumero: original.numero,
      facturaFecha: originalDate,
    });

    if (result.error || !result.cae) throw new Error(`FECAESolicitar: ${result.error || "sin CAE"}`);

    const nroComprobante = `${String(emisor.punto_venta).padStart(5, "0")}-${String(cbteNro).padStart(8, "0")}`;
    const { error: updateErr } = await adminClient
      .from("notas_credito")
      .update({
        estado: "emitida",
        numero_comprobante: nroComprobante,
        cae: result.cae,
        cae_vencimiento: result.caeVto || null,
        fecha_emision: new Date().toISOString(),
        error_detalle: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", notaId);
    if (updateErr) throw new Error(`ARCA autorizó la nota, pero falló el guardado local: ${updateErr.message}`);

    return json({
      success: true,
      nota_credito_id: notaId,
      numero_comprobante: nroComprobante,
      tipo_comprobante: tipoNc,
      letra_comprobante: nota.letra_comprobante,
      cae: result.cae,
      cae_vencimiento: result.caeVto,
      monto: Number(nota.monto),
    });
  } catch (err) {
    const message = (err as Error).message || "Error inesperado";
    console.error("emit-nota-credito-afip:", err);
    if (adminClient && notaId && !message.startsWith("ARCA autorizó la nota")) {
      try {
        await adminClient
          .from("notas_credito")
          .update({ estado: "error", error_detalle: message, updated_at: new Date().toISOString() })
          .eq("id", notaId)
          .neq("estado", "emitida");
      } catch (_) {
        // No ocultar el error original.
      }
    }
    return json({ error: message, nota_credito_id: notaId }, 500);
  }
});

async function authenticateWSAA(certPem: string, keyPem: string): Promise<{ token?: string; sign?: string; error?: string }> {
  try {
    const now = new Date();
    const genTime = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
    const expTime = new Date(now.getTime() + 10 * 60 * 1000).toISOString();
    const tra = `<?xml version="1.0" encoding="UTF-8"?>\n<loginTicketRequest version="1.0">\n  <header>\n    <uniqueId>${Math.floor(Date.now() / 1000)}</uniqueId>\n    <generationTime>${genTime}</generationTime>\n    <expirationTime>${expTime}</expirationTime>\n  </header>\n  <service>${SERVICE_NAME}</service>\n</loginTicketRequest>`;
    const cms = signCMS(tra, certPem, keyPem);
    const soapBody = `<?xml version="1.0" encoding="UTF-8"?>\n<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">\n  <soapenv:Body><wsaa:loginCms><wsaa:in0>${cms}</wsaa:in0></wsaa:loginCms></soapenv:Body>\n</soapenv:Envelope>`;
    const resp = await fetch(WSAA_URL, {
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: "" },
      body: soapBody,
    });
    const text = await resp.text();
    const fault = text.match(/<faultstring[^>]*>([^]*?)<\/faultstring>/i);
    if (!resp.ok || fault) return { error: fault?.[1]?.trim() || `HTTP ${resp.status}` };
    const returnMatch = text.match(/<loginCmsReturn>([^]*?)<\/loginCmsReturn>/);
    const decoded = (returnMatch?.[1] || text)
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"');
    const tokenMatch = decoded.match(/<token>([^<]+)<\/token>/);
    const signMatch = decoded.match(/<sign>([^<]+)<\/sign>/);
    if (!tokenMatch || !signMatch) return { error: "No se pudo obtener token/sign de WSAA" };
    return { token: tokenMatch[1], sign: signMatch[1] };
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
  const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
  const bytes = new Uint8Array(der.length);
  for (let i = 0; i < der.length; i++) bytes[i] = der.charCodeAt(i) & 0xff;
  return encodeBase64(bytes);
}

async function getUltimoComprobante(
  token: string,
  sign: string,
  cuit: string,
  puntoVenta: number,
  cbteTipo: number,
): Promise<{ number?: number; error?: string }> {
  const soapBody = `<?xml version="1.0" encoding="UTF-8"?>\n<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/">\n  <soapenv:Body>\n    <ar:FECompUltimoAutorizado>\n      <ar:Auth><ar:Token>${token}</ar:Token><ar:Sign>${sign}</ar:Sign><ar:Cuit>${cuit}</ar:Cuit></ar:Auth>\n      <ar:PtoVta>${puntoVenta}</ar:PtoVta><ar:CbteTipo>${cbteTipo}</ar:CbteTipo>\n    </ar:FECompUltimoAutorizado>\n  </soapenv:Body>\n</soapenv:Envelope>`;
  try {
    const resp = await fetch(WSFEV1_URL, {
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: "http://ar.gov.afip.dif.FEV1/FECompUltimoAutorizado" },
      body: soapBody,
    });
    const text = await resp.text();
    if (!resp.ok) return { error: `HTTP ${resp.status}` };
    const nro = text.match(/<CbteNro>(\d+)<\/CbteNro>/);
    if (nro) return { number: Number(nro[1]) };
    const err = text.match(/<Msg>([^<]+)<\/Msg>/);
    return { error: err?.[1] || "Respuesta inesperada de ARCA" };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

async function emitirNotaCreditoAfip(params: {
  token: string;
  sign: string;
  cuit: string;
  puntoVenta: number;
  cbteNro: number;
  cbteTipo: number;
  monto: number;
  clienteDoc: string;
  ivaIncluido21: boolean;
  facturaTipo: number;
  facturaPuntoVenta: number;
  facturaNumero: number;
  facturaFecha: Date;
}): Promise<EmitResult> {
  const {
    token, sign, cuit, puntoVenta, cbteNro, cbteTipo, monto, clienteDoc, ivaIncluido21,
    facturaTipo, facturaPuntoVenta, facturaNumero, facturaFecha,
  } = params;

  const docTipo = clienteDoc.length === 11 ? 80 : 96;
  const today = new Date();
  const fechaCbte = yyyymmdd(today);
  const firstDay = new Date(facturaFecha.getFullYear(), facturaFecha.getMonth(), 1);
  const lastDay = new Date(facturaFecha.getFullYear(), facturaFecha.getMonth() + 1, 0);
  const total = round2(monto);
  const neto = ivaIncluido21 ? round2(total / 1.21) : total;
  const iva = ivaIncluido21 ? round2(total - neto) : 0;
  const ivaXml = ivaIncluido21
    ? `<ar:Iva><ar:AlicIva><ar:Id>5</ar:Id><ar:BaseImp>${neto.toFixed(2)}</ar:BaseImp><ar:Importe>${iva.toFixed(2)}</ar:Importe></ar:AlicIva></ar:Iva>`
    : "";

  const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/">
  <soapenv:Body>
    <ar:FECAESolicitar>
      <ar:Auth><ar:Token>${token}</ar:Token><ar:Sign>${sign}</ar:Sign><ar:Cuit>${cuit}</ar:Cuit></ar:Auth>
      <ar:FeCAEReq>
        <ar:FeCabReq><ar:CantReg>1</ar:CantReg><ar:PtoVta>${puntoVenta}</ar:PtoVta><ar:CbteTipo>${cbteTipo}</ar:CbteTipo></ar:FeCabReq>
        <ar:FeDetReq>
          <ar:FECAEDetRequest>
            <ar:Concepto>2</ar:Concepto>
            <ar:DocTipo>${docTipo}</ar:DocTipo><ar:DocNro>${clienteDoc}</ar:DocNro>
            <ar:CbteDesde>${cbteNro}</ar:CbteDesde><ar:CbteHasta>${cbteNro}</ar:CbteHasta><ar:CbteFch>${fechaCbte}</ar:CbteFch>
            <ar:ImpTotal>${total.toFixed(2)}</ar:ImpTotal><ar:ImpTotConc>0</ar:ImpTotConc><ar:ImpNeto>${neto.toFixed(2)}</ar:ImpNeto><ar:ImpOpEx>0</ar:ImpOpEx><ar:ImpIVA>${iva.toFixed(2)}</ar:ImpIVA><ar:ImpTrib>0</ar:ImpTrib>
            <ar:FchServDesde>${yyyymmdd(firstDay)}</ar:FchServDesde><ar:FchServHasta>${yyyymmdd(lastDay)}</ar:FchServHasta><ar:FchVtoPago>${fechaCbte}</ar:FchVtoPago>
            <ar:MonId>PES</ar:MonId><ar:MonCotiz>1</ar:MonCotiz>
            <ar:CbtesAsoc>
              <ar:CbteAsoc>
                <ar:Tipo>${facturaTipo}</ar:Tipo><ar:PtoVta>${facturaPuntoVenta}</ar:PtoVta><ar:Nro>${facturaNumero}</ar:Nro><ar:Cuit>${cuit}</ar:Cuit><ar:CbteFch>${yyyymmdd(facturaFecha)}</ar:CbteFch>
              </ar:CbteAsoc>
            </ar:CbtesAsoc>
            ${ivaXml}
          </ar:FECAEDetRequest>
        </ar:FeDetReq>
      </ar:FeCAEReq>
    </ar:FECAESolicitar>
  </soapenv:Body>
</soapenv:Envelope>`;

  try {
    const resp = await fetch(WSFEV1_URL, {
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: "http://ar.gov.afip.dif.FEV1/FECAESolicitar" },
      body: soapBody,
    });
    const text = await resp.text();
    if (!resp.ok) return { error: `HTTP ${resp.status}` };

    const result = text.match(/<Resultado>([^<]+)<\/Resultado>/);
    if (result?.[1] === "A") {
      const cae = text.match(/<CAE>(\d+)<\/CAE>/)?.[1];
      const rawVto = text.match(/<CAEFchVto>(\d+)<\/CAEFchVto>/)?.[1];
      if (cae) {
        const caeVto = rawVto ? `${rawVto.slice(0, 4)}-${rawVto.slice(4, 6)}-${rawVto.slice(6, 8)}` : undefined;
        return { cae, caeVto };
      }
    }

    const err = text.match(/<Err>.*?<Msg>([^<]+)<\/Msg>/s)?.[1]
      || text.match(/<Observaciones>.*?<Msg>([^<]+)<\/Msg>/s)?.[1]
      || text.match(/<Msg>([^<]+)<\/Msg>/)?.[1]
      || "Nota de crédito rechazada por ARCA";
    return { error: err };
  } catch (err) {
    return { error: (err as Error).message };
  }
}
