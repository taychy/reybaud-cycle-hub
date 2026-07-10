// Sube un comprobante de transferencia. Validación por upload_token de la reserva.
// El cliente envía multipart/form-data con: reservation_id, token, file.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MAX_SIZE = 8 * 1024 * 1024; // 8MB
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const form = await req.formData();
    const reservationId = String(form.get("reservation_id") || "");
    const token = String(form.get("token") || "");
    const file = form.get("file") as File | null;

    if (!reservationId || !token || !file) {
      return new Response(JSON.stringify({ error: "Faltan datos (reservation_id, token, file)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!ALLOWED.includes(file.type)) {
      return new Response(JSON.stringify({ error: "Formato no permitido. Usá JPG, PNG, WEBP o PDF." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (file.size > MAX_SIZE) {
      return new Response(JSON.stringify({ error: "El archivo supera 8MB" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: r, error: rErr } = await supabase
      .from("reservas_turnera")
      .select("id, email, nombre, apellido, upload_token, pago_estado, hold_expira_at, metodo_pago")
      .eq("id", reservationId)
      .maybeSingle();
    if (rErr || !r) {
      return new Response(JSON.stringify({ error: "Reserva no encontrada" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!r.upload_token || String(r.upload_token) !== token) {
      return new Response(JSON.stringify({ error: "Token inválido" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (r.metodo_pago !== "transferencia") {
      return new Response(JSON.stringify({ error: "La reserva no está en modo transferencia" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!["pendiente_transferencia", "comprobante_subido"].includes(String(r.pago_estado))) {
      return new Response(JSON.stringify({ error: "La reserva ya no acepta comprobantes" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (r.hold_expira_at && new Date(r.hold_expira_at as string).getTime() < Date.now() && r.pago_estado !== "comprobante_subido") {
      return new Response(JSON.stringify({ error: "La reserva expiró" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ext = file.name.split(".").pop()?.toLowerCase() || (file.type === "application/pdf" ? "pdf" : "jpg");
    const path = `${reservationId}/${Date.now()}.${ext}`;

    const buf = new Uint8Array(await file.arrayBuffer());
    const { error: upErr } = await supabase.storage
      .from("turnera-comprobantes")
      .upload(path, buf, { contentType: file.type, upsert: false });
    if (upErr) {
      console.error("[upload-turnera-comprobante] storage error:", upErr);
      return new Response(JSON.stringify({ error: "No se pudo subir el archivo", detail: upErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase.from("reservas_turnera").update({
      comprobante_url: path,
      comprobante_subido_at: new Date().toISOString(),
      pago_estado: "comprobante_subido",
    } as any).eq("id", reservationId);

    // Aviso al admin (best-effort)
    try {
      await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-turnera-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({ reservation_id: reservationId, tipo: "admin_nuevo_comprobante" }),
      });
    } catch (e) {
      console.error("[upload-turnera-comprobante] email error:", (e as Error).message);
    }

    return new Response(JSON.stringify({ ok: true, path }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[upload-turnera-comprobante] error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
