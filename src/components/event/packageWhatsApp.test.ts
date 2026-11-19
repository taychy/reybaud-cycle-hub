import { it, expect } from "vitest";
import { packageWhatsAppUrl } from "./EventInquiryCtas";
it("arma el enlace de WhatsApp con el título del evento codificado", () => {
  const u = packageWhatsAppUrl("Gran Fondo Montevideo");
  expect(u.startsWith("https://wa.me/5491160026623?text=")).toBe(true);
  expect(decodeURIComponent(u.split("text=")[1])).toBe("Hola, soy ciclista de Reybaud y quiero recibir información sobre el paquete completo para la carrera Gran Fondo Montevideo.");
});
