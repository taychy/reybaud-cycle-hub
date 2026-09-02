import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ComunicacionesCalendario from "./ComunicacionesCalendario";

const hoy = new Date();
const dia = (d: number) =>
  new Date(hoy.getFullYear(), hoy.getMonth(), d, 10, 0, 0).toISOString();

const rows = Array.from({ length: 14 }, (_, i) => ({
  id: `r${i}`,
  message_id: `m${i}`,
  template_name: `tpl-${i % 7}`,
  recipient_email: `alumno${i}@test.com`,
  status: "sent",
  error_message: null,
  metadata: null,
  created_at: dia(1),
}));

vi.mock("@/integrations/supabase/client", () => {
  const builder: any = {
    select: () => builder,
    gte: () => builder,
    lt: () => builder,
    in: () => Promise.resolve({ data: [] }),
    order: () => builder,
    limit: () => Promise.resolve({ data: rows }),
  };
  return { supabase: { from: () => builder, auth: { getUser: async () => ({ data: { user: null } }) } } };
});

beforeAll(() => {
  (window as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

describe("ComunicacionesCalendario", () => {
  it("abre el drawer del día con todos los grupos al clickear la celda", async () => {
    render(<ComunicacionesCalendario />);
    const celda = await screen.findByText(/\+5 más/);
    fireEvent.click(celda);
    await waitFor(() => expect(screen.getByText(/7 envíos/)).toBeInTheDocument());
    // Los 7 grupos del día están listados en el drawer
    expect(screen.getAllByText("Tpl 0").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Tpl 6").length).toBeGreaterThan(0);
  });
});
