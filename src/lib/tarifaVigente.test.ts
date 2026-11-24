import { describe, it, expect } from "vitest";
import { withTarifaVigente } from "./tarifaVigente";

describe("withTarifaVigente", () => {
  const planes = [{ id: "grupal", precio: 68775 }, { id: "cr", precio: 60000 }];
  it("diciembre: muestra la tarifa nueva", () => {
    expect(withTarifaVigente(planes, { grupal: 73500, cr: 60000 })[0].precio).toBe(73500);
  });
  it("plan excluido conserva su precio", () => {
    expect(withTarifaVigente(planes, { grupal: 73500, cr: 60000 })[1].precio).toBe(60000);
  });
  it("sin tarifa resuelta usa catálogo", () => {
    expect(withTarifaVigente(planes, {})[0].precio).toBe(68775);
  });
});
