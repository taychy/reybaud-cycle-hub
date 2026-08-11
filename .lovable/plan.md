# Auditoría: ¿el sistema detecta pagos inconsistentes hoy?

**Respuesta corta: no.** Hoy el sistema detecta *ausencia de asignación* (un pago de Mercado Pago que nadie tocó) y *duplicación exacta del mismo ID de operación*. No detecta ninguna inconsistencia de **contenido**: importe distinto a la deuda, pago aplicado a la deuda equivocada, deuda que sigue figurando impaga después de cobrada, o medio de pago mal registrado. No existe ningún estado, campo ni tarea que signifique "este pago está inconsistente".

---

## 1. Qué valida el sistema hoy (lo que sí funciona)

| Control | Dónde vive | Qué cubre |
|---|---|---|
| No se puede duplicar la misma operación MP en la bandeja | Restricción `UNIQUE (cuenta_mp_id, mp_payment_id)` en `mp_account_movements` | Reingesta del mismo pago. Verificado: **0 duplicados** hoy |
| Aviso "este pago ya fue registrado" al imputar | `fn_mp_pago_ya_registrado()` | Busca el ID de operación en suscripciones, créditos y pagos de evento del **mismo alumno** |
| No reasignar a otro alumno | `assign_mp_movement_to_target()` (`already_assigned_to_other_student`) | Evita pisar una asignación previa |
| Sólo ingresos aprobados se imputan | mismo RPC | Bloquea egresos y pagos rechazados |
| Un solo pago de evento por operación | chequeo previo en el bloque `reservation` del mismo RPC | Evita doble pago sobre la misma reserva |
| Semáforo de verificación manual | vista `vw_conciliacion_pagos` (`auto_conciliado` / `verificado` / `por_verificar`) | Clasifica **por medio de pago**, no por consistencia |

**Importante:** `vw_conciliacion_pagos` es lo más cercano a un estado "conciliado" que existe, pero (a) sólo mira el medio de pago y una tilde manual — un pago con importe equivocado igual sale `auto_conciliado`; y (b) **no está siendo consumida por ninguna pantalla**: no aparece en el código de la app, sólo en los tipos autogenerados. Es decir, ese semáforo hoy no se ve en ningún lado.

---

## 2. Inconsistencias que hoy NO puede detectar (con evidencia real)

### A. Pago MP con alumno identificado pero sin impacto en cuenta corriente
Un movimiento con `alumno_id` cargado ya cuenta como "asignado" y **desaparece de la cola de pendientes**, aunque no esté imputado a ninguna deuda (`suscripcion_id`, `reservation_payment_id` y `gasto_id` en blanco). El filtro está en `MpMovementsTab.tsx` (líneas 440 y 469-471): considera asignado con que exista alumno.

> **151 movimientos aprobados por $14.315.775 están en ese estado hoy.** Plata cobrada, alumno identificado, sin efecto en la deuda ni en la cuenta corriente, y fuera de toda alerta.

### B. Deuda que sigue pendiente después del pago
No hay ningún trigger ni consulta que compare el pago contra el estado de la deuda. Consultando la base: **36 suscripciones tienen un pago MP aprobado vinculado y siguen en estado `vencida`/`pendiente`**. Ejemplos verificados: Aldo Marcelo (op 171825988178, $61.480 = precio exacto), Lorena Rojas (op 170508591215), Carina (op 167960112967, $80.030). Según la regla del negocio, pago cobrado + período terminado debería ser `finalizada`, no `vencida` — hoy figuran como deudoras.

### C. Importe distinto a la deuda
Nadie compara `monto del pago` contra `precio_final` de la suscripción ni contra el saldo del cargo. **38 casos con diferencia** entre lo cobrado y lo debido. Algunos serán pagos parciales legítimos, otros no: no hay forma de distinguirlos porque no se guarda ninguna marca de "parcial" ni de "diferencia aceptada".

### D. Pago aplicado a la deuda equivocada
No existe control alguno. El RPC valida que el cargo pertenezca al alumno correcto, pero nada más: cualquier deuda del alumno es un destino válido, sin importar período, importe ni moneda. Una vez imputado, no queda registro de "esto se aplicó mal" ni forma de detectarlo salvo revisión humana.

### E. Medio de pago que dice efectivo aunque venga de MP
Bug confirmado en `assign_mp_movement_to_target()`: al imputar a una suscripción hace `metodo_pago = COALESCE(metodo_pago, 'mercadopago')`. Como el campo casi nunca está vacío (suele venir `pendiente`, `efectivo` o `transferencia`), **el valor viejo nunca se corrige**. Hoy hay **7 suscripciones con ID de operación de Mercado Pago y medio de pago registrado como efectivo/transferencia/pendiente**. Efecto en cadena: distorsiona el arqueo de caja y el semáforo de conciliación.

### F. Créditos duplicados y créditos huérfanos
- **4 créditos en cuenta corriente comparten el mismo ID de operación MP** (`cuenta_ajustes.referencia_externa` no tiene restricción de unicidad): el mismo pago contado dos veces como saldo a favor.
- **24 créditos de origen MP quedaron sin aplicar a ninguna deuda** (`aplicado_a_fuente_id` vacío): inflan el "saldo a favor" del alumno mientras su deuda sigue viva. Este es exactamente el patrón de los casos que ya viste (familia Martinero).

### G. Facturación desacoplada
`facturacion_cola` tiene **410 registros en estado `pendiente`** (desde el 08/07 hasta hoy) contra 158 facturados. La cola no tiene reintento visible ni alerta: un pago puede estar cobrado y conciliado y no facturarse nunca sin que nadie se entere.

---

## 3. Diagnóstico de fondo

El sistema tiene **cinco fuentes de verdad paralelas** (`mp_account_movements`, `suscripciones`, `reservation_payments`, `cuenta_ajustes`, `store_orders`) y ningún proceso que las cruce. Cada RPC de imputación escribe en su tabla y termina; no hay verificación posterior de que el resultado sea coherente.

Lo que falta no es un campo más: falta un **motor de reglas de consistencia** que corra sobre los datos y produzca una lista de excepciones accionable.

---

## 4. Propuesta de solución (a discutir antes de implementar)

**Paso 1 — Vista de excepciones (sin tocar datos).** Una vista `vw_pagos_inconsistencias` que emita una fila por cada anomalía detectada, con tipo, severidad, alumno, importe y referencia. Reglas iniciales: pago con alumno sin imputar; pago vinculado con deuda aún impaga; diferencia importe vs deuda; medio de pago contradictorio con el ID de operación; crédito duplicado por operación; crédito sin aplicar con deuda viva; ítem de facturación estancado.

**Paso 2 — Pestaña "Inconsistencias" en Pagos y Cobranzas.** Lista de tareas con explicación en castellano y acción de resolución directa, más un contador visible en el panel.

**Paso 3 — Corregir las causas raíz.** Arreglar el `COALESCE` del medio de pago; que la imputación a suscripción cierre la deuda y deje el estado correcto; unicidad de operación MP en créditos; que el filtro "sin asignar" exija imputación real y no sólo alumno identificado.

**Paso 4 — Reparación de los casos históricos** detectados arriba, uno por uno y con registro de auditoría.

**Nota:** ninguno de estos pasos se ejecutó. Esta auditoría fue de sólo lectura.

---

## Detalle técnico

Archivos y objetos relevantes: `src/components/admin/MpMovementsTab.tsx` (líneas 436-474 del filtro de asignación), `src/components/admin/DeudoresTab.tsx`, RPCs `assign_mp_movement_to_target`, `assign_mp_movement_to_alumno`, `assign_mp_movement_to_new_suscripcion`, `fn_mp_pago_ya_registrado`, `apply_credit_ajuste_to_target`, `is_metodo_auto_conciliado`, vistas `vw_conciliacion_pagos` y `vw_cuenta_corriente_movimientos`, tablas `mp_account_movements`, `cuenta_ajustes`, `suscripciones`, `reservation_payments`, `store_orders`, `facturacion_cola`, `facturas`. Triggers existentes sobre `suscripciones` y `reservation_payments`: ninguno valida importe contra deuda.
