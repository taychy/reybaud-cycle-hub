# Diagnóstico Bormio 2027 — seguimiento de Meta y reservas (solo lectura)

No se modificó código, datos ni permisos. No se abrió el navegador ni se creó ninguna reserva.

## Estado actual del evento (leído de la base de datos)
- `status = publicado`, `is_active = true`, audiencia `open`, 0 reservas.
- Paquetes activos: Habitación doble EUR 3.890 · Habitación individual EUR 4.490.
- Atención: esto contradice el supuesto de "borrador/oculto". Bormio hoy es público y acepta reservas directas.

## 1. Meta Pixel — NO implementado
- Revisé `index.html`, `src/` y las funciones del servidor: no hay `fbq`, ni ID de pixel, ni envíos al servidor de Meta.
- No se dispara ningún evento: PageView, ViewContent, Lead, Contact, InitiateCheckout ni Purchase.
- Como no hay pixel, tampoco hay duplicaciones ni aviso de consentimiento para publicidad.
- El botón de WhatsApp (`LandingWhatsAppCta` en `src/components/event/EventPremiumLanding.tsx`) abre wa.me y no registra ningún evento.

## 2. Enlaces de la campaña y UTM
- No hay lectura ni guardado de `utm_*`, `fbclid` ni `gclid` en ningún lugar de la app.
- La landing es `/eventos/e726408b-…` (de `src/lib/eventLinks.ts`). Los parámetros UTM se pueden agregar al enlace y la página carga igual, pero se pierden: no llegan a la reserva.
- No puedo confirmar desde el código a qué URL apuntan los anuncios de la campaña; falta ese dato.

## 3. Flujo público de paquetes (verificado en el código)
- `src/pages/EventDetail.tsx` (~830–860): en la landing premium, `EventPackagesDrawer` recibe `selectPackage` como verdadero para invitados (audiencia abierta) y alumnos, y guarda la elección en `chosenPackageId`.
- `src/components/event/EventPackagesDrawer.tsx`: no se puede continuar sin elegir; muestra "Elegiste {nombre} · {precio}".
- `EventPaymentPlansPublic.tsx`: la seña y las cuotas se calculan con los datos del paquete elegido.
- Las ventanas de reserva reciben `initialPackageId={chosenPackageId}`:
  - Invitado: `src/components/reservation/GuestReservationDrawer.tsx` (líneas 75, 132, 186) preselecciona el paquete, muestra "Cambiar paquete" y envía `package_id`.
  - Alumno: `src/components/reservation/ReservationDrawer.tsx` (líneas 190–197, 496, 790): lo mismo.
- No se repite la selección dentro de la ventana; solo se cambia si se toca "Cambiar paquete".
- Detalle pendiente: el encabezado "Desde · EUR 3.890" (línea 600) aparece siempre porque hay más de un paquete. Es correcto, pero puede confundir a quien eligió la individual.
- No probado hoy en navegador: el paso previo al pago con la cuenta de alumno, y la reserva real hasta el pago (no se hace a propósito).

## 4. ¿Postulación o compra directa?
- Es compra directa: no hay pantalla de postulación para viajes. El CTA lleva a reservar con seña.
- El mensaje del WhatsApp habla de "la postulación", pero en la app esa etapa no existe.

## Prioridades sugeridas (no se implementan sin tu aprobación)
1. Decidir si Bormio debe seguir publicado y con reservas abiertas mientras corre la campaña.
2. Si vas a pautar en Meta: instalar el pixel una sola vez, con ID y aviso de consentimiento para las regiones que lo exigen. Registrar ViewContent en la landing, Contact en WhatsApp, InitiateCheckout al abrir la reserva, Lead al crear la reserva y Purchase solo cuando el pago de la seña esté confirmado. Actualizar la política de privacidad.
3. Guardar los UTM de la primera visita y asociarlos a la reserva.
4. Definir postulación vs compra directa y ajustar el texto del WhatsApp a esa decisión.
5. Con tu autorización: hacer una prueba en navegador como alumno hasta el paso previo al pago, sin pagar.
