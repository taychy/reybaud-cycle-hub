// Centraliza datos de contacto de la escuela.
// Si el número cambia, actualizar acá únicamente.

export const SCHOOL_WHATSAPP_NUMBER = "5491140312299";

/**
 * Construye un link wa.me con texto precargado.
 * En mobile abre la app de WhatsApp; en desktop abre WhatsApp Web.
 */
export function buildWhatsAppUrl(message: string, number: string = SCHOOL_WHATSAPP_NUMBER): string {
  const encoded = encodeURIComponent(message);
  return `https://wa.me/${number}?text=${encoded}`;
}

/**
 * Mensaje precargado para consultas sobre Record de la Hora.
 */
export function buildRecordHoraHelpMessage(opts: { alumnoNombre?: string | null; fechaEvento?: string | null }): string {
  const fecha = opts.fechaEvento ? formatFechaCorta(opts.fechaEvento) : "próximo";
  if (opts.alumnoNombre && opts.alumnoNombre.trim().length > 0) {
    return `Hola, soy ${opts.alumnoNombre.trim()}. Tengo una consulta sobre mi inscripción al Record de la Hora del ${fecha}.`;
  }
  return `Hola, tengo una consulta sobre mi inscripción al Record de la Hora del ${fecha}.`;
}

// Parseo seguro evitando timezone drift (ver core memory).
function formatFechaCorta(isoDate: string): string {
  try {
    const [y, m, d] = isoDate.split("T")[0].split("-").map((s) => parseInt(s, 10));
    if (!y || !m || !d) return isoDate;
    const meses = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
    return `${d} de ${meses[m - 1]}`;
  } catch {
    return isoDate;
  }
}

/**
 * Datos bancarios para transferencias de Asesoría Personalizada.
 * Si cambian los datos, actualizar acá únicamente.
 */
export const ASESORIA_TRANSFER_INFO = {
  titular: "Claudio Gustavo Reybaud",
  cbu: "0070140831004034472914",
  alias: "ciclismo.reybaud.bg",
  cuenta: "Cuenta Asesoría Personalizada",
} as const;
