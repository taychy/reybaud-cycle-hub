# Plan final — Facturación por pagos confirmados

## Principio rector
**Un pago confirmado = un ítem facturable.**
El estado de la suscripción (activa / vencida / cancelada) **nunca** decide si un cobro aparece en Facturación. Solo aporta contexto (a qué plan corresponde).

Flujo correcto:

```text
Pago real confirmado ──► pagado_at + evidencia ──► aparece en Facturación del mes correspondiente
Factura emitida ─────► cambia el estado de facturación del pago
Suscripción ─────────► solo contexto (plan, alumno, período)
```

---

## Fase 1 — Corregir `PendingPaymentsList` (sin migración)

Reescribir `fetchConfirmedPayments` (o su equivalente) siguiendo estas reglas:

### 1. Fuentes de "pago confirmado"
Unir en una sola lista de items facturables:

- **Mercado Pago (automático):**
  `mp_status = 'approved'` **y** `mp_payment_id IS NOT NULL`.
- **Pago manual / informado por alumno:**
  requiere evidencia explícita — método de pago confirmado + comprobante validado o movimiento en cuenta corriente asociado. **No** basta con "estado = activa".
- **Cargado por admin:**
  requiere marca explícita de cobrado (método de pago + comprobante o movimiento). Se elimina la regla `origen_registro='cargado_admin' AND estado IN ('activa','vencida')` — asumía que todo lo cargado por admin estaba cobrado y no es cierto.
- **Reservas de eventos/viajes:** filas de `reservation_payments` con estado aprobado.
- **Tienda:** pagos de `store_orders` / `store_preorders` con estado aprobado.

### 2. `pagado_at` — fecha real del cobro
Prioridad de resolución (primer valor no nulo gana):

1. `mp_date_approved` / `payment_date` del webhook de MP.
2. `created_at` del registro de pago (`reservation_payments`, movimiento, comprobante).
3. `updated_at` **solo como último recurso**.

### 3. Período mensual en zona AR
Todos los filtros de mes calculan `pagado_at AT TIME ZONE 'America/Argentina/Buenos_Aires'`. Evita que un pago del 31 a la noche se corra a otro mes por UTC.

### 4. Deduplicación por pago
Antes de mostrar la lista, deduplicar por clave estable de la fuente:

- MP → `mp_payment_id`
- Manual → id del movimiento o comprobante
- Reservas → `reservation_payment.id`
- Tienda → id del pago / orden

Si dos suscripciones apuntan al mismo `mp_payment_id` (caso Gastón), se muestra **un solo** ítem facturable.

### 5. Ignorar el estado de la suscripción
Se remueve todo `sub.estado = 'activa'`. Una sub vencida con pago aprobado sigue siendo facturable.

### Resultado esperado (caso Gastón Laya)
- Pagos de junio con MP aprobado aparecen en Facturación aunque las suscripciones ya estén vencidas.
- Si esos pagos comparten `mp_payment_id`, aparece uno solo.
- La renovación de julio pendiente **no** aparece hasta tener pago confirmado.

---

## Fase 2 — Cola de facturación persistente (`facturacion_cola`)

Migración con nueva tabla:

- Campos de dominio: `pago_id` (FK al registro real de pago), `referencia_tipo`, `referencia_id`, `monto`, `moneda`, `emisor_id`, `pagado_at`, `periodo_pago` (mes real), `periodo_operativo` (mes donde se factura), `motivo_arrastre` (nullable), `estado` (`pendiente` / `facturada` / `excluida` / `anulada`), `factura_id` (nullable).
- Unicidad: **`UNIQUE (referencia_tipo, referencia_id, pago_id)`** — no `(referencia_tipo, referencia_id)` a secas, porque una reserva/pedido/suscripción puede tener cuotas, pagos parciales, saldo, devoluciones y múltiples cobros.
- Se puebla desde pagos confirmados (no desde suscripciones).
- GRANTs + RLS estándar.

### Arrastre por cierre contable
Si un pago confirmado cae en un mes ya cerrado, se puede arrastrar al siguiente mes operativo, **conservando siempre**:

- `pagado_at` original
- `periodo_pago` original
- `periodo_operativo` (mes de facturación efectivo)
- `motivo_arrastre`

Nunca se reescribe la fecha real del cobro.

---

## Detalles técnicos

- **Archivos Fase 1:** `src/pages/admin/billing/PendingPaymentsList.tsx` y helpers de fetch en `src/pages/admin/billing/`.
- **Fase 1 no toca DB** — solo corrige el query/agregación en el front + tipado.
- **Fase 2:** migración `facturacion_cola` + backfill desde los pagos confirmados actuales + refactor de `PendingPaymentsList` para leer de la cola.
- Sin cambios en checkout, reservas ni admin de suscripciones.

---

## Qué NO se hace ahora
- No se toca el flujo de emisión AFIP.
- No se cambia el modelo de suscripciones.
- No se decide política contable de cierre — solo se deja el campo `motivo_arrastre` listo para cuando se defina.

Confirmame si aprobás Fase 1 sola para arrancar, o Fase 1 + Fase 2 en la misma tanda.
