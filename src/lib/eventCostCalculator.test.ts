import { describe, it, expect } from "vitest";
import { calcularSimulacion, type CostItem, type Modalidad, type Supuestos } from "./eventCostCalculator";

const sup: Supuestos = {
  tc_usd: 1, tc_eur: 1, pct_imprevistos: 0, pct_margen_objetivo: 0, moneda_base: "ARS",
};

const mods: Modalidad[] = [
  { key: "ind", label: "Individual", esperados: 2 },
  { key: "dob", label: "Doble", esperados: 4 },
];

const base = (over: Partial<CostItem>): CostItem => ({
  categoria: "otros", descripcion: "", cantidad: 1, precio_unitario: 0,
  moneda: "ARS", es_por_persona: false, aplica_a_modalidades: [], ...over,
});

describe("eventCostCalculator alojamiento", () => {
  it("imputa habitacion_noche sólo al paquete elegido", () => {
    const items: CostItem[] = [
      base({
        categoria: "alojamiento", precio_unitario: 100,
        detalle: { package_id: "ind", cost_basis: "habitacion_noche", habitaciones: 2, noches: 3 },
      }),
    ];
    const r = calcularSimulacion(items, mods, sup);
    expect(r.costo_por_modalidad.ind).toBe(600);
    expect(r.costo_por_modalidad.dob).toBe(0);
    expect(r.costos_fijos).toBe(600);
    expect(r.por_categoria.alojamiento).toBe(600);
  });

  it("individual y doble no se mezclan y dan precios sugeridos distintos", () => {
    const items: CostItem[] = [
      base({ categoria: "alojamiento", precio_unitario: 100,
        detalle: { package_id: "ind", cost_basis: "habitacion_noche", habitaciones: 2, noches: 2 } }),
      base({ categoria: "alojamiento", precio_unitario: 60,
        detalle: { package_id: "dob", cost_basis: "habitacion_noche", habitaciones: 2, noches: 2 } }),
    ];
    const r = calcularSimulacion(items, mods, sup);
    expect(r.costo_por_modalidad.ind).toBe(400);
    expect(r.costo_por_modalidad.dob).toBe(240);
    // costo unitario: ind 400/2 = 200 ; dob 240/4 = 60
    expect(r.precio_sugerido_por_modalidad.ind).toBe(200);
    expect(r.precio_sugerido_por_modalidad.dob).toBe(60);
  });

  it("persona_noche usa participantes esperados del paquete y es variable", () => {
    const items: CostItem[] = [
      base({ categoria: "alojamiento", precio_unitario: 10,
        detalle: { package_id: "dob", cost_basis: "persona_noche", noches: 5 } }),
    ];
    const r = calcularSimulacion(items, mods, sup);
    expect(r.costo_por_modalidad.dob).toBe(200); // 4 pax * 5 noches * 10
    expect(r.costo_por_modalidad.ind).toBe(0);
    expect(r.costos_variables).toBe(200);
  });

  it("persona_estadia no multiplica por noches y sólo afecta a su paquete", () => {
    const mods10: Modalidad[] = [
      { key: "ind", label: "Individual", esperados: 3 },
      { key: "dob", label: "Doble", esperados: 10 },
    ];
    const items: CostItem[] = [
      base({ categoria: "alojamiento", precio_unitario: 799,
        detalle: { package_id: "dob", cost_basis: "persona_estadia", noches: 7 } }),
    ];
    const r = calcularSimulacion(items, mods10, sup);
    expect(r.costo_por_modalidad.dob).toBe(7990);
    expect(r.costo_por_modalidad.ind).toBe(0);
    expect(r.costos_variables).toBe(7990);
    expect(r.por_categoria.alojamiento).toBe(7990);
  });

  it("individual y doble con persona_estadia conservan costos unitarios distintos", () => {
    const items: CostItem[] = [
      base({ categoria: "alojamiento", precio_unitario: 1200,
        detalle: { package_id: "ind", cost_basis: "persona_estadia" } }),
      base({ categoria: "alojamiento", precio_unitario: 799,
        detalle: { package_id: "dob", cost_basis: "persona_estadia" } }),
    ];
    const r = calcularSimulacion(items, mods, sup);
    expect(r.costo_por_modalidad.ind).toBe(2400); // 2 pax * 1200
    expect(r.costo_por_modalidad.dob).toBe(3196); // 4 pax * 799
    expect(r.precio_sugerido_por_modalidad.ind).toBe(1200);
    expect(r.precio_sugerido_por_modalidad.dob).toBe(799);
    expect(r.costos_variables).toBe(5596);
    expect(r.costos_fijos).toBe(0);
  });

  it("persona_estadia combinado con un costo fijo general suma el mismo prorrateo por persona", () => {
    const items: CostItem[] = [
      base({ categoria: "alojamiento", precio_unitario: 799,
        detalle: { package_id: "dob", cost_basis: "persona_estadia" } }),
      base({ categoria: "transporte", cantidad: 1, precio_unitario: 600 }),
    ];
    const r = calcularSimulacion(items, mods, sup);
    // fijo 600 sobre 6 esperados => 100 por persona
    expect(r.costo_por_modalidad.ind).toBe(200);
    expect(r.costo_por_modalidad.dob).toBe(3196 + 400);
    expect(r.precio_sugerido_por_modalidad.ind).toBe(100);
    expect(r.precio_sugerido_por_modalidad.dob).toBe(899);
    expect(r.costos_fijos).toBe(600);
    expect(r.costos_variables).toBe(3196);
  });


  it("total contratado se imputa completo a un solo paquete", () => {
    const items: CostItem[] = [
      base({ categoria: "alojamiento", cantidad: 1, precio_unitario: 5000,
        detalle: { package_id: "ind", cost_basis: "total" } }),
    ];
    const r = calcularSimulacion(items, mods, sup);
    expect(r.costo_por_modalidad.ind).toBe(5000);
    expect(r.costo_por_modalidad.dob).toBe(0);
  });

  it("costo general compartido sigue prorrateándose por esperados", () => {
    const items: CostItem[] = [
      base({ categoria: "transporte", cantidad: 1, precio_unitario: 600 }),
    ];
    const r = calcularSimulacion(items, mods, sup);
    expect(r.costo_por_modalidad.ind).toBe(200); // 2/6
    expect(r.costo_por_modalidad.dob).toBe(400); // 4/6
  });

  it("filas viejas de alojamiento sin detalle mantienen comportamiento previo", () => {
    const items: CostItem[] = [
      base({ categoria: "alojamiento", cantidad: 1, precio_unitario: 600 }),
    ];
    const r = calcularSimulacion(items, mods, sup);
    expect(r.costo_por_modalidad.ind).toBe(200);
    expect(r.costo_por_modalidad.dob).toBe(400);
  });
});

describe("escenarios de inscripción (prorrateo general)", () => {
  const supEsc = (n?: number): Supuestos => ({ ...sup, participantes_prorrateo: n });

  it("costo fijo general 600 con escenario 10 => 60 por persona en todos los paquetes", () => {
    const items: CostItem[] = [base({ categoria: "transporte", cantidad: 1, precio_unitario: 600 })];
    const r = calcularSimulacion(items, mods, supEsc(10));
    expect(r.precio_sugerido_por_modalidad.ind).toBe(60);
    expect(r.precio_sugerido_por_modalidad.dob).toBe(60);
    expect(r.costos_generales_prorrateables).toBe(600);
    expect(r.prorrateo_general_por_persona).toBe(60);
  });

  it("escenario 20 => 30 por persona", () => {
    const items: CostItem[] = [base({ categoria: "transporte", cantidad: 1, precio_unitario: 600 })];
    const r = calcularSimulacion(items, mods, supEsc(20));
    expect(r.precio_sugerido_por_modalidad.ind).toBe(30);
    expect(r.precio_sugerido_por_modalidad.dob).toBe(30);
    expect(r.prorrateo_general_por_persona).toBe(30);
  });

  it("es_por_persona=true es directo y no cambia con el escenario", () => {
    const items: CostItem[] = [
      base({ categoria: "servicios", cantidad: 1, precio_unitario: 50, es_por_persona: true }),
    ];
    const a = calcularSimulacion(items, mods, supEsc(10));
    const b = calcularSimulacion(items, mods, supEsc(20));
    expect(a.precio_sugerido_por_modalidad.ind).toBe(50);
    expect(b.precio_sugerido_por_modalidad.ind).toBe(50);
    expect(b.precio_sugerido_por_modalidad.dob).toBe(50);
    expect(b.costos_generales_prorrateables).toBe(0);
  });

  it("alojamiento persona_estadia sigue exclusivo por paquete y no cambia con el escenario", () => {
    const items: CostItem[] = [
      base({ categoria: "alojamiento", precio_unitario: 799,
        detalle: { package_id: "dob", cost_basis: "persona_estadia" } }),
    ];
    const a = calcularSimulacion(items, mods, supEsc(10));
    const b = calcularSimulacion(items, mods, supEsc(20));
    expect(a.costo_por_modalidad.dob).toBe(3196);
    expect(b.costo_por_modalidad.dob).toBe(3196);
    expect(b.costo_por_modalidad.ind).toBe(0);
    expect(b.costos_generales_prorrateables).toBe(0);
  });

  it("combina alojamiento propio + variable por persona + general prorrateado", () => {
    const items: CostItem[] = [
      base({ categoria: "alojamiento", precio_unitario: 1200,
        detalle: { package_id: "ind", cost_basis: "persona_estadia" } }),
      base({ categoria: "alojamiento", precio_unitario: 799,
        detalle: { package_id: "dob", cost_basis: "persona_estadia" } }),
      base({ categoria: "servicios", cantidad: 1, precio_unitario: 50, es_por_persona: true }),
      base({ categoria: "transporte", cantidad: 1, precio_unitario: 6000 }),
    ];
    const r = calcularSimulacion(items, mods, supEsc(15));
    // general: 6000/15 = 400 por persona para todos
    expect(r.prorrateo_general_por_persona).toBe(400);
    expect(r.precio_sugerido_por_modalidad.ind).toBe(1200 + 50 + 400);
    expect(r.precio_sugerido_por_modalidad.dob).toBe(799 + 50 + 400);
  });

  it("sin participantes_prorrateo conserva el comportamiento anterior", () => {
    const items: CostItem[] = [base({ categoria: "transporte", cantidad: 1, precio_unitario: 600 })];
    const r = calcularSimulacion(items, mods, sup);
    expect(r.costo_por_modalidad.ind).toBe(200);
    expect(r.costo_por_modalidad.dob).toBe(400);
  });
});
