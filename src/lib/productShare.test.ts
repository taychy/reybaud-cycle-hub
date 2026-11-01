import { describe, it, expect } from "vitest";
import { shareOrigin, productShareUrl, whatsappShareUrl, productShareText } from "./productShare";

describe("productShare", () => {
  it("usa el dominio canónico en producción", () => {
    expect(shareOrigin("reybaud.lovable.app", "https://reybaud.lovable.app")).toBe("https://reybaud-app.com");
    expect(shareOrigin("www.reybaud-app.com", "https://www.reybaud-app.com")).toBe("https://reybaud-app.com");
  });
  it("respeta el entorno de vista previa", () => {
    expect(shareOrigin("id-preview--x.lovable.app", "https://id-preview--x.lovable.app")).toBe("https://id-preview--x.lovable.app");
  });
  it("URL del producto sin parámetros", () => {
    expect(productShareUrl("abc-1", "https://reybaud-app.com")).toBe("https://reybaud-app.com/tienda/producto/abc-1");
  });
  it("WhatsApp sin destinatario fijo", () => {
    const u = whatsappShareUrl(productShareText("Jersey"), "https://reybaud-app.com/tienda/producto/1");
    expect(u.startsWith("https://wa.me/?text=")).toBe(true);
    expect(decodeURIComponent(u)).toContain("Jersey");
  });
});
