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

/** Alerta de revisión manual: reserva de origen confirmada sin pagos registrados (no excluye automáticamente). */
export function needsManualReview(src: { status: string | null; amount_paid: number | null } | undefined): boolean {
  return !!src && src.status === 'reserva_confirmada' && !(Number(src.amount_paid) > 0);
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
/** Marcador visible: el enlace personal real se genera recién al enviar (nunca en la vista previa). */
export const PREVIEW_LINK = '[Enlace personal · se genera al enviar, no incluido en la vista previa]';
/** Enlace público real (sin token) a la sección de servicios de la landing. */
export const PUBLIC_INCLUDES_LINK = 'https://reybaud-app.com/eventos/78a739f4-9b06-47af-bc6d-d8a1705e2477#incluye';

export type MailingBlock =
  | { kind: 'p'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'cta'; role: 'public' | 'personal'; label: string; href: string };
export interface MailingContent { subject: string; preheader: string; blocks: MailingBlock[]; footer: string[] }

const SIGNATURE = 'Scarlett y Claudio — Ciclismo Reybaud';
const LINK_NOTE = 'El enlace de tu reserva es personal y vale 30 días. Por favor no lo reenvíes.';
const SERVICES: MailingBlock = { kind: 'list', items: [
  '5 noches de hotel en Corvara, en habitación doble, con desayunos, almuerzos y cenas',
  'Inscripción a la carrera del 4 de julio',
  'Bicicleta Cannondale SuperSix EVO o Scott Addict, solo en el paquete con alquiler',
  'Plan de entrenamiento previo y salidas con Claudio',
  'Van de apoyo, hidratación y asistencia mecánica',
  'Traslados desde y hacia el aeropuerto de Venecia',
] };
const MORE: MailingBlock[] = [
  { kind: 'p', text: 'Y hay mucho más. Podés ver el programa completo, con lo que incluye y lo que no, en la página del viaje.' },
  { kind: 'cta', role: 'public', label: 'Ver todo lo que incluye', href: PUBLIC_INCLUDES_LINK },
];
export interface CapacityInfo { capacity: number; available: number; booked: number }
export const CAPACITY_FALLBACK = 'Cupos sujetos a disponibilidad, consultá el detalle.';

/** Valida cifras del servidor; null si no son coherentes (nunca inventa ocupación). */
export function capacityFromStatus(st: unknown): CapacityInfo | null {
  const c = Number((st as any)?.capacity), a = Number((st as any)?.available);
  if (!Number.isInteger(c) || !Number.isInteger(a) || c <= 0 || a < 0 || a > c) return null;
  return { capacity: c, available: a, booked: c - a };
}

/** Texto de cupos: "reservas registradas", nunca "confirmadas" ni "pagadas". */
export function capacityText(cap: CapacityInfo | null | undefined): string {
  const ok = cap && Number.isInteger(cap.capacity) && Number.isInteger(cap.available) && cap.capacity > 0 && cap.available >= 0 && cap.available <= cap.capacity && cap.booked === cap.capacity - cap.available;
  if (!ok) return CAPACITY_FALLBACK;
  const c = cap!;
  const reg = c.booked === 0 ? 'Todavía no hay reservas registradas' : c.booked === 1 ? 'Ya hay 1 reserva registrada' : `Ya hay ${c.booked} reservas registradas`;
  const free = c.available === 0 ? 'por ahora no quedan lugares disponibles' : c.available === 1 ? 'queda 1 lugar disponible, en habitación doble' : `quedan ${c.available} lugares disponibles, todos en habitación doble`;
  return `Para Maratona tenemos ${c.capacity} plazas en total. ${reg} y ${free}. La plaza se confirma una vez validada la seña, sujeta a disponibilidad.`;
}

/** Envío hipotético: solo si el cupo pudo verificarse justo antes. */
export const canSendWithCapacity = (cap: CapacityInfo | null) => cap !== null && cap.available > 0;

const terms = (cap?: CapacityInfo | null): MailingBlock[] => [
  { kind: 'p', text: 'Por venir de Alpes tenés una tarifa especial, en habitación doble: €3.000 con bici incluida o €2.800 si llevás la tuya. Se reserva con una seña de €500 y el resto en 8 cuotas.' },
  { kind: 'p', text: capacityText(cap) },
  { kind: 'p', text: 'Las 2 noches y el traslado entre los dos viajes (28 al 30 de junio) no están incluidos y se cotizan aparte.' },
  { kind: 'p', text: 'Tus datos ya los tenemos de Alpes, no hace falta cargarlos de nuevo. Si compartís habitación doble, mantenemos al mismo compañero siempre que los dos sigan. Si viajás en individual, vas a poder elegir con quién compartir o pedirnos que te asignemos.' },
  { kind: 'p', text: 'Desde tu enlace personal ves tu reserva ya armada: elegís la tarifa, confirmás y te mostramos cómo pagar la seña.' },
];

/** A: invitación a titulares Alpes sin solicitud ni reserva. */
export function buildInviteEmail(firstName: string, link: string, cap?: CapacityInfo | null): MailingContent {
  return {
    subject: 'Después de Alpes, la Maratona dles Dolomites',
    preheader: 'Una tarifa especial para quienes viajan a La Conquista Alpina.',
    blocks: [
      { kind: 'p', text: `Hola ${firstName || ''}, cómo estás?`.replace(' ,', ',') },
      { kind: 'p', text: 'Te escribimos porque después de La Conquista Alpina seguimos viaje a la Maratona dles Dolomites, del 30 de junio al 5 de julio de 2027. La carrera es el 4 de julio.' },
      { kind: 'p', text: 'Algunas cosas que incluye:' }, SERVICES, ...MORE, ...terms(cap),
      { kind: 'cta', role: 'personal', label: 'Acceder a mi reserva personalizada', href: link },
    ],
    footer: [LINK_NOTE, SIGNATURE],
  };
}

/** B: titulares Alpes que ya solicitaron y todavía no completaron la reserva. No es una nueva invitación. */
export function buildCompleteEmail(firstName: string, link: string, cap?: CapacityInfo | null): MailingContent {
  return {
    subject: 'Tu solicitud de Maratona dles Dolomites',
    preheader: 'Ya abrimos las reservas: podés completar la tuya con la tarifa de Alpes.',
    blocks: [
      { kind: 'p', text: `Hola ${firstName || ''}, cómo estás?`.replace(' ,', ',') },
      { kind: 'p', text: 'Ya recibimos tu solicitud de Maratona, gracias. Te recordamos que es la continuación de La Conquista Alpina, del 30 de junio al 5 de julio de 2027, con la carrera el 4 de julio. Ya abrimos las reservas, así que ahora podés completar la tuya.' },
      { kind: 'p', text: 'Algunas cosas que incluye:' }, SERVICES, ...MORE, ...terms(cap),
      { kind: 'cta', role: 'personal', label: 'Completar mi reserva', href: link },
    ],
    footer: [LINK_NOTE, SIGNATURE],
  };
}

/** Texto plano para revisar (sin datos reales). */
export function toPlainText(c: MailingContent): string {
  const parts = c.blocks.map(b => b.kind === 'p' ? b.text : b.kind === 'list' ? b.items.map(i => `- ${i}`).join('\n') : `${b.label}: ${b.href}`);
  return [...parts, ...c.footer].join('\n\n');
}
