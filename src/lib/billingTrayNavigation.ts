export const BILLING_TABS = ["pendientes", "problemas", "historial", "fiscal-beta"] as const;
export const BILLING_ORIGINS = ["todos", "escuela", "viajes", "tienda"] as const;
export type BillingTab = typeof BILLING_TABS[number];
export type BillingOrigin = typeof BILLING_ORIGINS[number];
export type BillingQueueFilter = "pendiente" | "excluida";

export function readBillingNavigation(params: URLSearchParams) {
  const tab = params.get("tab");
  const origin = params.get("origen");
  return {
    tab: BILLING_TABS.find((value) => value === tab) ?? "pendientes",
    origen: BILLING_ORIGINS.find((value) => value === origin) ?? "todos",
    estado: (params.get("estado") === "excluida" ? "excluida" : "pendiente") as BillingQueueFilter,
    search: params.get("q") ?? "",
  };
}

export function updateBillingNavigation(params: URLSearchParams, key: "tab" | "origen" | "estado" | "q", value: string) {
  const next = new URLSearchParams(params);
  if (value) next.set(key, value);
  else next.delete(key);
  return next;
}

export function billingStudentLink(id: string) {
  return { to: `/admin/alumnos?alumno=${encodeURIComponent(id)}`, target: "_blank", rel: "noopener noreferrer" };
}

/** One read-only refresh for the focus/visibility pair; detach cancels pending work. */
export function listenForBillingReturn(refresh: () => void, win = window, doc = document) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = () => {
    if (doc.visibilityState !== "visible") return;
    clearTimeout(timer);
    timer = setTimeout(refresh, 150);
  };
  win.addEventListener("focus", schedule);
  doc.addEventListener("visibilitychange", schedule);
  return () => {
    clearTimeout(timer);
    win.removeEventListener("focus", schedule);
    doc.removeEventListener("visibilitychange", schedule);
  };
}