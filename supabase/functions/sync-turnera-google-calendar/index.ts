// Sincroniza reservas de turnera con Google Calendar compartido de la escuela.
// Se invoca desde el trigger `trg_sync_turnera_gcal`.
//
// Modos:
//   { reservation_id, action?: 'upsert' | 'delete' }  → sincroniza una reserva
//   { mode: 'reconcile' }                             → repara reservas actuales/futuras
//                                                       sin google_event_id o con estado 'error'
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const CALENDAR_ID = "c_bb8012c231024152cdee4dd2209226311d060fae683d148210b0580cd23fcf54@group.calendar.google.com";
const GATEWAY_BASE = "https://connector-gateway.lovable.dev/google_calendar/calendar/v3";
const TZ = "America/Argentina/Buenos_Aires";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const GOOGLE_CALENDAR_API_KEY = Deno.env.get("GOOGLE_CALENDAR_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const gcalHeaders = {
  "Authorization": `Bearer ${LOVABLE_API_KEY}`,
  "X-Connection-Api-Key": GOOGLE_CALENDAR_API_KEY,
  "Content-Type": "application/json",
};

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** fetch con reintentos acotados: errores de red y 429/5xx. Nunca reintenta otros 4xx. */
async function gcalFetch(url: string, init: RequestInit, maxAttempts = 3): Promise<Response> {
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, init);
      if (res.ok || !RETRYABLE_STATUS.has(res.status) || attempt === maxAttempts) return res;
      console.warn(`[gcal] retry ${attempt}/${maxAttempts} status=${res.status}`);
    } catch (err) {
      lastErr = err;
      if (attempt === maxAttempts) throw err;
      console.warn(`[gcal] retry ${attempt}/${maxAttempts} network error: ${String(err)}`);
    }
    await sleep(500 * attempt);
  }
  throw lastErr ?? new Error("gcalFetch: unreachable");
}

function buildEvent(r: any, servicio: any, coach: any, sede: any) {
  const start = `${r.fecha}T${r.hora_inicio}`;
  const end = `${r.fecha}T${r.hora_fin}`;
  const nombreAlumno = `${r.nombre ?? ""} ${r.apellido ?? ""}`.trim() || r.email || "Alumno";
  const servicioNombre = servicio?.nombre ?? "Turno";
  const coachNombre = coach?.nombre ?? coach?.full_name ?? "Coach";
  const sedeNombre = sede?.nombre ?? "";

  const summary = `${servicioNombre} — ${nombreAlumno}`;
  const descLines = [
    `Servicio: ${servicioNombre}`,
    `Alumno: ${nombreAlumno}`,
    r.email ? `Email: ${r.email}` : null,
    r.celular ? `Celular: ${r.celular}` : null,
    `Coach: ${coachNombre}`,
    sedeNombre ? `Sede: ${sedeNombre}` : null,
    r.nota ? `\nNota: ${r.nota}` : null,
    `\nReserva ID: ${r.id}`,
  ].filter(Boolean).join("\n");

  return {
    summary,
    description: descLines,
    location: sedeNombre || undefined,
    start: { dateTime: start, timeZone: TZ },
    end: { dateTime: end, timeZone: TZ },
    extendedProperties: {
      private: { reserva_turnera_id: r.id },
    },
  };
}

type SyncResult =
  | { ok: true; action: "delete" }
  | { ok: true; action: "upsert"; event_id: string; htmlLink?: string }
  | { ok: false; status?: number; error: string };

async function syncOne(supabase: any, reservation_id: string, action?: string): Promise<SyncResult> {
  const { data: r, error: rErr } = await supabase
    .from("reservas_turnera")
    .select("*")
    .eq("id", reservation_id)
    .single();
  if (rErr || !r) return { ok: false, error: rErr?.message ?? "reserva no encontrada" };

  // DELETE
  if (action === "delete") {
    if (r.google_event_id) {
      let delRes: Response;
      try {
        delRes = await gcalFetch(
          `${GATEWAY_BASE}/calendars/${encodeURIComponent(CALENDAR_ID)}/events/${r.google_event_id}`,
          { method: "DELETE", headers: gcalHeaders },
        );
      } catch (err) {
        const msg = `delete network: ${String(err).slice(0, 400)}`;
        await supabase.from("reservas_turnera").update({
          google_sync_status: "error", google_sync_error: msg,
        }).eq("id", r.id);
        return { ok: false, error: msg };
      }
      if (!delRes.ok && delRes.status !== 404 && delRes.status !== 410) {
        const body = await delRes.text();
        const msg = `delete ${delRes.status}: ${body.slice(0, 500)}`;
        await supabase.from("reservas_turnera").update({
          google_sync_status: "error", google_sync_error: msg,
        }).eq("id", r.id);
        return { ok: false, status: delRes.status, error: msg };
      }
      await supabase.from("reservas_turnera").update({
        google_event_id: null,
        google_sync_status: "deleted",
        google_sync_error: null,
        google_synced_at: new Date().toISOString(),
      }).eq("id", r.id);
    }
    return { ok: true, action: "delete" };
  }

  // UPSERT: obtener datos relacionados
  const [{ data: servicio }, { data: coach }, { data: sede }] = await Promise.all([
    r.servicio_id
      ? supabase.from("servicios_turnera").select("nombre").eq("id", r.servicio_id).maybeSingle()
      : Promise.resolve({ data: null }),
    r.coach_id
      ? supabase.from("coaches").select("nombre, email").eq("id", r.coach_id).maybeSingle()
      : Promise.resolve({ data: null }),
    r.sede_id
      ? supabase.from("sedes").select("nombre").eq("id", r.sede_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const coachFull = coach ? { nombre: coach.nombre ?? "", email: coach.email } : null;
  const eventPayload = buildEvent(r, servicio, coachFull, sede);

  let response: Response;
  try {
    if (r.google_event_id) {
      response = await gcalFetch(
        `${GATEWAY_BASE}/calendars/${encodeURIComponent(CALENDAR_ID)}/events/${r.google_event_id}`,
        { method: "PATCH", headers: gcalHeaders, body: JSON.stringify(eventPayload) },
      );
      if (response.status === 404 || response.status === 410) {
        // Evento borrado en Google → recrear
        response = await gcalFetch(
          `${GATEWAY_BASE}/calendars/${encodeURIComponent(CALENDAR_ID)}/events`,
          { method: "POST", headers: gcalHeaders, body: JSON.stringify(eventPayload) },
        );
      }
    } else {
      response = await gcalFetch(
        `${GATEWAY_BASE}/calendars/${encodeURIComponent(CALENDAR_ID)}/events`,
        { method: "POST", headers: gcalHeaders, body: JSON.stringify(eventPayload) },
      );
    }
  } catch (err) {
    const msg = `upsert network: ${String(err).slice(0, 400)}`;
    console.error(`gcal ${msg}`);
    await supabase.from("reservas_turnera").update({
      google_sync_status: "error", google_sync_error: msg,
    }).eq("id", r.id);
    return { ok: false, error: msg };
  }

  if (!response.ok) {
    const body = await response.text();
    console.error(`gcal upsert failed [${response.status}]: ${body}`);
    await supabase.from("reservas_turnera").update({
      google_sync_status: "error",
      google_sync_error: `${response.status}: ${body.slice(0, 500)}`,
    }).eq("id", r.id);
    return { ok: false, status: response.status, error: `gcal upsert failed ${response.status}` };
  }

  const data = await response.json();
  await supabase.from("reservas_turnera").update({
    google_event_id: data.id,
    google_sync_status: "synced",
    google_sync_error: null,
    google_synced_at: new Date().toISOString(),
  }).eq("id", r.id);

  return { ok: true, action: "upsert", event_id: data.id, htmlLink: data.htmlLink };
}

function todayAR(): string {
  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Reconciliación segura: sólo reservas activas de hoy en adelante que estén
 *  sin google_event_id o explícitamente en estado 'error'. No toca históricos
 *  ni reservas ya sincronizadas. */
async function reconcile(supabase: any, limit = 50) {
  const { data: rows, error } = await supabase
    .from("reservas_turnera")
    .select("id, google_event_id, google_sync_status")
    .gte("fecha", todayAR())
    .eq("estado_operativo", "reservada")
    .or("google_event_id.is.null,google_sync_status.eq.error")
    .order("fecha", { ascending: true })
    .limit(limit);

  if (error) return { error: error.message };

  const results: any[] = [];
  for (const row of (rows || []) as any[]) {
    const out = await syncOne(supabase, row.id, "upsert");
    results.push({ id: row.id, ...out });
  }
  return {
    mode: "reconcile",
    candidates: rows?.length ?? 0,
    repaired: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const { reservation_id, action, mode } = body ?? {};
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    if (mode === "reconcile") {
      const out = await reconcile(supabase, Number(body?.limit) || 50);
      return new Response(JSON.stringify(out), {
        status: (out as any).error ? 500 : 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!reservation_id) {
      return new Response(JSON.stringify({ error: "reservation_id requerido" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const out = await syncOne(supabase, reservation_id, action);
    if (!out.ok) {
      return new Response(JSON.stringify({ error: out.error }), {
        status: out.status ?? 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify(out), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("sync-turnera-google-calendar error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
