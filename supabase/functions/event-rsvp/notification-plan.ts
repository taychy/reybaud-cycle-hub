export type RsvpNotificationKind = "participant_lunch" | "participant_confirmation" | "claudio_approval";

export type RsvpNotificationState = {
  response: "voy" | "no_voy";
  participationMode: "fondo_y_almuerzo" | "solo_fondo" | "solo_almuerzo" | null;
  cyclistNames: string[];
  pricesConfirmed: boolean;
};

/** Decide avisos transaccionales; nunca crea pagos, cargos ni aprobaciones. */
export function rsvpNotificationPlan(state: RsvpNotificationState): RsvpNotificationKind[] {
  if (state.response === "no_voy") return [];
  const includesLunch = state.participationMode === "fondo_y_almuerzo" || state.participationMode === "solo_almuerzo";
  const plan: RsvpNotificationKind[] = [
    includesLunch && state.pricesConfirmed ? "participant_lunch" : "participant_confirmation",
  ];
  if (state.cyclistNames.length) plan.push("claudio_approval");
  return plan;
}

export function receiptIdempotencySeed(input: {
  inviteId: string;
  response: string;
  participationMode: string | null;
  cyclists: unknown;
  nonCyclists: unknown;
}): string {
  return JSON.stringify([
    input.inviteId,
    input.response,
    input.participationMode,
    input.cyclists,
    input.nonCyclists,
  ]);
}
