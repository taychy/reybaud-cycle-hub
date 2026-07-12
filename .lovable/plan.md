## Objetivo
Reemplazar los campos manuales "% descuento / link" del bloque **Descuento próximo camp** por un sistema real:
- El admin elige **a qué camp** apunta el descuento y **qué código** usar (elegir existente o crear nuevo).
- El sistema genera el **link mágico** que se pega solo en el mail: `https://reybaud-app.com/eventos/:eventId?promo=CODIGO`.
- El link funciona **para todos los destinatarios**, logueados o no.
- **Cupo global** con contador de usos, no por alumno.

## Cambios en base de datos (una migration)

1. `descuentos`
   - `evento_id uuid` nullable, FK a `events(id) on delete set null` (código atado a un camp específico).
   - Índice `(evento_id) where activo`.
2. `event_surveys` — para persistir la elección hecha en el bloque:
   - `descuento_evento_id uuid` nullable (FK a `events`).
   - `descuento_codigo_id uuid` nullable (FK a `descuentos`).
   - Los campos actuales (`descuento_porcentaje`, `descuento_url`, títulos) siguen existiendo — se **auto-completan** desde la selección pero pueden overridearse en texto.
3. Función `redeem_promo_code(codigo text, evento_id uuid, alumno_email text)` (SECURITY DEFINER):
   - Valida activo + vigencia + `usos_actuales < max_usos` + `evento_id` coincide (o nulo).
   - Suma 1 a `usos_actuales` atómicamente.
   - Devuelve `{ ok, descuento_id, porcentaje, valor, tipo, motivo? }`.
4. Función pública read-only `get_promo_code(codigo text, evento_id uuid)` (SECURITY DEFINER):
   - Devuelve datos del código para pintar el banner en la landing pública **sin** consumir cupo (sin login).
   - Retorna `not_found | expired | maxed | scope_mismatch | ok`.

## Cambios en UI admin — `EventSurveyManager.tsx`

Bloque "Descuento próximo camp" pasa a tener:
- **Selector "Camp destino"** — lista los `events` con `category in ('camp','viaje')` y `date >= hoy`.
- **Selector "Código promo"** con dos modos:
  - **Elegir existente:** dropdown de `descuentos` con `aplica_a in ('eventos','todo')` y `evento_id = seleccionado OR null`.
  - **Crear nuevo:** input código + % + cupo máximo + vigencia hasta → inserta en `descuentos` con `evento_id`, `aplica_a='eventos'`.
- Muestra en vivo: contador `usos_actuales / max_usos`, código y **link resultante** (con botón copiar).
- Al guardar, la survey queda con `descuento_url` = link mágico y `descuento_porcentaje` = valor del código.

Los campos texto (título, mensaje, CTA label) siguen editables. El link ya no se escribe a mano.

## Cambios en UI pública — landing del evento

`src/pages/EventDetail.tsx`:
- Al montar, si hay `?promo=XXX`, llama a `get_promo_code` — si `ok`, muestra un **banner naranja arriba del precio**: "Aplicaste el código **CAMP10** — 10% off".
- Guarda `promo` en `sessionStorage` para que sobreviva login/redirects.
- El precio "desde" se muestra tachado con el precio con descuento al lado.
- En el flujo de reserva (crear `event_reservations`), antes del pago se llama a `redeem_promo_code` con `alumno_email`. Si `ok`, se aplica el descuento y se registra `descuento_id` en la reserva.
- Si el descuento choca con otros (ej: familiar), respetamos la lógica existente de mejor descuento en `discountConflicts.ts`.

## Correo (send-survey / send-encuesta)
Sin cambios estructurales: la función de envío ya lee `descuento_url` y `descuento_porcentaje` de la survey; ahora esos campos vienen auto-completados con el link mágico y el % real del código.

## Detalles técnicos
- Todos los `CREATE TABLE` no aplican (sólo `ALTER TABLE ADD COLUMN`).
- El `redeem` es atómico con `UPDATE ... WHERE usos_actuales < max_usos RETURNING` para evitar overshoot bajo carga.
- Anon puede ejecutar `get_promo_code` (lectura); `redeem_promo_code` requiere `authenticated` para asociar la redención al email logueado.
- Si el usuario no está logueado y hace click en el link, el banner se muestra igual, se guarda `promo` en sessionStorage y al loguearse/reservar se aplica.

## Alcance de esta iteración
Sí: migration + admin picker + landing con `?promo=` + aplicación en reserva.
No en esta iteración: dashboard analítico de "cuántos redimieron" (queda `usos_actuales` visible en admin), ni códigos que apliquen a categorías genéricas (solo evento específico).

¿Avanzo con la implementación?