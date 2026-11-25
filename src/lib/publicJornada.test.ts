import { describe, expect, it } from "vitest";
import { jornadaFormSchema, normalizeJornadaPhone } from "./publicJornada";
describe("public attendance validation", () => {
  it("normalizes Argentine WhatsApp formats to one identity", () => {
    expect(normalizeJornadaPhone("+54 11 6002-6623")).toBe("5491160026623");
    expect(normalizeJornadaPhone("11 6002 6623")).toBe("5491160026623");
    expect(normalizeJornadaPhone("+54 9 11 6002-6623")).toBe("5491160026623");
  });
  it("requires first name, surname and valid phone even for no-voy", () => {
    const valid = { first_name: "Ana", last_name: "QA", phone: "+54 9 11 60026623", response: "no_voy" };
    expect(jornadaFormSchema.safeParse(valid).success).toBe(true);
    expect(jornadaFormSchema.safeParse({ ...valid, last_name: " " }).success).toBe(false);
    expect(jornadaFormSchema.safeParse({ ...valid, phone: "123" }).success).toBe(false);
    expect(jornadaFormSchema.safeParse({ ...valid, phone: "abc5491160026623" }).success).toBe(false);
  });
});