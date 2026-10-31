import { fireEvent, render, screen, waitFor, within, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ScanCambioDialog from "./ScanCambioDialog";

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ select: () => ({ eq: (_key: string, id: string) => ({ maybeSingle: () => mocks.fetch(id), order: async () => ({ data: [] }) }) }) }) } }));
vi.mock("./CameraScanner", () => ({ default: () => null }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const original = { id: "original", name: "Original inactivo", variants: [{ name: "Talle", options: ["L", "XL"] }], variant_stock: {}, stock: 0 };
const props = { open: true, onOpenChange: vi.fn(), mode: "return" as const, cambioId: "change-1", expectedReturnProductId: "original", expectedReturnVariante: { Talle: "L" }, expectedDeliverProductId: "replacement", expectedDeliverVariante: { Talle: "XL" }, orderReference: "Pedido #98" };

describe("return manual defaults", () => {
  it("loads original by id, preserves variant, and requires explicit physical confirmation", async () => {
    mocks.fetch.mockResolvedValue({ data: original });
    const confirm = vi.fn();
    render(<ScanCambioDialog {...props} onConfirm={confirm} />);
    fireEvent.click(screen.getByRole("button", { name: "Manual" }));
    const manual = screen.getByRole("dialog", { name: "Carga manual" });
    await waitFor(() => expect(within(manual).getByText("Original inactivo")).toBeInTheDocument());
    expect(mocks.fetch).toHaveBeenCalledWith("original");
    expect(within(manual).getByRole("combobox")).toBeDisabled();
    fireEvent.click(within(manual).getByRole("button", { name: /^Confirmar$/ }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Carga manual" })).not.toBeInTheDocument());
    expect(confirm).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /^Confirmar$/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /^Confirmar$/ }));
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(confirm.mock.calls[0][0].devuelto).toEqual({ productId: "original", productName: "Original inactivo", variante: { Talle: "L" }, metodo: "manual", discrepancyReason: "" });
  });
  it("clears old selection when another exchange opens", async () => {
    mocks.fetch.mockImplementation(async (id) => ({ data: { ...original, id, name: id } }));
    const { rerender } = render(<ScanCambioDialog {...props} onConfirm={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Manual" }));
    await screen.findByText("Producto original del cambio");
    rerender(<ScanCambioDialog {...props} cambioId="change-2" expectedReturnProductId="second" expectedReturnVariante={{ Talle: "XL" }} onConfirm={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Manual" }));
    await screen.findByText("second");
    expect(mocks.fetch).toHaveBeenLastCalledWith("second");
  });
  it("keeps manual replacement selection independent of the original", async () => {
    render(<ScanCambioDialog {...props} mode="replacement" onConfirm={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Manual" }));
    await waitFor(() => expect(screen.getByRole("combobox")).toBeInTheDocument());
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(screen.queryByText("Producto original del cambio")).not.toBeInTheDocument();
  });
});