// Compartir productos de la tienda: URL canónica sin estado ni parámetros efímeros.
export const PRODUCTION_ORIGIN = "https://reybaud-app.com";

const PRODUCTION_HOSTS = ["reybaud-app.com", "www.reybaud-app.com", "reybaud.lovable.app"];

export function shareOrigin(hostname?: string, origin?: string): string {
  const host = hostname ?? (typeof window !== "undefined" ? window.location.hostname : "");
  const org = origin ?? (typeof window !== "undefined" ? window.location.origin : PRODUCTION_ORIGIN);
  if (!host || PRODUCTION_HOSTS.includes(host)) return PRODUCTION_ORIGIN;
  return org; // preview / local: respetar el entorno
}

export function productShareUrl(productId: string, origin = shareOrigin()): string {
  return `${origin.replace(/\/+$/, "")}/tienda/producto/${encodeURIComponent(productId)}`;
}

export function productShareText(name: string): string {
  return `Mirá "${name.trim()}" en la tienda de Reybaud`;
}

/** WhatsApp sin destinatario fijo: el usuario elige a quién enviarlo. */
export function whatsappShareUrl(text: string, url: string): string {
  return `https://wa.me/?text=${encodeURIComponent(`${text}: ${url}`)}`;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fallback */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
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

/** Devuelve "shared" | "cancelled" | "unsupported". */
export async function tryNativeShare(data: { title: string; text: string; url: string }): Promise<"shared" | "cancelled" | "unsupported"> {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") return "unsupported";
  if (typeof navigator.canShare === "function" && !navigator.canShare(data)) return "unsupported";
  try {
    await navigator.share(data);
    return "shared";
  } catch (e: any) {
    return e?.name === "AbortError" ? "cancelled" : "unsupported";
  }
}
