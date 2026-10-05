import { describe, it, expect } from "vitest";
import {
  resolverFechasEmision,
  decidirReconciliacion,
  esErrorTransitorio,
} from "../../supabase/functions/_shared/facturacion-emision";
import { autoEstadoUi, periodoLabel, emisorOrigenLabel } from "./facturacionAuto";

const hoy = new Date(Date.UTC(2026, 9, 5)); // 05/10/2026

describe("fechas de emisión desde el cobro", () => {
  it("usa la fecha del cobro y el período de la mensualidad", () => {
    const r = resolverFechasEmision({
      hoy, fechaComprobante: "2026-10-01", servicioDesde: "2026-10-01", servicioHasta: "2026-10-31",
      segmento: "escuela", origen: "auto",
    });
    expect(r).toEqual({ cbteFch: "20261001", servDesde: "20261001", servHasta: "20261031", vtoPago: "20261001", usoFechaCobro: true });
  });

  it("período de evento (22–25/10) aunque se cobre antes", () => {
    const r = resolverFechasEmision({
      hoy, fechaComprobante: "2026-10-05", servicioDesde: "2026-10-22", servicioHasta: "2026-10-25",
      segmento: "viajes", origen: "auto",
    }) as any;
    expect(r.servDesde).toBe("20261022");
    expect(r.servHasta).toBe("20261025");
  });

  it("automática: cobro fuera del rango ARCA va a revisión manual", () => {
    const r = resolverFechasEmision({ hoy, fechaComprobante: "2026-06-10", segmento: "escuela", origen: "auto" });
    expect("error" in r && r.error).toMatch(/fecha_fuera_de_rango_arca/);
  });

  it("manual: cobro viejo se emite con fecha de hoy pero conserva el período", () => {
    const r = resolverFechasEmision({
      hoy, fechaComprobante: "2026-06-10", servicioDesde: "2026-06-01", servicioHasta: "2026-06-30",
      segmento: "escuela", origen: "manual",
    }) as any;
    expect(r.cbteFch).toBe("20261005");
    expect(r.servDesde).toBe("20260601");
    expect(r.usoFechaCobro).toBe(false);
  });

  it("tienda admite solo 5 días", () => {
    const r = resolverFechasEmision({ hoy, fechaComprobante: "2026-09-28", segmento: "tienda", origen: "auto" });
    expect("error" in r).toBe(true);
  });
});

describe("conciliación con ARCA (caso G: falla local después de autorizar)", () => {
  it("si ARCA tiene el comprobante con el mismo importe y cliente, se recupera sin reemitir", () => {
    const d = decidirReconciliacion({
      esperadoNro: 120, consulta: { encontrado: true, cae: "123", caeVto: "2026-10-15", impTotal: 82500, docNro: "30123456" },
      ultimoAutorizado: 120, monto: 82500, docNro: "30123456",
    });
    expect(d.accion).toBe("recuperar");
  });

  it("si ARCA no lo tiene y el último número es menor, se libera para reintentar", () => {
    const d = decidirReconciliacion({ esperadoNro: 120, consulta: { encontrado: false }, ultimoAutorizado: 119, monto: 1, docNro: null });
    expect(d.accion).toBe("liberar");
  });

  it("si no se pudo consultar, queda incierta (nunca reemite)", () => {
    const d = decidirReconciliacion({ esperadoNro: 120, consulta: null, ultimoAutorizado: null, monto: 1, docNro: null });
    expect(d.accion).toBe("incierto");
  });

  it("si el número existe con otro importe, conflicto manual", () => {
    const d = decidirReconciliacion({
      esperadoNro: 120, consulta: { encontrado: true, cae: "9", impTotal: 999 }, ultimoAutorizado: 120, monto: 1, docNro: null,
    });
    expect(d.accion).toBe("conflicto");
  });

  it("no encontrado pero el último ya es igual o mayor: incierta", () => {
    const d = decidirReconciliacion({ esperadoNro: 120, consulta: { encontrado: false }, ultimoAutorizado: 121, monto: 1, docNro: null });
    expect(d.accion).toBe("incierto");
  });

  it("sin número esperado: nunca llegó a ARCA, se libera", () => {
    expect(decidirReconciliacion({ esperadoNro: null, consulta: null, ultimoAutorizado: null, monto: 1, docNro: null }).accion).toBe("liberar");
  });
});

describe("errores y etiquetas", () => {
  it("clasifica errores transitorios", () => {
    expect(esErrorTransitorio("HTTP 503")).toBe(true);
    expect(esErrorTransitorio("El campo DocNro es inválido")).toBe(false);
  });
  it("etiquetas", () => {
    expect(autoEstadoUi("requiere_revision_emisor").label).toBe("Revisar emisor");
    expect(periodoLabel("2026-10-01", "2026-10-31")).toBe("01/10/26 – 31/10/26");
    expect(emisorOrigenLabel(null)).toBe("Sin determinar");
  });
});
