export const FONDAZO_RESTAURANT_ALIAS = "Lacarretadelgato";
export const FONDAZO_ORGANIZATION_WHATSAPP = "5491171711122";
export const FONDAZO_ORGANIZATION_WHATSAPP_LABEL = "+54 9 11 7171-1122";
export const FONDAZO_POLICY_VERSION = "fondazo-almuerzo-v2-2026-11-17";
export const FONDAZO_POLICY_TEXT =
  "Si cancelás avisando hasta el viernes 27/11/2026 inclusive, el importe abonado queda como crédito para consumir en La Carreta del Gato en otra ocasión. Después de esa fecha no hay reembolso. El crédito lo administra La Carreta del Gato, no Ciclismo Reybaud.";

export function escapeRsvpHtml(value: unknown): string {
  return String(value ?? "")
    .split("&").join("&amp;")
    .split("<").join("&lt;")
    .split(">").join("&gt;")
    .split('"').join("&quot;")
    .split("'").join("&#39;");
}

export function rsvpReceiptWhatsAppUrl(fullName: string): string {
  const name = fullName.trim();
  if (!name) throw new Error("Falta el nombre real para preparar el WhatsApp del comprobante");
  const message = `Hola, soy ${name}. Te envío el comprobante del almuerzo del Fondazo de Reybaud del 29/11.`;
  return `https://wa.me/${FONDAZO_ORGANIZATION_WHATSAPP}?text=${encodeURIComponent(message)}`;
}

function rsvpMoney(value: number | string): string {
  if (typeof value === "string") return value;
  return new Intl.NumberFormat("es-AR", {
    style: "currency", currency: "ARS", minimumFractionDigits: 0, maximumFractionDigits: 2,
  }).format(value);
}

function mailButton(href: string, label: string, background = "#ff7d16", color = "#101010"): string {
  return `<a href="${escapeRsvpHtml(href)}" style="display:inline-block;padding:15px 24px;border-radius:9px;background:${background};color:${color};text-decoration:none;font-weight:800;margin:6px">${escapeRsvpHtml(label)}</a>`;
}

const mailShell = (content: string) => `<div style="max-width:600px;margin:auto;background:#0b1118;padding:30px 24px;color:#fff;font-family:Arial,sans-serif;line-height:1.55">
  <div style="color:#ff7d16;font-size:14px;font-weight:800;letter-spacing:2px">CICLISMO REYBAUD</div>
  ${content}
</div>`;

export type RsvpLunchMailInput = {
  name: string;
  responseUrl: string;
  receiptUrl: string;
  adultPrice: number | string;
  childPrice: number | string;
  under4Price: number | string;
};

export function renderRsvpLunchMail(input: RsvpLunchMailInput) {
  return {
    subject: "Fondazo Reybaud | Confirmación y datos para abonar la parrilla",
    preheader: "Tu asistencia está registrada. Te compartimos los datos para transferir el almuerzo.",
    content_html: mailShell(`
      <h1 style="font-size:27px;margin:14px 0">PARRILLA DE FIN DE AÑO</h1>
      <p>Hola ${escapeRsvpHtml(input.name)}! Tu asistencia al Fondazo del domingo 29/11 quedó registrada.</p>
      <p>Transferí el total de la parrilla <strong>directamente al restaurante La Carreta del Gato</strong>:</p>
      <ul style="padding-left:22px"><li>Adultos: <strong>${escapeRsvpHtml(rsvpMoney(input.adultPrice))}</strong></li><li>Niños de 4 a 9 años: <strong>${escapeRsvpHtml(rsvpMoney(input.childPrice))}</strong></li><li>Menores de 4: <strong>${Number(input.under4Price) === 0 ? "sin cargo" : escapeRsvpHtml(rsvpMoney(input.under4Price))}</strong></li></ul>
      <p><strong>Bebidas aparte.</strong> El importe que transferís es el total del menú para todos los comensales de tu grupo.</p>
      <div style="background:#182b38;border-radius:10px;padding:16px;margin:18px 0">
        <strong>Transferencia directa al restaurante</strong><br>
        Alias: <strong>${FONDAZO_RESTAURANT_ALIAS}</strong>
      </div>
      <p>Podés revisar las personas que registraste antes de transferir:</p>
      <div style="text-align:center;margin:12px 0">${mailButton(input.responseUrl, "Ver mis acompañantes", "#182b38", "#ffffff")}</div>
      <p>Después enviá el comprobante al WhatsApp de <strong>Scarlett, organización de Ciclismo Reybaud: ${FONDAZO_ORGANIZATION_WHATSAPP_LABEL}</strong>. <strong>No es el WhatsApp del restaurante.</strong> Scarlett lo reenvía personalmente al restaurante.</p>
      <div style="text-align:center;margin:20px 0">${mailButton(input.receiptUrl, "Enviar comprobante por WhatsApp")}</div>
      <p style="font-size:13px;color:#b7c0c7"><strong>Cancelaciones:</strong> ${FONDAZO_POLICY_TEXT}</p>
      <p style="font-size:13px;color:#b7c0c7">El pago del fondo de amigos ciclistas aprobados es independiente y tiene otro alias. No lo sumes a esta transferencia.</p>
    `),
  };
}

export function renderRsvpAttendanceMail(name: string, cyclistNames: string[]) {
  const pending = cyclistNames.length
    ? `<p>Los amigos ciclistas que anotaste (<strong>${escapeRsvpHtml(cyclistNames.join(", "))}</strong>) quedaron como <strong>solicitud pendiente de aprobación de Claudio</strong>. No quedaron inscriptos ni se generó ningún cobro.</p>`
    : "";
  return {
    subject: "Fondazo Reybaud | Recibimos tu confirmación",
    content_html: mailShell(`
      <h1 style="font-size:27px;margin:14px 0">¡NOS VEMOS EN EL FONDAZO!</h1>
      <p>Hola ${escapeRsvpHtml(name)}! Recibimos tu confirmación para el domingo 29/11 en La Carreta del Gato.</p>
      ${pending}
      <p>Este correo confirma únicamente tu respuesta. No se generó ningún cargo.</p>
    `),
  };
}

export function renderClaudioApprovalMail(participantName: string, cyclists: { name: string; whatsapp?: string; lunch?: boolean }[]) {
  const rows = cyclists.map((person) => `<li><strong>${escapeRsvpHtml(person.name)}</strong>${person.whatsapp ? ` · WhatsApp ${escapeRsvpHtml(person.whatsapp)}` : ""}${person.lunch ? " · también almuerza" : ""}</li>`).join("");
  return {
    subject: "Fondazo Reybaud | Solicitud de aprobación de amigos ciclistas",
    content_html: mailShell(`
      <h1 style="font-size:25px;margin:14px 0">APROBACIÓN DE CICLISTAS INVITADOS</h1>
      <p><strong>${escapeRsvpHtml(participantName)}</strong> solicitó sumar a estas personas al fondo:</p>
      <ul>${rows}</ul>
      <p>Quedaron pendientes de tu evaluación técnica y de rendimiento. <strong>No fueron inscriptos ni se generó un cobro.</strong> La gestión administrativa sigue siendo manual.</p>
    `),
  };
}
