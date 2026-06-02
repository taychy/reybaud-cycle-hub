import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";
import forge from "npm:node-forge@1.3.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// AFIP Production endpoints
const WSAA_URL = "https://wsaa.afip.gov.ar/ws/services/LoginCms";
const WSFEV1_URL = "https://servicios1.afip.gov.ar/wsfev1/service.asmx";
const SERVICE_NAME = "wsfe";

interface EmitRequest {
  factura_id: string;
  emisor_id: string;
  cliente_cuit: string | null;
  condicion_fiscal: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: EmitRequest = await req.json();
    const { factura_id, emisor_id, cliente_cuit, condicion_fiscal } = body;

    if (!factura_id || !emisor_id) {
      return new Response(
        JSON.stringify({ error: "factura_id y emisor_id son requeridos" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use service role to read cert/key securely
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get emisor with cert/key
    const { data: emisor, error: emisorErr } = await adminClient
      .from("emisores_fiscales")
      .select("*")
      .eq("id", emisor_id)
      .single();

    if (emisorErr || !emisor) {
      return new Response(
        JSON.stringify({ error: "Emisor no encontrado" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!emisor.cert_pem || !emisor.key_pem) {
      return new Response(
        JSON.stringify({ error: "El emisor no tiene certificado AFIP configurado" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get factura
    const { data: factura, error: facturaErr } = await adminClient
      .from("facturas")
      .select("*")
      .eq("id", factura_id)
      .single();

    if (facturaErr || !factura) {
      return new Response(
        JSON.stringify({ error: "Factura no encontrada" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 1: WSAA Authentication
    const wsaaResult = await authenticateWSAA(emisor.cert_pem, emisor.key_pem);
    if (wsaaResult.error) {
      await adminClient
        .from("facturas")
        .update({ estado: "error", error_detalle: `WSAA: ${wsaaResult.error}` } as any)
        .eq("id", factura_id);
      return new Response(
        JSON.stringify({ error: `Error de autenticación AFIP: ${wsaaResult.error}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 2: Get last authorized comprobante number
    const cuitClean = emisor.cuit.replace(/-/g, "");
    const lastNum = await getUltimoComprobante(
      wsaaResult.token!,
      wsaaResult.sign!,
      cuitClean,
      emisor.punto_venta
    );

    if (lastNum.error) {
      await adminClient
        .from("facturas")
        .update({ estado: "error", error_detalle: `FECompUltimoAutorizado: ${lastNum.error}` } as any)
        .eq("id", factura_id);
      return new Response(
        JSON.stringify({ error: `Error al consultar AFIP: ${lastNum.error}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cbteNro = lastNum.number! + 1;

    // Step 3: Emit Factura C (cbte_tipo = 11)
    const emitResult = await emitirFacturaC({
      token: wsaaResult.token!,
      sign: wsaaResult.sign!,
      cuit: cuitClean,
      puntoVenta: emisor.punto_venta,
      cbteNro,
      monto: factura.monto,
      concepto: 2, // Servicios
      clienteCuit: cliente_cuit?.replace(/-/g, "") || "0",
      condicionFiscal: condicion_fiscal,
    });

    if (emitResult.error) {
      await adminClient
        .from("facturas")
        .update({ estado: "error", error_detalle: `FECAESolicitar: ${emitResult.error}` } as any)
        .eq("id", factura_id);
      return new Response(
        JSON.stringify({ error: `Error al emitir factura: ${emitResult.error}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 4: Update factura with AFIP data
    const nroComprobante = `${String(emisor.punto_venta).padStart(5, "0")}-${String(cbteNro).padStart(8, "0")}`;

    const { error: updateErr } = await adminClient
      .from("facturas")
      .update({
        emisor_id: emisor_id,
        cliente_cuit: cliente_cuit || null,
        condicion_fiscal: condicion_fiscal,
        estado: "emitida",
        numero_comprobante: nroComprobante,
        cae: emitResult.cae,
        cae_vencimiento: emitResult.caeVto,
        fecha_emision: new Date().toISOString(),
        error_detalle: null,
      } as any)
      .eq("id", factura_id);

    if (updateErr) {
      console.error("Error updating factura:", updateErr);
    }

    // Auto-dispatch: generar PDF y enviar email al alumno (fire-and-forget)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const dispatch = async () => {
      try {
        await fetch(`${supabaseUrl}/functions/v1/generate-factura-pdf`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify({ factura_id, force: true }),
        });
        await fetch(`${supabaseUrl}/functions/v1/send-factura-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify({ factura_id }),
        });
      } catch (e) { console.error("auto-dispatch error", e); }
    };
    // @ts-ignore EdgeRuntime is available in Supabase edge runtime
    if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(dispatch());
    else dispatch();

    return new Response(
      JSON.stringify({
        success: true,
        numero_comprobante: nroComprobante,
        cae: emitResult.cae,
        cae_vencimiento: emitResult.caeVto,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: `Error inesperado: ${(err as Error).message}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ============================================================
// WSAA Authentication - Sign Login Ticket Request with CMS
// ============================================================
async function authenticateWSAA(
  certPem: string,
  keyPem: string
): Promise<{ token?: string; sign?: string; error?: string }> {
  try {
    const now = new Date();
    const genTime = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
    const expTime = new Date(now.getTime() + 10 * 60 * 1000).toISOString();

    const loginTicketRequest = `<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0">
  <header>
    <uniqueId>${Math.floor(Date.now() / 1000)}</uniqueId>
    <generationTime>${genTime}</generationTime>
    <expirationTime>${expTime}</expirationTime>
  </header>
  <service>${SERVICE_NAME}</service>
</loginTicketRequest>`;

    // Sign the TRA using PKCS#7 / CMS
    const cms = await signCMS(loginTicketRequest, certPem, keyPem);

    // Call WSAA
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
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: "",
      },
      body: soapBody,
    });

    const respText = await resp.text();

    if (!resp.ok) {
      return { error: `HTTP ${resp.status}: ${respText.substring(0, 200)}` };
    }

    // Parse response - extract token and sign
    const tokenMatch = respText.match(/<token>([^<]+)<\/token>/);
    const signMatch = respText.match(/<sign>([^<]+)<\/sign>/);

    // The response wraps XML in CDATA, we need to decode entities
    let cleanResp = respText;
    const returnMatch = cleanResp.match(/<loginCmsReturn>([^]*?)<\/loginCmsReturn>/);
    if (returnMatch) {
      const decoded = returnMatch[1]
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"');
      
      const tokenM = decoded.match(/<token>([^<]+)<\/token>/);
      const signM = decoded.match(/<sign>([^<]+)<\/sign>/);

      if (tokenM && signM) {
        return { token: tokenM[1], sign: signM[1] };
      }
    }

    if (tokenMatch && signMatch) {
      return { token: tokenMatch[1], sign: signMatch[1] };
    }

    return { error: "No se pudo obtener token/sign de WSAA" };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

// ============================================================
// CMS Signing using Web Crypto + manual PKCS#7 construction
// ============================================================
async function signCMS(data: string, certPem: string, keyPem: string): Promise<string> {
  // PKCS#7 / CMS signing using node-forge (works in Supabase Edge Runtime, no subprocess needed)
  try {
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

    // detached=false (nodetach equivalente al -nodetach de openssl smime)
    p7.sign({ detached: false });

    const derBytes = forge.asn1.toDer(p7.toAsn1()).getBytes();
    // Convert forge binary string -> Uint8Array -> base64
    const bytes = new Uint8Array(derBytes.length);
    for (let i = 0; i < derBytes.length; i++) bytes[i] = derBytes.charCodeAt(i) & 0xff;
    return encodeBase64(bytes);
  } catch (err) {
    throw new Error(`CMS sign failed: ${(err as Error).message}`);
  }
}

// ============================================================
// WSFEV1: Get last authorized comprobante
// ============================================================
async function getUltimoComprobante(
  token: string,
  sign: string,
  cuit: string,
  puntoVenta: number
): Promise<{ number?: number; error?: string }> {
  const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/">
  <soapenv:Body>
    <ar:FECompUltimoAutorizado>
      <ar:Auth>
        <ar:Token>${token}</ar:Token>
        <ar:Sign>${sign}</ar:Sign>
        <ar:Cuit>${cuit}</ar:Cuit>
      </ar:Auth>
      <ar:PtoVta>${puntoVenta}</ar:PtoVta>
      <ar:CbteTipo>11</ar:CbteTipo>
    </ar:FECompUltimoAutorizado>
  </soapenv:Body>
</soapenv:Envelope>`;

  try {
    const resp = await fetch(WSFEV1_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: "http://ar.gov.afip.dif.FEV1/FECompUltimoAutorizado",
      },
      body: soapBody,
    });

    const text = await resp.text();

    if (!resp.ok) {
      return { error: `HTTP ${resp.status}` };
    }

    const nroMatch = text.match(/<CbteNro>(\d+)<\/CbteNro>/);
    if (nroMatch) {
      return { number: parseInt(nroMatch[1]) };
    }

    const errMatch = text.match(/<Msg>([^<]+)<\/Msg>/);
    return { error: errMatch ? errMatch[1] : "Respuesta inesperada de AFIP" };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

// ============================================================
// WSFEV1: Emit Factura C
// ============================================================
async function emitirFacturaC(params: {
  token: string;
  sign: string;
  cuit: string;
  puntoVenta: number;
  cbteNro: number;
  monto: number;
  concepto: number;
  clienteCuit: string;
  condicionFiscal: string;
}): Promise<{ cae?: string; caeVto?: string; error?: string }> {
  const { token, sign, cuit, puntoVenta, cbteNro, monto, concepto, clienteCuit, condicionFiscal } = params;

  // Factura C = CbteTipo 11
  // DocTipo: 96=DNI, 80=CUIT, 99=Consumidor Final (sin doc)
  let docTipo = 99;
  let docNro = "0";

  if (clienteCuit && clienteCuit !== "0") {
    if (clienteCuit.length === 11) {
      docTipo = 80; // CUIT
      docNro = clienteCuit;
    } else {
      docTipo = 96; // DNI
      docNro = clienteCuit;
    }
  }

  const today = new Date();
  const fechaCbte = today.toISOString().split("T")[0].replace(/-/g, "");
  
  // For concepto = Servicios, need date range
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const fchServDesde = firstDay.toISOString().split("T")[0].replace(/-/g, "");
  const fchServHasta = lastDay.toISOString().split("T")[0].replace(/-/g, "");
  const fchVtoPago = fechaCbte;

  const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/">
  <soapenv:Body>
    <ar:FECAESolicitar>
      <ar:Auth>
        <ar:Token>${token}</ar:Token>
        <ar:Sign>${sign}</ar:Sign>
        <ar:Cuit>${cuit}</ar:Cuit>
      </ar:Auth>
      <ar:FeCAEReq>
        <ar:FeCabReq>
          <ar:CantReg>1</ar:CantReg>
          <ar:PtoVta>${puntoVenta}</ar:PtoVta>
          <ar:CbteTipo>11</ar:CbteTipo>
        </ar:FeCabReq>
        <ar:FeDetReq>
          <ar:FECAEDetRequest>
            <ar:Concepto>${concepto}</ar:Concepto>
            <ar:DocTipo>${docTipo}</ar:DocTipo>
            <ar:DocNro>${docNro}</ar:DocNro>
            <ar:CbteDesde>${cbteNro}</ar:CbteDesde>
            <ar:CbteHasta>${cbteNro}</ar:CbteHasta>
            <ar:CbteFch>${fechaCbte}</ar:CbteFch>
            <ar:ImpTotal>${monto.toFixed(2)}</ar:ImpTotal>
            <ar:ImpTotConc>0</ar:ImpTotConc>
            <ar:ImpNeto>${monto.toFixed(2)}</ar:ImpNeto>
            <ar:ImpOpEx>0</ar:ImpOpEx>
            <ar:ImpIVA>0</ar:ImpIVA>
            <ar:ImpTrib>0</ar:ImpTrib>
            <ar:FchServDesde>${fchServDesde}</ar:FchServDesde>
            <ar:FchServHasta>${fchServHasta}</ar:FchServHasta>
            <ar:FchVtoPago>${fchVtoPago}</ar:FchVtoPago>
            <ar:MonId>PES</ar:MonId>
            <ar:MonCotiz>1</ar:MonCotiz>
          </ar:FECAEDetRequest>
        </ar:FeDetReq>
      </ar:FeCAEReq>
    </ar:FECAESolicitar>
  </soapenv:Body>
</soapenv:Envelope>`;

  try {
    const resp = await fetch(WSFEV1_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: "http://ar.gov.afip.dif.FEV1/FECAESolicitar",
      },
      body: soapBody,
    });

    const text = await resp.text();

    if (!resp.ok) {
      return { error: `HTTP ${resp.status}` };
    }

    // Check for result
    const resultMatch = text.match(/<Resultado>([^<]+)<\/Resultado>/);
    if (resultMatch && resultMatch[1] === "A") {
      const caeMatch = text.match(/<CAE>(\d+)<\/CAE>/);
      const caeVtoMatch = text.match(/<CAEFchVto>(\d+)<\/CAEFchVto>/);
      
      if (caeMatch) {
        const caeVto = caeVtoMatch
          ? `${caeVtoMatch[1].substring(0, 4)}-${caeVtoMatch[1].substring(4, 6)}-${caeVtoMatch[1].substring(6, 8)}`
          : null;
        return { cae: caeMatch[1], caeVto: caeVto || undefined };
      }
    }

    // Check for errors
    const obsMatch = text.match(/<Msg>([^<]+)<\/Msg>/);
    const errMatch = text.match(/<Err>.*?<Msg>([^<]+)<\/Msg>/s);
    const obsMsg = text.match(/<Observaciones>.*?<Msg>([^<]+)<\/Msg>/s);
    
    const errorMsg = errMatch?.[1] || obsMsg?.[1] || obsMatch?.[1] || "Factura rechazada por AFIP";
    return { error: errorMsg };
  } catch (err) {
    return { error: (err as Error).message };
  }
}
