import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import SanLuis2027 from "./SanLuis2027";
import { sanLuisPackages } from "@/lib/sanLuisPreRegistration";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));
beforeAll(() => vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }));
afterAll(() => vi.unstubAllGlobals());

describe("San Luis · precio de la elección actual", () => {
  const cases = [["full", 0, 1950000], ["full", 1, 2480000], ["full", 2, 1950000], ["full", 3, 1420000], ["mini", 0, 1070000], ["mini", 1, 1340000], ["mini", 2, 1070000], ["mini", 3, 830000]] as const;
  it.each(cases)("%s modalidad %i muestra su tarifa ARS %i, no el precio de entrada", (camp, index, price) => {
    render(<MemoryRouter><SanLuis2027 /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText("Camp *"), { target: { value: camp } });
    fireEvent.change(screen.getByLabelText("Alojamiento *"), { target: { value: sanLuisPackages[camp][index].id } });
    const summary = within(screen.getByRole("region", { name: "Tu elección actual" }));
    expect(summary.getByText(new RegExp(price.toLocaleString("es-AR").replace(/\./g, "\\.")))).toBeTruthy();
    if (index !== 3) {
      const entryPrice = camp === "full" ? "1.420.000" : "830.000";
      expect(summary.queryByText(new RegExp(entryPrice.replace(/\./g, "\\.")))).toBeNull();
    }
  });
});