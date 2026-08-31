# Auditoría read-only: baja de alumnos + "Aplicar a deuda" (Mastronardi)

No se modificó código, ni migraciones, ni datos. Todo lo que sigue está verificado contra el repo y la base de producción (solo lecturas).

---

## Problema 1 — "Edge Function returned a non-2xx status code" al dar de baja

### Flujo exacto

| Paso | Dónde | Qué llama |
|---|---|---|
| Alumno solicita baja | `src/components/student/RequestBajaDialog.tsx:46` | RPC `request_baja_alumno` |
| Admin abre la cola de bajas | `src/components/admin/BajasSolicitudesList.tsx` | lectura de `bajas_solicitudes` |
| **Admin "Confirmar baja"** | `src/components/admin/ConfirmBajaDialog.tsx:52` | **Edge Function `process-baja-confirmacion`** |
| Edge Function | `supabase/functions/process-baja-confirmacion/index.ts:37` | RPC `confirm_baja_alumno` → si falla, devuelve **400** con el mensaje de Postgres |
| Baja directa (sin solicitud) | `src/components/admin/DarBajaDirectaDialog.tsx:101` | RPC `dar_baja_directa` |

El mensaje "Edge Function returned a non-2xx status code" es el texto genérico de `supabase.functions.invoke` cuando `process-baja-confirmacion` responde 400/401/500. La función existe y está desplegada (verificado: responde `400 {"error":"solicitud_id requerido"}` ante un body vacío), así que no es un problema de deploy ni de ruta.

### Causa raíz más probable (alta evidencia)

`confirm_baja_alumno` hace, entre otras cosas:

```sql
UPDATE public.alumnos SET estado='inactivo', grupo='Sin grupo'::grupo_ciclismo, ...
```

Ese UPDATE dispara el trigger `trg_alumnos_grupo_whatsapp_sync` → `reconciliar_tarea_whatsapp_grupo(...)`. Cuando **no existe** una tarea abierta `wa_grupo_<alumno>`, la función entra en la rama de INSERT y ejecuta:

```sql
INSERT INTO public.tareas (..., entidad_tipo, entidad_id, ...)
VALUES (..., 'alumno', p_alumno_id, ...)   -- p_alumno_id es uuid
```

pero `tareas.entidad_id` es de tipo **text** (verificado en `information_schema`). Postgres aborta con `42804: column "entidad_id" is of type text but expression is of type uuid`. La excepción sube por el trigger → aborta `confirm_baja_alumno` → la Edge Function devuelve 400 → la UI muestra el mensaje genérico.

Nota: la función hermana `procesar_cambio_grupo_alumno` sí castea correctamente (`p_alumno_id::text`, línea 182). Solo `reconciliar_tarea_whatsapp_grupo` quedó sin el cast, en la rama de INSERT. Por eso el error aparece de forma intermitente: si el alumno ya tenía una tarea de WhatsApp abierta, se toma la rama UPDATE y la baja funciona.

Evidencia adicional consistente: en `bajas_solicitudes` **las 10 solicitudes más recientes están todas en estado `solicitada`** — nunca se confirmó ninguna desde la app.

### Otras causas posibles (menor evidencia, ordenadas)

2. `confirm_baja_alumno` exige `has_role(auth.uid(),'admin')` sin aceptar `is_super_admin` — pero los 5 perfiles admin existentes tienen el rol `admin` en `user_roles`, así que hoy no es el bloqueante.
3. Solicitud ya no está en estado `solicitada` → `RAISE EXCEPTION 'La solicitud ya no está pendiente'` → 400. Sería un 400 con mensaje claro, no genérico.
4. Header `Authorization` ausente/expirado → 401.
5. **Bug adicional confirmado, no bloqueante:** `process-baja-confirmacion/index.ts:54` y `DarBajaDirectaDialog.tsx:118` invocan `cancel-mp-preapproval` con `{ preapproval_id }`, pero esa función lee `{ suscripcion_id }` y devuelve 400 "Falta suscripcion_id". Resultado: **las suscripciones MP nunca se cancelan realmente** en el flujo de baja; se reporta como `mp_failed` (aviso suave) o se traga en un `console.warn`. Riesgo real de seguir cobrando a un alumno dado de baja.

### Qué mirar el lunes antes de tocar nada

- Logs de la Edge Function `process-baja-confirmacion` inmediatamente después de reproducir el error (hoy no hay logs porque no se invocó recientemente): el body de la respuesta trae el mensaje exacto de Postgres.
- Logs de Postgres filtrando por `error_severity='ERROR'` en la ventana del intento (confirmar el `42804`).
- Confirmar sobre el alumno concreto si existe tarea abierta con `dedupe_key = 'wa_grupo_<alumno_id>'` (si existe, la baja pasaría; si no, falla).

### Propuesta mínima de corrección (para ejecutar después)

1. Migración de una línea: en `reconciliar_tarea_whatsapp_grupo`, cambiar `p_alumno_id` por `p_alumno_id::text` en el INSERT a `tareas`.
2. Alinear el contrato de `cancel-mp-preapproval`: enviar `{ suscripcion_id }` desde `process-baja-confirmacion` (que ya tiene las suscripciones) y desde `DarBajaDirectaDialog`, o aceptar ambos parámetros en la función.
3. Opcional: agregar `OR is_super_admin(auth.uid())` en `confirm_baja_alumno` para alinear con el resto de las RPC admin.
4. Opcional: mostrar en `ConfirmBajaDialog` el mensaje de error real que devuelve la función, no el genérico.

**Riesgos:** el fix 1 es de bajo riesgo (solo cast). El fix 2 sí produce efectos externos (cancela preapprovals reales en Mercado Pago) — probar primero con una suscripción de test. Las bajas ya "confirmadas" en el pasado pueden tener preapprovals vivos: conviene auditar `suscripciones` canceladas con `mp_preapproval_id` no nulo antes de tocar nada.

---

## Problema 2 — Mastronardi, Agostina: "Aplicar a deuda" no funciona

Alumna: `8380f37b-987e-409d-8885-1ffc7bce2366`, `agos1027@hotmail.com`, G3, activa.

### Estado real en base

- Único registro en `cuenta_ajustes`: **tipo `cargo`** de ARS 30.952, concepto "Mensualidad-Pausa-Julio.", medio `mp_externo_josi`, sin aplicar.
- `vw_pagos_disponibles` devuelve un pago sin imputar: **mp_movement `4814f7f0-…`, op `164068106073`, "Plan Pausa 50%", ARS 30.952, disponible 30.952**. Ese es el "SALDO DISPONIBLE" que muestra la UI.
- El otro movimiento (Plan Grupal, 65.500) ya está consumido.
- `get_saldo_alumno` no cuenta ese mp_movement como pago porque no está imputado ni vinculado a una suscripción → cargos 161.952 / pagos 131.000 / debe 30.952. La cifra es consistente con el modelo, no es un error de display.

### Lógica del botón

- Componente: `src/components/admin/SaldoDisponibleSection.tsx` (embebido en `StudentCuentaCorrienteSection.tsx:537`).
- Al abrir, llama RPC `get_alumno_payment_targets(_alumno_id)` y arma la lista de deudas con tres arrays: `subscriptions` → `type: "suscripcion"`, `reservations` → `type: "reservation"`, `cargos` → `type: "cargo"` (líneas 89-99).
- Al aplicar, llama RPC `aplicar_saldo_disponible(..., _obligacion_tipo: target.type, _obligacion_id: target.id, _monto)` (línea 126).
- `aplicar_saldo_disponible` delega en `imputar_pago`, que inserta en `pagos_imputaciones`.

### Causa raíz probable (bug de modelo, no de UI)

`pagos_imputaciones` tiene el CHECK:

```sql
obligacion_tipo IN ('suscripcion','reserva','store_order','turnera','otro')
```

El frontend envía **`'cargo'`** (y **`'reservation'`** en el caso de eventos). Ninguno de los dos está permitido → violación de check `23514` → la RPC falla y el saldo nunca se imputa.

Para Agostina esto es terminal: su **única** deuda elegible que devuelve `get_alumno_payment_targets` es el cargo de cuenta corriente de 30.952 (no hay suscripciones con saldo). Es decir, el único target posible es justamente el tipo que la base rechaza.

Segundo problema, encadenado: aunque la imputación se insertara, `get_saldo_alumno` calcula pagos desde `vw_cuenta_corriente_movimientos` (suscripciones, reservas, ajustes) y **no lee `pagos_imputaciones`**. Un pago imputado contra un cargo de `cuenta_ajustes` seguiría sin bajar el saldo mostrado. Y el botón alternativo (icono "Aplicar este pago a una suscripción" en la fila del ledger) no aparece acá porque solo se renderiza para filas `ajuste_credito`, y el ajuste de Agostina es un **cargo**, no un crédito.

**Conclusión:** no es UI ni elegibilidad; es desalineación entre los tipos que emite el frontend y los que acepta el modelo de imputaciones, más un hueco en el cálculo del saldo para obligaciones de tipo cargo.

### Propuesta mínima de corrección (para ejecutar después)

1. Unificar vocabulario de `obligacion_tipo`: ampliar el CHECK a `('suscripcion','reserva','cargo','store_order','turnera','otro')` **y** mapear `reservation → reserva` en el frontend (o aceptar ambos alias en la RPC). Sin las dos mitades, sigue roto.
2. Hacer que `get_saldo_alumno` (o `vw_cuenta_corriente_movimientos`) reconozca las imputaciones activas contra cargos de `cuenta_ajustes` como pago, para que el saldo baje al aplicar.
3. Caso puntual Agostina: una vez aplicado 1+2, imputar el mp_movement `164068106073` (30.952) contra el cargo "Mensualidad-Pausa-Julio." → saldo queda en 0. **No** crear un ajuste manual de crédito: duplicaría el pago.
4. Verificar cuántos casos más existen: pagos con `disponible > 0` cuya única deuda elegible sea un cargo de cuenta corriente.

**Riesgos:** tocar `get_saldo_alumno` afecta la cuenta corriente de todos los alumnos y el link público — validar con un set de alumnos de control antes/después. Ampliar el CHECK es de bajo riesgo. La imputación puntual es reversible vía `anular_imputacion`.

---

## Siguiente paso

Nada para ejecutar hoy. Cuando quieras avanzar, lo natural es hacer primero el fix 1 de bajas (cast a text) porque es de una línea y desbloquea el flujo, y dejar los cambios de cuenta corriente para una segunda tanda con validación previa.
