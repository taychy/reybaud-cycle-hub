import { describe, it, expect } from "vitest";
import {
  agendaLabel,
  bloqueosLiquidacion,
  discrepancias,
  duracionAgendaMin,
  hayNoPuede,
  liquidacionHabilitada,
  liquidacionLabel,
  todosConfirmaron,
  type ProgramaClaseDocente,
  type ProgramaClaseEstado,
} from "./programaClases";

const clase = (o: Partial<ProgramaClaseEstado> = {}): ProgramaClaseEstado => ({
  id: "c1",
  plan_id: "p1",
  orden: 3,
  titulo: "Introducción al Pelotón",
  duracion_min: 90,
  agenda_grupal_id: "a1",
  agenda_fecha: "2026-09-05",
  admin_estado: "pendiente",
  admin_nota: null,
  excepcion_nota: null,
  agenda_dia_semana: 6,
  agenda_hora_inicio: "12:00:00",
  agenda_hora_fin: "13:30:00",
  agenda_tipo_clase: "recurrente",
  agenda_fecha_puntual: null,
  agenda_activo: true,
  agenda_grupo: "Aspirantes",
  agenda_sede: "KDT",
  agenda_coach_id: "coach-chapu",
  agenda_coach_nombre: "Chapu",
  clase_dictada_id: null,
  clase_dictada_fecha: null,
  liquidacion_estado: null,
  liquidacion_mensual_id: null,
  ...o,
});

const doc = (o: Partial<ProgramaClaseDocente> = {}): ProgramaClaseDocente => ({
  id: "d1",
  clase_id: "c1",
  nombre_planificado: "Chapu",
  coach_id: "coach-chapu",
  confirmacion: "pendiente",
  motivo: null,
  confirmado_at: null,
  ...o,
});

describe("programaClases", () => {
  it("calcula duración de Agenda", () => {
    expect(duracionAgendaMin("12:00:00", "13:30:00")).toBe(90);
    expect(duracionAgendaMin(null, "13:30:00")).toBeNull();
  });

  it("muestra 'Sin clase vinculada en Agenda' cuando no hay relación", () => {
    expect(agendaLabel(clase({ agenda_grupal_id: null }))).toBe(
      "Sin clase vinculada en Agenda",
    );
  });

  it("arma la etiqueta con fecha, horario y sede de Agenda", () => {
    const l = agendaLabel(clase());
    expect(l).toContain("12:00–13:30");
    expect(l).toContain("KDT");
  });

  it("un profesor: confirmación individual habilita el bloque de confirmación", () => {
    const docentes = [doc({ confirmacion: "confirmado" })];
    expect(todosConfirmaron(docentes)).toBe(true);
  });

  it("varios profesores: falta uno ⇒ no todos confirmaron", () => {
    const docentes = [
      doc({ id: "d1", nombre_planificado: "Claudio", coach_id: "c-claudio", confirmacion: "confirmado" }),
      doc({ id: "d2", nombre_planificado: "Daniela", coach_id: "c-daniela" }),
    ];
    expect(todosConfirmaron(docentes)).toBe(false);
  });

  it("'No puedo' queda visible y no confirma la clase", () => {
    const docentes = [doc({ confirmacion: "no_puede", motivo: "Viaje" })];
    expect(hayNoPuede(docentes)).toBe(true);
    expect(todosConfirmaron(docentes)).toBe(false);
  });

  it("detecta discrepancia plan/Agenda por duración y por profesor distinto", () => {
    const d = discrepancias(
      clase({ agenda_hora_fin: "13:00:00", agenda_coach_id: "otro", agenda_coach_nombre: "Daniel" }),
      [doc()],
    );
    expect(d.length).toBe(2);
    expect(d[0]).toContain("60 min");
    expect(d[1]).toContain("Daniel");
  });

  it("sin Agenda no reporta discrepancias", () => {
    expect(discrepancias(clase({ agenda_grupal_id: null }), [doc()])).toEqual([]);
  });

  it("bloquea liquidación hasta dictada + confirmada + aprobada", () => {
    const docentes = [doc()];
    expect(liquidacionHabilitada(clase(), docentes)).toBe(false);
    expect(bloqueosLiquidacion(clase(), docentes)).toHaveLength(3);

    const ok = clase({ clase_dictada_id: "cd1", admin_estado: "aprobada" });
    const okDocs = [doc({ confirmacion: "confirmado" })];
    expect(liquidacionHabilitada(ok, okDocs)).toBe(true);
    expect(bloqueosLiquidacion(ok, okDocs)).toEqual([]);
    expect(liquidacionLabel(ok, okDocs)).toBe("Lista para liquidar");
  });

  it("nunca habilita automáticamente si Admin no aprobó", () => {
    const c = clase({ clase_dictada_id: "cd1" });
    expect(liquidacionHabilitada(c, [doc({ confirmacion: "confirmado" })])).toBe(false);
  });

  it("lee el estado real de liquidación sin copiar montos", () => {
    const c = clase({ clase_dictada_id: "cd1", admin_estado: "aprobada", liquidacion_estado: "pendiente" });
    expect(liquidacionLabel(c, [doc({ confirmacion: "confirmado" })])).toBe(
      "En liquidación · pendiente",
    );
    expect(liquidacionLabel({ ...c, liquidacion_mensual_id: "lm1" }, [doc({ confirmacion: "confirmado" })])).toBe(
      "Liquidada",
    );
  });
});
