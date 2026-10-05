/**
 * Normalización de teléfonos y mensaje de WhatsApp para preinscriptos de programas.
 * Solo arma el link wa.me: el envío real lo confirma la persona en WhatsApp.
 */

/** Devuelve el número en formato internacional solo dígitos, o null si no es válido. */
export function normalizePhoneAr(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const hadPlus = raw.trim().startsWith("+");
  let d = raw.replace(/[^\d]/g, "");
  if (!d) return null;

  if (hadPlus) {
    // Ya viene internacional: respetar el código de país.
    return d.length >= 10 && d.length <= 15 ? d : null;
  }

  // Formato local argentino.
  if (d.startsWith("54")) {
    d = d.slice(2);
  } else if (d.startsWith("0")) {
    d = d.slice(1);
  }
  // Quitar el 15 de celular local (p.ej. 11 15 1234 5678 → 11 1234 5678).
  d = d.replace(/^(11|[2-9]\d{2,3})15(\d{6,8})$/, "$1$2");
  // Celular argentino: 10 dígitos (área + número) → agregar 9 después del 54.
  if (d.length === 10) {
    d = "9" + d;
  }
  const full = "54" + d;
  return full.length >= 12 && full.length <= 13 ? full : null;
}

export function buildWaLink(phoneIntl: string, message: string): string {
  return `https://wa.me/${phoneIntl}?text=${encodeURIComponent(message)}`;
}

interface MsgParams {
  nombre: string;
  linkPersonal?: string | null;
}

/** Mensaje aprobado por Natalia para apertura de inscripciones del Programa de Iniciación. */
export function buildPreinscriptoWaMessage({ nombre, linkPersonal }: MsgParams): string {
  const first = (nombre || "").trim().split(/\s+/)[0] || "hola";
  let msg = `Hola ${first}, ¿cómo estás? Soy Natalia de Ciclismo Reybaud 😊

Te escribo porque te preinscribiste al Programa de Iniciación al Ciclismo de octubre y ya abrimos las inscripciones.

Quería saber si seguís con ganas de sumarte. Tenés disponible el precio de preinscripción de $153.000 o 2 cuotas de $82.500 hasta el 16/10.

Podés elegir entre KDT o Parque Sarmiento, los sábados de 11:00 a 12:30.

Si querés, te paso el link para completar la inscripción.`;
  if (linkPersonal) msg += `\n\nTu link personal es: ${linkPersonal}`;
  return msg;
}
