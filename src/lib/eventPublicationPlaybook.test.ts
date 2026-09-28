import { describe, it, expect } from "vitest";
import { evaluatePlaybook, capacidadComercial, nightsBetween, QA_ITEMS, type PlaybookInput } from "./eventPublicationPlaybook";

const base = (): PlaybookInput => ({
  event: {
    date: "2027-06-21", end_date: "2027-06-28", description: "Viaje", short_description: "Corto",
    image_url: "x.jpg", location: "Alpes", level: "Intermedio",
    incluye: ["Hotel", "Traslados"], no_incluye: ["Aéreos", "Tasa turística en destino"],
    roadbook: [{ dia: 1 }], payment_mode: "cuotas", metadata: { terms_text: "T", lodging_name: "Hotel" },
  },
  packages: [
    { id: "d", nombre: "Doble", descripcion: "d", precio: 3000, cupo: 10, activo: true },
    { id: "i", nombre: "Individual", descripcion: "i", precio: 3500, cupo: 10, activo: true },
  ],
  rooms: [{ package_id: "d", capacidad: 10 }, { package_id: "i", capacidad: 10 }],
  paymentPlans: [{ package_id: "d", activo: true }, { package_id: "i", activo: true }],
  simulation: {
    pct_imprevistos: 5, pct_margen_objetivo: 30, rentabilidad_modo: "honorario_participante",
    honorario_por_participante: 400, noches: 7, capacidad_total: 20,
    resultados: {
      margen_estimado: 0.12, escenario_inscriptos: 9,
      costo_unitario_por_modalidad: { d: 2600, i: 3100 },
      precio_final_por_modalidad: { d: 3000, i: 3500 },
    },
  },
  costItems: [
    { id: "a1", grupo_costo: "alojamiento", categoria: "alojamiento", descripcion: "Hotel con desayuno", detalle: { package_id: "d", noches: 7 } },
    { id: "a2", grupo_costo: "alojamiento", categoria: "alojamiento", descripcion: "Hotel", detalle: { package_id: "i", noches: 7 } },
    { id: "s", grupo_costo: "staff", categoria: "transporte", descripcion: "Aéreo", detalle: {} },
    { id: "t", grupo_costo: "general", categoria: "transporte", descripcion: "Transfer", detalle: {} },
  ],
  checklist: {},
});

const check = (r: ReturnType<typeof evaluatePlaybook>, phase: string, id: string) =>
  r.phases.find((p) => p.id === phase)!.checks.find((c) => c.id === id);

describe("eventPublicationPlaybook", () => {
  it("nightsBetween sin desvío de zona horaria", () => {
    expect(nightsBetween("2027-06-21", "2027-06-28")).toBe(7);
    expect(nightsBetween("2027-06-21", null)).toBeNull();
  });

  it("capacidad comercial sale de los cupos, no del escenario del simulador", () => {
    const i = base();
    const r = evaluatePlaybook(i);
    expect(r.capacidadComercial).toBe(20);
    expect(capacidadComercial(i.event, i.packages)).toBe(20);
    // escenario de 9 inscriptos no genera error ni cambia capacidad
    expect(check(r, "pricing", "capacidad")?.ok).toBe(true);
    expect(check(r, "pricing", "capacidad_presupuesto")).toBeUndefined();
  });

  it("sin cupos usa max_capacity del evento", () => {
    const i = base();
    i.packages = i.packages.map((p) => ({ ...p, cupo: null }));
    i.event.max_capacity = 16;
    expect(capacidadComercial(i.event, i.packages)).toBe(16);
  });

  it("honorario fijo: no exige margen porcentual aunque el observado sea bajo", () => {
    const i = base();
    i.simulation!.pct_margen_objetivo = 0;
    const r = evaluatePlaybook(i);
    expect(check(r, "pricing", "rentabilidad_modelo")?.ok).toBe(true);
    expect(r.phases.find((p) => p.id === "pricing")!.status).toBe("completa");
  });

  it("modo margen sin margen objetivo bloquea pricing", () => {
    const i = base();
    i.simulation!.rentabilidad_modo = "margen";
    i.simulation!.pct_margen_objetivo = 0;
    const r = evaluatePlaybook(i);
    expect(check(r, "pricing", "rentabilidad_modelo")?.ok).toBe(false);
    expect(r.phases.find((p) => p.id === "pricing")!.status).toBe("bloqueada");
  });

  it("precio por debajo del costo es crítico", () => {
    const i = base();
    i.packages[0].precio = 2000;
    const r = evaluatePlaybook(i);
    expect(check(r, "pricing", "precio_sobre_costo")?.ok).toBe(false);
  });

  it("capacidad del presupuesto distinta a la comercial es solo recomendado", () => {
    const i = base();
    i.simulation!.capacidad_total = 25;
    const c = check(evaluatePlaybook(i), "pricing", "capacidad_presupuesto");
    expect(c?.ok).toBe(false);
    expect(c?.severity).toBe("recomendado");
  });

  it("noches 0 en precio por estadía es recomendado, por noche es crítico", () => {
    const i = base();
    i.costItems[0].detalle = { package_id: "d", noches: 0, cost_basis: "persona_estadia" };
    expect(check(evaluatePlaybook(i), "costeo", "alojamiento_noches")?.severity).toBe("recomendado");
    i.costItems[0].detalle = { package_id: "d", noches: 0, cost_basis: "habitacion_noche" };
    expect(check(evaluatePlaybook(i), "costeo", "alojamiento_noches")?.severity).toBe("critico");
  });

  it("falta fecha de fin bloquea producto", () => {
    const i = base();
    i.event.end_date = null;
    expect(evaluatePlaybook(i).phases[0].status).toBe("bloqueada");
  });

  it("listo para publicar solo con QA completo y sin críticos", () => {
    const i = base();
    expect(evaluatePlaybook(i).readyToPublish).toBe(false);
    i.checklist.qa = Object.fromEntries(QA_ITEMS.map((q) => [q.id, true]));
    const r = evaluatePlaybook(i);
    expect(r.criticalPending).toBe(0);
    expect(r.readyToPublish).toBe(true);
    expect(r.phases[4].status).toBe("completa");
    expect(r.phases[5].status).toBe("pendiente");
  });
});
