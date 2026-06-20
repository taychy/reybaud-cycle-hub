/**
 * Plantillas de mensajes WhatsApp manuales para recordatorios de cuotas.
 *
 * Etapa 1: el admin clickea un botón y se abre wa.me con el texto preformateado.
 * No requiere proveedor.
 */

import { formatPrice } from "@/lib/currency";

export type WAReminderKind = "proxima" | "hoy" | "vencida" | "parcial";

export interface WAReminderInput {
  alumnoNombre: string;
  eventoNombre: string;
  cuotaNumero: number;
  cuotaDescripcion?: string | null;
  monto: number;
  saldoPendiente?: number;
  currency: string;
  fechaVencimiento: string; // YYYY-MM-DD
  diasOffset: number;       // negativo = falta, 0 = hoy, positivo = vencida
  linkPago?: string | null;
}

function formatDateAR(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function buildReminderMessage(kind: WAReminderKind, input: WAReminderInput): string {
  const venc = formatDateAR(input.fechaVencimiento);
  const monto = formatPrice(input.monto, input.currency as any);
  const saldo = input.saldoPendiente != null ? formatPrice(input.saldoPendiente, input.currency as any) : monto;
  const cuotaLabel = input.cuotaDescripcion || `Cuota ${input.cuotaNumero}`;
  const link = input.linkPago ? `\n\nLink de pago: ${input.linkPago}` : "";

  switch (kind) {
    case "proxima":
      return `Hola ${input.alumnoNombre}, te recuerdo que el ${venc} vence ${cuotaLabel} del ${input.eventoNombre} (${monto}). ¡Avisame si necesitás ayuda! 🚴${link}`;
    case "hoy":
      return `Hola ${input.alumnoNombre}, hoy vence ${cuotaLabel} del ${input.eventoNombre} por ${monto}. ¿Podés confirmar el pago? ¡Gracias!${link}`;
    case "parcial":
      return `Hola ${input.alumnoNombre}, gracias por el pago parcial. Te queda un saldo de ${saldo} sobre ${cuotaLabel} (${input.eventoNombre}), vencía el ${venc}. ¿Cuándo podemos coordinar el resto?${link}`;
    case "vencida":
      return `Hola ${input.alumnoNombre}, ${cuotaLabel} del ${input.eventoNombre} (${monto}) venció el ${venc} (hace ${input.diasOffset} día${input.diasOffset === 1 ? "" : "s"}). ¿Podemos resolverlo? Estamos para ayudarte.${link}`;
  }
}

export function waLink(telefono: string, mensaje: string): string {
  // Normaliza teléfono argentino: agrega 549 si falta
  let phone = telefono.replace(/[^\d]/g, "");
  if (!phone.startsWith("54")) phone = "549" + phone.replace(/^0+/, "");
  else if (phone.startsWith("54") && !phone.startsWith("549")) phone = "549" + phone.slice(2);
  return `https://wa.me/${phone}?text=${encodeURIComponent(mensaje)}`;
}
