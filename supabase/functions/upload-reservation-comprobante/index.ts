// Sube el comprobante de transferencia de una reserva de evento (flujo invitado).
// Validación por access_token del participante externo.
// Multipart/form-data: reservation_id, token, file.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MAX_SIZE = 8 * 1024 * 1024; // 8MB
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const form = await req.formData();
    const reservationId = String(form.get("reservation_id") || "");
    const token = String(form.get("token") || "");
    const file = form.get("file") as File | null;
    const amountRaw = form.get("amount");
    const amountInput = amountRaw != null && String(amountRaw).trim() !== "" ? Number(amountRaw) : null;

    if (!reservationId || !token || !file) {
      return json(400, { error: "Faltan datos (reservation_id, token, file)" });
    }
    if (amountInput != null && (!Number.isFinite(amountInput) || amountInput <= 0)) {
      return json(400, { error: "Monto inválido" });
    }
    if (!ALLOWED.includes(file.type)) {
      return json(400, { error: "Formato no permitido. Usá JPG, PNG, WEBP o PDF." });
    }
    if (file.size > MAX_SIZE) {
      return json(400, { error: "El archivo supera 8MB" });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Validar token → participante → reserva
    const { data: participant } = await supabase
      .from("event_external_participants")
      .select("id")
      .eq("access_token", token)
      .maybeSingle();

    if (!participant?.id) {
      return json(403, { error: "Token inválido" });
    }

    const { data: reservation, error: rErr } = await supabase
      .from("event_reservations")
      .select("id, external_participant_id, reservation_status, payment_status, balance_due, currency_snapshot, cancelled_at")
      .eq("id", reservationId)
      .maybeSingle();

    if (rErr || !reservation) {
      return json(404, { error: "Reserva no encontrada" });
    }
    if (reservation.external_participant_id !== participant.id) {
      return json(403, { error: "La reserva no pertenece a este perfil" });
    }
    if (reservation.cancelled_at) {
      return json(400, { error: "La reserva está cancelada" });
    }
    if (reservation.payment_status === "pagado") {
      return json(400, { error: "La reserva ya está pagada" });
    }

    // Subir archivo
    const ext = file.name.split(".").pop()?.toLowerCase() || (file.type === "application/pdf" ? "pdf" : "jpg");
    const path = `${reservationId}/${Date.now()}.${ext}`;
    const buf = new Uint8Array(await file.arrayBuffer());

    const { error: upErr } = await supabase.storage
      .from("payment-proofs")
      .upload(path, buf, { contentType: file.type, upsert: false });

    if (upErr) {
      console.error("[upload-reservation-comprobante] storage error:", upErr);
      return json(500, { error: "No se pudo subir el archivo", detail: upErr.message });
    }

    // Registrar pago informado (pendiente de verificación)
    const amount = Number(reservation.balance_due || 0);
    const currency = String(reservation.currency_snapshot || "ARS").toUpperCase();

    const { error: payErr } = await supabase.from("reservation_payments").insert({
      reservation_id: reservationId,
      amount,
      currency,
      payment_method: "transferencia",
      status: "informado",
      proof_url: path,
      notes: "Comprobante subido por el participante (link público).",
    });

    if (payErr) {
      console.error("[upload-reservation-comprobante] insert payment error:", payErr);
      return json(500, { error: "No se pudo registrar el comprobante", detail: payErr.message });
    }

    // Mantener estado de verificación
    await supabase
      .from("event_reservations")
      .update({ reservation_status: "pendiente_verificacion" })
      .eq("id", reservationId);

    return json(200, { ok: true, path });
  } catch (err) {
    console.error("[upload-reservation-comprobante] error:", err);
    return json(500, { error: (err as Error).message });
  }
});
