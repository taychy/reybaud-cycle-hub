// Bitácora única de avisos de Turnera: una fila por reserva + tipo + canal.
// Idempotencia real vía UNIQUE(idempotency_key).

export type Canal = "email" | "whatsapp";
export type Estado = "scheduled" | "queued" | "sent" | "error" | "skipped";

export const notifKey = (reservaId: string, tipo: string, canal: Canal) =>
  `turnera-${tipo}-${canal}-${reservaId}`;

/**
 * Reserva el envío. Devuelve `false` si ya existe una fila terminal
 * (queued/sent) — evita duplicar mensajes ante reintentos del cron.
 */
export async function claimNotification(
  supabase: any,
  args: { reservaId: string; tipo: string; canal: Canal; destinatario: string; scheduledFor?: string | null },
): Promise<{ claimed: boolean; key: string }> {
  const key = notifKey(args.reservaId, args.tipo, args.canal);
  const { error } = await supabase.from("turnera_notificaciones").insert({
    reserva_id: args.reservaId,
    tipo: args.tipo,
    canal: args.canal,
    destinatario: args.destinatario || "",
    estado: "scheduled",
    idempotency_key: key,
    scheduled_for: args.scheduledFor ?? null,
  });

  if (!error) return { claimed: true, key };
  if (error.code !== "23505") throw error;

  // Ya existe: sólo se re-intenta si quedó en scheduled o error.
  const { data } = await supabase
    .from("turnera_notificaciones").select("estado").eq("idempotency_key", key).maybeSingle();
  const estado = data?.estado as Estado | undefined;
  return { claimed: estado === "scheduled" || estado === "error", key };
}

export async function markNotification(
  supabase: any,
  key: string,
  patch: {
    estado: Estado;
    provider?: string;
    provider_message_id?: string | null;
    error_code?: string | null;
    error_message?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  const now = new Date().toISOString();
  const row: Record<string, unknown> = { ...patch };
  if (patch.estado === "queued") row.queued_at = now;
  if (patch.estado === "sent") row.sent_at = now;
  if (patch.estado === "error") row.failed_at = now;
  await supabase.from("turnera_notificaciones").update(row).eq("idempotency_key", key);
}

/** Registra un canal deliberadamente no ejecutado (apagado / sin datos / sin config). */
export async function skipNotification(
  supabase: any,
  args: { reservaId: string; tipo: string; canal: Canal; destinatario?: string; motivo: string },
) {
  const key = notifKey(args.reservaId, args.tipo, args.canal);
  await supabase.from("turnera_notificaciones").upsert(
    {
      reserva_id: args.reservaId,
      tipo: args.tipo,
      canal: args.canal,
      destinatario: args.destinatario || "",
      estado: "skipped",
      idempotency_key: key,
      error_message: args.motivo,
    },
    { onConflict: "idempotency_key", ignoreDuplicates: true },
  );
}
