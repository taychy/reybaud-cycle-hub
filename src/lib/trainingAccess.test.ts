import { describe, it, expect, vi, afterEach } from "vitest";
import { estadoPermiteEntrenamientos, suscripcionPermiteEntrenamientos, puedeVerEntrenamientos } from "./trainingAccess";
import { getAccessPermissions } from "./subscriptionStatus";

afterEach(() => vi.useRealTimers());
const hoy = (iso: string) => { vi.useFakeTimers(); vi.setSystemTime(new Date(`${iso}T12:00:00`)); };

describe("acceso a entrenamientos", () => {
  it("alumno inactivo/bloqueado no accede", () => {
    expect(estadoPermiteEntrenamientos("inactivo")).toBe(false);
    expect(puedeVerEntrenamientos("bloqueado", [{ estado: "activa", fecha_fin: null }])).toBe(false);
  });

  it("vigente: plan activo dentro del período", () => {
    hoy("2026-10-08");
    expect(puedeVerEntrenamientos("activo", [{ estado: "activa", fecha_fin: "2026-10-31" }])).toBe(true);
  });

  it("vencido dentro de gracia (día 1-5) conserva acceso", () => {
    hoy("2026-10-04");
    expect(puedeVerEntrenamientos("activo", [{ estado: "activa", fecha_fin: "2026-09-30" }])).toBe(true);
    expect(puedeVerEntrenamientos("activo", [
      { estado: "pendiente", origen_registro: "renovacion_pendiente", fecha_inicio: "2026-10-01", fecha_fin: "2026-10-31" },
    ])).toBe(true);
  });

  it("suspendido (después del día 5 sin pago) no accede", () => {
    hoy("2026-10-08");
    expect(puedeVerEntrenamientos("activo", [{ estado: "activa", fecha_fin: "2026-09-30" }])).toBe(false);
    const renov = { estado: "pendiente", origen_registro: "renovacion_pendiente", fecha_inicio: "2026-10-01", fecha_fin: "2026-10-31" };
    expect(puedeVerEntrenamientos("activo", [renov])).toBe(false);
    expect(getAccessPermissions([renov as any]).status).toBe("acceso_pausado");
    expect(puedeVerEntrenamientos("activo", [{ estado: "vencida", fecha_fin: "2026-09-30" }])).toBe(false);
  });

  it("pago confirmado restaura el acceso", () => {
    hoy("2026-10-08");
    expect(puedeVerEntrenamientos("activo", [{ estado: "pendiente_verificacion", fecha_fin: "2026-10-31" }])).toBe(true);
    expect(puedeVerEntrenamientos("activo", [{ estado: "activa", fecha_fin: "2026-10-31", mp_status: "approved" }])).toBe(true);
  });

  it("cancelada impaga no da acceso", () => {
    hoy("2026-10-08");
    expect(suscripcionPermiteEntrenamientos({ estado: "pendiente", cancelada_at: "2026-10-02", fecha_fin: "2026-10-31" })).toBe(false);
  });

  it("staff (admin/coach) no queda restringido por deuda", () => {
    hoy("2026-10-08");
    const deuda = [{ estado: "pendiente", origen_registro: "renovacion_pendiente", fecha_inicio: "2026-10-01", fecha_fin: "2026-10-31" }];
    expect(puedeVerEntrenamientos("activo", deuda, { esStaff: true })).toBe(true);
  });
});
