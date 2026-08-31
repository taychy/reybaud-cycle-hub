import { describe, it, expect } from "vitest";
import {
  DIAS_SEMANA,
  ORDEN_SEMANA_LUNES,
  agruparDisponibilidad,
  dentroDeVigencia,
  detectarConflictos,
  diffServicios,
  ocurrenciasEnSemana,
  ocurrenciasSerie,
  overlaps,
  parseIso,
  startOfWeek,
  toLocalIso,
  weekDays,
  type AgendaEvento,
  type DisponibilidadRow,
} from "./agenda";

describe("convención de días (0=Domingo)", () => {
  it("coincide con Date.getDay para una semana conocida", () => {
    // 2026-03-01 es domingo
    for (let i = 0; i < 7; i++) {
      const iso = toLocalIso(new Date(2026, 2, 1 + i));
      const dow = parseIso(iso).getDay();
      expect(DIAS_SEMANA[dow]).toBe(
        ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"][i],
      );
    }
  });

  it("el orden de visualización arranca en lunes y termina en domingo", () => {
    expect([...ORDEN_SEMANA_LUNES]).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(DIAS_SEMANA[ORDEN_SEMANA_LUNES[0]]).toBe("Lunes");
    expect(DIAS_SEMANA[ORDEN_SEMANA_LUNES[6]]).toBe("Domingo");
  });

  it("startOfWeek devuelve el lunes, incluso en domingo", () => {
    expect(toLocalIso(startOfWeek(new Date(2026, 2, 1)))).toBe("2026-02-23"); // domingo → lunes previo
    expect(toLocalIso(startOfWeek(new Date(2026, 2, 4)))).toBe("2026-03-02");
  });

  it("weekDays produce 7 fechas consecutivas", () => {
    const d = weekDays(new Date(2026, 2, 2));
    expect(d).toHaveLength(7);
    expect(d[0]).toBe("2026-03-02");
    expect(d[6]).toBe("2026-03-08");
    expect(parseIso(d[6]).getDay()).toBe(0);
  });

  it("ocurrenciasEnSemana mapea dia_semana a la fecha correcta", () => {
    const dias = weekDays(new Date(2026, 2, 2));
    expect(ocurrenciasEnSemana(dias, 1)).toEqual(["2026-03-02"]); // lunes
    expect(ocurrenciasEnSemana(dias, 0)).toEqual(["2026-03-08"]); // domingo
  });
});

describe("overlaps", () => {
  it("detecta solapamiento parcial", () => {
    expect(overlaps("09:00", "10:30", "10:00", "11:00")).toBe(true);
  });
  it("extremos que se tocan no se solapan", () => {
    expect(overlaps("09:00", "10:00", "10:00", "11:00")).toBe(false);
  });
  it("tolera segundos en el formato", () => {
    expect(overlaps("09:00:00", "10:00:00", "09:30:00", "09:45:00")).toBe(true);
  });
});

describe("agruparDisponibilidad", () => {
  const base = { coach_id: "c1", sede_id: "s1", dia_semana: 2, hora_inicio: "09:00:00", hora_fin: "12:00:00" };
  const rows: DisponibilidadRow[] = [
    { id: "r1", servicio_id: "sv1", ...base },
    { id: "r2", servicio_id: "sv2", ...base },
    { id: "r3", servicio_id: "sv3", ...base },
    { id: "r4", servicio_id: "sv1", ...base, dia_semana: 4 },
  ];

  it("agrupa filas idénticas en un solo bloque con sus servicios", () => {
    const bloques = agruparDisponibilidad(rows);
    expect(bloques).toHaveLength(2);
    const martes = bloques.find((b) => b.dia_semana === 2)!;
    expect(martes.servicio_ids).toEqual(["sv1", "sv2", "sv3"]);
    expect(martes.row_ids).toEqual(["r1", "r2", "r3"]);
    expect(martes.hora_inicio).toBe("09:00");
  });

  it("no mezcla sedes distintas", () => {
    const bloques = agruparDisponibilidad([
      ...rows.slice(0, 2),
      { id: "r5", servicio_id: "sv1", ...base, sede_id: "s2" },
    ]);
    expect(bloques).toHaveLength(2);
  });

  it("ordena por día y hora", () => {
    const bloques = agruparDisponibilidad(rows);
    expect(bloques.map((b) => b.dia_semana)).toEqual([2, 4]);
  });
});

describe("diffServicios", () => {
  it("calcula altas y bajas", () => {
    expect(diffServicios(["a", "b"], ["b", "c"])).toEqual({ toAdd: ["c"], toRemove: ["a"] });
  });
  it("es idempotente si no cambia nada", () => {
    expect(diffServicios(["a"], ["a"])).toEqual({ toAdd: [], toRemove: [] });
  });
});

describe("detectarConflictos", () => {
  const ev = (p: Partial<AgendaEvento>): AgendaEvento => ({
    id: "x",
    tipo: "turno",
    fecha: "2026-03-02",
    hora_inicio: "09:00",
    hora_fin: "10:00",
    coach_id: "c1",
    coach_nombre: "C",
    sede_id: "s1",
    sede_nombre: "S",
    titulo: "t",
    ...p,
  });

  it("marca clase grupal solapada con turno del mismo coach", () => {
    const c = detectarConflictos([
      ev({ id: "a", tipo: "grupal", hora_inicio: "09:00", hora_fin: "10:30" }),
      ev({ id: "b", tipo: "turno", hora_inicio: "10:00", hora_fin: "11:00" }),
    ]);
    expect([...c].sort()).toEqual(["a", "b"]);
  });

  it("no marca conflicto entre coaches distintos", () => {
    const c = detectarConflictos([
      ev({ id: "a", coach_id: "c1" }),
      ev({ id: "b", coach_id: "c2" }),
    ]);
    expect(c.size).toBe(0);
  });

  it("no marca conflicto en días distintos", () => {
    const c = detectarConflictos([ev({ id: "a" }), ev({ id: "b", fecha: "2026-03-03" })]);
    expect(c.size).toBe(0);
  });

  it("ignora bloques de disponibilidad", () => {
    const c = detectarConflictos([
      ev({ id: "a", tipo: "disponibilidad", hora_inicio: "08:00", hora_fin: "12:00" }),
      ev({ id: "b", tipo: "turno" }),
    ]);
    expect(c.size).toBe(0);
  });

  it("marca dos sedes distintas solapadas del mismo coach", () => {
    const c = detectarConflictos([
      ev({ id: "a", sede_id: "s1" }),
      ev({ id: "b", sede_id: "s2", hora_inicio: "09:30", hora_fin: "10:30" }),
    ]);
    expect(c.size).toBe(2);
  });
});

describe("series semanales recurrentes", () => {
  const dias = weekDays(new Date(2026, 2, 2)); // lun 2/3 → dom 8/3

  it("sin vigencia, la serie aparece siempre", () => {
    expect(ocurrenciasSerie(dias, { dia_semana: 3 })).toEqual(["2026-03-04"]);
  });

  it("no aparece antes de vigente_desde", () => {
    expect(ocurrenciasSerie(dias, { dia_semana: 3, vigente_desde: "2026-03-05" })).toEqual([]);
  });

  it("no aparece después de vigente_hasta", () => {
    expect(ocurrenciasSerie(dias, { dia_semana: 3, vigente_hasta: "2026-03-03" })).toEqual([]);
  });

  it("aparece dentro del rango, incluyendo extremos", () => {
    expect(
      ocurrenciasSerie(dias, { dia_semana: 3, vigente_desde: "2026-03-04", vigente_hasta: "2026-03-04" }),
    ).toEqual(["2026-03-04"]);
  });

  it("dentroDeVigencia tolera timestamps y nulls", () => {
    expect(dentroDeVigencia("2026-03-04", null, null)).toBe(true);
    expect(dentroDeVigencia("2026-03-04", "2026-03-04T00:00:00Z", undefined)).toBe(true);
  });

  it("finalizar una serie deja de proyectar futuras ocurrencias sin borrar el pasado", () => {
    const serie = { dia_semana: 3, vigente_hasta: "2026-03-04" };
    expect(ocurrenciasSerie(dias, serie)).toEqual(["2026-03-04"]);
    const siguiente = weekDays(new Date(2026, 2, 9));
    expect(ocurrenciasSerie(siguiente, serie)).toEqual([]);
  });
});
