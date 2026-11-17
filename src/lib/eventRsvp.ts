import { formatPrice } from "@/lib/currency";

export const FONDAZO_EVENT_ID = "08fc7e07-10df-4ace-b3ed-a0d581b6f7c9";
export const RESTAURANT_ALIAS = "Lacarretadelgato";
export const RESTAURANT_WHATSAPP = "5491171711122";
export const RESTAURANT_WHATSAPP_URL = `https://wa.me/${RESTAURANT_WHATSAPP}`;
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
  intencion_confirmada: "Asistencia registrada · correo de pago pendiente",
  instrucciones_pendientes: "Correo de pago pendiente",
  instrucciones_enviadas: "Instrucciones de pago enviadas",
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

export const GUEST_CYCLIST_PAYMENT_ALIAS = "granfondo.tc";
export const GUEST_CYCLIST_PAYMENT_OWNER = "Scarlett Tayná";

// Segundo correo, manual y posterior al VOY. Solo se envía a quienes eligieron almuerzo.
export const rsvpLunchEmail = () => ({
  subject: "Fondazo Reybaud | Datos para abonar la parrilla",
  preheader: "Tu asistencia está registrada. Te compartimos los datos para transferir el almuerzo.",
  content_html: `<div style="max-width:600px;margin:auto;background:#0b1118;padding:30px 24px;color:#fff;font-family:Arial,sans-serif;line-height:1.55">
    <div style="color:#ff7d16;font-size:14px;font-weight:800;letter-spacing:2px">CICLISMO REYBAUD</div>
    <h1 style="font-size:27px;margin:14px 0">PARRILLA DE FIN DE AÑO</h1>
    <p>Hola {nombre}! Gracias por confirmar tu asistencia al Fondazo del domingo 29/11.</p>
    <p>Ya podés realizar el pago correspondiente a la parrilla en La Carreta del Gato:</p>
    <ul style="padding-left:22px"><li>Adultos: <strong>{rsvp_adult_price}</strong></li><li>Niños de 4 a 9 años: <strong>{rsvp_child_price}</strong></li><li>Menores de 4: <strong>sin cargo</strong></li></ul>
    <p>Bebidas aparte. El importe que transferís es el total del menú para todos los comensales de tu grupo.</p>
    <div style="background:#182b38;border-radius:10px;padding:16px;margin:18px 0">
      <strong>Pago de la parrilla — directamente al restaurante</strong><br>
      Alias: <strong>${RESTAURANT_ALIAS}</strong>
    </div>
    <p>Una vez que transfieras, enviá el comprobante por WhatsApp a Scarlett. Nosotros se lo vamos a reenviar al restaurante.</p>
    <div style="text-align:center;margin:18px 0">${button(RESTAURANT_WHATSAPP_URL, "ENVIAR COMPROBANTE POR WHATSAPP", "#ff7d16", "#101010")}</div>
    <p style="font-size:13px;color:#b7c0c7"><strong>Cancelaciones:</strong> si avisás hasta el 24/11 inclusive, el importe queda como crédito para consumir en el restaurante en otra ocasión. Si no asistís y no avisás, perdés lo abonado. Para avisos del 25 al 28/11 o el mismo día, consultanos antes.</p>
    <p style="font-size:13px;color:#b7c0c7">El pago del fondo de amigos ciclistas aprobados es independiente y tiene otro alias. No lo sumes a esta transferencia.</p>
  </div>`,
});

// Correo individual: sólo cuando Claudio aprobó el/los amigos ciclistas.
// No se envía desde el formulario: administración lo prepara después del VOY.
export const guestCyclistPaymentEmail = (approvedNames: string[]) => {
  if (!approvedNames.length) throw new Error("No hay ciclistas aprobados para generar el correo de pago.");
  const count = approvedNames.length;
  const amount = count * GUEST_CYCLIST_FEE;
  return {
    subject: "Fondazo Reybaud | Pago del cupo de ciclista invitado",
    body: `Hola! Ya tenemos la aprobación de Claudio para ${approvedNames.join(", ")}.

Para confirmar el cupo ${count === 1 ? "del ciclista invitado" : "de los ciclistas invitados"}:
Cantidad: ${count}
Valor por ciclista: $30.000
Total: ${formatPrice(amount, "ARS")}

Alias: ${GUEST_CYCLIST_PAYMENT_ALIAS}
Titular: ${GUEST_CYCLIST_PAYMENT_OWNER}

Una vez que transfieras, enviá el comprobante por WhatsApp a Scarlett: +54 9 11 7171-1122.

Este pago corresponde solamente al fondo en bicicleta y no incluye la parrilla, que se abona por separado al restaurante.

¡Nos vemos en el Fondazo!
Equipo Ciclismo Reybaud`,
  };
};

export const formatLunchPrice = (value: number | null | undefined) =>
  value == null ? "Pendiente" : formatPrice(value, "ARS");
