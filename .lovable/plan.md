## Objetivo

Recibir notificaciones de Mercado Pago (pagos salientes y entrantes), validar que vengan de MP, consultar el detalle real vía API y actualizar/crear el gasto correspondiente.

## Arquitectura

```text
MP → POST /functions/v1/mp-gastos-webhook
        │
        ├─ Verifica firma x-signature (HMAC)
        ├─ GET /v1/payments/{id} con MP_ACCESS_TOKEN
        ├─ Idempotencia por (mp_payment_id)
        └─ Decide flujo según external_reference:
              ├─ "gasto:<uuid>"     → conciliar gasto existente
              ├─ "gasto_ejec:<uuid>"→ marcar ejecución pagada (RPC pay_gasto_ejecucion)
              └─ sin ref / desconocida → crear gasto "pendiente de conciliar"
```

## Cambios en DB (migración)

1. `gastos`: agregar columnas
   - `mp_payment_id TEXT UNIQUE` (idempotencia)
   - `mp_status TEXT`
   - `mp_external_reference TEXT`
   - `origen_registro TEXT DEFAULT 'manual'` (`'manual' | 'mp_webhook' | 'mp_link'`)
   - `estado_conciliacion TEXT DEFAULT 'conciliado'` (`'conciliado' | 'pendiente_conciliar'`)
   - índice en `mp_payment_id`
2. Nueva tabla `gastos_mp_webhook_log` para trazabilidad (raw payload, status, error, processed_at). Grants + RLS solo super_admin.
3. RPC `apply_mp_payment_to_gasto(p_gasto_id, p_mp_payment_id, p_mp_status, p_monto, p_fecha, p_raw jsonb)` — `SECURITY DEFINER`, actualiza gasto, fija `origen_registro='mp_link'`, marca conciliado.
4. RPC `create_gasto_from_mp(p_mp_payment_id, p_monto, p_moneda, p_fecha, p_descripcion, p_raw)` — crea gasto en estado `pendiente_conciliar` cuando no hay external_reference.

## Edge function: `mp-gastos-webhook`

- `verify_jwt = false` (MP no manda JWT).
- Lee headers `x-signature` y `x-request-id`, valida HMAC con `MP_WEBHOOK_SECRET` siguiendo el formato oficial de MP (`id:<data.id>;request-id:<x-request-id>;ts:<ts>;`).
- Si la firma falla → 401 + log.
- Si OK: `fetch` a `https://api.mercadopago.com/v1/payments/{id}` con `MP_ACCESS_TOKEN`.
- Resuelve `external_reference`:
  - `gasto:<uuid>` → `apply_mp_payment_to_gasto`
  - `gasto_ejec:<uuid>` → `pay_gasto_ejecucion`
  - otro caso → `create_gasto_from_mp` (queda en "Pendiente de conciliar" en la UI)
- Inserta siempre fila en `gastos_mp_webhook_log` (raw, status, decisión).
- Devuelve 200 incluso ante duplicados (idempotencia) para que MP no reintente eternamente.

## UI (SuperAdminGastos)

- Badge "MP" + tooltip con `mp_payment_id` y status en cada fila proveniente de MP.
- Nueva sección "Pendientes de conciliar" (filtra `estado_conciliacion = 'pendiente_conciliar'`) con acción "Vincular a un gasto existente" o "Confirmar como nuevo gasto".
- En el formulario de gasto manual: input opcional "Generar link de pago MP" que en el futuro creará preferencia con `external_reference = "gasto:<uuid>"` (link generation queda fuera de este alcance, sólo dejo el campo `mp_external_reference` listo).

## Secretos

- Reusa `MP_ACCESS_TOKEN` ya configurado.
- **Nuevo:** `MP_WEBHOOK_SECRET` (la "Clave secreta" que MP muestra al configurar el webhook). Lo pido cuando se apruebe el plan.

## URL a cargar en MP

`https://tgqfakfloonbunwkdoug.supabase.co/functions/v1/mp-gastos-webhook`
Eventos a suscribir: **payment** (cubre `payment.created` y `payment.updated`).

## Fuera de alcance (siguiente iteración)

- Generación automática de preferencias de cobro para gastos (link de pago).
- Reconciliación masiva histórica con pagos previos.
