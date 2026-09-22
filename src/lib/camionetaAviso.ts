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

export interface AvisoItemLike {
  product_name?: string | null;
  producto?: string | null;
  variant_selection?: unknown;
  variante?: unknown;
  quantity?: number | string | null;
  cantidad?: number | string | null;
}

const varianteBreve = (variante: unknown): string => {
  if (!variante) return "";
  if (typeof variante === "object") {
    return Object.values(variante as Record<string, unknown>)
      .filter((valor) => valor !== null && valor !== undefined && String(valor).trim())
      .map((valor) => String(valor).trim())
      .join(" · ");
  }
  return String(variante)
    .split(/\s*[·,|]\s*/)
    .map((parte) => parte.replace(/^[^:]+:\s*/, "").trim())
    .filter(Boolean)
    .join(" · ");
};

/** Devuelve “pedido #81 — Campera · L + 2 productos más”, con fallbacks seguros. */
export const buildAvisoPedidoReferencia = (
  orderNumber?: number | string | null,
  items: AvisoItemLike[] = [],
): string => {
  const numero = orderNumber !== null && orderNumber !== undefined && String(orderNumber).trim()
    ? `pedido #${String(orderNumber).trim()}`
    : "pedido";
  const primero = items[0];
  const producto = String(primero?.product_name || primero?.producto || "").trim();
  if (!producto) return orderNumber !== null && orderNumber !== undefined && String(orderNumber).trim() ? numero : "tu pedido";

  const variante = varianteBreve(primero?.variant_selection ?? primero?.variante);
  const cantidad = Number(primero?.quantity ?? primero?.cantidad ?? 0);
  const detalle = `${producto}${variante ? ` · ${variante}` : ""}${cantidad > 1 ? ` ×${cantidad}` : ""}`;
  const restantes = items.length - 1;
  const otros = restantes > 0 ? ` + ${restantes} producto${restantes === 1 ? "" : "s"} más` : "";
  return `${numero} — ${detalle}${otros}`;
};

/**
 * Mensaje del aviso.
 * - `saldo` es el saldo pendiente REAL del pedido (viene de get_store_orders_saldo).
 * - El texto de sobre + buzón es exclusivo de "Efectivo pendiente".
 */
export const buildAvisoCamionetaMessage = (
  nombre: string,
  o: AvisoOrderLike,
  saldo: number,
  referencia?: string,
): string => {
  const n = (nombre || "").trim() || "cliente";
  const estado = getPaymentState(o);
  const pendiente = Math.max(Number(saldo || 0), 0);
  const pedido = (referencia || "tu pedido").trim();
  const sujeto = pedido.toLowerCase().startsWith("tu ") ? pedido : `tu ${pedido}`;

  if (estado === "pagado" || pendiente <= 0) {
    return `Hola, ${n}. ${sujeto.charAt(0).toUpperCase()}${sujeto.slice(1)} ya está en la camioneta para que puedas retirarlo.`;
  }

  const importe = formatPrice(pendiente, (o.currency || "ARS") as any);

  if (estado === "efectivo_pendiente") {
    return (
      `Hola, ${n}. ${sujeto.charAt(0).toUpperCase()}${sujeto.slice(1)} ya está en la camioneta. ` +
      `Queda pendiente el pago de ${importe}. ` +
      `Tenés un sobre identificado para colocar el dinero; luego depositalo en el buzón ` +
      `ubicado entre los asientos delanteros de la camioneta. ¡Gracias!`
    );
  }

  // Pendiente por otro medio: no corresponde el sobre/buzón.
  return (
    `Hola, ${n}. ${sujeto.charAt(0).toUpperCase()}${sujeto.slice(1)} ya está en la camioneta para que puedas retirarlo. ` +
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
