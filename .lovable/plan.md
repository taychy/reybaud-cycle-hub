
## Objetivo
Permitir al alumno pagar una reserva de evento/viaje por transferencia bancaria con un flujo idéntico al de Turnera: ver datos bancarios, hold de 2 h, email de instrucciones, subida de comprobante, validación admin.

## Datos bancarios (Eventos/Viajes)
- Titular: Scarlett Tayna Barros Silva
- Alias: `granfondo.tc`
- CBU/CVU: `0000003100065071427147`

Se agregan en `src/lib/contactInfo.ts` como `EVENTOS_TRANSFER_INFO`.

## Cambios

### 1. Frontend — nuevo drawer `PayByTransferDrawer`
`src/components/reservation/PayByTransferDrawer.tsx`

- Muestra monto sugerido (próxima cuota o saldo) en la moneda del evento.
- Muestra Titular / CBU / Alias con copy-to-clipboard (mismo patrón que `CheckoutMethodStep` transfer-only).
- Botón "Confirmar — tengo 2 h para transferir" → invoca edge function `create-reservation-transferencia`, que devuelve `upload_token`, `hold_expira_at` y `amount`.
- Al confirmar, cierra este drawer y abre `ReportPaymentDrawer` en `mode="paid"` con `method="transferencia"` y monto pre-cargado, listo para subir el comprobante.
- Muestra countdown de 2 h si ya hay hold activo.

### 2. Integración con `ReservationDrawer` / tarjeta de reserva
- Nuevo botón "Pagar por transferencia" junto a "Pagar con MP" y "Ya pagué".
- Si la reserva ya tiene un intent `pendiente_transferencia` vigente, el botón dice "Continuar transferencia (te quedan XX:XX)".

### 3. Edge function `create-reservation-transferencia`
`supabase/functions/create-reservation-transferencia/index.ts`

- Requiere JWT del alumno dueño (verificado contra `event_reservations.alumno_id → alumnos.user_id`).
- Calcula monto a pagar (RPC existente `importe_a_pagar_ahora`).
- Inserta / actualiza fila en `reservation_payment_intents` con:
  - `concepto = 'transferencia'`, `status = 'pendiente_transferencia'`
  - `amount`, `currency`, `expires_at = now() + 2h`
  - `payload = { upload_token, tipo: 'transferencia' }`
- Dispara email `send-reservation-transferencia-instrucciones` (best-effort).
- Devuelve `{ upload_token, hold_expira_at, amount, currency }`.

### 4. Edge function `send-reservation-transferencia-instrucciones`
Nueva función, modelada sobre `send-turnera-email` tipo `transferencia_instrucciones`. Incluye: nombre del evento, monto, moneda, datos bancarios, deadline (2 h), link directo a la reserva para subir comprobante.

### 5. Extender `expire-turnera-holds` (o nueva `expire-reservation-holds`)
Cron diario/horario que marca intents `pendiente_transferencia` vencidos como `expirado` y libera el estado de la reserva (vuelve a `pendiente_pago`).

### 6. Migración DB
Sólo asegura que `reservation_payment_intents.status` acepte `'pendiente_transferencia'` y `'expirado'` (columna `text`, no requiere DDL; se documenta). No se cambia estructura.

## Fuera de alcance
- No se cambia el flujo MP existente.
- No se toca el flujo `ReportPaymentDrawer` (se reutiliza tal cual).
- Validación admin del comprobante sigue igual (informado → confirmado).

## Riesgo
Bajo: agregamos ruta paralela; los pagos existentes (MP y "ya pagué" manual) siguen funcionando exactamente igual.

¿Avanzo con esta implementación?
