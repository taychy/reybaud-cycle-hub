import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { decideEnrollmentRetry, type RetrySub } from "./retry.ts";

const A = "alumno-1", P = "plan-1";
const sub = (o: Partial<RetrySub>): RetrySub => ({ id: "sub-1", alumno_id: A, plan_id: P, estado: "pendiente_pago", mp_status: null, pagado: 0, ...o });
const benefit = { used_at: null, suscripcion_id: "sub-1" };

Deno.test("primer intento: crea suscripción nueva", () => {
  assertEquals(decideEnrollmentRetry({ alumnoId: A, planId: P, benefit: { used_at: null, suscripcion_id: null } }).action, "new");
});

Deno.test("pago abandonado: reutiliza la misma suscripción", () => {
  const d = decideEnrollmentRetry({ alumnoId: A, planId: P, benefit, existingSub: sub({}) });
  assertEquals(d, { action: "reuse", suscripcionId: "sub-1" });
});

Deno.test("pago fallido (MP marcó cancelada): reutiliza la suscripción del beneficio", () => {
  const d = decideEnrollmentRetry({ alumnoId: A, planId: P, benefit, existingSub: null, benefitSub: sub({ estado: "cancelada", mp_status: "rejected" }) });
  assertEquals(d, { action: "reuse", suscripcionId: "sub-1" });
});

Deno.test("pago aprobado: no permite reintentar", () => {
  const d = decideEnrollmentRetry({ alumnoId: A, planId: P, benefit, existingSub: sub({ estado: "activa", mp_status: "approved", pagado: 100 }) });
  assertEquals(d.action === "reject" && d.code, "PAGO_YA_REGISTRADO");
});

Deno.test("aprobado aunque el estado aún no se actualizó: no permite reintentar", () => {
  const d = decideEnrollmentRetry({ alumnoId: A, planId: P, benefit, existingSub: sub({ mp_status: "approved" }) });
  assertEquals(d.action === "reject" && d.code, "PAGO_YA_REGISTRADO");
});

Deno.test("beneficio ya consumido por pago: rechaza", () => {
  const d = decideEnrollmentRetry({ alumnoId: A, planId: P, benefit: { used_at: "2026-10-01", suscripcion_id: "sub-1" } });
  assertEquals(d.action === "reject" && d.code, "BENEFICIO_USADO");
});

Deno.test("pago en proceso: no genera otro cobro", () => {
  const d = decideEnrollmentRetry({ alumnoId: A, planId: P, benefit, existingSub: sub({ mp_status: "in_process" }) });
  assertEquals(d.action === "reject" && d.code, "PAGO_EN_PROCESO");
});

Deno.test("transferencia en verificación: no genera otro cobro", () => {
  const d = decideEnrollmentRetry({ alumnoId: A, planId: P, benefit, existingSub: sub({ estado: "pendiente_verificacion" }) });
  assertEquals(d.action === "reject" && d.code, "PAGO_EN_VERIFICACION");
});

Deno.test("enlace usado por otra persona: rechaza", () => {
  const d = decideEnrollmentRetry({ alumnoId: A, planId: P, benefit, benefitSub: sub({ alumno_id: "otro" }) });
  assertEquals(d.action === "reject" && d.code, "BENEFICIO_INVALIDO");
});
