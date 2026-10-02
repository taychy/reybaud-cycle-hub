export type EventPublicAudience = "open" | "students_only";

interface EventAudienceSource {
  type?: string | null;
  show_public?: boolean | null;
  metadata?: Record<string, unknown> | null;
}

export function resolveEventPublicAudience(event: EventAudienceSource): EventPublicAudience {
  const configured = event.metadata?.public_audience;

  if (configured === "open" || configured === "students_only") {
    return configured;
  }

  if (event.metadata?.active_students_only === true) {
    return "students_only";
  }

  // Preserve the historical public reservation flow when no audience was configured.
  return "open";
}