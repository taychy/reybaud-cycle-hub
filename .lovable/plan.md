# Auditoría: email cruzado Greco / Mantilla (1-Sep)

Solo lectura. No se modificó código ni datos.

## 1) Qué se buscó y qué se descartó

Se buscó el texto exacto del email ("Ya podes pagar tu mensualidad", "Descargue su Factura") en todo el repo (`src/` y las 90+ Edge Functions) y en las plantillas de base:

- No existe en el código: ninguna función genera ese asunto ni ese botón.
- `email_templates` (12 filas activas) no tiene ninguna plantilla con ese asunto. La única de mensualidad es `renewal_pending`: "Tu plan {plan_nombre} se renovó — regularizá antes del 5".
- `send-factura-email` usa asunto "Tu factura N de Reybaud Ciclismo" y botón "Descargar PDF" (no "Descargue su Factura").
- `broadcasts`: el último envío masivo fue el 30-Ago; no hay ninguno el 1-Sep. Además el asunto de broadcast **no** se personaliza (solo el cuerpo), así que nunca podría contener un nombre propio.
- `pgmq.a_transactional_emails` está vacía (los mensajes se borran al enviarse), no hay rastro de payloads del 1-Sep.

## 2) Cómo resuelven destinatario y nombre los caminos reales

Todos los caminos internos resuelven ambos datos **de la misma fila de alumno**, dentro de la misma iteración:

- `send-factura-email`: lee `facturas` → `alumnos` por `factura.alumno_id`; usa `alumno.nombre` y `alumno.email`.
- `renew-monthly-subscriptions`: por cada renovación relee `alumnos` por `r.alumno_id` dentro del `for`; nombre y `to` salen del mismo objeto.
- `send-monthly-plan-changes-reminder`: arma `html` por destinatario dentro del loop (`buildHtml({ nombre: r.nombre })`, `to: [{ email: r.email }]`).
- `send-broadcast`: `Promise.all` por lotes de 8, pero `html` y `to` se construyen dentro del `map` con la variable `r` del lote — no hay estado compartido entre destinatarios.
- `process-email-queue`: procesa mensaje por mensaje; el `to`, `subject` y `html` viajan juntos en el payload.

No se detectó ningún loop que reutilice variables entre destinatarios.

## 3) Datos reales del caso (SELECT)

- Greco `cfb2cc6f…`: nombre "Cristian Ariel", email `grecocristian@yahoo.com.ar`, `emails_adicionales` vacío, `auth.users` propio.
- Mantilla `b2a04565…`: nombre "Christian Augusto", email `chris_mantilla@hotmail.com`, `emails_adicionales` vacío, `auth.users` propio.
- `marketing_contacts`: una fila por cada uno, correctas.
- Ningún alumno tiene el mail de Greco en `emails_adicionales`.
- `email_send_log`: para ambos, el último registro es del 25-Ago (`monthly-plan-changes-reminder`). Ninguno el 1-Sep.
- Ambos ya tenían suscripción de Septiembre creada (24 y 25 de Agosto), por lo que el cron `renew-monthly-subscriptions` del 1-Sep 09:30 **no** los procesó ni les generó mail.

## 4) Causa raíz

El email **no fue generado por esta aplicación**. Coinciden cinco señales: el texto no existe en el código ni en las plantillas, el tono es de "usted" (el resto de la app tutea), no hay registro en `email_send_log` ni en la cola, no hubo broadcast ese día y ninguna renovación los tocó.

Escenario más probable: un envío externo con mail-merge (campaña/automatización en Brevo fuera de la app, planilla de cobranzas o sistema administrativo previo) donde la fila de contacto tiene el email de Greco asociado al nombre de Mantilla — típico corrimiento de columnas en una importación o merge de contactos.

Punto pendiente de confirmación (no deducible desde la base): hace falta el **encabezado técnico del email recibido** (Message-ID, From, Return-Path, y las cabeceras `X-Mailin-*` / `List-Unsubscribe`). Eso identifica el emisor exacto en un paso.

## 5) Alcance potencial

- Vía app: bajo. El único mecanismo interno donde el mail personalizado de la persona A puede llegar a la dirección B es `notify-student-update`, que envía también a `emails_adicionales`. Hoy ninguno de los dos alumnos tiene direcciones adicionales, y nadie tiene la de Greco cargada.
- Vía externa: si el cruce viene de una lista mal importada, puede afectar a cualquier contacto de esa lista. El alcance se determina revisando la fuente del envío, no la base de la app.

## 6) Corrección mínima y segura propuesta (a implementar solo si se aprueba)

1. Confirmar el emisor con las cabeceras del email; si es un envío externo, corregir/regenerar esa lista desde `marketing_contacts` (que está sana) y dejar de usar planillas paralelas.
2. Trazabilidad: registrar también en `email_send_log` los envíos que hoy no lo hacen (`send-broadcast`, `notify-*` que van directo al gateway), para que cualquier reclamo futuro se resuelva con una consulta y no con una auditoría.
3. Guarda defensiva en el worker de cola: verificar que el `to` del payload coincida con el destinatario esperado y que el HTML no contenga otro email de la base antes de enviar (log de advertencia, sin bloquear).
4. Tests: unitario de `personalize()` en `send-broadcast` con lote de 8 verificando que cada HTML contiene solo su propio nombre; test del worker validando `to` vs snapshot.

Nada de esto se ejecuta hasta que se apruebe.
