/**
 * Helpers para generar links compartibles de eventos.
 *
 * - Link público / landing: abre el detalle del evento sin requerir login
 *   (la ruta /eventos/:id ya es pública en App.tsx).
 * - Link interno alumno: lleva al alumno logueado al detalle del evento dentro
 *   del dashboard (/alumno?section=eventos&event=:id).
 *
 * Usamos `window.location.origin` para que funcione tanto en preview como en
 * el dominio de producción sin hardcodear URLs.
 */

const PROD_ORIGIN = "https://reybaud-app.com";

function getOrigin(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return PROD_ORIGIN;
}

export function getPublicEventLink(eventId: string): string {
  return `${getOrigin()}/eventos/${eventId}`;
}

export function getStudentEventLink(eventId: string): string {
  return `${getOrigin()}/alumno?section=eventos&event=${eventId}`;
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fallthrough to legacy */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
