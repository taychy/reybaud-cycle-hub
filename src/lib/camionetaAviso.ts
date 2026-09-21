/**
 * Aviso por WhatsApp "tu pedido ya está en la camioneta".
 *
 * Reutiliza el canal existente del proyecto (link wa.me + normalizePhoneAR).
 * El proyecto NO tiene envío outbound real de WhatsApp: el webhook existente es
 * sólo de entrada y la plantilla Twilio de Turnera es específica de turnos.
 * Por eso el aviso se registra únicamente cuando la persona confirma que lo envió.
 *
 * No cambia estados, cobros, entregas, cancelaciones ni devoluciones.
 */

import { formatPrice } from "@/lib/currency";
import { normalizePhoneAR } from "@/lib/phoneNormalize";
import { getPaymentState } from "@/lib/storeOrderStatus";

export interface AvisoOrderLike {
  total?: number | string | null;
  currency?: string | null;
  pagado_at?: string | null;
  metodo_pago?: string | null;
  status?: string | null;
}

/**
 * Mensaje del aviso.
 * - `saldo` es el saldo pendiente REAL del pedido (viene de get_store_orders_saldo).
 * - El texto de sobre + buzón es exclusivo de "Efectivo pendiente".
 */
export const buildAvisoCamionetaMessage = (
  nombre: string,
  o: AvisoOrderLike,
  saldo: number,
): string => {
  const n = (nombre || "").trim() || "cliente";
  const estado = getPaymentState(o);
  const pendiente = Math.max(Number(saldo || 0), 0);

  if (estado === "pagado" || pendiente <= 0) {
    return `Hola, ${n}. Tu pedido ya está en la camioneta para que puedas retirarlo.`;
  }

  const importe = formatPrice(pendiente, (o.currency || "ARS") as any);

  if (estado === "efectivo_pendiente") {
    return (
      `Hola, ${n}. Tu pedido ya está en la camioneta. ` +
      `Queda pendiente el pago de ${importe}. ` +
      `Tenés un sobre identificado para colocar el dinero; luego depositalo en el buzón ` +
      `ubicado entre los asientos delanteros de la camioneta. ¡Gracias!`
    );
  }

  // Pendiente por otro medio: no corresponde el sobre/buzón.
  return (
    `Hola, ${n}. Tu pedido ya está en la camioneta para que puedas retirarlo. ` +
    `Queda pendiente el pago de ${importe}. ¡Gracias!`
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
