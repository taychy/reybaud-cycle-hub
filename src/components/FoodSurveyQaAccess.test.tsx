import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import FoodSurveyQaAccess from "./FoodSurveyQaAccess";

const m = vi.hoisted(() => ({ navigate: vi.fn(), rpc: vi.fn(), session: vi.fn(), change: vi.fn() }));
vi.mock("react-router-dom", () => ({ useNavigate: () => m.navigate, useSearchParams: () => [new URLSearchParams("evento=67b4e85d-b00b-4b74-9644-99458d948c65")] }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: m.rpc, auth: { getSession: m.session, onAuthStateChange: m.change } } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it("does not require admin role when server allowlist permits the signed-in owner", async () => {
  m.session.mockResolvedValue({ data: { session: { user: { id: "laboral-coach" } } } });
  m.change.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  m.rpc.mockResolvedValue({ data: true, error: null });
  render(<FoodSurveyQaAccess><p>Private form</p></FoodSurveyQaAccess>);
  await screen.findByText("Private form");
  expect(m.rpc).toHaveBeenCalledWith("can_access_trip_food_survey_qa", { p_event_id: "67b4e85d-b00b-4b74-9644-99458d948c65" });
});
it("denies a signed-in account outside the allowlist", async () => {
  m.session.mockResolvedValue({ data: { session: { user: { id: "other-admin" } } } });
  m.change.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  m.rpc.mockResolvedValue({ data: false, error: null });
  render(<FoodSurveyQaAccess><p>Private form</p></FoodSurveyQaAccess>);
  await screen.findByRole("alert");
  expect(screen.queryByText("Private form")).toBeNull();
});
it("preserves QA return URL exactly once on repeated signed-out auth signals", async () => {
  window.history.replaceState({}, "", "/pruebas/encuesta-gastronomica?evento=67b4e85d-b00b-4b74-9644-99458d948c65");
  m.session.mockResolvedValue({ data: { session: null } });
  m.change.mockImplementation((cb: () => void) => { setTimeout(cb, 0); return { data: { subscription: { unsubscribe: vi.fn() } } }; });
  render(<FoodSurveyQaAccess><p>Private form</p></FoodSurveyQaAccess>);
  await waitFor(() => expect(m.navigate).toHaveBeenCalled());
  await new Promise(resolve => setTimeout(resolve, 20));
  expect(m.navigate).toHaveBeenCalledTimes(1);
  expect(m.navigate).toHaveBeenCalledWith("/admin/login?returnTo=%2Fpruebas%2Fencuesta-gastronomica%3Fevento%3D67b4e85d-b00b-4b74-9644-99458d948c65", { replace: true });
});