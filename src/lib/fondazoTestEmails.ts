/**
 * Correos automáticos de PRUEBA del Fondazo, nunca para alumnos reales.
 * El envío lo autoriza de nuevo la función send-broadcast con rol admin.
 */
import {
  FONDAZO_EVENT_ID, guestCyclistPaymentEmail, lunchAmount, rsvpLunchEmail,
  type LunchCounts, type LunchPrices, type ParticipationMode,
} from "./eventRsvp";

export const FONDAZO_TEST_RECIPIENT = "scarlettbonatto@gmail.com";

export type TestRsvp = {
  event: { id: string };
  is_test?: boolean;
  name: string | null;
  response: "voy" | "no_voy" | null;
  participation_mode: ParticipationMode | null;
  cyclist_guests: { name: string; lunch: boolean; whatsapp?: string }[];
  lunch: LunchCounts;
  prices: LunchPrices;
};

export type FondazoTestMail = {
  stage: "confirmacion" | "parrilla" | "ciclista_aprobado";
  subject: string;
  content_html: string;
};

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;")
  .replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const money = (n: number) => new Intl.NumberFormat("es-AR", {
  style: "currency", currency: "ARS", minimumFractionDigits: 0, maximumFractionDigits: 0,
}).format(n);

const testNotice = '<div style="padding:15px;margin-bottom:18px;border:2px solid #ff8a31;border-radius:10px;background:#332419;color:#fff;font-weight:bold;font-size:14px">' +
  'PRUEBA DE CORREO AUTOMÁTICO. NO REALIZAR TRANSFERENCIAS NI ENVIAR COMPROBANTES. ' +
  'Esta comunicación es una simulación del Fondazo.</div>';

const title = '<div style="color:#ff8a31;letter-spacing:1.8px;font-size:13px;font-weight:bold">' +
  'CICLISMO REYBAUD</div><h1 style="margin:12px 0;font-size:26px;color:#fff">' +
  'FONDAZO DE FIN DE AÑO 2026</h1>';

const wrap = (content: string) => '<div style="background:#080c12;padding:25px 10px;color:#fff;font-family:Arial,sans-serif">' +
  '<div style="max-width:600px;margin:auto;background:#151b22;border-radius:12px;padding:26px;line-height:1.6">' +
  testNotice + content + '</div></div>';

const greeting = (name: string | null) => 'Hola, ' + escapeHtml(name?.trim() || "Test Reybaud") + '!';

export function buildAutomaticFondazoTestMails(rsvp: TestRsvp, token: string): FondazoTestMail[] {
  if (rsvp.is_test !== true || rsvp.event.id !== FONDAZO_EVENT_ID) return [];

  const attendance = rsvp.response === "voy";
  const firstContent = title +
    '<p>' + greeting(rsvp.name) + '</p>' +
    (attendance
      ? '<p>Registramos tu asistencia al Fondazo del domingo 29/11/2026.</p>' +
        '<p>Modalidad: <strong>' + (
          rsvp.participation_mode === "solo_fondo" ? "Solo fondo" :
          rsvp.participation_mode === "solo_almuerzo" ? "Solo almuerzo" : "Fondo + parrilla"
        ) + '</strong>.</p>' +
        (rsvp.cyclist_guests.length
          ? '<p>Solicitaste ' + rsvp.cyclist_guests.length +
            ' amigo(s) ciclista(s). <strong>Claudio debe aprobarlos antes de pagar sus cupos.</strong></p>'
          : '') +
        '<p>Los importes de parrilla, cuando correspondan, llegan por correo separado.</p>'
      : '<p>Registramos que no vas a participar. Gracias por avisarnos. No tenés que pagar nada.</p>') +
    '<p style="color:#1cc7f0">Ciclismo Reybaud · La Carreta del Gato, Capilla del Señor</p>';

  const first: FondazoTestMail = {
    stage: "confirmacion",
    subject: attendance
      ? "Fondazo Reybaud | Recibimos tu confirmación de asistencia"
      : "Fondazo Reybaud | Registramos que no venís",
    content_html: wrap(firstContent),
  };
  if (!attendance) return [first];

  const result: FondazoTestMail[] = [first];
  if (rsvp.participation_mode === "fondo_y_almuerzo" || rsvp.participation_mode === "solo_almuerzo") {
    const total = lunchAmount(rsvp.lunch, rsvp.prices);
    if (total === null) throw new Error("Las tarifas del restaurante todavía no están confirmadas.");

    const original = rsvpLunchEmail();
    const surveyURL = "https://reybaud-app.com/confirmar-asistencia/" + token + "?seccion=almuerzo";
    const template = original.content_html
      .replaceAll("{rsvp_adult_price}", money(rsvp.prices.adult_price!))
      .replaceAll("{rsvp_child_price}", money(rsvp.prices.child_4_9_price!))
      .replaceAll("{rsvp_lunch_url}", escapeHtml(surveyURL));
    const summary = '<div style="padding:12px;border:1px solid #16b7d8;border-radius:8px;background:#152d35;margin:15px 0">' +
      '<strong>Tu grupo para la parrilla:</strong> ' +
      rsvp.lunch.adults_count + ' adulto(s), ' +
      rsvp.lunch.children_4_9_count + ' niño(s) de 4 a 9 años y ' +
      rsvp.lunch.under_4_count + ' menor(es) de 4.' +
      '<div style="font-size:19px"><strong>Total de prueba: ' + money(total) + '</strong></div></div>';

    result.push({
      stage: "parrilla",
      subject: original.subject,
      content_html: wrap(summary + template),
    });
  }
  return result;
}

/** Simulación del correo posterior a la aprobación de Claudio.
 * No cambia cupos, estado de aprobación, pagos ni reservas.
 */
export function buildApprovedCyclistsTestMail(rsvp: TestRsvp): FondazoTestMail {
  if (!rsvp.is_test || rsvp.event.id !== FONDAZO_EVENT_ID ||
      rsvp.response !== "voy" || !rsvp.cyclist_guests.length) {
    throw new Error("Necesitás una respuesta de prueba con ciclistas invitados.");
  }
  const original = guestCyclistPaymentEmail(rsvp.cyclist_guests.map((person) => person.name));
  return {
    stage: "ciclista_aprobado",
    subject: original.subject,
    content_html: wrap(title +
      '<p><strong>APROBACIÓN DE CLAUDIO SIMULADA</strong>. No autoriza a ciclistas reales ni habilita pagos.</p>' +
      '<div style="white-space:pre-line">' + escapeHtml(original.body) + '</div>'),
  };
}
