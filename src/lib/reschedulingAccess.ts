import type { ReschedulingCampaign } from './rescheduling';

export const PRODUCTION_ORIGIN = 'https://reybaud-app.com';

/** Personal link: identity is still verified server-side (session ownership or DNI + name + surname). */
export function personalReschedulingLink(eventId: string, reservationId: string, token: string, origin = PRODUCTION_ORIGIN) {
  const q = new URLSearchParams({ reserva: reservationId, token });
  return `${origin}/reprogramacion/${eventId}?${q}`;
}
export function maskLink(link: string) {
  return link.replace(/token=[^&]+/, 'token=••••');
}

export function choiceGroup(choice: string) {
  return choice.startsWith('attend_') ? 'attend' : choice;
}
export function mainGroups(campaign: Pick<ReschedulingCampaign, 'options'>) {
  const has = (v: string) => campaign.options.some(o => o.value === v);
  return [
    campaign.options.some(o => o.value.startsWith('attend_')) && { value: 'attend', label: 'Viajo en noviembre', hint: 'Elegís 5–8, 6–9 o 5–9 de noviembre' },
    has('refund') && { value: 'refund', label: 'No puedo viajar: pido la devolución', hint: '100% de lo efectivamente abonado, menos reintegros previos' },
    has('credit') && { value: 'credit', label: 'No puedo viajar: pido crédito para otro Training Camp', hint: 'Crédito nominal en pesos' },
    has('help') && { value: 'help', label: 'Necesito ayuda antes de elegir' },
  ].filter(Boolean) as { value: string; label: string; hint?: string }[];
}

export function identityInputValid(i: { dni: string; first: string; last: string }) {
  const dni = i.dni.replace(/\D/g, '');
  return dni.length >= 6 && dni.length <= 12 && i.first.trim().length >= 2 && i.first.length <= 100 && i.last.trim().length >= 2 && i.last.length <= 100;
}

const GUEST_KEY = (r: string) => `rs_guest_${r}`;
export function storeGuestSession(reservationId: string, session: string, expiresAt: string, storage: Storage = sessionStorage) {
  storage.setItem(GUEST_KEY(reservationId), JSON.stringify({ session, expiresAt }));
}
export function readGuestSession(reservationId: string, storage: Storage = sessionStorage, now = Date.now()) {
  try {
    const v = JSON.parse(storage.getItem(GUEST_KEY(reservationId)) ?? 'null') as { session: string; expiresAt: string } | null;
    if (!v || !/^rsg_[a-f0-9]{64}$/.test(v.session) || Date.parse(v.expiresAt) <= now) { storage.removeItem(GUEST_KEY(reservationId)); return null; }
    return v.session;
  } catch { return null; }
}

export const EMAIL_SUBJECT = 'Training Camp San Luis · Elegí cómo querés continuar';
export function emailBody(firstName: string, link: string) {
  return {
    subject: EMAIL_SUBJECT,
    text: `Hola ${firstName}:\n\nEl Training Camp San Luis se reprogramó del 5 al 9 de noviembre de 2026, en el mismo alojamiento. Queremos que elijas cómo seguir:\n\n• Viajar en noviembre (5–8, 6–9 o 5–9).\n• Pedir la devolución del 100% de lo que abonaste, menos reintegros previos.\n• Pedir un crédito en pesos para otro Training Camp.\n\nTe lleva directo a tu reserva:\n${link}\n\nElegir devolución o crédito registra tu pedido; no es un pago ya realizado. Si tenés dudas, escribinos y te ayudamos.\n\nEquipo Ciclismo Reybaud`,
    button: 'Elegir mi opción',
  };
}
export function whatsappText(firstName: string, link: string) {
  return `Hola ${firstName}, ya podés elegir cómo querés continuar con San Luis: viajar en noviembre, devolución o crédito. Ingresá acá ${link} . Te lleva directo a tu reserva. Si necesitás ayuda, escribinos.`;
}
export function whatsappUrl(phoneDigits: string, text: string) {
  return `https://wa.me/${phoneDigits}?text=${encodeURIComponent(text)}`;
}
