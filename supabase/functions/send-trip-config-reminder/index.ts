/**
 * Recordatorio para completar la configuración del viaje.
 *
 * Se ejecuta a diario (cron). Para cada reserva confirmada en eventos tipo
 * 'viaje' o 'camp', calcula el % completitud del checklist
 * (`reservation_checklist_data`) y, si es < 100 %, dispara el mail usando
 * `notify-reservation` (que encola + loguea + trackea idempotencia).
 *
 * Triggers automáticos (con ventana de catch-up, tolerante a caídas breves):
 *  - `48h`: entre 2 y 7 días después de reservar (y evento a más de 3 días)
 *  - `t30`: cuando el evento está a 27–30 días
 *
 * Trigger manual:
 *  - `catchup`: sólo si se invoca explícitamente con reservation_id
 *
 * Idempotencia:
 *   idempotency_key = `trip-config-<reservation_id>-<trigger>`
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const APP_URL = 'https://reybaud-app.com';

type Trigger = '48h' | 't30' | 'catchup';

/** Todos los step_key posibles (ver src/lib/tripSteps.ts). */
const ALL_TRIP_STEPS = [
  'bici', 'pedales', 'pasaje', 'seguro',
  'alimentacion', 'habitacion', 'arribo_partida',
  'noches_extras', 'transporte_bici',
  'salud_emergencia', 'peticiones',
];

function todayISO(): string {
  const d = new Date();
  const art = new Date(d.getTime() - 3 * 60 * 60 * 1000);
  return art.toISOString().slice(0, 10);
}
function daysBetween(fromISO: string, toISO: string): number {
  const [y1, m1, d1] = fromISO.split('-').map(Number);
  const [y2, m2, d2] = toISO.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}
function fmtDateAR(iso: string) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

/** POST con reintentos acotados: sólo errores de red y 429/5xx. */
async function postWithRetry(url: string, body: unknown, maxAttempts = 3): Promise<Response> {
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify(body),
      });
      if (res.ok || !RETRYABLE_STATUS.has(res.status) || attempt === maxAttempts) return res;
      console.warn(`[trip-config] retry ${attempt}/${maxAttempts} status=${res.status}`);
    } catch (err) {
      lastErr = err;
      if (attempt === maxAttempts) throw err;
      console.warn(`[trip-config] retry ${attempt}/${maxAttempts} network error: ${String(err)}`);
    }
    await sleep(400 * attempt);
  }
  throw lastErr ?? new Error('postWithRetry: unreachable');
}

interface Reservation {
  id: string;
  alumno_id: string;
  event_id: string;
  reservation_status: string;
  created_at: string;
}
interface EventLite { id: string; title: string; type: string | null; date: string | null; }
interface AlumnoLite { id: string; nombre: string; apellido: string | null; email: string; }

function buildContenido(params: {
  first_name: string;
  eventTitle: string;
  eventDate: string | null;
  pendingSteps: string[];
  reservationId: string;
  trigger: Trigger;
  daysToEvent: number | null;
}) {
  const { first_name, eventTitle, eventDate, pendingSteps, reservationId, trigger, daysToEvent } = params;
  const url = `${APP_URL}/mis-reservas?reservation=${reservationId}`;
  const stepsHtml = pendingSteps.map((s) => `<li style="margin-bottom:6px;color:#333;">${labelForStep(s)}</li>`).join('');
  const stepsText = pendingSteps.map((s) => `• ${labelForStep(s)}`).join('\n');

  let intro: string;
  let asunto: string;
  if (trigger === '48h') {
    intro = `¡Bienvenido al viaje! Reservaste hace unos días y todavía te faltan datos por completar para que podamos organizarlo todo bien.`;
    asunto = `Configurá tu viaje — ${eventTitle}`;
  } else if (trigger === 't30') {
    intro = `Faltan 30 días para tu viaje. Necesitamos que termines de cargar tus datos para poder cerrar la logística.`;
    asunto = `Faltan 30 días — completá tu configuración de ${eventTitle}`;
  } else {
    const dias = daysToEvent ?? null;
    intro = dias !== null && dias > 0
      ? `Faltan ${dias} ${dias === 1 ? 'día' : 'días'} para tu viaje y todavía tenemos datos pendientes tuyos para cerrar la logística.`
      : `Todavía tenemos datos pendientes tuyos para cerrar la logística de tu viaje.`;
    asunto = dias !== null && dias > 0
      ? `Faltan ${dias} ${dias === 1 ? 'día' : 'días'} — completá tu configuración de ${eventTitle}`
      : `Completá tu configuración de ${eventTitle}`;
  }

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:32px 20px;color:#121212;">
    <h1 style="font-size:22px;margin:0 0 6px;text-transform:uppercase;letter-spacing:1.5px;">${eventTitle}</h1>
    ${eventDate ? `<p style="font-size:13px;color:#888;margin:0 0 24px;">${fmtDateAR(eventDate)}</p>` : ''}
    <p style="font-size:15px;line-height:1.55;">¡Hola <strong>${first_name}</strong>!</p>
    <p style="font-size:15px;line-height:1.55;">${intro}</p>
    <p style="font-size:14px;color:#666;margin:20px 0 8px;font-weight:600;">Todavía te falta:</p>
    <ul style="padding-left:20px;margin:0 0 24px;font-size:14px;">${stepsHtml}</ul>
    <div style="text-align:center;margin:28px 0;">
      <a href="${url}" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#E8832A,#F0A05C);color:#fff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Completar mi viaje</a>
    </div>
    <p style="font-size:12px;color:#999;text-align:center;margin-top:28px;">Ciclismo Reybaud</p>
  </div>
</body></html>`;

  const texto = `¡Hola ${first_name}!\n\n${intro}\n\nTodavía te falta:\n${stepsText}\n\nCompletá tu viaje: ${url}\n\nCiclismo Reybaud`;
  return { asunto, html, texto };
}

function labelForStep(k: string): string {
  const map: Record<string, string> = {
    bici: 'Bicicleta y posición',
    pedales: 'Pedales y calas',
    pasaje: 'Pasaje o transporte',
    seguro: 'Seguro viajero',
    alimentacion: 'Alimentación',
    habitacion: 'Habitación',
    arribo_partida: 'Arribo y partida',
    noches_extras: 'Noches extras',
    transporte_bici: 'Transporte de la bici',
    salud_emergencia: 'Salud y contacto de emergencia',
    peticiones: 'Peticiones especiales',
  };
  return map[k] || k;
}

async function processReservation(
  supabase: any,
  reservation: Reservation,
  event: EventLite,
  alumno: AlumnoLite,
  trigger: Trigger,
  daysToEvent: number | null,
): Promise<{ sent: boolean; reason?: string }> {
  const idempotency_key = `trip-config-${reservation.id}-${trigger}`;

  // Chequeo de idempotencia
  const { data: existing } = await supabase
    .from('reservation_notifications')
    .select('id')
    .eq('idempotency_key', idempotency_key)
    .maybeSingle();
  if (existing) return { sent: false, reason: 'already_sent' };

  // Estado del checklist
  const { data: checklist } = await supabase
    .from('reservation_checklist_data')
    .select('step_key, completed')
    .eq('reservation_id', reservation.id);

  const completedSteps = new Set(
    ((checklist as any[]) || []).filter((r) => r.completed).map((r) => r.step_key),
  );
  const pendingSteps = ALL_TRIP_STEPS.filter((s) => !completedSteps.has(s));
  if (pendingSteps.length === 0) return { sent: false, reason: 'complete' };

  const first_name = (alumno.nombre || '').split(' ')[0] || 'ciclista';
  const { asunto, html, texto } = buildContenido({
    first_name,
    eventTitle: event.title,
    eventDate: event.date,
    pendingSteps,
    reservationId: reservation.id,
    trigger,
    daysToEvent,
  });

  let res: Response;
  try {
    res = await postWithRetry(`${SUPABASE_URL}/functions/v1/notify-reservation`, {
      reservation_id: reservation.id,
      alumno_id: reservation.alumno_id,
      tipo: 'novedad',
      asunto,
      contenido_html: html,
      contenido_texto: texto,
      idempotency_key,
      metadata: { trigger, pendingSteps, source: 'send-trip-config-reminder' },
    });
  } catch (err) {
    console.error(`[trip-config] notify-reservation network failure for ${reservation.id}: ${String(err)}`);
    return { sent: false, reason: 'notify_network_error' };
  }

  if (!res.ok) {
    const body = await res.text();
    console.error(`[trip-config] notify-reservation failed for ${reservation.id}: ${res.status} ${body}`);
    return { sent: false, reason: `notify_error_${res.status}` };
  }
  return { sent: true };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Modo manual
  let manualReservationId: string | null = null;
  let manualTrigger: Trigger | null = null;
  if (req.method === 'POST') {
    try {
      const body = await req.json();
      manualReservationId = body?.reservation_id || null;
      manualTrigger = body?.trigger || null;
    } catch { /* cron sin body */ }
  }

  // `catchup` sólo con invocación explícita para una reserva puntual.
  if (manualTrigger === 'catchup' && !manualReservationId) {
    return new Response(
      JSON.stringify({ error: 'trigger=catchup requiere reservation_id explícito' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const today = todayISO();
  const results: any[] = [];

  // Query base de reservas confirmadas en viajes/camps (schema actual)
  let query = supabase
    .from('event_reservations')
    .select(`
      id, alumno_id, event_id, reservation_status, created_at,
      alumnos!inner(id, nombre, apellido, email),
      events!inner(id, title, type, date)
    `)
    .eq('reservation_status', 'reserva_confirmada')
    .in('events.type', ['viaje', 'camp']);

  if (manualReservationId) query = query.eq('id', manualReservationId);

  const { data: reservations, error } = await query;
  if (error) {
    console.error('[trip-config] query error', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  for (const r of (reservations as any[]) || []) {
    const event: EventLite = r.events;
    const alumno: AlumnoLite = r.alumnos;
    if (!alumno?.email || !event?.date) continue;

    const daysToEvent = daysBetween(today, event.date);
    const daysSinceBooking = daysBetween(String(r.created_at).slice(0, 10), today);

    const triggers: Trigger[] = [];
    if (manualTrigger) {
      triggers.push(manualTrigger);
    } else {
      // Cron automático con ventanas de catch-up acotadas
      if (daysSinceBooking >= 2 && daysSinceBooking <= 7 && daysToEvent > 3) triggers.push('48h');
      if (daysToEvent >= 27 && daysToEvent <= 30) triggers.push('t30');
    }

    for (const t of triggers) {
      const out = await processReservation(supabase, r, event, alumno, t, daysToEvent);
      results.push({ reservation_id: r.id, trigger: t, ...out });
    }
  }

  return new Response(
    JSON.stringify({ processed: results.length, results }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
