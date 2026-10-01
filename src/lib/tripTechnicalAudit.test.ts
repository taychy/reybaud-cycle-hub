import { describe, it, expect } from "vitest";
import { auditProgress, AUDIT_SECTIONS, itemKey } from "./tripTechnicalAudit";

describe("tripTechnicalAudit", () => {
  it("cuenta OK / Error / Pendiente", () => {
    const s = AUDIT_SECTIONS[0];
    const r = auditProgress({
      [itemKey(s.id, s.items[0].id)]: { status: "ok" },
      [itemKey(s.id, s.items[1].id)]: { status: "error" },
    });
    expect(r.ok).toBe(1);
    expect(r.error).toBe(1);
    expect(r.pendiente).toBe(r.total - 2);
  });
  it("vacío = 0%", () => expect(auditProgress({}).pct).toBe(0));
});
