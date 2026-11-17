import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { rsvpNotificationPlan, receiptIdempotencySeed } from "./notification-plan.ts";
import { renderRsvpLunchMail, rsvpReceiptWhatsAppUrl, FONDAZO_POLICY_TEXT } from "../_shared/event-rsvp-mail.ts";

Deno.test("VOY sin invitados con parrilla prepara confirmación y pago inmediato", () => {
  assertEquals(rsvpNotificationPlan({ response: "voy", participationMode: "fondo_y_almuerzo", cyclistNames: [], pricesConfirmed: true }), ["participant_lunch"]);
});

Deno.test("VOY solo fondo confirma sin correo de pago y NO VOY no genera avisos ni cobros", () => {
  assertEquals(rsvpNotificationPlan({ response: "voy", participationMode: "solo_fondo", cyclistNames: [], pricesConfirmed: true }), ["participant_confirmation"]);
  assertEquals(rsvpNotificationPlan({ response: "no_voy", participationMode: null, cyclistNames: [], pricesConfirmed: true }), []);
});

Deno.test("amigos ciclistas agregan revisión de Claudio sin convertirse en inscripción", () => {
  assertEquals(rsvpNotificationPlan({ response: "voy", participationMode: "fondo_y_almuerzo", cyclistNames: ["Amigo Real"], pricesConfirmed: true }), ["participant_lunch", "claudio_approval"]);
});

Deno.test("el mismo cambio conserva idempotencia y un cambio real la renueva", () => {
  const base = { inviteId: "invite", response: "voy", participationMode: "solo_fondo", cyclists: [], nonCyclists: [] };
  assertEquals(receiptIdempotencySeed(base), receiptIdempotencySeed({ ...base }));
  assertEquals(receiptIdempotencySeed(base) === receiptIdempotencySeed({ ...base, response: "no_voy", participationMode: null }), false);
});

Deno.test("correo real usa botón Gmail, nombre real, alias, WhatsApp de Scarlett y política 27/11", () => {
  const name = "María Pérez";
  const url = rsvpReceiptWhatsAppUrl(name);
  const mail = renderRsvpLunchMail({ name, responseUrl: "https://reybaud-app.com/confirmar-asistencia/token", receiptUrl: url, adultPrice: 40000, childPrice: 20000, under4Price: 0 });
  assertStringIncludes(mail.content_html, ">Enviar comprobante por WhatsApp</a>");
  assertStringIncludes(mail.content_html, "Hola, soy María Pérez. Te envío el comprobante del almuerzo del Fondazo de Reybaud del 29/11.".replaceAll(" ", "%20"));
  assertStringIncludes(mail.content_html, "Lacarretadelgato");
  assertStringIncludes(mail.content_html, "+54 9 11 7171-1122");
  assertStringIncludes(mail.content_html, "No es el WhatsApp del restaurante");
  assertStringIncludes(mail.content_html, "$40.000");
  assertStringIncludes(mail.content_html, "Bebidas aparte");
  assertStringIncludes(mail.content_html, "viernes 27/11/2026");
  assertStringIncludes(FONDAZO_POLICY_TEXT, "Después de esa fecha no hay reembolso");
});
