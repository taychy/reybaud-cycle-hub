import { z } from 'zod';

export const nativePreflightSchema = z.object({
  ok: z.literal(true),
  can_prepare: z.boolean(),
  converted: z.boolean(),
  reservation_count: z.number().int().nonnegative(),
  blockers: z.array(z.string()),
  payment_enabled: z.literal(false),
});
export type NativePreflight = z.infer<typeof nativePreflightSchema>;

/** Admin-reviewed individual contacts, not the shared email of a group request. */
export function nativeParticipantEmails(emails: string[], peopleCount: number): string[] {
  const result = z.array(z.string().trim().email()).length(peopleCount).parse(emails).map(e => e.toLowerCase());
  if (new Set(result).size !== result.length) throw new Error('Cada persona necesita un contacto individual distinto.');
  return result;
}