# Plan: medición con Meta (Pixel + Conversions API) para Bormio 2027, con reserva directa

Este es solo un plan. No se cambió código, datos ni la configuración de publicación. La decisión comercial queda igual: reserva directa, seña de €500, precios y cuotas sin cambios.

## A. Qué se comprobó (código y base de datos)
- No hay Meta Pixel en `index.html` ni en `src/`: no aparecen `fbq`, ID de pixel, GTM ni gtag.
- Tampoco hay envíos a la Conversions API en las funciones del servidor.
- No se guardan UTM, `fbclid`, `fbp` ni `fbc` en ningún lugar.
- No hay aviso de cookies ni consentimiento. `src/pages/PrivacyPolicy.tsx` (128 líneas) no menciona a Meta.
- Bormio está `publicado` y `is_active`, con audiencia `open` y 0 reservas. Paquetes: doble €3.890 e individual €4.490.
- Flujo de reserva: `EventDetail.tsx` → `EventPackagesDrawer` → `ReservationDrawer` (alumno) o `GuestReservationDrawer` (invitado, usa la función `create-guest-reservation`). El paquete elegido se conserva con `initialPackageId`.
- Pagos con Mercado Pago:
  - `create-event-mp-preference` crea el intento de pago en `reservation_payment_intents`.
  - `mp-webhook` (y `event-ars-mp-webhook` para pagos en pesos) guarda `reservation_payments` con `mp_payment_id`.
  - Solo en esos webhooks, cuando `payment.status === "approved"`, el pago queda `status='validado'`.
- Las transferencias las valida Administración (`admin-verificar-comprobante`).
- `reservation_payments` guarda `equivalent_amount_event_currency`, `obligation_amount_contract` y `fx_surcharge_amount`. Sirven para informar el valor en EUR sin el recargo cambiario.
- Ya existe una lista de contactos (`marketing_contacts`) con `origen`, `tags`, `opt_in_marketing`, `opt_out_at` y `telefono_normalizado`. Hay que reutilizarla, no crear un registro paralelo.

## B. Lo que no se puede ver desde el código (por verificar)
- Si hay un pixel instalado por fuera: GTM agregado en el hosting, un plugin o el Administrador de eventos de Meta. Hay que revisarlo en Meta Events Manager → Fuentes de datos → "Diagnóstico" y en el sitio publicado.
- A qué URL apuntan hoy los anuncios y con qué UTM.
- Desde qué países llegan las visitas. Si llegan desde Europa, el consentimiento previo es obligatorio.

## C. Datos que faltan (no se inventan)
1. ID del Meta Pixel (Dataset ID).
2. Token de acceso de la Conversions API. Se guarda como dato secreto del servidor y nunca en el código.
3. Código de Test Events, solo para pruebas.
4. Decisión sobre el aviso de cookies: banner en las regiones que lo exigen, o no medir con Meta en esas regiones.
5. Aprobación de un texto nuevo para la política de privacidad.
6. Dominio verificado en Meta (`reybaud-app.com`).

## D. Eventos y dónde se envían

```text
Evento            Navegador (Pixel)                         Servidor (CAPI)                     Cuándo NO se envía
PageView          cambio de ruta (SPA, 1 por URL)           -                                   sin consentimiento
ViewContent       landing del evento cargada                -                                   evento en borrador/oculto
Contact           clic en "Hablar con Reybaud" (WhatsApp)   opcional, mismo event_id            no es una conversación real
InitiateCheckout  abre ReservationDrawer/Guest              -                                   abrir la lista de paquetes
Lead              reserva creada pendiente de pago          mismo event_id (crear reserva)      sin reserva real registrada
Purchase          página de resultado del pago (best-effort) webhook approved / admin valida    reserva pendiente, clic WhatsApp, checkout abierto
```

- **Lead** = reserva registrada en `event_reservations` antes de pagar. Es un dato real que se puede deducir. Los clics de WhatsApp son solo "Contact".
- **Purchase:**
  - `event_id = "purchase_" + reservation_payments.id`, compartido entre el navegador y el servidor para no contarlo dos veces.
  - `order_id` = id de la reserva.
  - `currency = "EUR"`.
  - `value` = monto efectivamente pagado en EUR (`equivalent_amount_event_currency` u `obligation_amount_contract`), sin recargo en pesos. Para la seña normal son €500, no el precio total.
  - El precio total se manda aparte en `custom_data.package_total`.
- Las cuotas siguientes no se marcan como Purchase. Se envían como un evento propio `InstallmentPaid`, para no inflar los resultados.
- Reserva confirmada sin pago (alta manual o efectivo anunciado): solo se registra en la app (`ReservationConfirmed`). No se manda como Purchase.
- Limitación: WhatsApp se abre por fuera de la app. Sin integrar WhatsApp Business no se puede saber si la persona realmente mandó el mensaje.

## E. Consentimiento y privacidad
- Con el banner en las regiones que lo exigen, se lee el país desde `/cdn-cgi/trace`. Si falla, el banner se muestra.
- Aceptar y rechazar tienen el mismo peso, y la elección se puede cambiar desde "Configurar cookies" en el pie.
- Sin consentimiento no se carga el Pixel y no se envía CAPI en esas regiones.
- Se guarda un registro del consentimiento: id de visitante, fecha, versión del texto y opciones elegidas.
- Los eventos que llegan más tarde (el webhook de pago) miran el consentimiento vigente de esa reserva. Si la persona lo retiró, no se envían.
- No se pone ningún dato personal en URLs ni en los parámetros de los eventos.
- Datos para que Meta reconozca a la persona (email y teléfono): solo si se agrega una aceptación explícita para publicidad, y con hash SHA-256 normalizado hecho en el servidor. Si no se pide, solo se envían `fbp`, `fbc`, la IP y el navegador del cliente.
- La política de privacidad debe nombrar a Meta, qué datos recibe, para qué (medición y optimización de anuncios) y cómo retirar el consentimiento.

## F. Atribución
- Al entrar a la app, guardar primera y última fuente en almacenamiento propio del navegador: `utm_*`, `fbclid` → `fbc`, la cookie `_fbp` (solo con consentimiento), la página de entrada y la fecha.
- Asociar esa fuente a:
  - el clic de WhatsApp (registro "click", no conversación);
  - la reserva, cuando se crea;
  - el pago, a través de la reserva.
- Limpiar `fbclid` y UTM de la URL una vez guardados.

## G. Cambios de base de datos propuestos (no ejecutados)
1. `marketing_consents`: id de visitante, `user_id` y `email` opcionales, elección, país, versión del aviso, fechas de aceptación y retiro.
2. `marketing_touchpoints`: id de visitante, `event_id`, tipo (`landing_view`, `whatsapp_click`, `checkout_open`), primera y última fuente (jsonb), `fbp`, `fbc` y fecha. Inserción anónima con id generado en el cliente; lectura solo para admin.
3. `event_reservations.attribution jsonb` (opcional, sin valor obligatorio): copia de la fuente y del id de consentimiento al reservar.
4. `meta_capi_log`: `event_name`, `event_id` único (garantiza enviar una sola vez), `reservation_id`, `payment_id`, estado (`en_cola`, `enviado`, `error`, `omitido_sin_consentimiento`), intentos, último error resumido sin datos personales, `test_mode`.
- Cada tabla nueva va con permisos explícitos, RLS e índices. Los contactos por WhatsApp de personas identificadas se vinculan a `marketing_contacts` existente.

## H. Archivos y funciones a tocar
- Nuevos:
  - `src/lib/metaPixel.ts`: carga condicionada, PageView en cambios de ruta y track con `event_id`.
  - `src/lib/attribution.ts`: captura y guarda la fuente de la visita.
  - `src/components/ConsentBanner.tsx`.
- `src/App.tsx` o `src/main.tsx`: escuchar los cambios de ruta para PageView, una vez por URL.
- `src/pages/EventDetail.tsx`: ViewContent en la landing pública, solo si está publicada.
- `src/components/event/EventPremiumLanding.tsx` (`LandingWhatsAppCta`): Contact y registro "click".
- `ReservationDrawer.tsx` y `GuestReservationDrawer.tsx`: InitiateCheckout al abrir. Al crear la reserva, Lead y envío de la atribución.
- `supabase/functions/create-guest-reservation` y la creación de reserva del alumno: guardar la atribución y encolar Lead.
- `supabase/functions/mp-webhook`, `event-ars-mp-webhook` y `admin-verificar-comprobante`: tras `approved`/`validado`, encolar Purchase o InstallmentPaid de forma idempotente.
- Nueva función `meta-capi-send`:
  - lee la cola y envía a la Graph API usando los datos secretos `META_PIXEL_ID` y `META_CAPI_TOKEN`;
  - agrega `test_event_code` solo si está configurado el modo prueba;
  - reintenta con espera creciente hasta 5 veces y registra en el log sin datos personales.
- `src/pages/PaymentResult.tsx`: Purchase en el navegador con el mismo `event_id`, solo si el pago ya figura validado.
- `src/pages/PrivacyPolicy.tsx`: texto nuevo.
- Pantalla admin simple dentro del evento (pestaña "Consultas y conversiones"): clics de WhatsApp, checkouts abiertos, reservas, señas pagadas por fuente, y el estado de los envíos a Meta.

## I. QA sin transacciones reales
1. Extensión Meta Pixel Helper y Test Events con `test_event_code` en la vista previa.
2. Pruebas automáticas:
   - el Purchase se arma solo con un pago `validado`;
   - `value` es la seña en EUR sin recargo;
   - el mismo `event_id` no se envía dos veces;
   - sin consentimiento, no se envía nada.
3. Webhook: reenviar un pago de prueba ya existente en modo test, o un payload simulado contra una reserva de prueba que se borra al terminar. Nunca una reserva o un pago reales.
4. En producción: verificar solo PageView, ViewContent, Contact e InitiateCheckout, sin crear reservas. Purchase se valida con el primer pago real.
5. Verificar que se recibe cada evento una sola vez, sin duplicados entre navegador y servidor.

## J. Fases y forma de volver atrás
1. Consentimiento, política de privacidad y atribución, sin Meta todavía.
2. Pixel en el navegador: PageView, ViewContent, Contact e InitiateCheckout.
3. CAPI con Lead y Purchase, más la pantalla admin.
- Para volver atrás: un interruptor en `app_config` (`meta_tracking_enabled`) apaga el Pixel y la CAPI sin publicar. Las tablas nuevas no afectan reservas ni pagos.

## Decisiones previas necesarias
- Pasar el ID del Pixel y el token de la CAPI, y confirmar si ya hay un pixel instalado por fuera.
- Elegir: banner en las regiones que lo exigen, o no medir con Meta en esas regiones.
- Confirmar si Purchase cuenta solo la seña (recomendado) y si las cuotas van como evento aparte.
- Decidir si se agrega una aceptación para usar email y teléfono con Meta (por defecto no).
- Aprobar la publicación cuando termine cada fase.

Nota: `roadmap.md` se actualiza al salir de este modo de solo lectura.
