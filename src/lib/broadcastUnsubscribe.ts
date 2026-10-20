/**
 * Valida el formato del token de baja de mailing (64 hex, crudo).
 * El servidor vuelve a validar; esto solo evita llamadas con basura.
 */
export function isValidUnsubscribeToken(token: string | null | undefined): boolean {
  return typeof token === "string" && /^[a-f0-9]{64}$/.test(token);
}
