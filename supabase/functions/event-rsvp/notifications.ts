import { sendManagedEmail } from "../_shared/send-managed-email.ts";
import {
  renderClaudioApprovalMail,
  renderRsvpAttendanceMail,
  renderRsvpLunchMail,
  rsvpReceiptWhatsAppUrl,
} from "../_shared/event-rsvp-mail.ts";
import { receiptIdempotencySeed, rsvpNotificationPlan, type RsvpNotificationKind } from "./notification-plan.ts";

const PUBLIC_ORIGIN = "https://reybaud-app.com";

type DeliveryResult = "sent" | "failed" | "not_applicable";
type Delivery = { participant: DeliveryResult; claudio: DeliveryResult };

async function digest(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

async function claudioEmail(db: any): Promise<string | null> {
  const { data, error } = await db.from("coaches").select("email").eq("estado", "activo").ilike("nombre", "Claudio");
  if (error) throw error;
  const emails: string[] = [...new Set<string>((data || []).map((row: any) => String(row.email || "").trim().toLowerCase()).filter(Boolean))];
  return emails.length === 1 ? emails[0] : null;
}

/** La respuesta ya quedó guardada: cada envío se informa sin fingir éxito ni deshacer el RSVP. */
export async function deliverRsvpNotifications(db: any, invite: any, status: any): Promise<Delivery> {
  const cyclistNames = (invite.cyclist_guests || []).map((person: any) => String(person.name || "").trim()).filter(Boolean);
  const plan = rsvpNotificationPlan({
    response: invite.response,
    participationMode: invite.participation_mode,
    cyclistNames,
    pricesConfirmed: !!status?.prices?.prices_confirmed_at,
  });
  const result: Delivery = {
    participant: plan.some((kind) => kind.startsWith("participant")) ? "failed" : "not_applicable",
    claudio: plan.includes("claudio_approval") ? "failed" : "not_applicable",
  };
  if (!plan.length) return result;

  const name = String(status?.identity?.full_name || invite.recipient_name || "").trim();
  if (!name) return result;
  const seed = await digest(receiptIdempotencySeed({
    inviteId: invite.id,
    response: invite.response,
    participationMode: invite.participation_mode,
    cyclists: invite.cyclist_guests,
    nonCyclists: invite.non_cyclist_guests,
  }));

  for (const kind of plan) {
    try {
      if (kind === "claudio_approval") {
        const to = await claudioEmail(db);
        if (!to) throw new Error("No hay un único Claudio activo con email para revisar la solicitud");
        const mail = renderClaudioApprovalMail(name, invite.cyclist_guests || []);
        const sent = await sendManagedEmail({
          to, subject: mail.subject, html: mail.content_html, supabase: db,
          label: "fondazo-cyclist-approval", idempotencyKey: `rsvp-${seed}-claudio`,
        });
        result.claudio = sent.sent ? "sent" : "failed";
        continue;
      }

      let mail: { subject: string; content_html: string };
      if (kind === "participant_lunch") {
        mail = renderRsvpLunchMail({
          name,
          responseUrl: `${PUBLIC_ORIGIN}/confirmar-asistencia/${invite.token}`,
          receiptUrl: rsvpReceiptWhatsAppUrl(name),
          adultPrice: Number(status.prices.adult_price),
          childPrice: Number(status.prices.child_4_9_price),
          under4Price: Number(status.prices.under_4_price),
        });
      } else {
        mail = renderRsvpAttendanceMail(name, cyclistNames);
      }
      const sent = await sendManagedEmail({
        to: invite.recipient_email, subject: mail.subject, html: mail.content_html, supabase: db,
        label: kind === "participant_lunch" ? "fondazo-lunch-confirmation" : "fondazo-attendance-confirmation",
        idempotencyKey: `rsvp-${seed}-${kind}`,
      });
      result.participant = sent.sent ? "sent" : "failed";
      if (sent.sent && kind === "participant_lunch" && !["comprobante_informado", "pago_verificado"].includes(invite.lunch_status)) {
        const previous = invite.lunch_status;
        const { error } = await db.from("event_rsvp_invites").update({
          lunch_status: "instrucciones_enviadas", lunch_status_changed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }).eq("id", invite.id).eq("lunch_status", previous);
        if (!error) {
          await db.from("event_rsvp_lunch_audit").insert({
            event_id: invite.event_id, invite_id: invite.id, from_status: previous, to_status: "instrucciones_enviadas",
            comment: "Sistema: proveedor aceptó el correo transaccional de confirmación e instrucciones.",
          });
        }
      }
    } catch (error) {
      console.error(`RSVP notification ${kind} failed`, error instanceof Error ? error.message : String(error));
    }
  }
  return result;
}
