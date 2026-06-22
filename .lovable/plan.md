## Problema

El modal "Nuevo ajuste manual" hoy solo registra **tipo, moneda, concepto, monto, fecha y notas**. Cuando cargás un crédito (pago recibido) no queda registro de **cómo entró la plata** (efectivo / transferencia / MP Josi / MP Scarlett / etc.), por lo que no se puede:
- Cruzar el ingreso con el resumen real de cada cuenta MP o caja
- Filtrar pagos por cuenta receptora
- Conciliar contra los reportes de las cuentas externas

Ya tenemos toda la infraestructura armada (`PAYMENT_METHODS` en `src/lib/paymentMethods.ts` con Efectivo, Transferencia, MP Josi, MP Scarlett, MP Claudio, Tarjeta, Externo; y la tabla `cuentas_mp` con las cuentas MP reales). Solo falta enchufarla al ajuste.

## Solución propuesta

### 1. Base de datos
Agregar a la tabla `cuenta_ajustes` dos columnas opcionales:
- `medio_pago text` → uno de los `PaymentMethodKey` (efectivo, transferencia, mp_externo_josi, mp_externo_scarlett, mp_externo_claudio, tarjeta, plataforma_externa, otro)
- `cuenta_mp_id uuid` → FK opcional a `cuentas_mp` cuando el medio es una cuenta MP específica (para reportes finos)
- `referencia_externa text` → opcional, para guardar nº de operación / últimos 4 dígitos / alias bancario

Solo aplica a `tipo = 'credito'` (ingreso). En `cargo` queda en NULL.

### 2. UI del modal "Nuevo ajuste manual"
Cuando el tipo es **Crédito (a favor)**, agregar:
- Selector **"Medio de pago"** (obligatorio si es crédito) usando `PAYMENT_METHODS`
- Si elige "MP Josi / Scarlett / Claudio / MercadoPago" → resolver `cuenta_mp_id` automáticamente desde `cuentas_mp` por slug
- Campo opcional **"Nº operación / referencia"** (transferencia bancaria, comprobante, etc.)

Si el tipo es **Cargo** estos campos se ocultan.

### 3. Vista cuenta corriente
Agregar en `vw_cuenta_corriente_movimientos` el `medio_pago` dentro de `referencia_extra` para los `ajuste_credito`, y mostrarlo en la columna **"Concepto"** o como sub-línea: `Crédito manual · MP Josi · ref 162457…`.

### 4. Listado de pagos del admin (`/admin/pagos`)
Los ajustes manuales tipo crédito ya deberían aparecer como ingresos. Verificar que el filtro por **medio de pago** los incluya correctamente y que el reporte por cuenta MP los sume.

## Archivos a tocar

```text
supabase/migrations/<nueva>.sql        # ALTER TABLE cuenta_ajustes
src/components/admin/StudentCuentaCorrienteSection.tsx   # modal + insert
src/lib/paymentMethods.ts              # (sin cambios; se reutiliza)
supabase/migrations/<nueva>.sql        # CREATE OR REPLACE VIEW vw_cuenta_corriente_movimientos
```

## Caso de uso resuelto

Daniel transfiere $169.065 a la cuenta de Josi → admin entra a la cuenta corriente de Daniel, **+ Ajuste manual → Crédito → MP Josi → ref 162457749966** → queda asentado tanto en la cuenta corriente del alumno como en los ingresos de la cuenta MP Josi para la conciliación mensual.

## Pendiente de tu confirmación

1. ¿El selector de medio de pago debe ser **obligatorio** en créditos, o lo dejamos opcional con default "Otro"?
2. ¿Querés que también permitamos elegir cuenta en los **cargos** (por si la deuda se origina en una cuenta puntual)? Por defecto digo que no.
3. ¿Mostramos el medio de pago directamente en la columna "Concepto" de la tabla, o agregamos una columna nueva "Medio"?
