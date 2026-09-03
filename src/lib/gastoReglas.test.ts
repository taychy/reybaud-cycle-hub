import { describe, it, expect } from "vitest";
import {
  matchRegla,
  resolverCategoria,
  sugerirPatron,
  matchCoachPorContraparte,
  collectorIdDeMovimiento,
  type GastoRegla,
  type GastoCategoria,
} from "./gastoReglas";

const cats: GastoCategoria[] = [
  { id: "cat-comb", nombre: "Vehiculo", activa: true, archivada_at: null },
  { id: "cat-super", nombre: "Otros", activa: true, archivada_at: null },
  { id: "cat-pend", nombre: "Por categorizar", activa: true, archivada_at: null },
  { id: "cat-off", nombre: "Vieja", activa: false, archivada_at: "2026-01-01" },
];

const reglas: GastoRegla[] = [
  { id: "r1", campo: "texto", patron: "DIESEL VP", categoria_id: "cat-comb", prioridad: 10, activa: true },
  { id: "r2", campo: "descripcion", patron: "JUMBO", categoria_id: "cat-super", prioridad: 20, activa: true },
  { id: "r3", campo: "texto", patron: "ENAUSA", categoria_id: "cat-off", prioridad: 5, activa: true },
  { id: "r4", campo: "texto", patron: "DIESEL", categoria_id: "cat-super", prioridad: 90, activa: true },
  { id: "r5", campo: "proveedor", patron: "Naturgy", categoria_id: "cat-super", prioridad: 30, activa: false },
];

describe("reglas de categorización de egresos", () => {
  it("(a) una regla automática categoriza un egreso MP real", () => {
    const r = resolverCategoria({
      reglas,
      categorias: cats,
      descripcion: "$ 195648.66 de DIESEL VP | SHOP",
    });
    expect(r.categoria_id).toBe("cat-comb");
    expect(r.origen).toBe("regla");
    expect(r.regla_id).toBe("r1");
  });

  it("gana la regla de menor prioridad numérica", () => {
    expect(matchRegla(reglas, "compra DIESEL VP", null, cats)?.id).toBe("r1");
  });

  it("ignora reglas inactivas y reglas de categorías archivadas", () => {
    expect(matchRegla(reglas, "ENAUSA SA", null, cats)).toBeNull();
    expect(matchRegla(reglas, "pago", "Naturgy", cats)).toBeNull();
  });

  it("respeta el campo evaluado", () => {
    expect(matchRegla(reglas, "JUMBO SAN MARTIN", null, cats)?.id).toBe("r2");
    expect(matchRegla(reglas, "pago", "JUMBO", cats)).toBeNull();
  });

  it("sin coincidencia cae en Por categorizar", () => {
    const r = resolverCategoria({ reglas, categorias: cats, descripcion: "Varios" });
    expect(r.categoria_id).toBe("cat-pend");
    expect(r.origen).toBe("sin_categoria");
  });

  it("(b) una corrección manual nunca se sobreescribe por reglas", () => {
    const r = resolverCategoria({
      reglas,
      categorias: cats,
      descripcion: "$ 195648.66 de DIESEL VP | SHOP",
      categoriaActualId: "cat-super",
      origenActual: "manual",
    });
    expect(r.categoria_id).toBe("cat-super");
    expect(r.origen).toBe("manual");
    expect(r.regla_id).toBeNull();
  });

  it("sugiere un patrón limpio a partir del texto MP", () => {
    expect(sugerirPatron("$ 195648.66 de DIESEL VP | SHOP")).toBe("de DIESEL VP");
    expect(sugerirPatron("Varios")).toBe("");
    expect(sugerirPatron(null)).toBe("");
  });
});

describe("matching de transferencias a profesores", () => {
  const contrapartes = [
    { coach_id: "coach-1", mp_collector_id: "8967693" },
    { coach_id: "coach-2", mp_collector_id: "404786720" },
  ];

  it("(d) match inequívoco cuando la contraparte MP está mapeada a un solo profesor", () => {
    const m = matchCoachPorContraparte("8967693", contrapartes);
    expect(m).toEqual({ estado: "inequivoco", coach_id: "coach-1" });
  });

  it("(e) match ambiguo queda para revisión, no se auto-marca", () => {
    const m = matchCoachPorContraparte("999", [
      { coach_id: "coach-1", mp_collector_id: "999" },
      { coach_id: "coach-3", mp_collector_id: "999" },
    ]);
    expect(m.estado).toBe("ambiguo");
    if (m.estado === "ambiguo") expect(m.candidatos).toHaveLength(2);
  });

  it("sin contraparte mapeada no inventa profesor", () => {
    expect(matchCoachPorContraparte("111", contrapartes)).toEqual({ estado: "sin_match" });
    expect(matchCoachPorContraparte(null, contrapartes)).toEqual({ estado: "sin_match" });
  });

  it("extrae el identificador de contraparte del movimiento MP", () => {
    expect(collectorIdDeMovimiento({ collector: { id: 8967693 } })).toBe("8967693");
    expect(collectorIdDeMovimiento({})).toBeNull();
  });
});
