import { describe, it, expect } from "vitest";
import {
  estadoPermiteEntrenamientos,
  suscripcionPermiteEntrenamientos,
  puedeVerEntrenamientos,
} from "./trainingAccess";

describe("acceso a entrenamientos", () => {
  it("alumno inactivo no accede aunque tenga grupo y suscripción", () => {
    expect(estadoPermiteEntrenamientos("inactivo")).toBe(false);
    expect(puedeVerEntrenamientos("inactivo", [{ estado: "activa", cancelada_at: null }])).toBe(false);
  });

  it("alumno bloqueado o pendiente no accede", () => {
    expect(puedeVerEntrenamientos("bloqueado", [{ estado: "activa" }])).toBe(false);
    expect(puedeVerEntrenamientos("pendiente", [{ estado: "activa" }])).toBe(false);
  });

  it("suscripción cancelada no otorga acceso", () => {
    expect(suscripcionPermiteEntrenamientos({ estado: "activa", cancelada_at: "2026-09-01" })).toBe(false);
    expect(puedeVerEntrenamientos("activo", [{ estado: "activa", cancelada_at: "2026-09-01" }])).toBe(false);
  });

  it("alumno activo sin ninguna suscripción no accede", () => {
    expect(puedeVerEntrenamientos("activo", [])).toBe(false);
  });

  it("alumno activo con suscripción vigente accede", () => {
    expect(puedeVerEntrenamientos("activo", [{ estado: "activa", cancelada_at: null }])).toBe(true);
    expect(puedeVerEntrenamientos("vacaciones", [{ estado: "pendiente", cancelada_at: null }])).toBe(true);
  });
});
