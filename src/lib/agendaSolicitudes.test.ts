import { describe, it, expect } from "vitest";
import {
  ALCANCE_LABEL,
  ESTADO_LABEL,
  TIPO_SOLICITUD_LABEL,
  camposModificados,
  resumenBloque,
  resumenAjuste,
  esSolicitudAjustePuntual,

} from "./agendaSolicitudes";

describe("etiquetas de solicitudes de agenda", () => {
  it("cubre todos los tipos que acepta el backend", () => {
    for (const t of [
      "grupal_crear",
      "grupal_editar",
      "grupal_finalizar",
      "grupal_eliminar",
      "disp_crear",
      "disp_editar",
      "disp_eliminar",
    ]) {
      expect(TIPO_SOLICITUD_LABEL[t]).toBeTruthy();
    }
  });

  it("cubre los tres alcances y los tres estados", () => {
    expect(Object.keys(ALCANCE_LABEL).sort()).toEqual(["desde_fecha", "solo_fecha", "toda_serie"]);
    expect(Object.keys(ESTADO_LABEL).sort()).toEqual(["aprobada", "pendiente", "rechazada"]);
  });
});

describe("resumenBloque", () => {
  it("muestra el día de la semana para una serie recurrente", () => {
    expect(resumenBloque({ dia_semana: 2, hora_inicio: "09:00:00", hora_fin: "10:30:00" })).toBe(
      "Martes · 09:00–10:30",
    );
  });

  it("muestra la fecha concreta para una clase puntual", () => {
    expect(
      resumenBloque({ tipo_clase: "puntual", fecha: "2026-10-01", hora_inicio: "18:00", hora_fin: "19:00" }),
    ).toBe("2026-10-01 · 18:00–19:00");
  });

  it("incluye grupo y vigencias cuando existen", () => {
    expect(
      resumenBloque({ dia_semana: 1, hora_inicio: "07:00", hora_fin: "08:00", grupo: "G2", vigente_desde: "2026-10-01" }),
    ).toBe("Lunes · 07:00–08:00 · G2 · desde 2026-10-01");
  });

  it("degrada a guion si no hay datos", () => {
    expect(resumenBloque(null)).toBe("—");
    expect(resumenBloque({})).toBe("—");
  });
});

describe("camposModificados", () => {
  it("detecta el cambio de profesor y de horario", () => {
    const antes = { coach_id: "jorge", dia_semana: 2, hora_inicio: "09:00:00", hora_fin: "10:00:00" };
    const despues = { coach_id: "daniel", dia_semana: 2, hora_inicio: "10:00:00", hora_fin: "11:00:00" };
    expect(camposModificados(antes, despues).sort()).toEqual(["coach_id", "hora_fin", "hora_inicio"]);
  });

  it("ignora diferencias de formato horario (HH:MM vs HH:MM:SS)", () => {
    expect(camposModificados({ hora_inicio: "09:00:00" }, { hora_inicio: "09:00" })).toEqual([]);
  });

  it("solo compara campos presentes en la propuesta", () => {
    expect(camposModificados({ grupo: "G1", sede_id: "s1" }, { grupo: "G2" })).toEqual(["grupo"]);
  });

  it("tolera nulos y objetos vacíos", () => {
    expect(camposModificados(null, null)).toEqual([]);
    expect(camposModificados({ sede_id: null }, { sede_id: "s1" })).toEqual(["sede_id"]);
  });
});

describe("cambios puntuales de disponibilidad", () => {
  it("reconoce las solicitudes de ajuste puntual", () => {
    expect(esSolicitudAjustePuntual("ajuste_crear")).toBe(true);
    expect(esSolicitudAjustePuntual("ajuste_eliminar")).toBe(true);
    expect(esSolicitudAjustePuntual("disp_crear")).toBe(false);
    expect(esSolicitudAjustePuntual("grupal_editar")).toBe(false);
  });

  it("resume un bloqueo de día completo sin horarios", () => {
    expect(resumenAjuste({ tipo_ajuste: "bloquear", fecha: "2026-03-10" })).toBe(
      "2026-03-10 · Bloquear el día completo",
    );
  });

  it("incluye el rango horario cuando reemplaza o agrega", () => {
    expect(
      resumenAjuste({ tipo_ajuste: "agregar", fecha: "2026-03-10", hora_inicio: "18:00:00", hora_fin: "20:00:00" }),
    ).toBe("2026-03-10 · Agregar un tramo extra · 18:00–20:00");
  });

  it("usa la fecha efectiva cuando el payload no la trae", () => {
    expect(resumenAjuste({ tipo: "reemplazar" }, "2026-04-01")).toBe(
      "2026-04-01 · Reemplazar el horario del día",
    );
  });

  it("devuelve — si no hay datos", () => {
    expect(resumenAjuste(null)).toBe("—");
  });
});
