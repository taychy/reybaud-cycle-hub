/**
 * Mailing segmentado de reserva rápida (viaje de origen → viaje destino).
 * Solo vista previa: las cohortes las decide el servidor (admin_crosssell_mailing_audience)
 * y el enlace personal nunca aparece en la vista previa.
 */
export type MailingCohort = 'A' | 'B' | 'excluido';
export interface MailingAudienceRow {
  source_reservation_id: string; nombre: string | null; email: string | null;
  cohort: MailingCohort; reason: string; roommate: string | null;
}

export interface MailingSummary { A: MailingAudienceRow[]; B: MailingAudienceRow[]; excluded: MailingAudienceRow[] }

/** Separa cohortes y garantiza un único correo por persona entre A y B. */
export function splitCohorts(rows: MailingAudienceRow[]): MailingSummary {
  const seen = new Set<string>();
  const out: MailingSummary = { A: [], B: [], excluded: [] };
  for (const r of rows) {
    const em = (r.email ?? '').trim().toLowerCase();
    if (r.cohort === 'excluido' || !em) { out.excluded.push(r); continue; }
    if (seen.has(em)) { out.excluded.push({ ...r, cohort: 'excluido', reason: 'Correo duplicado: revisar' }); continue; }
    seen.add(em);
    (r.cohort === 'A' ? out.A : out.B).push(r);
  }
  return out;
}

export const PREVIEW_NAME = 'Nombre';
export const PREVIEW_LINK = 'https://reybaud-app.com/eventos/…?acceso=••••••';

export interface MailingContent { subject: string; preheader: string; paragraphs: string[]; cta: string; link: string; footer: string[] }

const SIGNATURE = 'Scarlett y Claudio — Ciclismo Reybaud';
const LINK_NOTE = 'El enlace es personal y vale 30 días. Por favor no lo reenvíes.';
const COMMON = [
  'La Maratona dles Dolomites 2027 es del 30 de junio al 5 de julio de 2027, con la carrera el 4 de julio. Incluye 5 noches de hotel en habitación doble, entrenamientos y asistencia durante toda la semana. La bicicleta de alquiler es opcional.',
  'Tarifa especial para quienes viajan a La Conquista Alpina: €3.000 con bicicleta incluida o €2.800 si llevás tu propia bici.',
  'No tenés que volver a cargar tus datos: usamos los de tu reserva de Alpes. Si en Alpes compartís habitación doble, mantenemos a tu compañía; si viajás en individual, elegís con quién compartir o te asignamos compañía.',
  'Se reserva con una seña de €500 y el saldo se paga en 8 cuotas. Las 2 noches y el traslado entre los dos viajes (28 al 30 de junio) no están incluidos y se cotizan aparte.',
  'Hay 20 plazas en total. La plaza queda confirmada cuando validamos la seña, sujeta a cupo.',
];

/** A: invitación a titulares Alpes sin solicitud ni reserva. */
export function buildInviteEmail(firstName: string, link: string): MailingContent {
  return {
    subject: 'Maratona dles Dolomites 2027: una tarifa especial para quienes viajan a Alpes',
    preheader: 'Sumá la Maratona a tu viaje con €3.000 con bici o €2.800 con bici propia.',
    paragraphs: [
      `Hola ${firstName || 'ciclista'},`,
      'Como ya tenés tu lugar en La Conquista Alpina, queremos invitarte a sumar la Maratona dles Dolomites 2027 con una tarifa pensada solo para quienes viajan a Alpes.',
      ...COMMON,
    ],
    cta: 'Reservar con mi tarifa especial', link,
    footer: [LINK_NOTE, SIGNATURE],
  };
}

/** B: titulares Alpes que ya solicitaron y todavía no completaron la reserva. No es una nueva invitación. */
export function buildCompleteEmail(firstName: string, link: string): MailingContent {
  return {
    subject: 'Completá tu reserva de Maratona dles Dolomites 2027',
    preheader: 'Ya recibimos tu solicitud: ahora podés dejar tu reserva formal sin volver a cargar datos.',
    paragraphs: [
      `Hola ${firstName || 'ciclista'},`,
      'Gracias por tu solicitud para la Maratona dles Dolomites 2027: la tenemos registrada. Ya abrimos las reservas formales, así que ahora podés completarla con tu tarifa especial de Alpes.',
      ...COMMON.slice(1),
    ],
    cta: 'Completar mi reserva', link,
    footer: [LINK_NOTE, SIGNATURE],
  };
}

/** Texto plano para revisar (sin datos reales). */
export function toPlainText(c: MailingContent): string {
  return [...c.paragraphs, `${c.cta}: ${c.link}`, ...c.footer].join('\n\n');
}
