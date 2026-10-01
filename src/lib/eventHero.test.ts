import { describe, expect, it } from "vitest";
import { normalizeHeroImages, resolveEventHero } from "./eventHero";

describe("eventHero", () => {
  it("conserva la imagen única actual cuando no hay configuración", () => {
    expect(resolveEventHero("main.jpg", {}, "fallback.jpg")).toEqual({
      mode: "single",
      images: ["main.jpg"],
      fit: "cover",
      autoplay: false,
      displayStyle: "standard",
    });
  });

  it("usa fallback aunque carousel tenga menos de dos imágenes", () => {
    expect(resolveEventHero("main.jpg", { hero_mode: "carousel", hero_images: ["one.jpg"] }, "fallback.jpg")).toMatchObject({
      mode: "single",
      images: ["main.jpg"],
    });
  });

  it("activa carrusel, contain y autoplay con dos imágenes válidas", () => {
    expect(resolveEventHero("main.jpg", {
      hero_mode: "carousel",
      hero_images: [" first.jpg ", "second.jpg"],
      hero_image_fit: "contain",
      hero_autoplay: true,
    }, "fallback.jpg")).toEqual({
      mode: "carousel",
      images: ["first.jpg", "second.jpg"],
      fit: "contain",
      autoplay: true,
      displayStyle: "standard",
    });
  });

  it("resuelve la presentación completa con fondo suave desde metadata", () => {
    expect(resolveEventHero("main.jpg", {
      hero_mode: "carousel",
      hero_images: ["one.jpg", "two.jpg"],
      hero_display_style: "contain_blur_background",
    }, "fallback.jpg")).toMatchObject({
      mode: "carousel",
      displayStyle: "contain_blur_background",
    });
  });

  it("descarta valores inválidos, vacíos y duplicados", () => {
    expect(normalizeHeroImages(["a.jpg", "", null, "a.jpg", " b.jpg "])).toEqual(["a.jpg", "b.jpg"]);
  });
});