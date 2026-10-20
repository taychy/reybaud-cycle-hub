/** Policy comes from the campaign, never impose a San Luis deadline on other trips. */
export function refundTiming(choice: string, policyText: string): string | null {
  if (choice !== 'refund') return null;
  return policyText.match(/Plazo de reintegro: de \d+ a \d+ días\./)?.[0] ?? null;
}