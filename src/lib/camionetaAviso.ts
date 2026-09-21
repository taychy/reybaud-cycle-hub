/**
 * Aviso por WhatsApp "tu pedido ya está en la camioneta".
 *
 * Reutiliza el canal existente del proyecto (link wa.me + normalizePhoneAR).
 * No cambia estados, cobros, entregas, cancelaciones ni devoluciones.
 */

import { formatPrice } from "@/lib/currency";
import { normalizePhoneAR } from "@/lib/phoneNormalize";

export interface AvisoOrderLike {
  total?: number | string | null;
  currency?: string | null;
  pagado_at?: string | null;
  metodo_pago?: string | null;
}

/** Importe realmente pendiente del pedido (pagado_at es la fuente de verdad). */
export const pendienteAviso = (o: AvisoOrderLike): number =>
  o.pagado_at ? 0 : Math.max(Number(o.total || 0), 0);

export const buildAvisoCamionetaMessage = (
  nombre: string,
  o: AvisoOrderLike,
): string => {
  const n = (nombre || "").trim() || "cliente";
  const pendiente = pendienteAviso(o);
  if (pendiente <= 0) {
    return `Hola, ${n}. Tu pedido ya está en la camioneta para que puedas retirarlo.`;
  }
  const importe = formatPrice(pendiente, (o.currency || "ARS") as any);
  return (
    `Hola, ${n}. Tu pedido ya está en la camioneta. ` +
    `Queda pendiente el pago de ${importe}. ` +
    `Tenés un sobre identificado para colocar el dinero; luego depositalo en el buzón ` +
    `ubicado entre los asientos delanteros de la camioneta. ¡Gracias!`
  );
};

export const avisoWaLink = (telefono: string, mensaje: string): string | null => {
  const tel = normalizePhoneAR(telefono);
  if (!tel) return null;
  return `https://wa.me/${tel}?text=${encodeURIComponent(mensaje)}`;
};

export const formatAvisoFecha = (iso?: string | null): string => {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
};
