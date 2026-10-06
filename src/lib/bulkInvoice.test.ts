import { describe, it, expect } from "vitest";
import { bloqueoEmisor, totalesPorEmisor, ordenEmision, mensajeErrorEmision } from "./bulkInvoice";
import {
  ajustarFechaAlUltimo, esMismatchNumeracion, obtenerTicketWsaa, taReutilizable,
} from "../../supabase/functions/_shared/facturacion-emision";

const emisores = [
  { id: "E1", nombre_fiscal: "Josilene", cuit: "1", punto_venta: 6, activo: true, tiene_credenciales: true },
  { id: "E2", nombre_fiscal: "Claudio", cuit: "2", punto_venta: 3, activo: true, tiene_credenciales: true },
];

describe("lote con varios emisores", () => {
  const rows = [
    { id: "a", emisor_id: "E1", monto: 100, fecha: "2026-10-05" },
    { id: "b", emisor_id: "E2", monto: 50, fecha: "2026-10-01" },
    { id: "c", emisor_id: "E1", monto: 30, fecha: "2026-10-02" },
    { id: "d", emisor_id: null, monto: 10 },
  ];
  it("cada fila conserva su emisor y el cupo se suma por emisor", () => {
    const t = totalesPorEmisor(rows);
    expect(t.get("E1")).toBe(130);
    expect(t.get("E2")).toBe(50);
    expect(ordenEmision(rows.slice(0, 3)).map((r) => [r.id, r.emisor_id])).toEqual([["c", "E1"], ["a", "E1"], ["b", "E2"]]);
  });
  it("fila sin emisor o en revisión: solo esa queda bloqueada", () => {
    expect(rows.map((r) => bloqueoEmisor(r, emisores))).toEqual([null, null, null, "Revisar emisor"]);
    expect(bloqueoEmisor({ id: "x", emisor_id: "E1", auto_estado: "requiere_revision_emisor", monto: 1 }, emisores)).toBe("Revisar emisor");
  });
});

describe("numeración y fecha ARCA", () => {
  const base = { cbteFch: "20261005", servDesde: "20261001", servHasta: "20261031", vtoPago: "20261005", usoFechaCobro: true };

  it("secuencia de 3 facturas del mismo emisor: cada una consulta el último y usa último+1", () => {
    // ARCA simulado
    const arca = { ultimo: 61, ultimoFch: "20261006" };
    const consultas: number[] = [];
    const usados: Array<[number, string]> = [];
    for (let i = 0; i < 3; i++) {
      consultas.push(arca.ultimo); // FECompUltimoAutorizado justo antes de cada emisión
      const nro = arca.ultimo + 1;
      const f = ajustarFechaAlUltimo(base, arca.ultimoFch);
      expect(f.cbteFch >= arca.ultimoFch).toBe(true);
      usados.push([nro, f.cbteFch]);
      arca.ultimo = nro; arca.ultimoFch = f.cbteFch;
    }
    expect(consultas).toEqual([61, 62, 63]);
    expect(usados).toEqual([[62, "20261006"], [63, "20261006"], [64, "20261006"]]);
  });

  it("no cambia la fecha si el cobro es posterior al último", () => {
    expect(ajustarFechaAlUltimo(base, "20261003")).toMatchObject({ cbteFch: "20261005", ajustadaPorUltimo: false });
    const adj = ajustarFechaAlUltimo(base, "20261006");
    expect(adj).toMatchObject({ cbteFch: "20261006", vtoPago: "20261006", servDesde: "20261001", servHasta: "20261031", ajustadaPorUltimo: true });
  });

  it("detecta el rechazo de numeración de ARCA", () => {
    expect(esMismatchNumeracion("El numero o fecha del comprobante no se corresponde con el proximo a autorizar. Consultar metodo FECompUltimoAutorizado.")).toBe(true);
    expect(esMismatchNumeracion("DocNro invalido")).toBe(false);
  });
});

describe("ticket WSAA", () => {
  const ahora = Date.parse("2026-10-06T15:00:00Z");
  it("reutiliza un TA vigente y no pide otro", async () => {
    let logins = 0;
    const r = await obtenerTicketWsaa({
      leer: async () => ({ token: "T", sign: "S", expires_at: "2026-10-07T02:00:00Z" }),
      guardar: async () => {},
      login: async () => { logins++; return { token: "N", sign: "N" }; },
      ahora: () => ahora,
    });
    expect(r).toMatchObject({ token: "T", reutilizado: true });
    expect(logins).toBe(0);
  });
  it("TA vencido: hace login una vez y lo guarda", async () => {
    let guardado: any = null;
    const r = await obtenerTicketWsaa({
      leer: async () => ({ token: "T", sign: "S", expires_at: "2026-10-06T15:01:00Z" }),
      guardar: async (t) => { guardado = t; },
      login: async () => ({ token: "N", sign: "M", expires_at: "2026-10-07T03:00:00Z" }),
      ahora: () => ahora,
    });
    expect(r).toMatchObject({ token: "N", reutilizado: false });
    expect(guardado.token).toBe("N");
  });
  it("'ya posee un TA válido': relee el guardado por otra invocación en vez de fallar", async () => {
    let lecturas = 0;
    const r = await obtenerTicketWsaa({
      leer: async () => (++lecturas >= 2 ? { token: "OTRO", sign: "S", expires_at: "2026-10-07T03:00:00Z" } : null),
      guardar: async () => {},
      login: async () => ({ error: "HTTP 500: El CEE ya posee un TA valido para el acceso al WSN solicitado" }),
      ahora: () => ahora, esperar: async () => {},
    });
    expect(r).toMatchObject({ token: "OTRO", reutilizado: true });
  });
  it("'ya posee un TA válido' sin TA guardado: error claro y reintentable", async () => {
    const r = await obtenerTicketWsaa({
      leer: async () => null, guardar: async () => {},
      login: async () => ({ error: "El CEE ya posee un TA valido" }),
      ahora: () => ahora, esperar: async () => {},
    });
    expect(r.code).toBe("ta_vigente_no_disponible");
    expect(mensajeErrorEmision(r.error!, r.code)).toMatch(/reintentá más tarde/);
  });
  it("margen de vencimiento", () => {
    expect(taReutilizable("2026-10-06T15:01:00Z", ahora)).toBe(false);
    expect(taReutilizable("2026-10-06T16:00:00Z", ahora)).toBe(true);
  });
});
