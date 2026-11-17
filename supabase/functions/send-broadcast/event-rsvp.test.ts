import { assertEquals, assertRejects, assertStringIncludes } from "jsr:@std/assert";
import { decorateRsvpRecipients } from "./event-rsvp.ts";

const EVENT_ID = "08fc7e07-10df-4ace-b3ed-a0d581b6f7c9";
const TOKEN = "00000000-0000-0000-0000-0000000000aa";
const segment = { rsvp_event_id: EVENT_ID, rsvp_kind: "invitacion" as const };

function fakeAdmin(existing: any, writes: any[]) {
  return {
    from(table: string) {
      const query: any = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({
          data: table === "events" ? { id: EVENT_ID, metadata: { rsvp_enabled: true } } : existing,
          error: null,
        }),
        upsert: (payload: any) => {
          writes.push(payload);
          return query;
        },
        single: async () => ({ data: { token: TOKEN }, error: null }),
      };
      if (!["events", "event_rsvp_invites"].includes(table)) throw new Error(`Tabla inesperada: ${table}`);
      return query;
    },
  };
}

Deno.test("la invitación real saluda con nombre y apellido del perfil del alumno", async () => {
  const writes: any[] = [];
  const [recipient] = await decorateRsvpRecipients(fakeAdmin(null, writes), [{
    id: "alumno-1", contact_type: "alumno", email: "maria@test.local",
    nombre: "María", apellido: "Pérez", display_name: "María Pérez",
  }], segment);
  assertEquals(writes[0].recipient_name, "María Pérez");
  assertEquals(writes[0].alumno_id, "alumno-1");
  assertEquals(recipient.display_name, "María Pérez");
  assertStringIncludes(recipient.rsvp_voy_url, `/confirmar-asistencia/${TOKEN}?opcion=voy`);
});

Deno.test("un reintento conserva alumno_id y nombre ya vinculados al token", async () => {
  const writes: any[] = [];
  const existing = { alumno_id: "alumno-1", recipient_name: "María Pérez" };
  const [recipient] = await decorateRsvpRecipients(fakeAdmin(existing, writes), [{
    email: "maria@test.local", name: "Texto anterior",
  }], segment);
  assertEquals(writes[0].alumno_id, "alumno-1");
  assertEquals(writes[0].recipient_name, "María Pérez");
  assertStringIncludes(recipient.rsvp_receipt_whatsapp_url, encodeURIComponent("María Pérez"));
});

Deno.test("una invitación real sin nombre no cae en un saludo genérico o email", async () => {
  const writes: any[] = [];
  await assertRejects(
    () => decorateRsvpRecipients(fakeAdmin(null, writes), [{ email: "sin-nombre@test.local" }], segment),
    Error,
    "Falta el nombre real del perfil",
  );
  assertEquals(writes.length, 0);
});
