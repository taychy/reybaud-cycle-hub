
# Plan: reservas de viajes — herramientas admin para corregir casos incompletos

Tres cambios que atacan los tres problemas que trajiste (Suanni, Tamara, Daniel Pozo). Todos suman herramientas al admin **sin tocar el flujo público de reserva** y sin bloquear nada existente.

---

## 1. Reasignar pago a otra cuota (caso Suanni)

**Dónde**: `ReservationInstallmentsPanel` y la lista de pagos de la reserva. En cada pago validado aparece un botón **"Reasignar a otra cuota"**.

**Cómo funciona**:
- Abre un pequeño diálogo con la lista de cuotas de la reserva (Seña + Cuota 1, 2, 3…) mostrando saldo pendiente de cada una.
- Admin elige la cuota destino y confirma.
- Nueva RPC `reassign_payment_to_installment(payment_id, target_installment_id, admin_note)` que en una sola transacción:
  1. Resta el monto del pago de la cuota origen (recalcula `paid_amount`, `saldo_pendiente`, `balance_due`, `status`, limpia `condoned_*` si fue condonación fantasma como el caso Suanni).
  2. Suma el monto a la cuota destino y recalcula lo mismo.
  3. Actualiza `installment_id` e `installment_number` del pago.
  4. Escribe dos entradas en `reservation_installment_history` (`payment_removed` y `payment_reassigned`) con `admin_note`.
- Sólo lo pueden invocar admin/super_admin (RLS + `SECURITY DEFINER`).

**Cómo quedan comprobados los pagos**: exactamente igual que hoy — el pago no se recrea, solo se reapunta. Sigue teniendo su `payment_reference`, `proof_url`, `status='validated'`, `reviewed_by`, `reviewed_at`. En el historial de la cuota queda registrado quién y cuándo lo movió.

*Nota:* No tocamos el matcher automático de MP en esta iteración (vos elegiste solo UI). El botón queda como red de seguridad para cuando el matcher se equivoque.

---

## 2. Asignar plan de pagos a reserva existente (caso Tamara)

**Dónde**: `ReservationInstallmentsPanel`. Cuando la reserva **no tiene** `payment_plan_id`, en vez del listado vacío se muestra un card **"Esta reserva no tiene plan de pagos asignado"** con botón **"Asignar plan de pagos"**.

**Cómo funciona**:
- El botón abre un diálogo que lista los planes de pago del paquete de la reserva (`event_package_payment_plans` activos del `package_id`). Si la reserva tampoco tiene paquete, el diálogo le dice al admin que primero use "Cambiar paquete" (ver punto 3, que ya lo permite).
- Admin elige un plan y confirma.
- Nueva RPC `assign_payment_plan_to_reservation(reservation_id, payment_plan_id, admin_note)`:
  1. Setea `payment_plan_id` y snapshots (`payment_plan_name_snapshot`, `payment_plan_snapshot`).
  2. Reusa la lógica de `materialize_reservation_installments` para generar Seña + cuotas con fechas y montos según el plan.
  3. Si ya había pagos validados en la reserva, **los imputa en orden**: primero completa la Seña, después cuota 1, etc. (así el caso Tamara aplica sus $100k a la Seña automáticamente).
  4. Recalcula `amount_total`, `amount_paid`, `balance_due`, `payment_status` de la reserva.
  5. Log en `reservation_installment_history` con tipo `plan_assigned` + `admin_note`.

---

## 3. Cambio de paquete admin: etapa + plan + precio libre (caso Daniel Pozo)

**Dónde**: `AdminChangePackageDialog` (el que ya existe, solo se extiende — no se toca el drawer del alumno).

**UI nueva bajo el selector de paquete destino**:
- **Etapa de precio** (dropdown): lista `event_package_price_stages` del paquete elegido con fecha y monto de cada etapa. Por defecto queda "Etapa vigente (actual)".
- **Plan de pagos** (dropdown): lista `event_package_payment_plans` del paquete elegido. Obligatorio si la reserva no tenía plan; opcional (mantener el actual) si ya tenía uno.
- **Precio manual** (input numérico + checkbox "Usar precio manual"): si se activa, sobreescribe la etapa. Se registra explícitamente en `admin_note` y en el historial como `manual_price_override`.

**Backend**: se extienden `preview_package_change` y `apply_package_change` para aceptar tres parámetros opcionales nuevos: `p_price_stage_id`, `p_payment_plan_id`, `p_manual_price`.
- Preview: usa el precio elegido (manual > stage > vigente) para recalcular diferencia, crédito/débito y plazas.
- Apply: además de lo actual, si viene `payment_plan_id` (o la reserva no tenía uno), materializa cuotas nuevas reusando la RPC del punto 2. Si venía plan viejo con pagos hechos, los re-imputa en el nuevo plan (Seña primero).

Con esto: Daniel Pozo hoy tiene paquete pero cero cuotas → volvés a "Cambiar paquete", elegís el mismo paquete + una etapa (o precio libre) + un plan, y en un click quedan las cuotas generadas con los $100k ya imputados a la Seña.

---

## Detalles técnicos

**Migración SQL** (un solo archivo):
- `CREATE OR REPLACE FUNCTION public.reassign_payment_to_installment(...)` — `SECURITY DEFINER`, chequea `has_role(auth.uid(),'admin')` o super_admin.
- `CREATE OR REPLACE FUNCTION public.assign_payment_plan_to_reservation(...)` — idem. Extrae la lógica de materialización de cuotas de `materialize_reservation_installments` en un helper interno reusable, o la llama directamente.
- `CREATE OR REPLACE FUNCTION public.preview_package_change(...)` — agrega params `p_price_stage_id uuid default null`, `p_payment_plan_id uuid default null`, `p_manual_price numeric default null`. Mantiene compatibilidad con las llamadas actuales.
- `CREATE OR REPLACE FUNCTION public.apply_package_change(...)` — mismos params nuevos. Si la reserva no tiene plan y viene uno nuevo, materializa cuotas y re-imputa pagos existentes en orden (Seña → Cuota 1 → …).
- Nuevo tipo de evento en `reservation_installment_history`: valores `plan_assigned`, `payment_reassigned` (ya existe), `manual_price_override`.

**Frontend** (archivos):
- `src/lib/packageChangePreview.ts` — extender tipos `ApplyPackageChangeArgs` y `previewPackageChange` con los 3 nuevos params.
- `src/components/admin/AdminChangePackageDialog.tsx` — sumar los 3 controles (stage, plan, precio manual) y pasarlos a preview/apply.
- `src/components/admin/ReservationInstallmentsPanel.tsx` — empty state con botón "Asignar plan de pagos" + botón "Reasignar" en cada fila de pago.
- Nuevos componentes chicos: `AssignPaymentPlanDialog.tsx` y `ReassignPaymentDialog.tsx`.

**Compatibilidad**: nada que ya funciona hoy se rompe. Los flujos del alumno (drawer público, checkout) no se tocan. Solo se agregan opciones al admin.

**Fuera de alcance** (para pactar en una segunda vuelta si lo querés):
- Arreglar el matcher automático de MP para que priorice Seña.
- Bloquear reservas sin paquete/plan en el flujo público.
- Reversión de reservas incompletas históricas en masa (por ahora se corrigen una a una con las herramientas nuevas).
