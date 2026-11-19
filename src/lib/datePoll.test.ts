import { describe, it, expect } from "vitest";
import { preselectedOption, voteError, SAN_LUIS_2027_EMAIL_HTML } from "./datePoll";
const opts = [{ value: "enero_17_24", label: "17 al 24 de enero" }, { value: "febrero_18_21", label: "18 al 21 de febrero" }, { value: "otra", label: "Otra fecha", needs_text: true }];
describe("encuesta de fechas", () => {
  it("el enlace sólo preselecciona opciones válidas", () => {
    expect(preselectedOption(opts, "febrero_18_21")).toBe("febrero_18_21");
    expect(preselectedOption(opts, "marzo")).toBeNull();
  });
  it("otra fecha exige sugerencia", () => {
    expect(voteError(opts[2], "  ")).not.toBeNull();
    expect(voteError(opts[2], "marzo")).toBeNull();
    expect(voteError(opts[0], "")).toBeNull();
  });
  it("el correo trae un botón personal por opción", () => {
    for (const o of opts) expect(SAN_LUIS_2027_EMAIL_HTML).toContain(`{poll_url_${o.value}}`);
  });
});
