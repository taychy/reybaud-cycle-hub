import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2/cors";

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

    // Validate caller is admin
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

    // Check admin role
    const { data: isAdmin } = await adminClient.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { alumno_id, concepto, monto, referencia_tipo, referencia_id } = body;

    if (!alumno_id || !concepto || !monto) {
      return new Response(
        JSON.stringify({ error: "alumno_id, concepto y monto son requeridos" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get default emisor with facturacion_automatica enabled
    const { data: emisor } = await adminClient
      .from("emisores_fiscales")
      .select("*")
      .eq("es_predeterminado", true)
      .eq("activo", true)
      .single();

    if (!emisor) {
      // No default emisor - just create factura record for manual processing
      const { data: alumno } = await adminClient
        .from("alumnos")
        .select("nombre, apellido")
        .eq("id", alumno_id)
        .single();

      const clienteNombre = alumno ? `${alumno.nombre}${alumno.apellido ? ` ${alumno.apellido}` : ""}` : "Sin nombre";

      const { error: insertErr } = await adminClient.from("facturas").insert({
        alumno_id,
        cliente_nombre: clienteNombre,
        concepto,
        monto,
        referencia_tipo: referencia_tipo || "suscripcion",
        referencia_id: referencia_id || null,
        estado: "sin_factura",
        condicion_fiscal: "consumidor_final",
      });

      if (insertErr) {
        console.error("Error creating factura record:", insertErr);
        return new Response(
          JSON.stringify({ error: "Error al crear registro de factura", created: false }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          created: true, 
          emitted: false, 
          message: "Registro de factura creado. No hay emisor predeterminado para facturación automática." 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Has default emisor - check if auto-invoicing is enabled and certs exist
    const canAutoEmit = emisor.facturacion_automatica && emisor.cert_pem && emisor.key_pem;

    // Get alumno info
    const { data: alumno } = await adminClient
      .from("alumnos")
      .select("nombre, apellido, documento")
      .eq("id", alumno_id)
      .single();

    const clienteNombre = alumno ? `${alumno.nombre}${alumno.apellido ? ` ${alumno.apellido}` : ""}` : "Sin nombre";

    // Create factura record
    const { data: factura, error: insertErr } = await adminClient.from("facturas").insert({
      alumno_id,
      cliente_nombre: clienteNombre,
      cliente_cuit: alumno?.documento || null,
      concepto,
      monto,
      referencia_tipo: referencia_tipo || "suscripcion",
      referencia_id: referencia_id || null,
      emisor_id: emisor.id,
      estado: canAutoEmit ? "sin_factura" : "sin_factura",
      condicion_fiscal: "consumidor_final",
    }).select("id").single();

    if (insertErr || !factura) {
      console.error("Error creating factura:", insertErr);
      return new Response(
        JSON.stringify({ error: "Error al crear registro de factura" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!canAutoEmit) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          created: true, 
          emitted: false, 
          message: "Registro creado. Facturación automática desactivada o sin certificado AFIP." 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Auto-emit via AFIP - call the existing emit function internally
    const emitUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/emit-factura-afip`;
    const emitResp = await fetch(emitUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({
        factura_id: factura.id,
        emisor_id: emisor.id,
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
          error_afip: emitData.error || "Error al emitir contra AFIP",
          message: "Registro creado pero falló la emisión automática. Podés reintentarlo manualmente." 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        created: true, 
        emitted: true, 
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
