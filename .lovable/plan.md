# Informe: enlace privado para pagar solo la jornada adicional (San Luis 2026)

Solo informe. Hasta que lo autorices no se cambia código, base de datos, Extras ni se envían correos.

## Qué ya existe y se puede reutilizar
- **Enlace privado por reserva:** `admin_trip_additional_day_link` (desde el reporte admin de jornada adicional) genera un enlace personal ya validado para cada reserva. Hoy solo sirve para *responder interés*, no para pagar.
- **Pantalla de pago:** `/mis-reservas/:id?action=pay` y la vista externa con token (`ExternalTripView`). Cobra el **saldo total** o **una cuota**; no sabe cobrar un Extra puntual.
- **Cobro MP:** la función `create-event-mp-preference` arma la preferencia (un ítem), crea un intento de 15 min en `reservation_payment_intents` y usa `external_reference = event:<reserva>[:inst:N]`. El webhook `event-ars-mp-webhook` no duplica por `mp_payment_id`, suma a `amount_paid` y, si hay cuota, la imputa.
- **Extras inactivos provisionales:** cabaña $220.000, doble PC $280.000, individual PC $315.000 (siguen inactivos).

## Riesgos detectados en lo actual
1. `create-event-mp-preference` **no valida quién llama** y **acepta un monto enviado por el navegador** (`amount`). Para un enlace por correo esto es inaceptable: el monto debe salir siempre del servidor.
2. Si la persona paga "saldo" en vez de la jornada, el dinero se mezcla con cuotas/saldos anteriores (caso Luciano, con pagos mal imputados).
3. No hay marca que diga "este pago es de la jornada adicional"; la cuenta corriente lo vería como un pago genérico de la reserva.
4. Rodrigo y Teresa ya tienen la jornada cargada (Teresa pagada; Rodrigo cubierto por un ingreso de $395.000 pendiente de imputar). Un enlace para ellos generaría doble cobro.

## Qué faltaría implementar
1. **Concepto nuevo `jornada_adicional`** en el cobro: la función acepta `addon_id` (no monto), busca la línea del Extra *ya cargada en esa reserva*, calcula pendiente en servidor y crea un ítem detallado: "Jornada adicional 5–9/11 — Cabaña triple · $220.000". `external_reference = event:<reserva>:addon:<línea>`.
2. **Webhook:** si la referencia es `addon:`, registra el pago vinculado a esa línea, marca la línea pagada y **no** toca cuotas.
3. **Enlace privado de pago:** reutilizar el token de jornada adicional (ya limitado a la reserva y con caducidad), con alcance "solo pagar este Extra". Sin acceso por DNI ni por email escrito a mano. Página mínima: detalle, monto y botón "Pagar con Mercado Pago".
4. **Condiciones antes de ofrecer el pago** (todas en servidor):
   - elección validada `attend_5_9`, reserva confirmada, condiciones aceptadas, sin transferencia de cupo pendiente;
   - Extra **aprobado** (nueva marca separada de "activo en el catálogo", para no abrir venta pública);
   - línea cargada a esa reserva, con precio del paquete correspondiente;
   - nada pendiente: ni pago validado, ni intento abierto, ni ingreso MP aprobado sin imputar del mismo alumno/monto (caso Rodrigo), ni pagos en revisión (caso Luciano → bloqueado hasta regularizar).
5. **Anti doble cobro:** un solo intento abierto por línea (índice único), bloqueo de la fila al crear la preferencia, `mp_payment_id` único, reintentos del webhook idempotentes.
6. **Correo:** plantilla transaccional con el enlace, enviada solo con confirmación humana, persona por persona; estados en cola/enviado/error con confirmación real del proveedor.
7. **Pruebas:** monto alterado desde el navegador ignorado; reserva ajena rechazada; doble clic = un solo intento; webhook repetido = un solo pago; cuotas intactas; Extra no aprobado = sin botón; Rodrigo/Teresa/Luciano bloqueados.

## Qué se puede preparar ahora sin habilitar cobros
- Construir todo lo anterior con el pago **apagado** (la marca de aprobación queda en "no"): la página muestra "Pago aún no habilitado" y no crea preferencias.
- Generar un **listado borrador** de destinatarios elegibles (attend_5_9 validados, sin jornada pagada ni ingreso pendiente), con monto según paquete y motivo de exclusión de cada uno, sin enlaces activos ni envíos.
- Dejar la plantilla de correo en borrador y verla en la vista previa.
- QA en el entorno privado existente de jornada adicional (allowlist), sin reservas reales.

## Orden sugerido
1. Aprobar valores finales (hoy provisionales).
2. Regularizar Rodrigo (imputar $395.000) y Luciano (pago de $184.450).
3. Implementar con pago apagado + pruebas.
4. Revisar borrador de destinatarios y correo.
5. Activar pago y enviar uno por uno, con tu autorización.

## Detalle técnico
- Archivos: `supabase/functions/create-event-mp-preference`, `event-ars-mp-webhook`, `ExternalTripView.tsx`, `EventAdditionalDayReport.tsx`; migración para `reservation_payment_intents.addon_line_id`, índice único de intento abierto por línea y marca `payment_approved` en metadata del Extra.
- Autorización: sesión del titular (`alumno_id` del JWT) o token de jornada adicional resuelto vía RPC SECURITY DEFINER; nunca confiar en `amount` del cliente.
