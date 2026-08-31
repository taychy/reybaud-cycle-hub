/**
 * Helpers para mostrar errores reales al usuario en vez de mensajes genéricos.
 *
 * `supabase.functions.invoke` devuelve "Edge Function returned a non-2xx status code"
 * y deja la respuesta HTTP en `error.context`; ahí está el JSON `{ error: "..." }`.
 */
export async function edgeFunctionErrorMessage(
  error: unknown,
  data?: { error?: string } | null,
): Promise<string> {
  if (data?.error) return data.error;
  const ctx = (error as { context?: unknown } | null)?.context as Response | undefined;
  if (ctx && typeof (ctx as Response).text === "function") {
    try {
      const raw = await (ctx as Response).clone().text();
      try {
        const parsed = JSON.parse(raw);
        if (parsed?.error) return String(parsed.error);
        if (parsed?.message) return String(parsed.message);
      } catch {
        if (raw?.trim()) return raw.trim().slice(0, 300);
      }
    } catch {
      /* ignorar: nos quedamos con el mensaje genérico */
    }
  }
  return (error as { message?: string } | null)?.message || "Error inesperado";
}

/** Mensaje legible de un error de RPC de Postgres (PostgrestError o Error). */
export function rpcErrorMessage(error: unknown, fallback = "No se pudo completar la operación"): string {
  if (!error) return fallback;
  const e = error as { message?: string; details?: string; hint?: string };
  const msg = e.message?.trim();
  if (msg) return e.details && e.details !== msg ? `${msg} (${e.details})` : msg;
  if (e.details) return e.details;
  return fallback;
}
