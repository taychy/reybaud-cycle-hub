// Sends turnera reservation emails: confirmación / recordatorio / cancelación.
// Reads service config (politica_cancelacion, ics_adjunto, email_*_enabled) from servicios_turnera.
// Logs every send to reservation_notifications (reusing the table; reservation_id stores reservas_turnera.id).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SENDER_DOMAIN = "notify.reybaud-app.com";
const FROM_NAME = "Reybaud Ciclismo";
const APP_DOMAIN = "https://reybaud-app.com";

type Tipo =
  | "confirmacion"
  | "recordatorio"
  | "cancelacion"
  | "coach_aviso"
  | "coach_recordatorio"
  | "reprogramacion"
  | "coach_reprogramacion"
  | "coach_reprogramacion_removida"
  | "transferencia_instrucciones"
  | "transferencia_recordatorio_15min"
  | "transferencia_expirada"
  | "transferencia_aprobada"
  | "transferencia_rechazada"
  | "transferencia_comprobante_recibido"
  | "admin_nuevo_comprobante";

const normalizeEmail = (e: string) => e.trim().toLowerCase();

const getOrCreateUnsubscribeToken = async (supabase: any, email: string) => {
  const n = normalizeEmail(email);
  const { data: exist } = await supabase.from("email_unsubscribe_tokens").select("token").eq("email", n).maybeSingle();
  if (exist?.token) return exist.token;
  const token = crypto.randomUUID();
  const { data: ins } = await supabase.from("email_unsubscribe_tokens").insert({ email: n, token }).select("token").single();
  if (ins?.token) return ins.token;
  const { data: fb } = await supabase.from("email_unsubscribe_tokens").select("token").eq("email", n).maybeSingle();
  return fb?.token || token;
};

const escapeHtml = (s: string) =>
  String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const fmtDateAR = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
};

const fmtHora = (t: string) => t.substring(0, 5);

// Devuelve "mañana", "hoy" o "el <fecha>" respecto de la fecha actual en zona AR (UTC-3).
const whenLabelAR = (isoFecha: string): string => {
  const [y, m, d] = isoFecha.split("-").map(Number);
  // "Hoy" en AR: fecha actual UTC desplazada -3h
  const now = new Date(Date.now() - 3 * 3600 * 1000);
  const hoy = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const target = new Date(Date.UTC(y, m - 1, d));
  const diff = Math.round((target.getTime() - hoy.getTime()) / 86400000);
  if (diff === 0) return "hoy";
  if (diff === 1) return "mañana";
  return `el ${fmtDateAR(isoFecha)}`;
};

// Link de Google Maps por sede — matching por nombre.
const sedeMapsLink = (sedeNombre: string): string | null => {
  const n = (sedeNombre || "").toLowerCase();
  if (n.includes("kdt")) return "https://maps.app.goo.gl/MixfSzuLDWhskfhx9";
  if (n.includes("sarmiento")) return "https://maps.app.goo.gl/ik45eU5bt2yyDJhN9";
  return null;
};

// Normaliza teléfono AR a formato wa.me (549 + área + número, solo dígitos).
const normalizePhoneWA = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  let d = String(raw).replace(/\D/g, "");
  if (d.length < 8) return null;
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("549")) d = d.slice(3);
  else if (d.startsWith("54")) d = d.slice(2);
  while (d.startsWith("0")) d = d.slice(1);
  if (d.length > 10) {
    for (const areaLen of [2, 3, 4]) {
      if (d.length - areaLen >= 8 && d.substring(areaLen, areaLen + 2) === "15") {
        const c = d.substring(0, areaLen) + d.substring(areaLen + 2);
        if (c.length === 10) { d = c; break; }
      }
    }
  }
  if (d.length < 10 || d.length > 11) return null;
  d = d.slice(-10);
  return "549" + d;
};

// Construye el mensaje precargado que el coach enviará al alumno por WhatsApp.
const buildCoachWaMessage = (opts: {
  alumnoNombre: string;
  coachNombre: string;
  fecha: string;       // YYYY-MM-DD
  hora: string;        // HH:MM
  sedeNombre: string;
  mapsLink: string | null;
}): string => {
  const cuando = whenLabelAR(opts.fecha);
  const sede = opts.sedeNombre || "la sede";
  const maps = opts.mapsLink ? `\n\nUbicación de ${sede}: ${opts.mapsLink}` : "";
  return (
`Hola ${opts.alumnoNombre}, soy ${opts.coachNombre} tu profe de Ciclismo. ¡Un gusto!

Te escribo para recordarte que ${cuando} tenés clase a las ${opts.hora} en ${sede}.

También quiero recordarte los elementos que vas a necesitar: casco, lentes, zapas, bici con ruedas infladas y cadena lubricada.

En la entrada de ${sede} te cobran para usar las instalaciones del parque, llevate efectivo.${maps}

Te espero en la entrada de la pista, está después del estacionamiento. Vas a ver a los ciclistas yendo hacia esa puerta.

Cualquier duda estoy a tu disposición.

¡Muchas gracias!
${opts.coachNombre}`
  );
};

const googleCalLink = (title: string, fecha: string, hi: string, hf: string, desc: string, loc: string) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  const [y, m, d] = fecha.split("-").map(Number);
  const [h1, m1] = hi.split(":").map(Number);
  const [h2, m2] = hf.split(":").map(Number);
  // AR = UTC-3 → UTC = local+3
  const start = `${y}${pad(m)}${pad(d)}T${pad(h1 + 3)}${pad(m1)}00Z`;
  const end = `${y}${pad(m)}${pad(d)}T${pad(h2 + 3)}${pad(m2)}00Z`;
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${start}/${end}`,
    details: desc,
    location: loc,
  });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
};

const renderEmail = (opts: {
  tipo: Tipo;
  servicioNombre: string;
  nombre: string;
  fechaTxt: string;
  horaTxt: string;
  modalidad: string;
  politica: string;
  icsUrl: string | null;
  gcalUrl: string;
}) => {
  const { tipo, servicioNombre, nombre, fechaTxt, horaTxt, modalidad, politica, icsUrl, gcalUrl } = opts;
  const titulos: Record<Tipo, string> = {
    confirmacion: "✅ Tu reserva está confirmada",
    recordatorio: "⏰ Recordatorio de tu reserva",
    cancelacion: "❌ Tu reserva fue cancelada",
    coach_aviso: "📌 Nueva clase agendada en tu calendario",
    coach_recordatorio: "⏰ Recordatorio: tenés una clase próxima",
  } as Record<string, string>;
  const intros: Record<Tipo, string> = {
    confirmacion: "Recibimos tu reserva. Acá tenés los detalles:",
    recordatorio: "Te recordamos que tenés una reserva próxima:",
    cancelacion: "Te avisamos que tu reserva fue cancelada. Si fue un error, escribinos.",
    coach_aviso: "Un alumno reservó una clase con vos. Te dejamos los datos para que la sumes a tu calendario:",
    coach_recordatorio: "Te recordamos la clase que tenés agendada. Podés avisarle al alumno desde el botón de WhatsApp:",
  } as Record<string, string>;
  const calBtn = tipo !== "cancelacion"
    ? `<div style="margin:20px 0;">
        <a href="${gcalUrl}" style="background:#0f1115;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:13px;font-weight:600;">📅 Agregar a Google Calendar</a>
      </div>`
    : "";
  const polBlock = politica && tipo !== "cancelacion"
    ? `<div style="border-top:1px solid #eee;margin-top:24px;padding-top:16px;">
         <h3 style="font-size:13px;text-transform:uppercase;letter-spacing:1px;color:#0f1115;margin:0 0 8px;">Política de cancelación</h3>
         <div style="font-size:13px;color:#555;line-height:1.55;white-space:pre-line;">${escapeHtml(politica)}</div>
       </div>`
    : "";

  return `<!doctype html><html><body style="margin:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:32px 24px;">
    <div style="text-align:center;margin-bottom:24px;">
      <span style="font-size:11px;letter-spacing:3px;color:#888;text-transform:uppercase;">Reybaud Ciclismo</span>
    </div>
    <h1 style="font-size:22px;color:#0f1115;margin:0 0 12px;">${titulos[tipo]}</h1>
    <p style="font-size:15px;color:#333;margin:0 0 20px;">Hola ${escapeHtml(nombre)}, ${intros[tipo]}</p>
    <div style="background:#fafafa;border:1px solid #eee;border-radius:12px;padding:18px;">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#888;margin-bottom:6px;">Servicio</div>
      <div style="font-size:16px;color:#0f1115;font-weight:600;margin-bottom:14px;">${escapeHtml(servicioNombre)}</div>
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#888;margin-bottom:6px;">Fecha y hora</div>
      <div style="font-size:15px;color:#0f1115;margin-bottom:14px;">${escapeHtml(fechaTxt)} · ${escapeHtml(horaTxt)} hs</div>
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#888;margin-bottom:6px;">Modalidad</div>
      <div style="font-size:14px;color:#0f1115;">${escapeHtml(modalidad)}</div>
    </div>
    ${calBtn}
    ${polBlock}
    <p style="font-size:12px;color:#999;margin-top:32px;text-align:center;">Reybaud Ciclismo · <a href="${APP_DOMAIN}" style="color:#999;">reybaud-app.com</a></p>
  </div></body></html>`;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const { reservation_id, tipo } = body as { reservation_id: string; tipo: Tipo };
    if (!reservation_id || !tipo) {
      return new Response(JSON.stringify({ error: "Missing reservation_id or tipo" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: r, error: errR } = await supabase
      .from("reservas_turnera")
      .select("id, servicio_id, coach_id, alumno_id, fecha, hora_inicio, hora_fin, nombre, apellido, email, celular, documento, nota, sede_id, pago_monto, moneda_snapshot, upload_token, hold_expira_at, form_responses")
      .eq("id", reservation_id)
      .maybeSingle();
    if (errR || !r) return new Response(JSON.stringify({ error: "reservation_not_found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: s } = await supabase
      .from("servicios_turnera")
      .select("nombre, descripcion, modalidad, politica_cancelacion, email_confirmacion_enabled, email_recordatorio_enabled, email_coach_enabled, email_coach_recordatorio_enabled, ics_adjunto, form_fields, sedes:sede_id(nombre)")
      .eq("id", r.servicio_id)
      .maybeSingle();

    // ─── REPROGRAMACIÓN — handler separado con datos antes/ahora ───
    if (tipo === "reprogramacion" || tipo === "coach_reprogramacion" || tipo === "coach_reprogramacion_removida") {
      return await handleReprogramacionEmail(supabase, tipo, r, s, body);
    }

    const TRANSFER_TIPOS = new Set([
      "transferencia_instrucciones",
      "transferencia_recordatorio_15min",
      "transferencia_expirada",
      "transferencia_aprobada",
      "transferencia_rechazada",
      "transferencia_comprobante_recibido",
      "admin_nuevo_comprobante",
    ]);
    if (TRANSFER_TIPOS.has(tipo)) {
      return await handleTransferenciaEmail(supabase, tipo, r, s, body);
    }

    // Respect per-service toggles
    if (tipo === "confirmacion" && s && s.email_confirmacion_enabled === false) {
      return new Response(JSON.stringify({ skipped: true, reason: "email_confirmacion_disabled" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (tipo === "recordatorio" && s && s.email_recordatorio_enabled === false) {
      return new Response(JSON.stringify({ skipped: true, reason: "email_recordatorio_disabled" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (tipo === "coach_recordatorio" && s && (s as any).email_coach_recordatorio_enabled === false) {
      return new Response(JSON.stringify({ skipped: true, reason: "email_coach_recordatorio_disabled" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (tipo === "coach_aviso" && s && s.email_coach_enabled === false) {
      return new Response(JSON.stringify({ skipped: true, reason: "email_coach_disabled" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Resolve recipient
    let recipientEmail = r.email as string;
    let recipientName = r.nombre as string;
    if (tipo === "coach_aviso" || tipo === "coach_recordatorio") {
      const { data: coach } = await supabase.from("coaches").select("email, nombre").eq("id", r.coach_id).maybeSingle();
      if (!coach?.email) {
        return new Response(JSON.stringify({ skipped: true, reason: "coach_no_email" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      recipientEmail = coach.email;
      recipientName = coach.nombre || "coach";
    }
    if (!recipientEmail) return new Response(JSON.stringify({ error: "no_email" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const servicioNombre = s?.nombre || "Reserva";
    const modalidad = s?.modalidad === "virtual" ? "Online" : s?.modalidad === "hibrida" ? "Híbrida" : "Presencial — Reybaud Ciclismo";
    const fechaTxt = fmtDateAR(r.fecha as string);
    const horaTxt = `${fmtHora(r.hora_inicio as string)} – ${fmtHora(r.hora_fin as string)}`;
    const icsUrl = s?.ics_adjunto !== false
      ? `${SUPABASE_URL}/functions/v1/turnera-ics?id=${r.id}`
      : null;
    let sedeNombre = (s as any)?.sedes?.nombre || "";
    if ((r as any).sede_id) {
      const { data: sedeRow } = await supabase.from("sedes").select("nombre").eq("id", (r as any).sede_id).maybeSingle();
      if (sedeRow?.nombre) sedeNombre = sedeRow.nombre;
    }
    const esCoach = tipo === "coach_aviso" || tipo === "coach_recordatorio";

    // Respuestas del formulario del servicio (sólo para el coach / calendario)
    const camposServicio: Array<{ key: string; label: string }> =
      Array.isArray((s as any)?.form_fields) ? (s as any).form_fields : [];
    const respuestas = ((r as any).form_responses || {}) as Record<string, unknown>;
    const respuestasList = camposServicio
      .map((f) => ({ label: f.label || f.key, value: String(respuestas?.[f.key] ?? "").trim() }))
      .filter((x) => x.value);

    const gcalTitle = esCoach
      ? `${servicioNombre} · ${r.nombre} ${r.apellido || ""}`.trim()
      : servicioNombre;
    const gcalDesc = esCoach
      ? [
          `Alumno: ${r.nombre} ${r.apellido || ""}`.trim(),
          r.email ? `Email: ${r.email}` : "",
          r.celular ? `Celular: ${r.celular}` : "",
          r.documento ? `DNI: ${r.documento}` : "",
          r.nota ? `Nota: ${r.nota}` : "",
          ...respuestasList.map((x) => `${x.label}: ${x.value}`),
        ].filter(Boolean).join("\n")
      : (s?.descripcion || "");

    const gcal = googleCalLink(
      gcalTitle,
      r.fecha as string,
      r.hora_inicio as string,
      r.hora_fin as string,
      gcalDesc,
      sedeNombre || modalidad,
    );

    let html = renderEmail({
      tipo,
      servicioNombre,
      nombre: recipientName,
      fechaTxt,
      horaTxt,
      modalidad,
      politica: esCoach ? "" : (s?.politica_cancelacion || ""),
      icsUrl,
      gcalUrl: gcal,
    });

    // For coach: append alumno contact block + botón WhatsApp con mensaje precargado
    if (esCoach) {
      const alumnoNombreFull = `${r.nombre} ${r.apellido || ""}`.trim();
      const alumnoFirstName = (r.nombre || "").split(" ")[0] || alumnoNombreFull;
      const waPhone = normalizePhoneWA(r.celular as string);
      const mapsLink = sedeMapsLink(sedeNombre);
      const waMsg = buildCoachWaMessage({
        alumnoNombre: alumnoFirstName,
        coachNombre: (recipientName || "").split(" ")[0] || recipientName || "tu profe",
        fecha: r.fecha as string,
        hora: fmtHora(r.hora_inicio as string),
        sedeNombre,
        mapsLink,
      });
      const waUrl = waPhone
        ? `https://wa.me/${waPhone}?text=${encodeURIComponent(waMsg)}`
        : null;

      const waBlock = waUrl
        ? `<div style="margin:20px 0;text-align:center;">
             <a href="${waUrl}" style="background:#25D366;color:#fff;text-decoration:none;padding:14px 22px;border-radius:10px;font-size:15px;font-weight:700;display:inline-block;">💬 Enviar confirmación por WhatsApp al alumno</a>
             <div style="font-size:12px;color:#888;margin-top:8px;">El mensaje se abre precargado — solo tenés que apretar enviar.</div>
           </div>`
        : `<div style="margin:20px 0;padding:12px;background:#fff8e1;border:1px solid #f0c69a;border-radius:8px;font-size:13px;color:#5a3d00;">⚠️ El alumno no dejó un celular válido, por lo que no podemos armar el botón de WhatsApp.</div>`;

      const contactBlock = `<div style="background:#fff5ec;border:1px solid #f0c69a;border-radius:12px;padding:16px;margin-top:16px;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#888;margin-bottom:8px;">Datos del alumno</div>
        <div style="font-size:14px;color:#0f1115;line-height:1.6;">
          <strong>${escapeHtml(alumnoNombreFull)}</strong><br/>
          ${r.email ? `📧 ${escapeHtml(r.email)}<br/>` : ""}
          ${r.celular ? `📱 ${escapeHtml(r.celular)}<br/>` : ""}
          ${r.documento ? `🪪 DNI ${escapeHtml(r.documento)}<br/>` : ""}
          ${sedeNombre ? `📍 Sede ${escapeHtml(sedeNombre)}<br/>` : ""}
          ${r.nota ? `<br/><em>${escapeHtml(r.nota)}</em>` : ""}
        </div>
      </div>
      ${respuestasList.length > 0 ? `<div style="background:#f6f7f9;border:1px solid #e2e5ea;border-radius:12px;padding:16px;margin-top:12px;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#888;margin-bottom:8px;">Respuestas del alumno</div>
        <div style="font-size:14px;color:#0f1115;line-height:1.6;">
          ${respuestasList.map((x) => `<div style="margin-bottom:8px;"><strong>${escapeHtml(x.label)}</strong><br/>${escapeHtml(x.value)}</div>`).join("")}
        </div>
      </div>` : ""}
      ${waBlock}`;
      html = html.replace("</div></body></html>", `${contactBlock}</div></body></html>`);

    }


    const subjects: Record<string, string> = {
      confirmacion: `Reserva confirmada · ${servicioNombre} · ${fechaTxt}`,
      recordatorio: `Recordatorio · ${servicioNombre} · ${fechaTxt}`,
      cancelacion: `Reserva cancelada · ${servicioNombre} · ${fechaTxt}`,
      coach_recordatorio: `Recordatorio de clase · ${fechaTxt} ${fmtHora(r.hora_inicio as string)} · ${r.nombre}`,
      coach_aviso: `Nueva clase agendada · ${fechaTxt} ${fmtHora(r.hora_inicio as string)} · ${r.nombre}`,
    };

    const messageId = crypto.randomUUID();
    const unsubscribeToken = await getOrCreateUnsubscribeToken(supabase, recipientEmail);
    const idempotencyKey = `turnera-${tipo}-${r.id}`;

    const { error: qErr } = await supabase.rpc("enqueue_email", {
      queue_name: "transactional_emails",
      payload: {
        message_id: messageId,
        to: recipientEmail,
        from: `${FROM_NAME} <notificaciones@${SENDER_DOMAIN}>`,
        sender_domain: SENDER_DOMAIN,
        subject: subjects[tipo],
        html,
        text: `${subjects[tipo]}\n\n${fechaTxt} ${horaTxt}\n\nVer detalles: ${APP_DOMAIN}`,
        purpose: "transactional",
        label: `turnera_${tipo}`,
        idempotency_key: idempotencyKey,
        unsubscribe_token: unsubscribeToken,
        queued_at: new Date().toISOString(),
      },
    });

    if (qErr) {
      return new Response(JSON.stringify({ error: "queue_failed", detail: qErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Copia al admin para confirmacion / coach_aviso
    if (tipo === "confirmacion" || tipo === "coach_aviso") {
      try {
        const { data: cfg } = await supabase
          .from("app_config")
          .select("value")
          .eq("key", "admin_notification_email")
          .maybeSingle();
        const rawAdmin = (cfg?.value as any) ?? "";
        const adminEmailStr = typeof rawAdmin === "string" ? rawAdmin : String(rawAdmin || "");
        const adminEmails = adminEmailStr
          .split(/[,;]/)
          .map((e: string) => e.trim())
          .filter((e: string) => e && e.includes("@"));
        if (adminEmails.length === 0) adminEmails.push("natalia@ciclismoreybaud.com");

        // Nombre del coach (para mostrar en la copia admin de coach_aviso)
        let coachNombre = "";
        if (tipo === "coach_aviso" && r.coach_id) {
          const { data: coachRow } = await supabase.from("coaches").select("nombre").eq("id", r.coach_id).maybeSingle();
          coachNombre = coachRow?.nombre || "";
        }

        for (const adm of adminEmails) {
          if (normalizeEmail(adm) === normalizeEmail(recipientEmail)) continue;
          const admMsgId = crypto.randomUUID();
          const admToken = await getOrCreateUnsubscribeToken(supabase, adm);
          const adminSubject = tipo === "coach_aviso"
            ? `[Admin] Nueva reserva · ${servicioNombre} · ${fechaTxt} ${fmtHora(r.hora_inicio as string)} · ${r.nombre} ${r.apellido || ""}`.trim()
            : `[Admin] Reserva confirmada · ${servicioNombre} · ${fechaTxt} · ${r.nombre} ${r.apellido || ""}`.trim();

          // Render exclusivo para admin (no reutiliza el saludo del destinatario)
          const adminTitle = tipo === "coach_aviso"
            ? "📬 Nueva reserva de turnera"
            : "📬 Reserva confirmada";
          const adminIntro = tipo === "coach_aviso"
            ? `Se agendó una nueva clase${coachNombre ? ` con <strong>${escapeHtml(coachNombre)}</strong>` : ""}. Detalle:`
            : `Se confirmó una reserva. Detalle:`;
          const alumnoBlock = `<div style="background:#fff5ec;border:1px solid #f0c69a;border-radius:12px;padding:16px;margin-top:16px;">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#888;margin-bottom:8px;">Alumno</div>
            <div style="font-size:14px;color:#0f1115;line-height:1.6;">
              <strong>${escapeHtml(`${r.nombre} ${r.apellido || ""}`.trim())}</strong><br/>
              ${r.email ? `📧 ${escapeHtml(r.email)}<br/>` : ""}
              ${r.celular ? `📱 ${escapeHtml(r.celular)}<br/>` : ""}
              ${r.documento ? `🪪 DNI ${escapeHtml(r.documento)}<br/>` : ""}
              ${sedeNombre ? `📍 Sede ${escapeHtml(sedeNombre)}<br/>` : ""}
              ${coachNombre ? `👤 Coach ${escapeHtml(coachNombre)}<br/>` : ""}
              ${r.nota ? `<br/><em>${escapeHtml(r.nota)}</em>` : ""}
            </div>
          </div>`;
          const adminHtml = `<!doctype html><html><body style="margin:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
            <div style="max-width:600px;margin:0 auto;padding:32px 24px;">
              <div style="text-align:center;margin-bottom:24px;">
                <span style="font-size:11px;letter-spacing:3px;color:#888;text-transform:uppercase;">Reybaud Ciclismo · Interno</span>
              </div>
              <div style="background:#fff8e1;border:1px solid #f0c69a;color:#5a3d00;padding:10px 14px;border-radius:8px;margin:0 0 16px;font-size:13px;">📬 Copia interna — no responder</div>
              <h1 style="font-size:22px;color:#0f1115;margin:0 0 12px;">${adminTitle}</h1>
              <p style="font-size:15px;color:#333;margin:0 0 20px;">${adminIntro}</p>
              <div style="background:#fafafa;border:1px solid #eee;border-radius:12px;padding:18px;">
                <div style="font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#888;margin-bottom:6px;">Servicio</div>
                <div style="font-size:16px;color:#0f1115;font-weight:600;margin-bottom:14px;">${escapeHtml(servicioNombre)}</div>
                <div style="font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#888;margin-bottom:6px;">Fecha y hora</div>
                <div style="font-size:15px;color:#0f1115;margin-bottom:14px;">${escapeHtml(fechaTxt)} · ${escapeHtml(horaTxt)} hs</div>
                <div style="font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#888;margin-bottom:6px;">Modalidad</div>
                <div style="font-size:14px;color:#0f1115;">${escapeHtml(modalidad)}</div>
              </div>
              ${alumnoBlock}
              <p style="font-size:12px;color:#999;margin-top:32px;text-align:center;">Reybaud Ciclismo · <a href="${APP_DOMAIN}" style="color:#999;">reybaud-app.com</a></p>
            </div></body></html>`;

          await supabase.rpc("enqueue_email", {
            queue_name: "transactional_emails",
            payload: {
              message_id: admMsgId,
              to: adm,
              from: `${FROM_NAME} <notificaciones@${SENDER_DOMAIN}>`,
              sender_domain: SENDER_DOMAIN,
              subject: adminSubject,
              html: adminHtml,
              text: `${adminSubject}\n\n${fechaTxt} ${horaTxt}`,
              purpose: "transactional",
              label: `turnera_${tipo}_admin`,
              idempotency_key: `turnera-${tipo}-admin-${r.id}-${adm}`,
              unsubscribe_token: admToken,
              queued_at: new Date().toISOString(),
            },
          });
        }
      } catch (e) {
        console.error("[send-turnera-email] admin copy error:", (e as Error).message);
      }
    }

    // Mark reminder as sent so cron doesn't re-send
    if (tipo === "recordatorio") {
      await supabase.from("reservas_turnera").update({ recordatorio_enviado_at: new Date().toISOString() } as any).eq("id", r.id);
    }
    if (tipo === "coach_recordatorio") {
      await supabase.from("reservas_turnera").update({ coach_recordatorio_enviado_at: new Date().toISOString() } as any).eq("id", r.id);
    }
    // Trazabilidad para el admin (no condiciona reenvíos)
    if (tipo === "confirmacion") {
      await supabase.from("reservas_turnera").update({ confirmacion_enviado_at: new Date().toISOString() } as any).eq("id", r.id);
    }
    if (tipo === "coach_aviso") {
      await supabase.from("reservas_turnera").update({ coach_aviso_enviado_at: new Date().toISOString() } as any).eq("id", r.id);
    }


    return new Response(JSON.stringify({ success: true, tipo, recipient: recipientEmail }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

// ─── Transferencia email helper ───────────────────────────────────────
const fmtMoney = (amount: number, currency: string) => {
  const symbol = currency === "USD" ? "US$" : currency === "EUR" ? "€" : "$";
  return `${symbol}${Number(amount || 0).toLocaleString("es-AR")}`;
};

const fmtHoraCorta = (t: string | null | undefined) => (t || "").substring(0, 5);

async function handleTransferenciaEmail(
  supabase: any,
  tipo: Tipo,
  r: any,
  s: any,
  extra: any,
) {
  // Cargar datos bancarios desde app_config
  const { data: cfg } = await supabase
    .from("app_config")
    .select("key, value")
    .in("key", ["turnera_cbu", "turnera_alias", "turnera_titular", "turnera_cuit", "admin_notification_email"]);
  const cfgMap: Record<string, string> = {};
  for (const row of (cfg || [])) {
    const v = row.value;
    cfgMap[row.key] = typeof v === "string" ? v : (v ?? "");
  }
  const cbu = cfgMap.turnera_cbu || "";
  const alias = cfgMap.turnera_alias || "";
  const titular = cfgMap.turnera_titular || "";
  const cuit = cfgMap.turnera_cuit || "";

  const servicioNombre = s?.nombre || "Reserva";
  const fechaTxt = fmtDateAR(r.fecha);
  const horaTxt = `${fmtHoraCorta(r.hora_inicio)} – ${fmtHoraCorta(r.hora_fin)}`;
  const monto = Number(r.pago_monto || 0);
  const currency = String(r.moneda_snapshot || "ARS").toUpperCase();
  const montoTxt = fmtMoney(monto, currency);
  const concepto = `RESERVA-${String(r.id).slice(0, 8).toUpperCase()}`;
  const uploadUrl = `${APP_DOMAIN}/reservar/${r.id}/transferencia?token=${r.upload_token || ""}`;
  const holdMin = r.hold_expira_at
    ? Math.max(0, Math.round((new Date(r.hold_expira_at).getTime() - Date.now()) / 60000))
    : 120;

  // Determinar destinatario y contenido
  let recipient = r.email as string;
  let recipientName = r.nombre as string;
  let subject = "";
  let title = "";
  let intro = "";
  let bodyHtml = "";
  let cta: { label: string; url: string } | null = null;
  let label = `turnera_${tipo}`;
  let idempotencyKey = `turnera-${tipo}-${r.id}`;

  const datosBancarios = `
    <div style="background:#fafafa;border:1px solid #eee;border-radius:12px;padding:18px;margin:18px 0;">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#888;margin-bottom:8px;">Datos para transferir</div>
      <div style="font-size:14px;color:#0f1115;line-height:1.7;">
        <strong>Titular:</strong> ${escapeHtml(titular || "—")}<br/>
        <strong>CUIT:</strong> ${escapeHtml(cuit || "—")}<br/>
        <strong>CBU:</strong> ${escapeHtml(cbu || "—")}<br/>
        <strong>Alias:</strong> ${escapeHtml(alias || "—")}<br/>
        <strong>Monto:</strong> ${escapeHtml(montoTxt)} ${escapeHtml(currency)}<br/>
        <strong>Concepto:</strong> ${escapeHtml(concepto)}
      </div>
    </div>`;

  const detalleReserva = `
    <div style="background:#fff;border:1px solid #eee;border-radius:12px;padding:16px;margin:16px 0;">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#888;margin-bottom:6px;">Servicio</div>
      <div style="font-size:15px;color:#0f1115;font-weight:600;margin-bottom:10px;">${escapeHtml(servicioNombre)}</div>
      <div style="font-size:13px;color:#555;">${escapeHtml(fechaTxt)} · ${escapeHtml(horaTxt)} hs</div>
    </div>`;

  switch (tipo) {
    case "transferencia_instrucciones":
      subject = `Transferencia pendiente · ${servicioNombre} · ${fechaTxt}`;
      title = "💸 Completá tu reserva con la transferencia";
      intro = `Recibimos tu reserva. Tenés <strong>${holdMin} minutos</strong> para hacer la transferencia y subir el comprobante. Si no lo hacés a tiempo, el turno vuelve a estar disponible para otros alumnos.`;
      bodyHtml = detalleReserva + datosBancarios + `
        <p style="font-size:14px;color:#333;">Después de hacer la transferencia, tocá el botón para subir el comprobante:</p>`;
      cta = { label: "Subir comprobante", url: uploadUrl };
      break;
    case "transferencia_recordatorio_15min":
      subject = `⏰ Te quedan 15 min · ${servicioNombre}`;
      title = "⏰ Quedan 15 minutos";
      intro = `Si no subís el comprobante en los próximos <strong>15 minutos</strong>, el turno se libera automáticamente.`;
      bodyHtml = detalleReserva + datosBancarios;
      cta = { label: "Subir comprobante ahora", url: uploadUrl };
      break;
    case "transferencia_expirada":
      subject = `Reserva liberada · ${servicioNombre}`;
      title = "El turno se liberó";
      intro = `No recibimos el comprobante a tiempo y liberamos el turno. Podés reservar nuevamente cuando quieras.`;
      bodyHtml = detalleReserva;
      cta = { label: "Volver a reservar", url: `${APP_DOMAIN}` };
      break;
    case "transferencia_aprobada":
      subject = `✅ Reserva confirmada · ${servicioNombre} · ${fechaTxt}`;
      title = "✅ Tu reserva está confirmada";
      intro = `Aprobamos el pago por transferencia. ¡Nos vemos!`;
      bodyHtml = detalleReserva;
      break;
    case "transferencia_rechazada":
      subject = `Comprobante no aprobado · ${servicioNombre}`;
      title = "No pudimos aprobar el comprobante";
      intro = extra?.motivo
        ? `Motivo: <em>${escapeHtml(extra.motivo)}</em>. Si fue un error, escribinos y lo revisamos.`
        : `Si creés que fue un error, escribinos y lo revisamos.`;
      bodyHtml = detalleReserva;
      cta = { label: "Volver a reservar", url: `${APP_DOMAIN}` };
      break;
    case "transferencia_comprobante_recibido":
      subject = `Recibimos tu comprobante · ${servicioNombre}`;
      title = "📩 Recibimos tu comprobante";
      intro = `Gracias por enviar el comprobante de transferencia. Nuestro equipo lo está revisando y te vamos a avisar por email en cuanto lo validemos. Mientras tanto, tu turno queda <strong>reservado</strong>.`;
      bodyHtml = detalleReserva;
      break;
    case "admin_nuevo_comprobante": {
      recipient = cfgMap.admin_notification_email || "natalia@ciclismoreybaud.com";
      recipientName = "equipo Reybaud";
      subject = `📋 Nuevo comprobante para validar · ${servicioNombre}`;
      title = "📋 Nuevo comprobante de transferencia";
      intro = `Un alumno subió un comprobante y espera validación:`;
      bodyHtml = `
        <div style="background:#fff;border:1px solid #eee;border-radius:12px;padding:16px;margin:16px 0;">
          <div style="font-size:14px;color:#0f1115;line-height:1.7;">
            <strong>Alumno:</strong> ${escapeHtml(`${r.nombre} ${r.apellido || ""}`.trim())}<br/>
            ${r.email ? `<strong>Email:</strong> ${escapeHtml(r.email)}<br/>` : ""}
            ${r.celular ? `<strong>Celular:</strong> ${escapeHtml(r.celular)}<br/>` : ""}
            <strong>Servicio:</strong> ${escapeHtml(servicioNombre)}<br/>
            <strong>Fecha:</strong> ${escapeHtml(fechaTxt)} · ${escapeHtml(horaTxt)}<br/>
            <strong>Monto:</strong> ${escapeHtml(montoTxt)} ${escapeHtml(currency)}
          </div>
        </div>`;
      cta = { label: "Abrir panel de validación", url: `${APP_DOMAIN}/admin/turnera?tab=transferencias` };
      idempotencyKey = `turnera-admin-comprobante-${r.id}-${Date.now()}`;
      break;
    }
  }

  if (!recipient) {
    return new Response(JSON.stringify({ skipped: true, reason: "no_recipient" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const ctaHtml = cta ? `<div style="margin:20px 0;">
    <a href="${cta.url}" style="background:#ea6a1a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:14px;font-weight:600;display:inline-block;">${cta.label}</a>
  </div>` : "";

  const html = `<!doctype html><html><body style="margin:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
    <div style="max-width:600px;margin:0 auto;padding:32px 24px;">
      <div style="text-align:center;margin-bottom:24px;">
        <span style="font-size:11px;letter-spacing:3px;color:#888;text-transform:uppercase;">Reybaud Ciclismo</span>
      </div>
      <h1 style="font-size:22px;color:#0f1115;margin:0 0 12px;">${title}</h1>
      <p style="font-size:15px;color:#333;margin:0 0 16px;line-height:1.55;">Hola ${escapeHtml(recipientName)}, ${intro}</p>
      ${bodyHtml}
      ${ctaHtml}
      <p style="font-size:12px;color:#999;margin-top:32px;text-align:center;">Reybaud Ciclismo · <a href="${APP_DOMAIN}" style="color:#999;">reybaud-app.com</a></p>
    </div></body></html>`;

  const messageId = crypto.randomUUID();
  const unsubscribeToken = await getOrCreateUnsubscribeToken(supabase, recipient);

  const { error: qErr } = await supabase.rpc("enqueue_email", {
    queue_name: "transactional_emails",
    payload: {
      message_id: messageId,
      to: recipient,
      from: `${FROM_NAME} <notificaciones@${SENDER_DOMAIN}>`,
      sender_domain: SENDER_DOMAIN,
      subject,
      html,
      text: `${subject}\n\n${fechaTxt} ${horaTxt}\n\n${APP_DOMAIN}`,
      purpose: "transactional",
      label,
      idempotency_key: idempotencyKey,
      unsubscribe_token: unsubscribeToken,
      queued_at: new Date().toISOString(),
    },
  });

  if (qErr) {
    return new Response(JSON.stringify({ error: "queue_failed", detail: qErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  return new Response(JSON.stringify({ success: true, tipo, recipient }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─── Reprogramación de reserva ────────────────────────────────────────
// Recibe en el body: { reservation_id, tipo, before: {coach_id, fecha, hora_inicio, hora_fin, sede_id},
//                      motivo, coach_id_target? }
// `before` viene del RPC admin_update_turnera_reservation; la reserva ya está actualizada en DB.
async function handleReprogramacionEmail(
  supabase: any,
  tipo: Tipo,
  r: any,
  s: any,
  extra: any,
) {
  const before = extra?.before || {};
  const motivo: string = extra?.motivo || "";

  const sedeNombreById = async (id: string | null | undefined) => {
    if (!id) return "";
    const { data } = await supabase.from("sedes").select("nombre").eq("id", id).maybeSingle();
    return data?.nombre || "";
  };
  const coachById = async (id: string | null | undefined) => {
    if (!id) return null;
    const { data } = await supabase.from("coaches").select("nombre, email").eq("id", id).maybeSingle();
    return data || null;
  };

  const servicioNombre = s?.nombre || "Reserva";
  const alumnoNombre = `${r.nombre || ""} ${r.apellido || ""}`.trim();

  const newFechaTxt = fmtDateAR(r.fecha);
  const newHoraTxt = `${fmtHoraCorta(r.hora_inicio)} – ${fmtHoraCorta(r.hora_fin)}`;
  const oldFecha = before.fecha || r.fecha;
  const oldFechaTxt = fmtDateAR(oldFecha);
  const oldHoraTxt = `${fmtHoraCorta(before.hora_inicio || r.hora_inicio)} – ${fmtHoraCorta(before.hora_fin || r.hora_fin)}`;

  const [newSede, oldSede, newCoach, oldCoach] = await Promise.all([
    sedeNombreById(r.sede_id),
    sedeNombreById(before.sede_id),
    coachById(r.coach_id),
    coachById(before.coach_id),
  ]);

  // Destinatario
  let recipient = "";
  let recipientName = "";
  if (tipo === "reprogramacion") {
    recipient = r.email || "";
    recipientName = (r.nombre || "").split(" ")[0] || "alumno";
  } else if (tipo === "coach_reprogramacion") {
    const target = extra?.coach_id_target ? await coachById(extra.coach_id_target) : newCoach;
    recipient = target?.email || "";
    recipientName = (target?.nombre || "coach").split(" ")[0];
  } else {
    const target = extra?.coach_id_target ? await coachById(extra.coach_id_target) : oldCoach;
    recipient = target?.email || "";
    recipientName = (target?.nombre || "coach").split(" ")[0];
  }

  if (!recipient) {
    return new Response(JSON.stringify({ skipped: true, reason: "no_recipient" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const row = (label: string, antes: string, ahora: string) => {
    if (antes === ahora) return "";
    return `<tr>
      <td style="padding:8px 10px;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:1px;">${escapeHtml(label)}</td>
      <td style="padding:8px 10px;font-size:14px;color:#a33;text-decoration:line-through;">${escapeHtml(antes || "—")}</td>
      <td style="padding:8px 10px;font-size:14px;color:#0f1115;font-weight:600;">${escapeHtml(ahora || "—")}</td>
    </tr>`;
  };

  const comparativa = `
    <div style="background:#fafafa;border:1px solid #eee;border-radius:12px;padding:8px;margin:16px 0;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:6px 10px;font-size:11px;color:#bbb;"></td>
          <td style="padding:6px 10px;font-size:11px;color:#bbb;text-transform:uppercase;letter-spacing:1px;">Antes</td>
          <td style="padding:6px 10px;font-size:11px;color:#bbb;text-transform:uppercase;letter-spacing:1px;">Ahora</td>
        </tr>
        ${row("Fecha", oldFechaTxt, newFechaTxt)}
        ${row("Hora", `${oldHoraTxt} hs`, `${newHoraTxt} hs`)}
        ${row("Coach", oldCoach?.nombre || "", newCoach?.nombre || "")}
        ${row("Sede", oldSede, newSede)}
      </table>
    </div>`;

  const detalleActual = `
    <div style="background:#fff;border:1px solid #eee;border-radius:12px;padding:16px;margin:16px 0;">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#888;margin-bottom:6px;">Datos actualizados</div>
      <div style="font-size:14px;color:#0f1115;line-height:1.7;">
        <strong>Servicio:</strong> ${escapeHtml(servicioNombre)}<br/>
        <strong>Fecha:</strong> ${escapeHtml(newFechaTxt)}<br/>
        <strong>Hora:</strong> ${escapeHtml(newHoraTxt)} hs<br/>
        ${newCoach?.nombre ? `<strong>Coach:</strong> ${escapeHtml(newCoach.nombre)}<br/>` : ""}
        ${newSede ? `<strong>Sede:</strong> ${escapeHtml(newSede)}<br/>` : ""}
        ${alumnoNombre && tipo !== "reprogramacion" ? `<strong>Alumno:</strong> ${escapeHtml(alumnoNombre)}<br/>` : ""}
      </div>
    </div>`;

  const motivoBlock = motivo
    ? `<div style="margin:16px 0;padding:12px 14px;background:#fff8e1;border:1px solid #f0c69a;border-radius:8px;font-size:13px;color:#5a3d00;">
         <strong>Motivo del cambio:</strong> ${escapeHtml(motivo)}
       </div>`
    : "";

  let subject = "";
  let title = "";
  let intro = "";
  let bodyHtml = "";

  if (tipo === "reprogramacion") {
    subject = `Tu clase fue reprogramada · ${servicioNombre} · ${newFechaTxt}`;
    title = "🔄 Tu clase fue reprogramada";
    intro = "Actualizamos los datos de tu clase. Estos son los cambios:";
    bodyHtml = comparativa + detalleActual + motivoBlock;
  } else if (tipo === "coach_reprogramacion") {
    subject = `Clase actualizada · ${newFechaTxt} ${fmtHoraCorta(r.hora_inicio)} · ${alumnoNombre}`;
    title = "🔄 Una clase tuya fue actualizada";
    intro = `Se reprogramó la clase con <strong>${escapeHtml(alumnoNombre || "un alumno")}</strong>. Actualizá tu agenda:`;
    bodyHtml = comparativa + detalleActual + motivoBlock;
  } else {
    subject = `Clase reasignada · ${oldFechaTxt} ${fmtHoraCorta(before.hora_inicio || r.hora_inicio)} · ${alumnoNombre}`;
    title = "ℹ️ Esta clase ya no te corresponde";
    intro = `La clase con <strong>${escapeHtml(alumnoNombre || "un alumno")}</strong> que tenías el ${escapeHtml(oldFechaTxt)} a las ${escapeHtml(fmtHoraCorta(before.hora_inicio || r.hora_inicio))} hs fue reasignada${newCoach?.nombre ? ` a <strong>${escapeHtml(newCoach.nombre)}</strong>` : ""}. Podés quitarla de tu agenda.`;
    bodyHtml = detalleActual + motivoBlock;
  }

  const html = `<!doctype html><html><body style="margin:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
    <div style="max-width:600px;margin:0 auto;padding:32px 24px;">
      <div style="text-align:center;margin-bottom:24px;">
        <span style="font-size:11px;letter-spacing:3px;color:#888;text-transform:uppercase;">Reybaud Ciclismo</span>
      </div>
      <h1 style="font-size:22px;color:#0f1115;margin:0 0 12px;">${title}</h1>
      <p style="font-size:15px;color:#333;margin:0 0 16px;line-height:1.55;">Hola ${escapeHtml(recipientName)}, ${intro}</p>
      ${bodyHtml}
      <p style="font-size:12px;color:#999;margin-top:32px;text-align:center;">Reybaud Ciclismo · <a href="${APP_DOMAIN}" style="color:#999;">reybaud-app.com</a></p>
    </div></body></html>`;

  const messageId = crypto.randomUUID();
  const unsubscribeToken = await getOrCreateUnsubscribeToken(supabase, recipient);

  const { error: qErr } = await supabase.rpc("enqueue_email", {
    queue_name: "transactional_emails",
    payload: {
      message_id: messageId,
      to: recipient,
      from: `${FROM_NAME} <notificaciones@${SENDER_DOMAIN}>`,
      sender_domain: SENDER_DOMAIN,
      subject,
      html,
      text: `${subject}\n\nAntes: ${oldFechaTxt} ${oldHoraTxt}\nAhora: ${newFechaTxt} ${newHoraTxt}\n${motivo ? `Motivo: ${motivo}\n` : ""}\n${APP_DOMAIN}`,
      purpose: "transactional",
      label: `turnera_${tipo}`,
      // Clave única por envío: una reserva puede reprogramarse varias veces.
      idempotency_key: `turnera-${tipo}-${r.id}-${messageId}`,
      unsubscribe_token: unsubscribeToken,
      queued_at: new Date().toISOString(),
    },
  });

  if (qErr) {
    return new Response(JSON.stringify({ error: "queue_failed", detail: qErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ success: true, tipo, recipient }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
