import { describe, expect, it } from "vitest";
import { requiresSurveyUpdateCheck, wantsAdditionalDaySurvey, wantsFoodSurvey } from "./appUpdate";

describe("enlace personal de encuesta de jornada adicional", () => {
  it("reconoce el enlace directo sin revelar ni procesar el token", () => {
    const params = "token=ejemplo-privado&encuesta=jornada_extra";
    expect(wantsAdditionalDaySurvey(params)).toBe(true);
    expect(wantsFoodSurvey(params)).toBe(false);
    expect(requiresSurveyUpdateCheck("/viaje/mi-reserva", params)).toBe(true);
  });
  it("admite step como alias, pero no confunde gastronomía ni noche extra", () => {
    expect(wantsAdditionalDaySurvey("step=jornada_extra")).toBe(true);
    expect(wantsAdditionalDaySurvey("encuesta=gastronomia")).toBe(false);
    expect(wantsAdditionalDaySurvey("encuesta=noche_extra")).toBe(false);
    expect(wantsAdditionalDaySurvey("")).toBe(false);
    expect(requiresSurveyUpdateCheck("/", "encuesta=jornada_extra")).toBe(false);
  });
});
