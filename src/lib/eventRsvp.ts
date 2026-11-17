import { formatPrice } from "@/lib/currency";

export const FONDAZO_EVENT_ID = "08fc7e07-10df-4ace-b3ed-a0d581b6f7c9";
export const RESTAURANT_ALIAS = "Lacarretadelgato";
export const RESTAURANT_WHATSAPP = "5491171711122";
export const RESTAURANT_WHATSAPP_URL = `https://wa.me/${RESTAURANT_WHATSAPP}`;
export const GUEST_CYCLIST_ALIAS = "granfondo.tc";
export const GUEST_CYCLIST_ACCOUNT_HOLDER = "Scarlett Tayná";
export const LUNCH_POLICY_VERSION = "fondazo-almuerzo-v1-2026-11-16";
export const LUNCH_POLICY_TEXT =
  "Si cancelás avisando con al menos 5 días de anticipación (hasta el 24/11/2026 inclusive), el importe abonado queda como crédito para consumir en La Carreta del Gato en otra ocasión. Si no asistís el día del evento y no avisás, perdés el 100% del importe abonado.";
export const LUNCH_POLICY_PENDING =
  "Las cancelaciones avisadas entre el 25 y el 28/11/2026 o el mismo día están pendientes de definición administrativa; no se consideran automáticamente una ausencia sin aviso. El crédito lo administra La Carreta del Gato, no Ciclismo Reybaud.";

export const ADULT_LUNCH_PRICE_ANNOUNCED = 40000;
export const GUEST_CYCLIST_FEE = 30000;
export const GUEST_CYCLIST_MAX = 10;
export const COMPANIONS_TECH_MAX = 500;
export const FONDAZO_NOTICE =
  "El fondo es gratis para alumnos activos. ¿Querés traer un amigo ciclista? Consultalo antes con Claudio: deberá evaluar su nivel técnico y de rendimiento. Solo 10 cupos para amigos ciclistas aprobados. Invitados al fondo: $30.000. Parrilla: $40.000 por adulto. Acompañantes que solo vienen al almuerzo: sin límite de cupos.";

export const PARTICIPATION_LABELS = {
  fondo_y_almuerzo: "Fondo + almuerzo",
  solo_fondo: "Solo fondo",
  solo_almuerzo: "Solo almuerzo",
} as const;

export const LUNCH_STATUS_LABELS = {
  sin_interes: "Sin interés en almuerzo",
  intencion_confirmada: "Asistencia registrada · pago por correo",
  instrucciones_pendientes: "Reserva pendiente de pago",
  instrucciones_enviadas: "Reserva pendiente de pago",
  comprobante_informado: "Comprobante recibido",
  pago_verificado: "Reserva confirmada · pago verificado",
} as const;

export type ParticipationMode = keyof typeof PARTICIPATION_LABELS;
export type LunchStatus = keyof typeof LUNCH_STATUS_LABELS;
export type LunchCounts = {
  adults_count: number;
  children_4_9_count: number;
  under_4_count: number;
};
export type LunchPrices = {
  adult_price: number | null;
  child_4_9_price: number | null;
  under_4_price: number | null;
  prices_confirmed_at?: string | null;
};

export const hasLunchInterest = (response?: string | null, mode?: string | null) =>
  response === "voy" && (mode === "fondo_y_almuerzo" || mode === "solo_almuerzo");

export const lunchDinerTotal = (counts: LunchCounts) =>
  counts.adults_count + counts.children_4_9_count + counts.under_4_count;

export const lunchAmount = (counts: LunchCounts, prices: LunchPrices): number | null => {
  if (
    !prices.prices_confirmed_at ||
    prices.adult_price == null ||
    prices.child_4_9_price == null ||
    prices.under_4_price == null
  ) return null;
  return counts.adults_count * prices.adult_price +
    counts.children_4_9_count * prices.child_4_9_price +
    counts.under_4_count * prices.under_4_price;
};

export const validateLunchCounts = (counts: LunchCounts, guestsCount: number): string | null => {
  const values = Object.values(counts);
  if (values.some((n) => !Number.isInteger(n) || n < 0 || n > COMPANIONS_TECH_MAX + 1)) return "Revisá las cantidades de comensales.";
  if (counts.adults_count < 1) return "Incluí al menos un adulto.";
  if (lunchDinerTotal(counts) !== guestsCount + 1) {
    return `La suma tiene que ser ${guestsCount + 1}: vos más ${guestsCount} acompañante${guestsCount === 1 ? "" : "s"}.`;
  }
  return null;
};

const button = (href: string, label: string, background: string, color: string) =>
  `<a href="${href}" style="display:inline-block;padding:15px 28px;border-radius:9px;background:${background};color:${color};text-decoration:none;font-weight:800;margin:6px">${label}</a>`;

export const rsvpInvitationEmail = () => ({
  subject: "🚴 Fondazo de fin de año Reybaud | Confirmá si venís",
  preheader: "Contanos si venís al Fondazo del domingo 29/11. Podés elegir fondo, almuerzo o ambos.",
  content_html: `<div style="max-width:600px;margin:auto;background:#0b1118;padding:30px 24px;color:#fff;font-family:Arial,sans-serif;line-height:1.55">
    <div style="color:#ff7d16;font-size:14px;font-weight:800;letter-spacing:2px">CICLISMO REYBAUD</div>
    <h1 style="font-size:30px;margin:14px 0 4px">FONDAZO DE FIN DE AÑO</h1>
    <p style="font-size:18px;color:#00c5f7;margin:0 0 20px">Domingo 29/11 · La Carreta del Gato, Capilla del Señor</p>
    <p>Hola {nombre}! Queremos despedir este 2026 juntos: fondo en ruta y parrilla después.</p>
    <div style="border:2px solid #ff7d16;border-radius:10px;padding:14px 16px;margin:18px 0;background:#141d26;font-size:14px">${FONDAZO_NOTICE}</div>
    <p><a href="https://maps.app.goo.gl/6Bg9nS9BFn4g8hV79" target="_blank" rel="noopener noreferrer" style="color:#00c5f7;text-decoration:underline;font-weight:700">📍 Ver restaurante en Google Maps</a></p>
    <p><strong>¿Contamos con vos?</strong> Tocá VOY o NO VOY para confirmar tu participación.</p>
    <p>Si venís acompañado, podés completar los datos de tus invitados al confirmar.</p>
    <div style="text-align:center;margin:22px 0">${button("{rsvp_voy_url}", "VOY", "#ff7d16", "#101010")}${button("{rsvp_no_voy_url}", "NO VOY", "#182b38", "#ffffff")}</div>
  </div>`,
});

/**
 * Segunda etapa: se envía a quienes respondieron VOY después de revisar la
 * lista. No se dispara desde la encuesta, ni se cobran importes en la app.
 * Las transferencias al fondo de invitados requieren aprobación de Claudio.
 */
export const rsvpLunchEmail = () => ({
  subject: "Fondazo Reybaud | Tu asistencia y las indicaciones de pago",
  preheader: "Almuerzo en La Carreta del Gato y, si corresponde, fondo de amigos ciclistas aprobados.",
  content_html: `<div style="max-width:600px;margin:auto;background:#0b1118;padding:30px 24px;color:#fff;font-family:Arial,sans-serif;line-height:1.6">
    <div style="color:#ff7d16;font-size:14px;font-weight:800;letter-spacing:2px">CICLISMO REYBAUD</div>
    <h1 style="font-size:28px;margin:14px 0">FONDAZO · INFORMACIÓN PARA RESERVAR</h1>
    <p>Hola {nombre}! Gracias por confirmar tu participación para el domingo 29/11 en La Carreta del Gato, Capilla del Señor.</p>
    <p>Te compartimos los importes y los datos de transferencia. El fondo de la escuela es gratuito para alumnos activos.</p>
    <div style="border:1px solid #00baf2;border-radius:10px;padding:16px;margin:18px 0;background:#142630">
      <div style="font-size:16px;font-weight:bold;color:#00c5f7">1 · Parrilla del restaurante</div>
      <p style="margin:8px 0">Adultos: <strong>{rsvp_adult_price}</strong> por persona.<br>Niños de 4 a 9 años: <strong>{rsvp_child_price}</strong> por persona.<br>Menores de 4: <strong>{rsvp_under_4_price}</strong>. Bebidas aparte.</p>
      <p style="margin:8px 0">Si confirmaste almuerzo, transferí el importe de todos tus comensales al restaurante:</p>
      <p style="font-size:17px;margin:8px 0">Alias: <strong>${RESTAURANT_ALIAS}</strong></p>
      <p style="font-size:13px;color:#b5c5cd">Este alias recibe únicamente el valor de la parrilla, nunca el del fondo.</p>
    </div>
    <div style="border:1px solid #ff7d16;border-radius:10px;padding:16px;margin:18px 0;background:#241b16">
      <div style="font-size:16px;font-weight:bold;color:#ff9c4b">2 · Amigo ciclista invitado</div>
      <p style="margin:8px 0">Valor del fondo: <strong>$30.000 por cada ciclista invitado aprobado</strong>. Hay solamente 10 cupos aprobados en total.</p>
      <p style="margin:8px 0"><strong>Importante:</strong> si solicitaste traer un amigo ciclista, esperá la aprobación expresa de Claudio antes de transferir este importe.</p>
      <p style="font-size:17px;margin:8px 0">Alias: <strong>${GUEST_CYCLIST_ALIAS}</strong></p>
      <p style="font-size:14px;margin:0">Titular: <strong>${GUEST_CYCLIST_ACCOUNT_HOLDER}</strong></p>
      <p style="font-size:13px;color:#e8b98e;margin:8px 0 0">Si no tenés un ciclista invitado aprobado, no corresponde este pago.</p>
    </div>
    <p><strong>Comprobantes:</strong> enviá la constancia de cada transferencia por WhatsApp a Scarlett e indicá a qué concepto corresponde.</p>
    <div style="text-align:center;margin:20px 0">${button(RESTAURANT_WHATSAPP_URL, "ENVIAR COMPROBANTE POR WHATSAPP", "#ff7d16", "#111111")}</div>
    <div style="border-top:1px solid #3b444a;padding-top:14px;font-size:13px;color:#c3c9cd">
      <strong>Condiciones de la parrilla:</strong> avisando hasta el 24/11 inclusive, lo abonado queda como crédito para otra visita al restaurante. Si no asistís el 29/11 y no avisás, se pierde el importe abonado. Para cancelaciones avisadas del 25 al 28/11, consultanos antes.
    </div>
    <p style="font-size:13px;color:#aab8c1">La reserva se verifica manualmente después de recibir el comprobante. No se realizan pagos dentro de Reybaud.</p>
  </div>`,
});

export const formatLunchPrice = (value: number | null | undefined) =>
  value == null ? "Pendiente" : formatPrice(value, "ARS");
