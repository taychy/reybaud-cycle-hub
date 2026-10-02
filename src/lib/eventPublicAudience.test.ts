import { describe, expect, it } from "vitest";
import { resolveEventPublicAudience } from "./eventPublicAudience";

describe("eventPublicAudience", () => {
  it("uses an explicit open audience", () => {
    expect(resolveEventPublicAudience({ metadata: { public_audience: "open" } })).toBe("open");
  });

  it("uses an explicit students-only audience", () => {
    expect(resolveEventPublicAudience({ metadata: { public_audience: "students_only" } })).toBe("students_only");
  });

  it("preserves the legacy active-students restriction", () => {
    expect(resolveEventPublicAudience({ metadata: { active_students_only: true } })).toBe("students_only");
  });

  it("keeps existing unconfigured public reservation pages open", () => {
    expect(resolveEventPublicAudience({ type: "camp", show_public: true, metadata: {} })).toBe("open");
    expect(resolveEventPublicAudience({ type: "otro", metadata: null })).toBe("open");
  });
});