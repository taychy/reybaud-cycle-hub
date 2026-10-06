import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveChargeNow } from "./chargeNow.ts";

Deno.test("cuota materializada vía RPC tiene prioridad", () => {
  assertEquals(resolveChargeNow({ amountTotal: 1000, rpc: { amount: 200, installment_number: 1 }, packageSena: 300 }), { amount: 200, source: "importe_a_pagar_ahora" });
});
Deno.test("RPC sin cuota (saldo total) no se usa si hay plan", () => {
  assertEquals(resolveChargeNow({ amountTotal: 1000, rpc: { amount: 1000, installment_number: null }, plan: { sena_tipo: "porcentaje_paquete", sena_valor: 30 } }).amount, 300);
});
Deno.test("plan monto fijo", () => {
  assertEquals(resolveChargeNow({ amountTotal: 1000, plan: { sena_tipo: "monto_fijo", sena_valor: 150 } }).amount, 150);
});
Deno.test("seña del paquete sin plan", () => {
  assertEquals(resolveChargeNow({ amountTotal: 1000, packageSena: 250 }), { amount: 250, source: "package_sena" });
});
Deno.test("sin seña ni plan cobra total", () => {
  assertEquals(resolveChargeNow({ amountTotal: 1000, packageSena: 0 }), { amount: 1000, source: "total" });
});
Deno.test("nunca supera el total", () => {
  assertEquals(resolveChargeNow({ amountTotal: 100, packageSena: 500 }).amount, 100);
});
