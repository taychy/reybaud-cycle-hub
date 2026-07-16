// Reserva de invitado (externo, sin cuenta de alumno) para un evento público.
// Crea/actualiza event_external_participants y event_reservations con
// external_participant_id, dispara pago MP o registra transferencia con comprobante.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveCuentaMP } from "../_shared/resolve-cuenta-mp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface GuestPayload {
  event_id: string;
  package_id: string;
  nombre: string;
  apellido: string;
  email: string;
  telefono?: string;
  documento?: string;
  fecha_nacimiento?: string;
  contacto_emergencia_nombre?: string;
  contacto_emergencia_telefono?: string;
  metodo_pago: "mp" | "transferencia";
  accepted_terms: boolean;
  comprobante_base64?: string | null;
  comprobante_filename?: string | null;
  comprobante_mime?: string | null;
}

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResp({ error: "Method not allowed" }, 405);

  try {
    const raw = (await req.json()) as Partial<GuestPayload>;
    const event_id = String(raw.event_id ?? "").trim();
    const package_id = String(raw.package_id ?? "").trim();
    const nombre = String(raw.nombre ?? "").trim();
    const apellido = String(raw.apellido ?? "").trim();
    const email = String(raw.email ?? "").trim().toLowerCase();
    const telefono = String(raw.telefono ?? "").trim() || null;
    const documento = String(raw.documento ?? "").trim() || null;
    const fecha_nacimiento = raw.fecha_nacimiento ? String(raw.fecha_nacimiento).slice(0, 10) : null;
    const contacto_emergencia_nombre = String(raw.contacto_emergencia_nombre ?? "").trim() || null;
    const contacto_emergencia_telefono = String(raw.contacto_emergencia_telefono ?? "").trim() || null;
    const metodo_pago = raw.metodo_pago === "transferencia" ? "transferencia" : "mp";
    const accepted_terms = !!raw.accepted_terms;

    if (!event_id || !package_id || !nombre || !apellido || !email) {
      return jsonResp({ error: "Faltan datos obligatorios" }, 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonResp({ error: "Email inválido" }, 400);
    }
    if (!accepted_terms) {
      return jsonResp({ error: "Debés aceptar los términos" }, 400);
    }
    if (metodo_pago === "transferencia" && !raw.comprobante_base64) {
      return jsonResp({ error: "Adjuntá el comprobante de transferencia" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1) Validar evento y paquete
    const { data: eventRow } = await admin
      .from("events")
      .select("id, title, date, is_active")
      .eq("id", event_id)
      .maybeSingle();
    if (!eventRow) return jsonResp({ error: "Evento no encontrado" }, 404);

    const { data: pkg } = await admin
      .from("event_packages")
      .select("id, nombre, precio, currency, sena, activo, event_id")
      .eq("id", package_id)
      .eq("event_id", event_id)
      .maybeSingle();
    if (!pkg || !pkg.activo) return jsonResp({ error: "Paquete no disponible" }, 400);

    const amount_total = Number(pkg.precio || 0);
    const currency = pkg.currency || "ARS";

    // 2) Upsert del participante externo
    const { data: existingList } = await admin
      .from("event_external_participants")
      .select("id, access_token, nombre, apellido")
      .ilike("email", email)
      .limit(1);
    const existing = existingList?.[0] ?? null;

    let participantId: string;
    let accessToken: string;
    if (existing) {
      participantId = existing.id;
      accessToken = existing.access_token;
      await admin
        .from("event_external_participants")
        .update({
          nombre, apellido, telefono, documento,
          fecha_nacimiento, contacto_emergencia_nombre, contacto_emergencia_telefono,
          estado: "activo",
        })
        .eq("id", participantId);
    } else {
      const { data: created, error: pErr } = await admin
        .from("event_external_participants")
        .insert({
          nombre, apellido, email, telefono, documento,
          fecha_nacimiento, contacto_emergencia_nombre, contacto_emergencia_telefono,
          estado: "activo",
        })
        .select("id, access_token")
        .single();
      if (pErr || !created) {
        console.error("[create-guest-reservation] participant insert", pErr);
        return jsonResp({ error: "No se pudo crear el participante" }, 500);
      }
      participantId = created.id;
      accessToken = created.access_token;
    }

    // 3) Reserva
    const { data: reservation, error: rErr } = await admin
      .from("event_reservations")
      .insert({
        event_id,
        alumno_id: null,
        external_participant_id: participantId,
        package_id: pkg.id,
        package_nombre_snapshot: pkg.nombre,
        price_snapshot: pkg.precio,
        currency_snapshot: currency,
        amount_total,
        amount_paid: 0,
        balance_due: amount_total,
        reservation_status: metodo_pago === "transferencia" ? "pendiente_verificacion" : "pendiente_pago",
        payment_status: "pendiente",
        metodo_pago: metodo_pago === "transferencia" ? "transferencia" : "mercado_pago",
        moneda: currency,
        external_email: email,
        external_first_name: nombre,
        external_last_name: apellido,
        origin: "guest_landing",
        created_by: "guest",
        accepted_terms: true,
        terminos_aceptados_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (rErr || !reservation) {
      console.error("[create-guest-reservation] reservation insert", rErr);
      return jsonResp({ error: "No se pudo crear la reserva" }, 500);
    }
    const reservationId = reservation.id;

    // 4) Transferencia: subir comprobante + notificar admin
    if (metodo_pago === "transferencia") {
      const bytes = base64ToBytes(String(raw.comprobante_base64));
      const ext = (raw.comprobante_filename?.split(".").pop() || "bin").toLowerCase();
      const path = `guest-reservations/${reservationId}/${Date.now()}.${ext}`;
      const { error: upErr } = await admin.storage
        .from("payment-proofs")
        .upload(path, bytes, {
          contentType: raw.comprobante_mime || "application/octet-stream",
          upsert: true,
        });
      if (upErr) console.error("[create-guest-reservation] upload comprobante", upErr);

      await admin
        .from("event_reservations")
        .update({ admin_notes: `Comprobante invitado: ${path}` })
        .eq("id", reservationId);

      try {
        await admin.from("admin_notification_events").insert({
          tipo: "guest_reservation_transferencia_pendiente",
          prioridad: "alta",
          payload: {
            reservation_id: reservationId,
            participant_id: participantId,
            event_id, event_nombre: eventRow.title,
            package_nombre: pkg.nombre,
            monto: amount_total,
            email, nombre, apellido, telefono, documento,
            comprobante_path: path,
          },
          deduplication_key: `guest-transf-${reservationId}`,
        });
      } catch (e) { console.error(e); }

      return jsonResp({
        ok: true,
        mode: "transfer",
        reservation_id: reservationId,
        participant_id: participantId,
        access_token: accessToken,
      });
    }

    // 5) MP
    const cuenta = await resolveCuentaMP(admin, { unidad_negocio: "eventos" });
    if (!cuenta.access_token) return jsonResp({ error: "Mercado Pago no está configurado" }, 500);

    const origin = req.headers.get("origin") || "https://reybaud-app.com";
    const prefBody: Record<string, unknown> = {
      items: [{
        title: `${eventRow.title} · ${pkg.nombre}`,
        quantity: 1,
        unit_price: amount_total,
        currency_id: currency,
      }],
      payer: { name: `${nombre} ${apellido}`.trim(), email },
      back_urls: {
        success: `${origin}/mi-reserva/${accessToken}?status=approved`,
        failure: `${origin}/mi-reserva/${accessToken}?status=failure`,
        pending: `${origin}/mi-reserva/${accessToken}?status=pending`,
      },
      auto_return: "approved",
      external_reference: `guest_reservation:${reservationId}`,
      notification_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/mp-webhook${cuenta.slug ? `?cuenta=${cuenta.slug}` : ""}`,
      statement_descriptor: "CICLISMO REYBAUD",
    };

    const mpRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cuenta.access_token}` },
      body: JSON.stringify(prefBody),
    });
    if (!mpRes.ok) {
      console.error("[create-guest-reservation] MP", await mpRes.text());
      return jsonResp({ error: "No se pudo generar el link de pago" }, 502);
    }
    const pref = await mpRes.json();

    return jsonResp({
      ok: true,
      mode: "mp",
      init_point: pref.init_point || pref.sandbox_init_point,
      preference_id: pref.id,
      reservation_id: reservationId,
      participant_id: participantId,
      access_token: accessToken,
    });
  } catch (e) {
    console.error("[create-guest-reservation] fatal", e);
    return jsonResp({ error: "Error interno" }, 500);
  }
});
