import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2/cors";

type Segmento = "escuela" | "viajes" | "tienda";

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

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: isAdmin } = await adminClient.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const {
      alumno_id,
      concepto,
      monto,
      referencia_tipo,
      referencia_id,
      segmento,
      origen,
    }: {
      alumno_id: string;
      concepto: string;
      monto: number;
      referencia_tipo?: string;
      referencia_id?: string;
      segmento: Segmento;
      origen?: "app_online" | "manual_admin" | "efectivo" | "transferencia";
    } = body;

    if (!alumno_id || !concepto || !monto) {
      return new Response(
        JSON.stringify({ error: "alumno_id, concepto y monto son requeridos" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!segmento || !["escuela", "viajes", "tienda"].includes(segmento)) {
      return new Response(
        JSON.stringify({ error: "segmento inválido (escuela | viajes | tienda)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Datos del alumno
    const { data: alumno } = await adminClient
      .from("alumnos")
      .select("nombre, apellido, documento")
      .eq("id", alumno_id)
      .single();

    const clienteNombre = alumno
      ? `${alumno.nombre}${alumno.apellido ? ` ${alumno.apellido}` : ""}`
      : "Sin nombre";

    // ============================================================
    // RUTEO: elegir el mejor emisor para este segmento
    // ============================================================
    const emisorElegido = await elegirEmisor(adminClient, segmento, monto);

    if (!emisorElegido) {
      // No hay emisor disponible -> crear factura sin emitir
      const { error: insertErr } = await adminClient.from("facturas").insert({
        alumno_id,
        cliente_nombre: clienteNombre,
        cliente_cuit: alumno?.documento || null,
        concepto,
        monto,
        referencia_tipo: referencia_tipo || "suscripcion",
        referencia_id: referencia_id || null,
        segmento,
        estado: "sin_factura",
        condicion_fiscal: "consumidor_final",
      });

      if (insertErr) {
        console.error("Error creating factura record:", insertErr);
        return new Response(
          JSON.stringify({ error: "Error al crear registro de factura" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          created: true,
          emitted: false,
          message: `Sin emisor disponible para "${segmento}". Configurá uno habilitado con cupo y certificado en /admin/facturacion.`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Crear factura asociada al emisor elegido
    const { data: factura, error: insertErr } = await adminClient
      .from("facturas")
      .insert({
        alumno_id,
        cliente_nombre: clienteNombre,
        cliente_cuit: alumno?.documento || null,
        concepto,
        monto,
        referencia_tipo: referencia_tipo || "suscripcion",
        referencia_id: referencia_id || null,
        segmento,
        emisor_id: emisorElegido.id,
        estado: "sin_factura",
        condicion_fiscal: "consumidor_final",
      })
      .select("id")
      .single();

    if (insertErr || !factura) {
      console.error("Error creating factura:", insertErr);
      return new Response(
        JSON.stringify({ error: "Error al crear registro de factura" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const canAutoEmit =
      emisorElegido.facturacion_automatica &&
      emisorElegido.cert_pem &&
      emisorElegido.key_pem;

    if (!canAutoEmit) {
      return new Response(
        JSON.stringify({
          success: true,
          created: true,
          emitted: false,
          emisor: emisorElegido.nombre_fiscal,
          message: "Factura creada. Emisión automática desactivada o sin certificado.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Emitir contra AFIP
    const emitUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/emit-factura-afip`;
    const emitResp = await fetch(emitUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({
        factura_id: factura.id,
        emisor_id: emisorElegido.id,
        cliente_cuit: alumno?.documento || null,
        condicion_fiscal: "consumidor_final",
      }),
    });

    const emitData = await emitResp.json();

    if (!emitResp.ok || emitData.error) {
      console.error("Auto-emit failed:", emitData);
      return new Response(
        JSON.stringify({
          success: true,
          created: true,
          emitted: false,
          emisor: emisorElegido.nombre_fiscal,
          error_afip: emitData.error || "Error al emitir contra AFIP",
          message: "Registro creado pero falló la emisión. Reintentá manualmente.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        created: true,
        emitted: true,
        emisor: emisorElegido.nombre_fiscal,
        numero_comprobante: emitData.numero_comprobante,
        cae: emitData.cae,
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

/**
 * Selecciona el mejor emisor para un segmento dado, balanceando por cupo disponible.
 * Reglas:
 *  1. Debe estar activo y habilitado para el segmento.
 *  2. Si tiene `limite_anual_ars`, el monto a facturar no debe hacer que se pase del tope.
 *  3. Entre los candidatos, gana el de mayor cupo disponible (o el primero si nadie tiene límite).
 */
async function elegirEmisor(
  adminClient: ReturnType<typeof createClient>,
  segmento: Segmento,
  monto: number
) {
  // Emisores habilitados para el segmento
  const { data: configs } = await adminClient
    .from("emisor_segmento_config")
    .select("emisor_id, emisores_fiscales!inner(*)")
    .eq("segmento", segmento)
    .eq("habilitado", true);

  if (!configs || configs.length === 0) return null;

  // Aplanar a array de emisores activos
  // deno-lint-ignore no-explicit-any
  const emisores = (configs as any[])
    .map((c) => c.emisores_fiscales)
    .filter((e) => e && e.activo);

  if (emisores.length === 0) return null;

  // Facturado anual por emisor
  const { data: facturados } = await adminClient
    .from("emisor_facturado_anual")
    .select("emisor_id, facturado_anual, cupo_disponible, limite_anual_ars");

  const facturadoMap = new Map<
    string,
    { facturado: number; cupo: number | null; limite: number | null }
  >();
  // deno-lint-ignore no-explicit-any
  (facturados as any[] | null)?.forEach((f) => {
    facturadoMap.set(f.emisor_id, {
      facturado: Number(f.facturado_anual) || 0,
      cupo: f.cupo_disponible !== null ? Number(f.cupo_disponible) : null,
      limite: f.limite_anual_ars !== null ? Number(f.limite_anual_ars) : null,
    });
  });

  // Filtrar candidatos con cupo
  const candidatos = emisores.filter((e) => {
    const info = facturadoMap.get(e.id);
    if (!info || info.limite === null) return true; // sin límite => siempre elegible
    return info.cupo !== null && info.cupo >= monto;
  });

  if (candidatos.length === 0) return null;

  // Balanceo: el de mayor cupo disponible primero (los sin límite van al final con cupo "infinito")
  candidatos.sort((a, b) => {
    const ia = facturadoMap.get(a.id);
    const ib = facturadoMap.get(b.id);
    const cupoA = ia?.cupo ?? Number.POSITIVE_INFINITY;
    const cupoB = ib?.cupo ?? Number.POSITIVE_INFINITY;
    return cupoB - cupoA;
  });

  return candidatos[0];
}
