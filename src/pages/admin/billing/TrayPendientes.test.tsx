import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TrayPendientes } from "./TrayPendientes";

const state = vi.hoisted(() => ({
  ranges: [] as [number, number][],
  queue: [] as any[],
  preflight: [] as any[],
  delayed: null as Promise<any> | null,
  rpc: vi.fn(),
  invoiceSources: [] as any[],
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: (table: string) => {
    let from = 0, to = 49;
    const query: any = {
      select: () => query, eq: () => query, order: () => query, in: () => query, or: () => query,
      range: (a: number, b: number) => { from = a; to = b; state.ranges.push([a, b]); return query; },
      then: (resolve: any, reject: any) => {
        const result = table === "facturacion_cola"
          ? state.delayed ?? Promise.resolve({ data: state.queue.slice(from, to + 1), error: null })
          : Promise.resolve({ data: [], error: null });
        return result.then(resolve, reject);
      },
    };
    return query;
  },
  rpc: (...args: any[]) => { state.rpc(...args); return Promise.resolve({ data: state.preflight, error: null }); },
} }));
vi.mock("@/components/admin/RuteoUnidadCard", () => ({ RuteoUnidadCard: () => null }));
vi.mock("@/components/admin/FacturacionAutoConfigCard", () => ({ FacturacionAutoConfigCard: () => null }));
vi.mock("@/components/admin/ColaEmisorOverrideDialog", () => ({ ColaEmisorOverrideDialog: () => null }));
vi.mock("./BulkInvoiceModal", () => ({ BulkInvoiceModal: () => null }));
vi.mock("./QueueExclusionAction", () => ({ QueueExclusionAction: () => null }));
vi.mock("@/components/admin/BillingInvoiceLauncher", () => ({ BillingInvoiceLauncher: ({ source }: any) => {
  state.invoiceSources.push(source); return null;
} }));

function Url() { return <output data-testid="url">{useLocation().search}</output>; }
function tray(key = 0, url = "/admin/facturacion") {
  return <MemoryRouter initialEntries={[url]}><TrayPendientes refreshKey={key} /><Url /></MemoryRouter>;
}
const row = (index: number) => ({ id: `queue-${index}`, alumno_id: `student-${index}`, cliente_nombre: `Cliente ${index}`,
  source: "suscripcion", estado: "pendiente", concepto: "Mensualidad", monto: 800, moneda: "ARS",
  cliente_cuit: "old", pagado_at: "2026-10-25T10:00:00Z", excluida_facturacion: false,
  auto_estado: "requiere_datos_fiscales", factura_id: null,
});
beforeEach(() => {
  state.ranges = []; state.queue = [row(0)]; state.preflight = []; state.delayed = null;
  state.rpc.mockClear(); state.invoiceSources = [];
});
afterEach(cleanup);

describe("TrayPendientes read-only refresh", () => {
  it("preserves loaded pages, clears selection, updates fiscal preflight and documents without writes", async () => {
    state.queue = Array.from({ length: 100 }, (_, i) => row(i));
    state.preflight = [{ cola_id: "queue-0", clase: "documento_faltante", alumno_id: "student-0" }];
    const view = render(tray());
    await screen.findByText("Cliente 0");
    fireEvent.click(screen.getByRole("button", { name: "Cargar más" }));
    await screen.findByText("Cliente 99");
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    expect(screen.getByText("100 seleccionado(s)")).toBeInTheDocument();
    state.preflight = [{ cola_id: "queue-0", clase: "ok", alumno_id: "student-0", documento_actual: "20329642330" }];
    view.rerender(tray(1));
    await waitFor(() => expect(state.ranges.at(-1)).toEqual([0, 99]));
    await waitFor(() => expect(screen.queryByText("100 seleccionado(s)")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.queryByText("⚠ Datos fiscales incompletos")).not.toBeInTheDocument());
    expect(screen.getByText("Cliente 99")).toBeInTheDocument();
    expect(state.invoiceSources.some((source) => source.alumno_id === "student-0" && source.cliente_cuit === "20329642330")).toBe(true);
    expect(state.rpc.mock.calls.every(([name]) => name === "preflight_facturacion_cola")).toBe(true);
  });
  it("rejects an older queue response after a newer refresh", async () => {
    let resolveOld: (value: any) => void = () => {};
    state.delayed = new Promise((resolve) => { resolveOld = resolve; });
    const view = render(tray());
    await waitFor(() => expect(state.ranges.length).toBe(1));
    state.delayed = null; state.queue = [{ ...row(0), cliente_nombre: "Actualizado" }];
    view.rerender(tray(1));
    await screen.findByText("Actualizado");
    resolveOld({ data: [{ ...row(0), cliente_nombre: "Antiguo" }], error: null });
    await waitFor(() => expect(screen.queryByText("Antiguo")).not.toBeInTheDocument());
    expect(screen.getByText("Actualizado")).toBeInTheDocument();
  });
  it("restores filters from URL and stores search without selections", async () => {
    render(tray(0, "/admin/facturacion?origen=viajes&estado=excluida&q=Ana&tab=pendientes&from=dashboard"));
    const input = screen.getByPlaceholderText("Buscar cliente o concepto...");
    expect(input).toHaveValue("Ana");
    fireEvent.change(input, { target: { value: "Luis" } });
    await waitFor(() => expect(screen.getByTestId("url").textContent).toContain("q=Luis"));
    const url = screen.getByTestId("url").textContent ?? "";
    expect(url).toContain("origen=viajes"); expect(url).toContain("estado=excluida"); expect(url).toContain("from=dashboard");
    expect(url).not.toContain("selected");
  });
});