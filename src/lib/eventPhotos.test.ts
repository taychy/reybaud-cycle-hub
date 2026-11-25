import { describe, expect, it } from "vitest";
import { canMarkPublishable, resolvePhotoType, validatePhotoSelection } from "./eventPhotos";

const MB = 1024 * 1024;
describe("eventPhotos", () => {
  it("rechaza archivos de más de 15 MB", () => {
    const r = validatePhotoSelection(0, [{ name: "a.jpg", type: "image/jpeg", size: 15 * MB + 1 }]);
    expect(r.accepted).toEqual([]);
  });
  it("acepta como máximo 10 fotos por envío", () => {
    const files = Array.from({ length: 4 }, (_, i) => ({ name: `${i}.jpg`, type: "image/jpeg", size: MB }));
    expect(validatePhotoSelection(8, files).accepted).toEqual([0, 1]);
  });
  it("no acepta videos y deduce HEIC por extensión", () => {
    expect(resolvePhotoType({ name: "v.mp4", type: "video/mp4" })).toBeNull();
    expect(resolvePhotoType({ name: "IMG_1.HEIC", type: "" })).toBe("image/heic");
  });
  it("sin consentimiento de difusión no se puede marcar apta para publicar", () => {
    expect(canMarkPublishable([{ publication_consent: true }, { publication_consent: false }])).toBe(false);
    expect(canMarkPublishable([{ publication_consent: true }])).toBe(true);
  });
});
