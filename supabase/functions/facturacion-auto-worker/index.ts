// Worker de facturación automática (Fase 1).
// Solo procesa cobros que la base marcó como elegibles (ARS, emisor resuelto,
// datos fiscales válidos, pagados después de la activación). Lote acotado,
// bloqueo por fila (claim_facturacion_auto) y reintentos con espera.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const BATCH = 5;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: cfg } = await admin.from("facturacion_worker_config").select("token").eq("id", 1).maybeSingle();
  const workerToken = cfg?.token as string | undefined;
  const given = req.headers.get("x-worker-token");
  let authorized = !!workerToken && given === workerToken;
  if (!authorized) {
    const auth = req.headers.get("Authorization");
    if (auth?.startsWith("Bearer ")) {
      const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
      const { data } = await userClient.auth.getClaims(auth.slice(7));
      const sub = data?.claims?.sub as string | undefined;
      if (sub) {
        const { data: isAdmin } = await admin.rpc("has_role", { _user_id: sub, _role: "admin" });
        authorized = !!isAdmin;
      }
    }
  }
  if (!authorized || !workerToken) return json({ error: "Unauthorized" }, 401);

  const emit = async (payload: Record<string, unknown>) => {
    const r = await fetch(`${url}/functions/v1/emit-factura-afip`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-worker-token": workerToken },
      body: JSON.stringify(payload),
    });
    let body: any = {};
    try { body = await r.json(); } catch { /* sin cuerpo */ }
    return { status: r.status, body };
  };

  // 0) Inerte si ningún emisor tiene el interruptor maestro + algún tipo de cobro encendidos
  const { data: activos } = await admin
    .from("emisor_segmento_config")
    .select("emisor_id, emisores_fiscales!inner(facturacion_automatica, activo)")
    .eq("auto_habilitado", true)
    .eq("emisores_fiscales.facturacion_automatica", true)
    .eq("emisores_fiscales.activo", true)
    .limit(1);
  if (!activos || activos.length === 0) return json({ ok: true, inerte: true });

  const resumen = { conciliadas: 0, procesadas: 0, facturadas: 0, errores: 0, inciertas: 0, sin_cae: 0 };

  // 0b) Persistencia incompleta: marcadas emitidas sin CAE -> se concilian con ARCA, nunca se reemiten a ciegas
  const { data: sinCae } = await admin
    .from("facturas").select("id").eq("estado", "emitida").is("cae", null)
    .is("recuperacion_estado", null).not("facturacion_cola_id", "is", null).limit(BATCH);
  for (const f of sinCae ?? []) {
    await admin.from("facturas").update({ estado: "emitiendo", recuperacion_estado: "incierta" } as any)
      .eq("id", f.id).eq("estado", "emitida").is("cae", null);
    resumen.sin_cae++;
  }

  // 1) Conciliación: emisiones inciertas o bloqueos viejos
  const limite = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: inciertas } = await admin
    .from("facturas")
    .select("id")
    .eq("estado", "emitiendo")
    .or(`recuperacion_estado.eq.incierta,emision_lock_at.lt.${limite}`)
    .limit(BATCH);
  for (const f of inciertas ?? []) {
    await emit({ action: "reconciliar", factura_id: f.id });
    resumen.conciliadas++;
  }

  // 2) Cobros nuevos listos
  const { data: claimed, error: claimErr } = await admin.rpc("claim_facturacion_auto", { p_limit: BATCH });
  if (claimErr) {
    console.error("[facturacion-auto-worker] claim error", claimErr.message);
    return json({ error: "No se pudo tomar la cola", ...resumen }, 500);
  }

  for (const c of (claimed as any[]) ?? []) {
    resumen.procesadas++;
    let facturaId: string | null = null;
    try {
      const { data: existente } = await admin.from("facturas").select("id, estado, cae").eq("facturacion_cola_id", c.id).maybeSingle();
      if (existente) {
        facturaId = existente.id;
        if (existente.estado === "emitida" && existente.cae) {
          await admin.rpc("finish_facturacion_auto", { p_cola_id: c.id, p_resultado: "facturada", p_factura_id: facturaId });
          resumen.facturadas++;
          continue;
        }
      } else {
        const { data: nueva, error: insErr } = await admin.from("facturas").insert({
          alumno_id: c.alumno_id,
          cliente_nombre: c.cliente_nombre || "Sin nombre",
          cliente_cuit: c.cliente_cuit,
          concepto: c.concepto,
          monto: c.monto,
          moneda: c.moneda || "ARS",
          referencia_tipo: c.referencia_tipo,
          referencia_id: c.referencia_id,
          segmento: c.segmento === "eventos" ? "viajes" : c.segmento,
          emisor_id: c.emisor_resuelto_id,
          estado: "sin_factura",
          metodo_pago: c.metodo_pago,
          origen_registro: c.origen_registro,
          cuenta_mp_id: c.cuenta_mp_id,
          facturacion_cola_id: c.id,
          servicio_desde: c.servicio_desde,
          servicio_hasta: c.servicio_hasta,
          fecha_comprobante: c.fecha_comprobante,
        }).select("id").single();
        if (insErr) {
          // Otro proceso la creó (índice único por cola): reusar
          const { data: again } = await admin.from("facturas").select("id").eq("facturacion_cola_id", c.id).maybeSingle();
          if (!again) throw new Error(insErr.message);
          facturaId = again.id;
        } else {
          facturaId = nueva.id;
        }
      }

      const r = await emit({ factura_id: facturaId, emisor_id: c.emisor_resuelto_id });
      if (r.status === 200 && r.body?.success) {
        await admin.rpc("finish_facturacion_auto", { p_cola_id: c.id, p_resultado: "facturada", p_factura_id: facturaId });
        resumen.facturadas++;
      } else if (r.status === 202) {
        await admin.rpc("finish_facturacion_auto", { p_cola_id: c.id, p_resultado: "incierta", p_error: r.body?.error, p_factura_id: facturaId });
        resumen.inciertas++;
      } else if (r.body?.estado === "requiere_datos_fiscales") {
        await admin.rpc("finish_facturacion_auto", { p_cola_id: c.id, p_resultado: "requiere_datos_fiscales", p_error: r.body?.error, p_factura_id: facturaId });
        resumen.errores++;
      } else {
        await admin.rpc("finish_facturacion_auto", {
          p_cola_id: c.id, p_resultado: "error", p_error: r.body?.error || `HTTP ${r.status}`,
          p_retryable: !!r.body?.retryable || r.status >= 500, p_factura_id: facturaId,
        });
        resumen.errores++;
      }
    } catch (e) {
      await admin.rpc("finish_facturacion_auto", {
        p_cola_id: c.id, p_resultado: "error", p_error: (e as Error).message, p_retryable: true, p_factura_id: facturaId,
      });
      resumen.errores++;
    }
  }

  return json({ ok: true, ...resumen });
});
