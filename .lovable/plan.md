# Fondazo 29/11 · Corrección del flujo de amigos ciclistas invitados

## Qué hay hoy (verificado)
- Las respuestas viven en `event_rsvp_invites`. Cada amigo ciclista está dentro de `cyclist_guests` (nombre, categoría, almuerzo, WhatsApp), sin id propio, sin decisión y sin auditoría.
- En el panel de RSVP, la "aprobación" es solo un tilde local en pantalla y el botón abre el correo de la persona administradora (`mailto:`). No guarda nada, no controla el cupo de 10 y no queda registro.
- El WhatsApp que se muestra es el del amigo, no el del titular. Eso va contra la regla de la dueña.
- Encuesta real con invitado ciclista: hoy hay solo una, Hernán Martinero Saez (VOY), que invita a "Ivan martinero" (+5491133371546, adulto, almuerza).
- Registro de correos de los últimos 10 días: `fondazo-lunch-confirmation` tiene 52 envíos a 45 direcciones. Hay 6 direcciones con 2 envíos y una con 3, todos del 17/11 y separados por 7 a 60 segundos. `fondazo-cyclist-approval` tiene 1 envío.

## Paso 1 · Diagnóstico de los correos repetidos (solo lectura)
- Ver en `event-rsvp` y en la función/trigger que encola `fondazo-lunch-confirmation` si cada guardado (VOY → editar → guardar) dispara un correo nuevo sin clave de idempotencia por invitación.
- Comparar el contenido guardado de cada par. Si cambió (otros comensales), fue una edición legítima y no es un bug de doble envío. Si es idéntico y está a segundos de distancia, es un doble envío.
- Corrección solo si hay bug: clave de idempotencia `fondazo-lunch-<invite_id>-<hash del grupo de comensales>`. Así una edición real vuelve a avisar y un doble click no. No se reenvía ni se borra nada del historial.

## Paso 2 · Modelo de datos (una migración aditiva, sin tocar lo existente)
- Tabla nueva `event_rsvp_cyclist_guests`: una fila por amigo, generada desde `cyclist_guests` con una clave estable (invite_id + posición + nombre normalizado). Guarda nombre, teléfono E.164 normalizado y `decision` (`pendiente` / `aprobado` / `rechazado`), además de quién decidió, cuándo y un comentario. El estado de pago del fondo (`sin_pago` / `comprobante_recibido` / `pago_verificado`) va separado de la decisión.
- `event_rsvp_cyclist_guest_audit`: solo agrega filas. Registra cada cambio de decisión, de pago y de notificación, con quién lo hizo.
- `event_rsvp_cyclist_notifications`: una fila por intento, con canal (email / whatsapp), estado (`preparado` / `proveedor_aceptado` / `error` / `whatsapp_abierto` / `marcado_enviado_por_admin`), id del mensaje, error y una clave de idempotencia única.
- El cupo de 10 aprobados por evento sale de `events.metadata.rsvp_cyclist_guest_cap` (por defecto 10), para que se pueda reutilizar en otros eventos.
- Permisos: lectura y escritura solo para admin y superadmin con `has_role` sobre `user_roles`. Sin acceso público ni de alumnos. Grants a authenticated y service_role. Nunca castear `super_admin` a `app_role`.
- Rellenado idempotente desde las encuestas actuales (Iván incluido) con decisión `pendiente`. No se cambian `cyclist_guests`, `response`, `lunch_status` ni ningún campo de parrilla.

## Paso 3 · RPC del servidor (SECURITY DEFINER, solo admin)
- `admin_sync_rsvp_cyclist_guests(event_id)`: vuelve a leer las encuestas y agrega amigos nuevos sin pisar decisiones. Si un amigo desaparece de la encuesta, se marca `retirado_por_titular` y no se borra.
- `admin_set_rsvp_cyclist_decision(guest_id, decision, comment)`: bloquea la fila del evento con `FOR UPDATE` y cuenta los aprobados. Rechaza la aprobación número 11 aunque lleguen pedidos al mismo tiempo, y deja auditoría. Aprobar no cambia el pago ni confirma el lugar.
- `admin_rsvp_cyclist_matches(guest_id)`: busca en `alumnos` (cualquier estado: activo, inactivo, exalumno) por teléfono normalizado (exacto, y también por los últimos 8 dígitos) y por nombre (coincidencia aproximada). Devuelve las fichas probables con estado, motivo de la coincidencia e id para abrir el perfil. Nunca vincula sola. Solo admin.
- `admin_mark_rsvp_cyclist_notification(guest_id, kind)`: deja registro de "WhatsApp abierto" o "marcado como enviado por admin". Abrir WhatsApp no cuenta como prueba de envío.
- `admin_set_rsvp_cyclist_payment(guest_id, status, ref)`: estado del fondo, con auditoría.

## Paso 4 · Función `event-rsvp`
- Acción nueva `send_cyclist_approval`, solo admin (verifica la sesión y `has_role`). Recibe guest_id y una confirmación explícita.
- Revisa: decisión `aprobado`, titular con VOY y correo del titular de la encuesta. El destinatario siempre sale de la invitación guardada, nunca del navegador, y nunca es el amigo.
- Clave de idempotencia `fondazo-cyclist-approval-<guest_id>`. Antes de enviar, inserta la fila `preparado` con esa clave única. Si ya existe, no envía de nuevo y devuelve el estado actual (cubre el doble click).
- Envía con el proveedor de correos de la app que ya existe (la misma vía que usa hoy `fondazo-cyclist-approval`). Pasa a `proveedor_aceptado` con el id del mensaje, o a `error` con el detalle. Nunca dice "enviado" sin confirmación del proveedor.
- Contenido: el amigo aprobado, fondo $30.000 por amigo ciclista, alias `granfondo.tc` a nombre de Scarlett Tayná, comprobante al WhatsApp +54 9 11 7171-1122, y aviso de que la parrilla se paga aparte a La Carreta del Gato. Deja claro que la aprobación no confirma el lugar hasta verificar el pago. Los datos de pago salen de `events.metadata` (parametrizable).
- No hay envíos automáticos ni masivos, y en esta tarea no se envía nada.

## Paso 5 · Panel `EventRsvpDashboard`
- Sección "Amigos ciclistas", con el contador "Aprobados X/10" leído del servidor.
- Por amigo: titular, decisión con botones Aprobar o Rechazar (con comentario), estado del pago del fondo y coincidencias probables con alumnos (estado de la ficha y enlace al perfil) con el aviso "posible coincidencia, no vinculado".
- Botón "Enviar correo de aprobación al titular": abre un diálogo de confirmación con la vista previa y el destinatario, y queda deshabilitado mientras envía.
- Botón "Abrir WhatsApp del titular" (`participant_whatsapp` normalizado) con el mensaje y los datos de pago prearmados. Registra `whatsapp_abierto`, y aparte está el botón "Marcar como enviado".
- Se quitan el `mailto:` y el enlace al WhatsApp del amigo (ya no es el canal por defecto). Su teléfono queda solo como dato visible para la persona administradora.
- Historial de notificaciones y de auditoría por amigo.

## Paso 6 · Pruebas y verificación
- Pruebas unitarias del armado del mensaje y de la normalización de teléfonos (`+54 9 11…`, con o sin 15, con o sin 0).
- SQL: aprobaciones al mismo tiempo que intentan pasar de 10 (2 sesiones); idempotencia del envío; un no-admin rechazado en cada RPC; el rellenado no cambia respuestas ni parrilla (comparar antes y después).
- Vista previa: el panel con el caso Hernán → Iván, sin enviar nada.
- No se publica ni se aplica nada sin una autorización aparte.

## Riesgos
- La instancia de Lovable Cloud es la misma para la vista previa y el sitio publicado: la migración y la función afectan producción en cuanto se aplican o despliegan. Por eso aplicar y desplegar necesitan una autorización explícita aparte.
- Siguen abiertos los 7 hallazgos críticos de seguridad que bloquean la publicación.
- El nombre del amigo es texto libre. La clave estable puede cambiar si el titular edita el nombre: el plan lo trata como retiro más un amigo nuevo, y conserva la decisión anterior en la auditoría.
- La coincidencia por nombre es solo una sugerencia. El exalumno no se activa ni recibe gratuidad.

## Detalles técnicos
- Archivos: nueva migración 0119; `supabase/functions/event-rsvp/index.ts`; una plantilla de correo si `fondazo-cyclist-approval` no tiene los datos nuevos; `src/components/admin/EventRsvpDashboard.tsx`; un helper nuevo `src/lib/rsvpCyclistGuests.ts` con sus pruebas.
- Una regla en AGENTS.md: las decisiones sobre amigos ciclistas viven en una tabla por invitado con un cupo bloqueado en el servidor, y las notificaciones van al titular de la encuesta.
