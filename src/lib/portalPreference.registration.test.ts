import { describe, expect, it, vi } from "vitest";
import { getAvailablePortals } from "./portalPreference";

const m = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: m.rpc } }));

describe("Portal del alumno vinculado", () => {
  it("acepta una ficha canónica aunque su user_id principal sea otro", async () => {
    m.rpc.mockImplementation(async (name: string) => ({
      data: name === "current_alumno_id" ? "alumno-canonico" : false,
      error: null,
    }));

    const portals = await getAvailablePortals("identidad-secundaria");
    expect(portals).toEqual(["alumno"]);
    expect(m.rpc).toHaveBeenCalledWith("current_alumno_id");
  });

  it("no inventa acceso si el servidor no resuelve ninguna ficha", async () => {
    m.rpc.mockResolvedValue({ data: null, error: null });
    expect(await getAvailablePortals("identidad-sin-ficha")).toEqual([]);
  });
});
