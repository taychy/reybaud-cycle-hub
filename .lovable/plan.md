# Auditoría: error al pagar con tarjeta (solo lectura)

No se modificó código, datos ni configuración.

## Causa raíz confirmada: la tarjeta se tokeniza con una cuenta de Mercado Pago y el cobro se hace con OTRA

- El formulario pide la clave pública a `get-mp-public-key`, que devuelve **siempre** el secret legacy `MP_PUBLIC_KEY` — corresponde a la cuenta **claudio_reybaud** (`es_default_global = true`).
- `process-card-payment` NO usa esa cuenta: llama a `resolveCuentaMP({ unidad_negocio: "suscripcion_escuela" })`, y el routing activo (prioridad 1) apunta a la cuenta **josilene_do_nascimento**, con token `MP_ACCESS_TOKEN_JOSILENE_DO_NASCIMENTO`.
- Un `card_token` generado con la public key de la cuenta A no es válido para cobrar con el access token de la cuenta B: Mercado Pago responde **HTTP 400** y no crea el pago.

Evidencia en datos reales:
- `cuenta_mp_routing`: `suscripcion_escuela → josilene_do_nascimento` (activa, prod), actualizado el 13-Ago-2026.
- `app_config.mp_routing_enabled = true` (el fallback legacy está desactivado).
- Suscripción `96afd991-4286-4013-a26c-130cb89cdc15` (Agustina, $83.500, 1-Sep 01:10): quedó `pendiente`, **sin `mp_payment_id`** y con `mp_status = '400'` — la firma exacta de un rechazo HTTP de la API, no de un rechazo del emisor de la tarjeta.
- Hay 10 suscripciones históricas con `mp_status = '400'` (mismo patrón: sin payment id).
- Todos los pagos aprobados recientes con la cuenta josilene tienen `mp_payment_id` real y vienen del flujo de **link/preferencia** (`create-mp-preference` → `init_point`), que no tokeniza tarjeta. Por eso "el link funciona y la tarjeta en la app no".

## Bug secundario (empeora el diagnóstico)

En `process-card-payment` la guarda es:

```ts
if (!mpResponse.ok && !mpData?.status) { ...mensaje legible... }
```

Los errores de la API de MP traen `status: 400` numérico, así que la condición no se cumple: el código cae en la rama de "rechazo" y guarda `mp_status = '400'`, devolviendo al alumno un error genérico en vez del `cause[0].description` de MP. Por eso nadie ve el motivo real.

## Respuestas puntuales

- **(A) HTTP recientes de las funciones:** no disponibles. La tabla de logs de edge functions sólo retiene ~8 minutos (registro más antiguo 17:56, más nuevo 18:04 del 1-Sep) y sólo contiene crons. **No se puede reconstruir 48-72 h desde logs**; la evidencia usada es la base de datos.
- **(B) ¿MP rechaza pagos?** No hay rechazos de emisor recientes (`mp_status = 'rejected'`: último 7-Ago). Lo que hay es rechazo de la **API** (400) sin `status_detail` persistido.
- **(C) ¿Dónde falla?** La tokenización en el navegador funciona (usa la public key de Claudio y es válida para esa cuenta). Falla **al crear el payment en MP**, dentro de `process-card-payment`. No falla antes ni en el retorno.
- **(D) Alcance por medio de pago:** afecta a **todo lo que pase por el card form** — crédito y débito por igual. No afecta dinero en cuenta / link de pago / QR, porque van por preferencia.
- **(E) Configuración:** sí, hay desalineación. `get-mp-public-key` está hardcodeado al secret legacy y no respeta el routing por unidad de negocio.
- **(F) Flujo actual:** `PlanSelection` → `CardPaymentForm` (public key legacy → `mp.cardForm` → token) → `process-card-payment` (valida sub/monto server-side → `resolveCuentaMP` cuenta josilene → `POST /v1/payments`) → según respuesta actualiza `suscripciones` → `mp-webhook` confirma después.
- **(G) Hipótesis ordenadas:** 1) cruce de cuentas public key / access token (confirmado por routing + `mp_status='400'` sin payment id); 2) enmascaramiento del error por la guarda incorrecta (confirmado por lectura de código); 3) rechazo por emisor (descartado en la ventana reciente).

## (H) Corrección mínima propuesta (a implementar sólo si se aprueba)

1. `get-mp-public-key`: resolver la clave con `resolveCuentaMP({ unidad_negocio: "suscripcion_escuela" })` y devolver `public_key` + `cuenta_slug`; mantener `MP_PUBLIC_KEY` sólo como fallback. Así token y cobro quedan en la misma cuenta.
2. `process-card-payment`: cambiar la guarda a `if (!mpResponse.ok)` cuando `mpData.status` no sea uno de `approved | in_process | pending | rejected`, devolver `cause[0].description` y **no** escribir `mp_status = '400'` (dejar `mp_status = 'api_error'` + guardar la causa para auditoría).
3. Opcional y de bajo riesgo: que la función devuelva `cuenta_slug` y el front lo mande de vuelta, para que el backend valide que el token se generó con la misma cuenta antes de cobrar.

Tests:
- Unitario de `resolveCuentaMP` para `suscripcion_escuela` verificando que devuelve la misma cuenta que usa la public key.
- Test de `process-card-payment` con respuesta MP 400 (`{status:400, cause:[...]}`) verificando que devuelve el mensaje legible y no persiste `mp_status='400'`.
- Test de contrato: `get-mp-public-key` y `process-card-payment` deben resolver el mismo `cuenta_id`.
- Prueba manual en sandbox con tarjeta de crédito y de débito.

Dato que falta para cerrar al 100%: los logs de `process-card-payment` del intento fallido (retención insuficiente) o una captura del error del alumno. Si se necesita evidencia directa, hay que aumentar la retención o registrar el `cause` de MP en base — punto 2 de la corrección.
