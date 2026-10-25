import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import AdminBilling from "./AdminBilling";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => {
  const query: any = { select: () => query, order: () => query,
    then: (resolve: any) => Promise.resolve({ data: [] }).then(resolve) };
  return query;
} } }));
vi.mock("./useBillingCounts", () => ({ useBillingCounts: () => ({ pendientes: 0, problemas: 0, emitidasMes: 0 }) }));
vi.mock("./ManualInvoiceButton", () => ({ ManualInvoiceButton: () => null }));
vi.mock("./TrayPendientes", () => ({ TrayPendientes: () => <div>cola</div> }));
vi.mock("./TrayProblemas", () => ({ TrayProblemas: () => <div>problemas</div> }));
vi.mock("./TrayHistorial", () => ({ TrayHistorial: () => <div>historial</div> }));
vi.mock("./FiscalComprobantesLab", () => ({ FiscalComprobantesLab: () => null }));
afterEach(cleanup);
function Url() { return <output data-testid="url">{useLocation().search}</output>; }
it("restores the billing tab and changes it without discarding queue filters", () => {
  render(<MemoryRouter initialEntries={["/admin/facturacion?tab=historial&origen=tienda&estado=excluida&q=Ana"]}>
    <AdminBilling /><Url />
  </MemoryRouter>);
  expect(screen.getByRole("tab", { name: "Historial" })).toHaveAttribute("aria-selected", "true");
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Pendientes" }), { button: 0, ctrlKey: false });
  expect(screen.getByRole("tab", { name: "Pendientes" })).toHaveAttribute("aria-selected", "true");
  const params = new URLSearchParams(screen.getByTestId("url").textContent ?? "");
  expect(params.get("tab")).toBe("pendientes");
  expect(params.get("origen")).toBe("tienda");
  expect(params.get("estado")).toBe("excluida");
  expect(params.get("q")).toBe("Ana");
});