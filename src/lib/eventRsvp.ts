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
  intencion_confirmada: "Pendiente de completar datos",
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
    <p><strong>¿Contamos con vos?</strong></p>
    <div style="text-align:center;margin:22px 0">${button("{rsvp_voy_url}", "VOY", "#ff7d16", "#101010")}${button("{rsvp_no_voy_url}", "NO VOY", "#182b38", "#ffffff")}</div>
    <p style="font-size:13px;color:#b7c0c7">Cada botón abre una confirmación segura, sin iniciar sesión. El voto se registra recién cuando confirmás en la pantalla. Si venís, podés elegir fondo, almuerzo o ambos y editar tu respuesta.</p>
    <p style="font-size:13px;color:#b7c0c7">En la pantalla vas a indicar por separado cuántos amigos ciclistas querés invitar al fondo y cuántos acompañantes no ciclistas vienen al almuerzo. Podés indicar si un amigo ciclista también viene a la parrilla. Completá los nombres y edades de los comensales para calcular el total. Los ciclistas invitados requieren aprobación previa de Claudio y hay 10 cupos en total; responder no reserva uno.</p>
  </div>`,
});

export const rsvpLunchEmail = () => ({
  subject: "Fondazo Reybaud | Cómo confirmar tu almuerzo en La Carreta del Gato",
  preheader: "Tarifas confirmadas, transferencia directa al restaurante y comprobante a la organización por WhatsApp.",
  content_html: `<div style="max-width:600px;margin:auto;background:#0b1118;padding:30px 24px;color:#fff;font-family:Arial,sans-serif;line-height:1.55">
    <div style="color:#ff7d16;font-size:14px;font-weight:800;letter-spacing:2px">CICLISMO REYBAUD</div>
    <h1 style="font-size:27px;margin:14px 0">TU ALMUERZO EN EL FONDAZO</h1>
    <p>Hola {nombre}! Ya están confirmados los valores del restaurante:</p>
    <ul style="padding-left:22px"><li>Adultos: <strong>{rsvp_adult_price}</strong></li><li>Menores de 4 a 9 años: <strong>{rsvp_child_price}</strong></li><li>Menores de 4 años: <strong>{rsvp_under_4_price}</strong></li></ul>
    <p>Bebidas aparte. Completá el nombre y grupo de edad de cada acompañante en la pantalla para calcular el importe total del almuerzo. El titular aparece automáticamente.</p>
    <div style="background:#182b38;border-radius:10px;padding:16px;margin:18px 0">
      <strong>Transferencia directa a La Carreta del Gato</strong><br>
      Alias: <strong>${RESTAURANT_ALIAS}</strong><br>
      Enviá tu comprobante a la organización de Ciclismo Reybaud por WhatsApp al <a style="color:#00c5f7" href="${RESTAURANT_WHATSAPP_URL}">+54 9 11 7171-1122</a>. Nosotros lo compartiremos con el restaurante para verificar tu reserva.<br>
      Incluí tu nombre y la cantidad de comensales. La transferencia cubre el total del precio del restaurante para cada comensal, no un porcentaje.
    </div>
    <p><strong>No pagues en la aplicación.</strong> Reybaud no cobra ni factura este almuerzo. El pago queda confirmado únicamente cuando administración lo verifica con el restaurante.</p>
    <div style="text-align:center;margin:22px 0">${button("{rsvp_lunch_url}", "CONFIRMAR DATOS DEL ALMUERZO", "#ff7d16", "#101010")}</div>
    <p style="font-size:13px;color:#b7c0c7">Antes de confirmar vas a leer y aceptar las condiciones. Responder VOY, transferir o avisar por WhatsApp no equivalen por sí solos a una reserva verificada.</p>
  </div>`,
});

export const formatLunchPrice = (value: number | null | undefined) =>
  value == null ? "Pendiente" : formatPrice(value, "ARS");
