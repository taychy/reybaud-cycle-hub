# Plan: pagos Formación Inicial (MP + transferencia, 1 pago o 2 cuotas)

## Alcance
Sumar en la landing `/formacion-inicial` la elección de **método de pago** (Mercado Pago o Transferencia) además de la modalidad (Contado o 2 cuotas). Para 2 cuotas, la cuota 1 se cobra en el momento y la cuota 2 queda como deuda en cuenta corriente con vencimiento a 30 días.

## Combinaciones

| Modalidad | Método | Comportamiento |
|---|---|---|
| Contado + MP | MP | Checkout MP por el total. Al aprobar → suscripción `activa`. (Ya funciona) |
| Contado + Transferencia | Transferencia | Suscripción `pendiente_verificacion`. El alumno ve CBU/alias y sube comprobante. Admin valida. |
| 2 cuotas + MP | MP | Checkout MP **solo por la cuota 1**. Se crea deuda en cuenta corriente por la cuota 2 (vence a 30 días). |
| 2 cuotas + Transferencia | Transferencia | Suscripción `pendiente_verificacion` por la cuota 1 (con comprobante). Cuota 2 queda como deuda en cuenta corriente (vence a 30 días). |

## UI Landing (`FormacionInicial.tsx`)
1. Se mantienen los cards de "Un pago" / "2 cuotas".
2. Debajo del formulario se agrega un selector **Método de pago**: `Mercado Pago` / `Transferencia`.
3. Al elegir Transferencia se muestra un bloque con **CBU / Alias / Titular** de la cuenta de la escuela y un input para subir comprobante (imagen o PDF).
4. Botón final:
   - MP → "Ir a pagar y asegurar mi lugar" (comportamiento actual)
   - Transferencia → "Enviar comprobante y reservar mi lugar" → sube archivo + POST a la edge function.
5. Mensaje claro en 2 cuotas: *"Hoy pagás la cuota 1 ($X). La cuota 2 ($X) queda pendiente y vence el DD/MM. Podés pagarla desde tu cuenta corriente."*

## Edge function `enroll-programa`
Cambios:
- Nuevo campo en payload: `metodo_pago_inicial: "mp" | "transferencia"`.
- Nuevo campo opcional: `comprobante_url` (path en Storage) para transferencia.
- Si `modo_pago = "cuotas"`:
  - `unit_price` cuota 1 = `precio_cuota`.
  - Crear un registro en `cuenta_ajustes` (o el mecanismo existente de deuda) por la cuota 2 con `fecha_vencimiento = hoy + 30 días`, vinculado a la suscripción y al plan.
  - MP preference: `items[].unit_price = precio_cuota` (solo cuota 1). Se remueve la lógica actual de `installments` forzado.
- Si `metodo_pago_inicial = "transferencia"`:
  - No se crea preferencia MP.
  - Sub queda en `estado = "pendiente_verificacion"` con `metodo_pago = "transferencia"`, `comprobante_url` guardado.
  - Se dispara notificación al admin (reutilizando el patrón de `notify-cash-payment`).
  - Response devuelve `{ ok: true, mode: "transfer", suscripcion_id }` en lugar de `init_point`.

## Bloqueo por cuota 2 impaga
- Cuando la deuda de cuota 2 vence sin pago, se marca la sub como `suspendida_impago` (o se usa el mismo flag de acceso restringido que ya usa el resto del sistema).
- Se genera automáticamente una **notificación en admin** (tabla `admin_notification_events` con `tipo = "cuota_programa_vencida"`) para que el equipo tome acción.
- El bloqueo se ejecuta desde el cron diario ya existente (`renew-monthly-subscriptions` o similar) sumando un chequeo para deudas de cuota 2 del programa.

## Datos de transferencia
Se toman de la cuenta de la escuela (misma unidad de negocio `suscripcion_escuela`). Se leen del emisor fiscal vinculado a esa cuenta (`emisores_fiscales.cbu`, `.alias`, `.titular`) o, si no está poblado, se agrega un fallback en `src/lib/contactInfo.ts` similar a `ASESORIA_TRANSFER_INFO` (a confirmar con el usuario si prefiere hardcodear).

## Archivos a tocar
- `src/pages/FormacionInicial.tsx` — selector de método + bloque transferencia + comprobante.
- `supabase/functions/enroll-programa/index.ts` — soporte transferencia + generación de cuota 2 como deuda.
- Nueva edge fn o reuso de `notify-cash-payment` para el alerta admin de transferencia.
- Migration: agregar `tipo = 'cuota_programa_vencida'` a `admin_notification_events` si hace falta, y helper SQL para generar la deuda de cuota 2 (o insert directo desde la edge).
- Cron/función que vence la cuota 2 y bloquea acceso + genera notificación (extender `renew-monthly-subscriptions` o crear `expire-programa-cuota-2`).

## Preguntas técnicas abiertas (las resuelvo al implementar salvo que corrijas)
1. **Storage bucket para comprobantes**: reutilizo el bucket existente que ya usan los pagos manuales (si lo hay); si no, creo `comprobantes-programa`.
2. **Deuda cuota 2**: la registro en `cuenta_ajustes` con `tipo = "deuda"` (o el mecanismo estándar de cuenta corriente del proyecto). Se ligará a la sub y al plan para poder pagarla desde el módulo público de cuenta corriente ya existente.
3. **Datos transferencia**: si el emisor fiscal de la escuela no tiene CBU/alias cargados, uso valores fallback hardcoded en `contactInfo.ts` con TODO para que los completes.
