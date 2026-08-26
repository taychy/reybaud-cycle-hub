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

describe("modalidades sin participantes esperados", () => {
  const modsCero: Modalidad[] = [
    { key: "ind", label: "Individual", esperados: 0 },
    { key: "dob", label: "Doble", esperados: 4 },
  ];

  it("no inventa costo unitario ni precio sugerido con 0 esperados", () => {
    const items: CostItem[] = [
      base({ categoria: "alojamiento", precio_unitario: 500,
        detalle: { package_id: "ind", cost_basis: "habitacion_noche", habitaciones: 2, noches: 3 } }),
    ];
    const r = calcularSimulacion(items, modsCero, { ...sup, pct_margen_objetivo: 30 });
    expect(r.costo_unitario_por_modalidad.ind).toBeNull();
    expect(r.precio_sugerido_por_modalidad.ind).toBe(0);
    expect(r.ganancia_unitaria_por_modalidad.ind).toBeNull();
    // el costo total de la línea sigue existiendo, sólo no es unitario
    expect(r.costo_por_modalidad.ind).toBe(3000);
  });

  it("las modalidades con esperados > 0 sí calculan costo unitario", () => {
    const items: CostItem[] = [
      base({ categoria: "alojamiento", precio_unitario: 100,
        detalle: { package_id: "dob", cost_basis: "persona_estadia" } }),
    ];
    const r = calcularSimulacion(items, modsCero, sup);
    expect(r.costo_unitario_por_modalidad.dob).toBe(100);
    expect(r.costo_unitario_por_modalidad.ind).toBeNull();
  });
});

describe("modelo precio base + suplementos (Rimini 2027)", () => {
  const IND = "ind";
  const DOB = "dob";
  const riminiItems = (): CostItem[] => [
    base({ grupo_costo: "alojamiento", categoria: "alojamiento", precio_unitario: 1039, moneda: "EUR",
      detalle: { package_id: IND, cost_basis: "persona_estadia", habitaciones: 6, noches: 8, personas_por_habitacion: 1 } }),
    base({ grupo_costo: "alojamiento", categoria: "alojamiento", precio_unitario: 799, moneda: "EUR",
      detalle: { package_id: DOB, cost_basis: "persona_estadia", habitaciones: 5, noches: 8, personas_por_habitacion: 2 } }),
    // participante directo: 152 por persona
    base({ grupo_costo: "participante", categoria: "servicios", precio_unitario: 8, moneda: "EUR", es_por_persona: true }),
    base({ grupo_costo: "participante", categoria: "servicios", precio_unitario: 35, moneda: "EUR", es_por_persona: true }),
    base({ grupo_costo: "participante", categoria: "comida", cantidad: 8, precio_unitario: 1.5, moneda: "EUR", es_por_persona: true }),
    base({ grupo_costo: "participante", categoria: "comida", cantidad: 8, precio_unitario: 2, moneda: "EUR", es_por_persona: true }),
    base({ grupo_costo: "participante", categoria: "comida", precio_unitario: 35, moneda: "EUR", es_por_persona: true }),
    base({ grupo_costo: "participante", categoria: "servicios", precio_unitario: 6, moneda: "EUR", es_por_persona: true }),
    base({ grupo_costo: "participante", categoria: "otros", precio_unitario: 40, moneda: "EUR", es_por_persona: true }),
    // staff: 2482
    base({ grupo_costo: "staff", categoria: "staff", precio_unitario: 1200, moneda: "EUR" }),
    base({ grupo_costo: "staff", categoria: "staff", precio_unitario: 200, moneda: "EUR" }),
    base({ grupo_costo: "staff", categoria: "staff", precio_unitario: 8, moneda: "EUR" }),
    base({ grupo_costo: "staff", categoria: "staff", precio_unitario: 35, moneda: "EUR" }),
    base({ grupo_costo: "staff", categoria: "staff", precio_unitario: 1039, moneda: "EUR" }),
    // generales: 1450
    base({ grupo_costo: "general", categoria: "transporte", cantidad: 2, precio_unitario: 650, moneda: "EUR" }),
    base({ grupo_costo: "general", categoria: "marketing", precio_unitario: 150, moneda: "EUR" }),
  ];
  const riminiSup: Supuestos = {
    tc_usd: 1, tc_eur: 1, moneda_base: "EUR",
    pct_imprevistos: 5, pct_margen_objetivo: 30,
    participantes_prorrateo: 8, paquete_base_id: DOB,
  };
  const mods6y7: Modalidad[] = [
    { key: IND, label: "Individual", esperados: 6 },
    { key: DOB, label: "Doble", esperados: 7 },
  ];
  const round = (n: number | null) => Math.round((n ?? 0) * 100) / 100;

  it("reproduce los números de Rimini con escenario conservador de 8", () => {
    const r = calcularSimulacion(riminiItems(), mods6y7, riminiSup);
    expect(r.escenario_inscriptos).toBe(8);
    expect(round(r.costo_participante_directo_unitario)).toBe(159.6);
    expect(round(r.costo_staff_total)).toBe(2606.1);
    expect(round(r.costo_staff_por_persona)).toBe(325.76);
    expect(round(r.costo_general_total)).toBe(1522.5);
    expect(round(r.costo_general_por_persona)).toBe(190.31);
    expect(round(r.costo_alojamiento_unitario_por_modalidad[DOB])).toBe(838.95);
    expect(round(r.costo_alojamiento_unitario_por_modalidad[IND])).toBe(1090.95);
    expect(round(r.costo_base_unitario)).toBe(1514.63);
    expect(round(r.precio_base_sugerido)).toBe(2163.75);
    expect(round(r.suplemento_costo_por_modalidad[IND])).toBe(252);
    expect(round(r.suplemento_precio_por_modalidad[IND])).toBe(360);
    expect(round(r.precio_final_por_modalidad[IND])).toBe(2523.75);
    expect(round(r.precio_final_por_modalidad[DOB])).toBe(2163.75);
  });

  it("marca la distribución inválida cuando no suma el escenario activo", () => {
    const r = calcularSimulacion(riminiItems(), mods6y7, riminiSup);
    expect(r.distribucion_total).toBe(13);
    expect(r.distribucion_valida).toBe(false);
    expect(r.escenario_ingreso_total).toBeNull();
    expect(r.escenario_ganancia_total).toBeNull();
    expect(r.escenario_margen).toBeNull();
    // los precios sí se calculan igual
    expect(round(r.precio_base_sugerido)).toBe(2163.75);
  });

  it("con distribución válida (4+4=8) calcula ingreso y margen sin duplicar staff/generales", () => {
    const mods: Modalidad[] = [
      { key: IND, label: "Individual", esperados: 4 },
      { key: DOB, label: "Doble", esperados: 4 },
    ];
    const r = calcularSimulacion(riminiItems(), mods, riminiSup);
    expect(r.distribucion_valida).toBe(true);
    const esperadoIngreso = 4 * 2523.75 + 4 * 2163.75;
    expect(round(r.escenario_ingreso_total)).toBe(round(esperadoIngreso));
    // staff y generales entran una sola vez sobre 8 personas
    const esperadoCosto = 8 * 1514.625 + 4 * 252;
    expect(round(r.escenario_costo_total)).toBe(round(esperadoCosto));
    expect(round((r.escenario_margen ?? 0) * 100)).toBe(30);
  });

  it("modo honorario por participante cobra el honorario una sola vez", () => {
    const mods: Modalidad[] = [
      { key: IND, label: "Individual", esperados: 4 },
      { key: DOB, label: "Doble", esperados: 4 },
    ];
    const r = calcularSimulacion(riminiItems(), mods, {
      ...riminiSup, rentabilidad_modo: "honorario_participante", honorario_por_participante: 500,
    });
    expect(round(r.precio_base_sugerido)).toBe(round(1514.625 + 500));
    expect(round(r.suplemento_precio_por_modalidad[IND])).toBe(252);
    expect(round(r.precio_final_por_modalidad[IND])).toBe(round(1514.625 + 500 + 252));
  });

  it("sin paquete base no inventa precios base ni finales", () => {
    const r = calcularSimulacion(riminiItems(), mods6y7, { ...riminiSup, paquete_base_id: null });
    expect(r.paquete_base_id).toBeNull();
    expect(r.precio_base_sugerido).toBe(0);
    expect(r.precio_final_por_modalidad[IND]).toBe(0);
  });

  it("por_grupo y por_categoria quedan en la misma base (con imprevistos)", () => {
    const r = calcularSimulacion(riminiItems(), mods6y7, riminiSup);
    const sumaCat = Object.values(r.por_categoria).reduce((a, b) => a + b, 0);
    const sumaGrupo = Object.values(r.por_grupo).reduce((a, b) => a + b, 0);
    expect(round(sumaCat)).toBe(round(sumaGrupo));
  });
});

describe("escenario activo como única verdad y suplementos", () => {
  const IND = "ind";
  const DOB = "dob";
  const sup8: Supuestos = {
    tc_usd: 1, tc_eur: 1, moneda_base: "EUR",
    pct_imprevistos: 5, pct_margen_objetivo: 30,
    participantes_prorrateo: 8, paquete_base_id: DOB,
  };
  const mods6y7: Modalidad[] = [
    { key: IND, label: "Individual", esperados: 6 },
    { key: DOB, label: "Doble", esperados: 7 },
  ];
  const items = (): CostItem[] => [
    base({ grupo_costo: "alojamiento", categoria: "alojamiento", precio_unitario: 1039, moneda: "EUR",
      detalle: { package_id: IND, cost_basis: "persona_estadia" } }),
    base({ grupo_costo: "alojamiento", categoria: "alojamiento", precio_unitario: 799, moneda: "EUR",
      detalle: { package_id: DOB, cost_basis: "persona_estadia" } }),
    base({ grupo_costo: "participante", categoria: "comida", precio_unitario: 152, moneda: "EUR", es_por_persona: true }),
    base({ grupo_costo: "staff", categoria: "staff", precio_unitario: 2482, moneda: "EUR" }),
    base({ grupo_costo: "general", categoria: "otros", precio_unitario: 1450, moneda: "EUR" }),
  ];
  const round = (n: number | null) => Math.round((n ?? 0) * 100) / 100;

  it("suplemento Rimini: 1039−799=240, +5%=252, margen 30% ⇒ 360", () => {
    const r = calcularSimulacion(items(), mods6y7, sup8);
    expect(round(r.costo_alojamiento_unitario_por_modalidad[IND] - r.costo_alojamiento_unitario_por_modalidad[DOB])).toBe(252);
    expect(round(r.suplemento_costo_por_modalidad[IND])).toBe(252);
    expect(round(r.suplemento_precio_por_modalidad[IND])).toBe(360);
  });

  it("el total del grupo Participantes usa el escenario activo, no la suma de modalidades", () => {
    const r = calcularSimulacion(items(), mods6y7, sup8);
    expect(round(r.costo_participante_directo_unitario)).toBe(159.6);
    expect(round(r.costo_participante_total)).toBe(1276.8); // 159.60 × 8, no × 13
    expect(round(r.por_grupo.participante)).toBe(1276.8);
  });

  it("distribución distinta del escenario bloquea la proyección", () => {
    const r = calcularSimulacion(items(), mods6y7, sup8);
    expect(r.distribucion_valida).toBe(false);
    expect(r.escenario_ingreso_total).toBeNull();
    expect(r.escenario_margen).toBeNull();
    expect(r.precio_base_sugerido).toBeGreaterThan(0);
  });

  it("staff y generales prorratean por separado y su suma coincide con el combinado", () => {
    const r = calcularSimulacion(items(), mods6y7, sup8);
    expect(round(r.costo_staff_por_persona)).toBe(round(2482 * 1.05 / 8));
    expect(round(r.costo_general_por_persona)).toBe(round(1450 * 1.05 / 8));
    expect(round(r.costo_staff_por_persona + r.costo_general_por_persona))
      .toBe(round((2482 + 1450) * 1.05 / 8));
  });

  it("por_categoria y por_grupo mantienen la misma política de imprevistos", () => {
    const r = calcularSimulacion(items(), mods6y7, sup8);
    const sumaCat = Object.values(r.por_categoria).reduce((a, b) => a + b, 0);
    const sumaGrupo = Object.values(r.por_grupo).reduce((a, b) => a + b, 0);
    expect(Math.abs(sumaCat - sumaGrupo)).toBeLessThan(0.01);
  });

  it("el snapshot del cálculo cambia al eliminar una línea", () => {
    const antes = calcularSimulacion(items(), mods6y7, sup8);
    const menos = items().filter((_, i) => i !== 4); // sin generales
    const despues = calcularSimulacion(menos, mods6y7, sup8);
    expect(JSON.stringify(antes)).not.toBe(JSON.stringify(despues));
    expect(despues.costo_general_total).toBe(0);
  });

  it("alojamiento más barato que la base se muestra como descuento (suplemento negativo)", () => {
    const r = calcularSimulacion(items(), mods6y7, { ...sup8, paquete_base_id: IND });
    expect(r.suplemento_costo_por_modalidad[DOB]).toBeLessThan(0);
    expect(r.precio_final_por_modalidad[DOB]).toBeLessThan(r.precio_base_sugerido);
  });
});
