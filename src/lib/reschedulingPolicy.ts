// Plazo de reintegro tomado de la política versionada de cada campaña.
// Solo aplica a devoluciones monetarias; nunca a crédito u otras opciones.
const TIMING = /Plazo de reintegro: \d+ a \d+ días hábiles\./

export function refundTiming(choice: string | null | undefined, policyText: string | null | undefined): string | null {
  if (choice !== 'refund' || !policyText) return null
  return policyText.match(TIMING)?.[0] ?? null
}
