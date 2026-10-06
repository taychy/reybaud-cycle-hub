import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";
import forge from "https://esm.sh/node-forge@1.3.1";
import { resolveClienteFiscal } from "../_shared/fiscal-identity.ts";
import {
  resolverFechasEmision, decidirReconciliacion, esErrorTransitorio,
  ajustarFechaAlUltimo, esMismatchNumeracion, obtenerTicketWsaa,
  type OrigenEmision, type FechasEmision, type ConsultaComprobante,
} from "../_shared/facturacion-emision.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// AFIP Production endpoints
const WSAA_URL = "https://wsaa.afip.gov.ar/ws/services/LoginCms";
const WSFEV1_URL = "https://servicios1.afip.gov.ar/wsfev1/service.asmx";
const SERVICE_NAME = "wsfe";

type ComprobanteLetra = "A" | "B" | "C";

interface ComprobanteAfip {
  tipo: 1 | 6 | 11;
  letra: ComprobanteLetra;
  ivaIncluido21: boolean;
}

type EmitAfipResult = { cae?: string; caeVto?: string; error?: string; uncertain?: boolean };

function normalizeFiscal(value: string | null | undefined): string {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[_.-]+/g, " ")
    .trim();
}

function isResponsableInscripto(value: string | null | undefined): boolean {
  const normalized = normalizeFiscal(value);
  return normalized.includes("responsable inscripto") || normalized === "ri" || normalized.includes("resp inscripto");
}

function resolveComprobanteAfip(
  emisorCondicionIva: string | null | undefined,
  clienteCondicionFiscal: string | null | undefined,
  clienteDoc: string
): ComprobanteAfip {
  if (!isResponsableInscripto(emisorCondicionIva)) {
    return { tipo: 11, letra: "C", ivaIncluido21: false };
  }

  const clienteRi = isResponsableInscripto(clienteCondicionFiscal) && clienteDoc.length === 11;
  return clienteRi
    ? { tipo: 1, letra: "A", ivaIncluido21: true }
    : { tipo: 6, letra: "B", ivaIncluido21: true };
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

interface EmitRequest {
  action?: "emitir" | "reconciliar";
  factura_id: string;
  emisor_id?: string;
  cliente_cuit?: string | null;
  condicion_fiscal?: string;
}

const LOCKABLE = ["sin_factura", "error", "requiere_datos_fiscales"];
const LOCK_STALE_MS = 10 * 60 * 1000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function hoyArgentina(): Date {
  const ar = new Date(Date.now() - 3 * 3600 * 1000);
  return new Date(Date.UTC(ar.getUTCFullYear(), ar.getUTCMonth(), ar.getUTCDate()));
}

// deno-lint-ignore no-explicit-any
async function logAuto(admin: any, facturaId: string, colaId: string | null, evento: string, detalle: unknown) {
  try {
    await admin.from("facturacion_auto_log").insert({ factura_id: facturaId, cola_id: colaId, evento, detalle });
  } catch (e) {
    console.error("[emit-factura-afip] log error", (e as Error).message);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ---- Autenticación: admin logueado o worker interno con token ----
    let origen: OrigenEmision = "manual";
    const workerToken = req.headers.get("x-worker-token");
    if (workerToken) {
      const { data: cfg } = await adminClient
        .from("facturacion_worker_config").select("token").eq("id", 1).maybeSingle();
      if (!cfg?.token || cfg.token !== workerToken) return json({ error: "Unauthorized" }, 401);
      origen = "auto";
    } else {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const token = authHeader.replace("Bearer ", "");
      const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
      if (claimsError || !claimsData?.claims) return json({ error: "Unauthorized" }, 401);
      const { data: isAdmin, error: roleErr } = await adminClient.rpc("has_role", {
        _user_id: claimsData.claims.sub as string,
        _role: "admin",
      });
      if (roleErr || !isAdmin) return json({ error: "Forbidden: admin role required" }, 403);
    }

    const body: EmitRequest = await req.json();
    const action = body.action ?? "emitir";
    const { factura_id } = body;
    if (!factura_id) return json({ error: "factura_id es requerido" }, 400);

    const { data: factura, error: facturaErr } = await adminClient
      .from("facturas").select("*").eq("id", factura_id).single();
    if (facturaErr || !factura) return json({ error: "Factura no encontrada" }, 404);

    if (factura.estado === "emitida" && factura.cae) {
      return json({
        success: true, already: true, numero_comprobante: factura.numero_comprobante,
        cae: factura.cae, cae_vencimiento: factura.cae_vencimiento,
      });
    }

    const emisorId = body.emisor_id || factura.emisor_id;
    if (!emisorId) return json({ error: "La factura no tiene emisor fiscal asignado" }, 400);
    const { data: emisor } = await adminClient
      .from("emisores_fiscales").select("*").eq("id", emisorId).single();
    if (!emisor) return json({ error: "Emisor no encontrado" }, 404);
    if (!emisor.cert_pem || !emisor.key_pem) {
      return json({ error: "El emisor no tiene certificado AFIP configurado" }, 400);
    }
    const cuitClean = String(emisor.cuit).replace(/-/g, "");

    // ---- Emisión en curso o incierta: conciliar contra ARCA antes de hacer nada ----
    const lockViejo = factura.emision_lock_at
      ? Date.now() - new Date(factura.emision_lock_at).getTime() > LOCK_STALE_MS
      : true;
    if (action === "reconciliar" || (factura.estado === "emitiendo" && (lockViejo || factura.recuperacion_estado === "incierta"))) {
      return await reconciliar(adminClient, factura, emisor, cuitClean);
    }
    if (factura.estado === "emitiendo") {
      return json({ error: "Esta factura ya se está emitiendo. Esperá unos minutos." }, 409);
    }

    // ---- Bloqueo atómico: solo un proceso puede pasar a 'emitiendo' ----
    const { data: claimed } = await adminClient
      .from("facturas")
      .update({
        estado: "emitiendo",
        emision_lock_at: new Date().toISOString(),
        emision_intentos: (factura.emision_intentos ?? 0) + 1,
        emisor_id: emisorId,
        cbte_esperado_tipo: null, cbte_esperado_pto: null, cbte_esperado_nro: null,
        recuperacion_estado: null,
      } as any)
      .eq("id", factura_id)
      .in("estado", LOCKABLE)
      .is("cae", null)
      .select("id")
      .maybeSingle();
    if (!claimed) {
      return json({ error: "Otra emisión tomó esta factura. Recargá para ver el estado." }, 409);
    }

    const fallar = async (estado: string, detalle: string, status: number, extra: Record<string, unknown> = {}) => {
      await adminClient.from("facturas")
        .update({ estado, error_detalle: detalle, emision_lock_at: null } as any)
        .eq("id", factura_id);
      await logAuto(adminClient, factura_id, factura.facturacion_cola_id, estado, { detalle, origen });
      return json({ error: detalle, estado, retryable: esErrorTransitorio(detalle), ...extra }, status);
    };

    // ---- Moneda: nunca mandar USD/EUR como pesos ----
    if (String(factura.moneda || "ARS").toUpperCase() !== "ARS") {
      return await fallar("error", `moneda_no_soportada_automaticamente: la factura está en ${factura.moneda}`, 422);
    }

    // ---- Identidad fiscal actual del cliente ----
    const cliente = await resolveClienteFiscal(adminClient as any, {
      alumnoId: factura.alumno_id ?? null,
      snapshotNombre: factura.cliente_nombre ?? null,
      snapshotDocumento: body.cliente_cuit ?? factura.cliente_cuit ?? null,
      snapshotCondicion: body.condicion_fiscal ?? factura.condicion_fiscal ?? null,
    });
    if (cliente.identity.clase !== "ok" || !cliente.identity.docNro) {
      const detalle = cliente.identity.mensaje || "Falta completar/validar DNI o CUIT en la ficha del cliente";
      return await fallar("requiere_datos_fiscales", `Datos fiscales incompletos: ${detalle}`, 422);
    }
    const condicionEfectiva = cliente.condicionFiscal || body.condicion_fiscal || "consumidor_final";
    const clienteCuitClean = cliente.identity.docNro;
    await adminClient.from("facturas").update({
      cliente_nombre: cliente.nombre || factura.cliente_nombre,
      cliente_cuit: clienteCuitClean,
      condicion_fiscal: condicionEfectiva,
    } as any).eq("id", factura_id);

    // ---- Fechas desde el cobro, no "hoy" ----
    const fechas = resolverFechasEmision({
      hoy: hoyArgentina(),
      fechaComprobante: factura.fecha_comprobante,
      servicioDesde: factura.servicio_desde,
      servicioHasta: factura.servicio_hasta,
      segmento: factura.segmento,
      origen,
    });
    if ("error" in fechas) return await fallar("error", fechas.error, 422);

    // ---- ARCA ----
    const wsaaResult = await getTicket(adminClient, emisor);
    if (wsaaResult.error) {
      return await fallar("error", wsaaResult.error, 503, { code: wsaaResult.code });
    }

    let comprobante = resolveComprobanteAfip(emisor.condicion_iva, condicionEfectiva, clienteCuitClean);

    const tk = wsaaResult.token || "", sg = wsaaResult.sign || "";
    const pedirNumeroYFecha = async (tipo: ComprobanteAfip) => {
      // Siempre justo antes de FECAESolicitar: nunca reutilizar un número calculado antes.
      const lastNum = await getUltimoComprobante(tk, sg, cuitClean, emisor.punto_venta, tipo.tipo);
      if (lastNum.error || lastNum.number === undefined) return { error: `FECompUltimoAutorizado: ${lastNum.error || "sin número"}` };
      let ultimoFch: string | null = null;
      if (lastNum.number > 0) {
        const ult = await consultarComprobante(tk, sg, cuitClean, emisor.punto_venta, tipo.tipo, lastNum.number);
        ultimoFch = ult?.cbteFch ?? null;
      }
      return { cbteNro: lastNum.number + 1, fechas: ajustarFechaAlUltimo(fechas, ultimoFch) };
    };

    const emitirConTipo = async (tipo: ComprobanteAfip, intento = 0): Promise<{ cbteNro: number | null; result: EmitAfipResult }> => {
      const pn = await pedirNumeroYFecha(tipo);
      if ("error" in pn) return { cbteNro: null, result: { error: pn.error } };
      const cbteNro = pn.cbteNro;
      // Registrar el número esperado ANTES de pedir CAE: permite conciliar si algo falla después.
      const { error: preErr } = await adminClient.from("facturas").update({
        cbte_esperado_tipo: tipo.tipo, cbte_esperado_pto: emisor.punto_venta, cbte_esperado_nro: cbteNro,
      } as any).eq("id", factura_id).eq("estado", "emitiendo");
      if (preErr) {
        return { cbteNro: null, result: { error: `No se pudo registrar el número esperado: ${preErr.message}` } as EmitAfipResult };
      }
      if (pn.fechas.ajustadaPorUltimo) {
        await logAuto(adminClient, factura_id, factura.facturacion_cola_id, "fecha_ajustada_al_ultimo", { cbteFch: pn.fechas.cbteFch, fecha_cobro: fechas.cbteFch });
      }
      const result = await emitirFacturaAfip({
        token: tk, sign: sg, cuit: cuitClean,
        puntoVenta: emisor.punto_venta, cbteNro, cbteTipo: tipo.tipo, monto: factura.monto, concepto: 2,
        clienteCuit: clienteCuitClean, condicionFiscal: condicionEfectiva, ivaIncluido21: tipo.ivaIncluido21,
        fechas: pn.fechas,
      });
      if (result.error && !result.uncertain && esMismatchNumeracion(result.error) && intento === 0) {
        // Antes de reintentar: ¿ARCA ya tiene autorizado el número que pedimos para ESTA factura?
        const c = await consultarComprobante(tk, sg, cuitClean, emisor.punto_venta, tipo.tipo, cbteNro);
        if (c === null) return { cbteNro, result: { error: `ARCA rechazó la numeración y no se pudo verificar el número ${cbteNro}`, uncertain: true } };
        if (c.encontrado && c.cae) {
          const montoOk = c.impTotal == null || Math.abs(Number(c.impTotal) - Number(factura.monto)) < 0.01;
          const docOk = !c.docNro || String(c.docNro) === String(clienteCuitClean);
          if (montoOk && docOk) return { cbteNro, result: { cae: c.cae, caeVto: c.caeVto ?? undefined } };
          // Ese número es de otro comprobante: reintentar con el próximo real.
        }
        await logAuto(adminClient, factura_id, factura.facturacion_cola_id, "reintento_numeracion", { cbteNro, detalle: result.error });
        return await emitirConTipo(tipo, 1);
      }
      return { cbteNro, result };
    };

    let { cbteNro, result: emitResult } = await emitirConTipo(comprobante);

    if (emitResult.uncertain) {
      await adminClient.from("facturas").update({
        recuperacion_estado: "incierta",
        error_detalle: `Emisión incierta: ${emitResult.error}. Queda para conciliación con ARCA.`,
      } as any).eq("id", factura_id);
      await logAuto(adminClient, factura_id, factura.facturacion_cola_id, "incierta", { detalle: emitResult.error, cbteNro, origen });
      return json({ error: "No hubo respuesta clara de ARCA. La factura quedó para conciliación; no se va a duplicar.", estado: "incierta", recoverable: true }, 202);
    }

    if (emitResult.error?.startsWith("FECompUltimoAutorizado:") || emitResult.error?.startsWith("No se pudo registrar")) {
      return await fallar("error", emitResult.error, 500);
    }

    const emisorNoMonotributoRejected =
      comprobante.tipo === 11 && emitResult.error &&
      /NO AUTORIZADO A EMITIR COMPROBANTES|NO CORRESPONDE A RESPONS(?:A|BA)LE MONOTRIBUTO|RESPONS(?:A|BA)LE MONOTRIBUTO/i.test(emitResult.error);
    if (emisorNoMonotributoRejected) {
      console.warn(`[emit-factura-afip] Factura C rechazada para ${cuitClean}; reintento como RI.`);
      comprobante = resolveComprobanteAfip("Responsable Inscripto", condicionEfectiva, clienteCuitClean);
      ({ cbteNro, result: emitResult } = await emitirConTipo(comprobante));
      if (emitResult.uncertain) {
        await adminClient.from("facturas").update({ recuperacion_estado: "incierta", error_detalle: `Emisión incierta: ${emitResult.error}` } as any).eq("id", factura_id);
        return json({ error: "No hubo respuesta clara de ARCA. Quedó para conciliación.", estado: "incierta", recoverable: true }, 202);
      }
    }

    const padronRejected = emitResult.error &&
      /no se encuentra registrado en los padrones|no corresponde a una cuit|DocNro|DocTipo/i.test(emitResult.error);
    if (padronRejected) {
      return await fallar("requiere_datos_fiscales",
        `ARCA rechazó el documento del cliente (${clienteCuitClean}). Corregí el DNI o CUIT. Detalle: ${emitResult.error}`, 422);
    }
    if (emitResult.error) {
      const code = esMismatchNumeracion(emitResult.error) ? "numeracion_arca" : "arca_rechazo";
      return await fallar("error", `FECAESolicitar: ${emitResult.error}`, 422, { code });
    }
    if (cbteNro === null || !emitResult.cae) return await fallar("error", "AFIP no devolvió número/CAE", 500);

    const nroComprobante = `${String(emisor.punto_venta).padStart(5, "0")}-${String(cbteNro).padStart(8, "0")}`;
    const persisted = await persistirEmitida(adminClient, factura_id, {
      emisor_id: emisorId, nroComprobante, tipo: comprobante.tipo, letra: comprobante.letra,
      cae: emitResult.cae, caeVto: emitResult.caeVto ?? null, recuperada: false,
    });
    if (!persisted.ok) {
      await logAuto(adminClient, factura_id, factura.facturacion_cola_id, "cae_sin_persistir", {
        numero_comprobante: nroComprobante, cae: emitResult.cae, error: persisted.error,
      });
      return json({
        error: "ARCA autorizó la factura pero no se pudo guardar. Quedó en recuperación: se reconstruye desde ARCA sin duplicar.",
        recoverable: true, numero_comprobante: nroComprobante, cae: emitResult.cae,
      }, 500);
    }

    dispatchPdfEmail(factura_id);
    await logAuto(adminClient, factura_id, factura.facturacion_cola_id, "emitida", { numero_comprobante: nroComprobante, origen });

    return json({
      success: true,
      numero_comprobante: nroComprobante,
      tipo_comprobante: comprobante.tipo,
      letra_comprobante: comprobante.letra,
      cae: emitResult.cae,
      cae_vencimiento: emitResult.caeVto,
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    return json({ error: `Error inesperado: ${(err as Error).message}` }, 500);
  }
});

// deno-lint-ignore no-explicit-any
async function persistirEmitida(admin: any, facturaId: string, d: {
  emisor_id: string; nroComprobante: string; tipo: number; letra: string; cae: string; caeVto: string | null; recuperada: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  let lastErr = "";
  for (let i = 0; i < 3; i++) {
    const { error } = await admin.from("facturas").update({
      emisor_id: d.emisor_id,
      estado: "emitida",
      numero_comprobante: d.nroComprobante,
      tipo_comprobante: d.tipo,
      letra_comprobante: d.letra,
      cae: d.cae,
      cae_vencimiento: d.caeVto,
      fecha_emision: new Date().toISOString(),
      error_detalle: null,
      emision_lock_at: null,
      recuperacion_estado: d.recuperada ? "recuperada" : null,
    }).eq("id", facturaId);
    if (!error) return { ok: true };
    lastErr = error.message;
    await new Promise((r) => setTimeout(r, 400 * (i + 1)));
  }
  // Marcar al menos como incierta para que la conciliación la recupere.
  await admin.from("facturas").update({ recuperacion_estado: "incierta" }).eq("id", facturaId);
  return { ok: false, error: lastErr };
}

function dispatchPdfEmail(factura_id: string) {
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
}

// deno-lint-ignore no-explicit-any
async function reconciliar(admin: any, factura: any, emisor: any, cuitClean: string): Promise<Response> {
  const esperadoNro: number | null = factura.cbte_esperado_nro ?? null;
  const tipo: number | null = factura.cbte_esperado_tipo ?? null;
  const pto: number = factura.cbte_esperado_pto ?? emisor.punto_venta;

  let consulta: ConsultaComprobante | null = null;
  let ultimo: number | null = null;
  if (esperadoNro != null && tipo != null) {
    const wsaa = await getTicket(admin, emisor);
    if (!wsaa.error) {
      consulta = await consultarComprobante(wsaa.token || "", wsaa.sign || "", cuitClean, pto, tipo, esperadoNro);
      const u = await getUltimoComprobante(wsaa.token || "", wsaa.sign || "", cuitClean, pto, tipo);
      ultimo = u.number ?? null;
    }
  }

  const decision = decidirReconciliacion({
    esperadoNro, consulta, ultimoAutorizado: ultimo, monto: Number(factura.monto), docNro: factura.cliente_cuit,
  });

  if (decision.accion === "recuperar") {
    const nro = `${String(pto).padStart(5, "0")}-${String(esperadoNro).padStart(8, "0")}`;
    const letra = tipo === 1 ? "A" : tipo === 6 ? "B" : "C";
    const p = await persistirEmitida(admin, factura.id, {
      emisor_id: emisor.id, nroComprobante: nro, tipo: tipo!, letra, cae: decision.cae, caeVto: decision.caeVto, recuperada: true,
    });
    await logAuto(admin, factura.id, factura.facturacion_cola_id, "recuperada", { numero_comprobante: nro, ok: p.ok });
    if (p.ok) dispatchPdfEmail(factura.id);
    return json({ success: p.ok, recovered: true, numero_comprobante: nro, cae: decision.cae }, p.ok ? 200 : 500);
  }
  if (decision.accion === "liberar") {
    await admin.from("facturas").update({
      estado: "error", emision_lock_at: null, recuperacion_estado: esperadoNro != null ? "sin_comprobante" : null,
      error_detalle: decision.motivo,
    }).eq("id", factura.id);
    await logAuto(admin, factura.id, factura.facturacion_cola_id, "liberada", { motivo: decision.motivo });
    return json({ success: false, released: true, motivo: decision.motivo, retryable: true });
  }
  await admin.from("facturas").update({ recuperacion_estado: "incierta", error_detalle: decision.motivo }).eq("id", factura.id);
  await logAuto(admin, factura.id, factura.facturacion_cola_id, decision.accion, { motivo: decision.motivo });
  return json({ success: false, estado: "incierta", motivo: decision.motivo }, 202);
}

// TA (ticket WSAA) reutilizable por emisor/servicio, guardado solo en backend.
// deno-lint-ignore no-explicit-any
async function getTicket(admin: any, emisor: any) {
  return await obtenerTicketWsaa({
    leer: async () => {
      const { data } = await admin.from("afip_wsaa_tickets").select("token, sign, expires_at")
        .eq("emisor_id", emisor.id).eq("service", SERVICE_NAME).maybeSingle();
      return data ?? null;
    },
    guardar: async (t) => {
      const { error } = await admin.from("afip_wsaa_tickets").upsert({
        emisor_id: emisor.id, service: SERVICE_NAME, token: t.token, sign: t.sign,
        expires_at: t.expires_at, obtained_at: new Date().toISOString(),
      });
      if (error) console.error("[emit-factura-afip] no se pudo guardar TA", error.message);
    },
    login: () => authenticateWSAA(emisor.cert_pem, emisor.key_pem),
  });
}

// ============================================================
// WSAA Authentication - Sign Login Ticket Request with CMS
// ============================================================
async function authenticateWSAA(
  certPem: string,
  keyPem: string
): Promise<{ token?: string; sign?: string; expires_at?: string; error?: string }> {
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
      // Extraer el faultstring del SOAP fault (más útil que el XML crudo)
      const faultMatch = respText.match(/<faultstring[^>]*>([^]*?)<\/faultstring>/i);
      const detail = faultMatch ? faultMatch[1].trim() : respText.substring(0, 500);
      console.error(`[WSAA] HTTP ${resp.status}: ${respText.substring(0, 2000)}`);
      return { error: `HTTP ${resp.status}: ${detail}` };
    }
    // Algunas fallas WSAA vienen con HTTP 200 pero SOAP fault
    const faultCheck = respText.match(/<faultstring[^>]*>([^]*?)<\/faultstring>/i);
    if (faultCheck) {
      console.error(`[WSAA] SOAP fault: ${respText.substring(0, 2000)}`);
      return { error: `SOAP fault: ${faultCheck[1].trim()}` };
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
        const expM = decoded.match(/<expirationTime>([^<]+)<\/expirationTime>/);
        return { token: tokenM[1], sign: signM[1], expires_at: expM ? new Date(expM[1]).toISOString() : undefined };
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
  puntoVenta: number,
  cbteTipo: number
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
      <ar:CbteTipo>${cbteTipo}</ar:CbteTipo>
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
// WSFEV1: Emit factura AFIP
// ============================================================

// ============================================================
// WSFEV1: Emit factura AFIP
// ============================================================
async function emitirFacturaAfip(params: {
  token: string;
  sign: string;
  cuit: string;
  puntoVenta: number;
  cbteNro: number;
  cbteTipo: number;
  monto: number;
  concepto: number;
  clienteCuit: string;
  condicionFiscal: string;
  ivaIncluido21: boolean;
  fechas: FechasEmision;
}): Promise<EmitAfipResult> {
  const { token, sign, cuit, puntoVenta, cbteNro, cbteTipo, monto, concepto, clienteCuit, ivaIncluido21, fechas } = params;

  const docTipo = clienteCuit.length === 11 ? 80 : 96;
  const docNro = clienteCuit;

  const total = round2(Number(monto));
  const neto = ivaIncluido21 ? round2(total / 1.21) : total;
  const iva = ivaIncluido21 ? round2(total - neto) : 0;
  const ivaXml = ivaIncluido21
    ? `<ar:Iva><ar:AlicIva><ar:Id>5</ar:Id><ar:BaseImp>${neto.toFixed(2)}</ar:BaseImp><ar:Importe>${iva.toFixed(2)}</ar:Importe></ar:AlicIva></ar:Iva>`
    : "";

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
          <ar:CbteTipo>${cbteTipo}</ar:CbteTipo>
        </ar:FeCabReq>
        <ar:FeDetReq>
          <ar:FECAEDetRequest>
            <ar:Concepto>${concepto}</ar:Concepto>
            <ar:DocTipo>${docTipo}</ar:DocTipo>
            <ar:DocNro>${docNro}</ar:DocNro>
            <ar:CbteDesde>${cbteNro}</ar:CbteDesde>
            <ar:CbteHasta>${cbteNro}</ar:CbteHasta>
            <ar:CbteFch>${fechas.cbteFch}</ar:CbteFch>
            <ar:ImpTotal>${total.toFixed(2)}</ar:ImpTotal>
            <ar:ImpTotConc>0</ar:ImpTotConc>
            <ar:ImpNeto>${neto.toFixed(2)}</ar:ImpNeto>
            <ar:ImpOpEx>0</ar:ImpOpEx>
            <ar:ImpIVA>${iva.toFixed(2)}</ar:ImpIVA>
            <ar:ImpTrib>0</ar:ImpTrib>
            ${ivaXml}
            <ar:FchServDesde>${fechas.servDesde}</ar:FchServDesde>
            <ar:FchServHasta>${fechas.servHasta}</ar:FchServHasta>
            <ar:FchVtoPago>${fechas.vtoPago}</ar:FchVtoPago>
            <ar:MonId>PES</ar:MonId>
            <ar:MonCotiz>1</ar:MonCotiz>
          </ar:FECAEDetRequest>
        </ar:FeDetReq>
      </ar:FeCAEReq>
    </ar:FECAESolicitar>
  </soapenv:Body>
</soapenv:Envelope>`;

  let text: string;
  try {
    const resp = await fetch(WSFEV1_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: "http://ar.gov.afip.dif.FEV1/FECAESolicitar",
      },
      body: soapBody,
    });
    text = await resp.text();
    if (!resp.ok) {
      // El pedido llegó a ARCA pero no sabemos si se autorizó: queda incierto.
      return { error: `HTTP ${resp.status}`, uncertain: true };
    }
  } catch (err) {
    return { error: (err as Error).message, uncertain: true };
  }

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
    return { error: "ARCA aprobó sin CAE legible", uncertain: true };
  }
  if (!resultMatch) {
    return { error: "Respuesta de ARCA sin resultado", uncertain: true };
  }

  const obsMatch = text.match(/<Msg>([^<]+)<\/Msg>/);
  const errMatch = text.match(/<Err>.*?<Msg>([^<]+)<\/Msg>/s);
  const obsMsg = text.match(/<Observaciones>.*?<Msg>([^<]+)<\/Msg>/s);
  const errorMsg = errMatch?.[1] || obsMsg?.[1] || obsMatch?.[1] || "Factura rechazada por AFIP";
  return { error: errorMsg };
}

// ============================================================
// WSFEV1: consultar un comprobante ya emitido (para conciliación)
// ============================================================
async function consultarComprobante(
  token: string, sign: string, cuit: string, puntoVenta: number, cbteTipo: number, cbteNro: number,
): Promise<ConsultaComprobante | null> {
  const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/">
  <soapenv:Body>
    <ar:FECompConsultar>
      <ar:Auth>
        <ar:Token>${token}</ar:Token>
        <ar:Sign>${sign}</ar:Sign>
        <ar:Cuit>${cuit}</ar:Cuit>
      </ar:Auth>
      <ar:FeCompConsReq>
        <ar:CbteTipo>${cbteTipo}</ar:CbteTipo>
        <ar:CbteNro>${cbteNro}</ar:CbteNro>
        <ar:PtoVta>${puntoVenta}</ar:PtoVta>
      </ar:FeCompConsReq>
    </ar:FECompConsultar>
  </soapenv:Body>
</soapenv:Envelope>`;
  try {
    const resp = await fetch(WSFEV1_URL, {
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: "http://ar.gov.afip.dif.FEV1/FECompConsultar" },
      body: soapBody,
    });
    if (!resp.ok) return null;
    const text = await resp.text();
    const cae = text.match(/<CodAutorizacion>(\d+)<\/CodAutorizacion>/)?.[1] ?? null;
    if (cae) {
      const vto = text.match(/<FchVto>(\d{8})<\/FchVto>/)?.[1] ?? null;
      const imp = text.match(/<ImpTotal>([\d.]+)<\/ImpTotal>/)?.[1];
      const doc = text.match(/<DocNro>(\d+)<\/DocNro>/)?.[1] ?? null;
      const fch = text.match(/<CbteFch>(\d{8})<\/CbteFch>/)?.[1] ?? null;
      return {
        encontrado: true,
        cbteFch: fch,
        cae,
        caeVto: vto ? `${vto.slice(0, 4)}-${vto.slice(4, 6)}-${vto.slice(6, 8)}` : null,
        impTotal: imp != null ? Number(imp) : null,
        docNro: doc,
      };
    }
    // Código 602: "No existen datos en nuestros registros para los parámetros ingresados"
    if (/<Code>602<\/Code>/.test(text) || /No existen datos/i.test(text)) return { encontrado: false };
    return null;
  } catch {
    return null;
  }
}
