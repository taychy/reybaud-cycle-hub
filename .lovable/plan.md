## Lista de espera por evento

### 1. Nuevo estado del evento

Agregar a `events`:
- `estado_publicacion` enum: `borrador` | `proximamente` | `publicado` | `cerrado` (default `borrador`; migrar los `activo=true` actuales a `publicado`).
- `waitlist_habilitada bool` (default false).
- `waitlist_mensaje text` — copy corto que se muestra arriba del formulario (ej: "Estamos definiendo fechas. Anotate y te avisamos apenas abramos.").

En el listado público (`Eventos.tsx`) y el detalle:
- `borrador` no se lista.
- `proximamente` muestra badge "Próximamente" y CTA "Anotarme en la lista de espera" (oculta paquetes/precios; muestra "fechas y precios a confirmar").
- `publicado` funciona como hoy.
- `cerrado` se lista sin CTA, solo lectura.

### 2. Plantillas de preguntas reutilizables

Tabla `waitlist_question_templates`:
- `nombre` (ej. "Camp base"), `descripcion`.
- `preguntas jsonb` — array de `{ id, orden, label, tipo, opciones, requerida }`.
- Tipos soportados: `text`, `textarea`, `single_choice`, `multi_choice`, `date`, `number`.

Admin en Configuración → "Plantillas lista de espera": CRUD con editor visual para agregar/reordenar/borrar preguntas.

En el editor del evento, tab "Lista de espera":
- Toggle "Habilitar lista de espera".
- Selector "Plantilla base" (opcional) → al elegirla, copia las preguntas al evento.
- Editor local: podés editar/agregar/quitar preguntas específicas de este evento sin tocar la plantilla.
- Las preguntas finales se guardan en `events.waitlist_questions jsonb`.

### 3. Tabla de anotados

Tabla `event_waitlist_entries`:
- `event_id`, `alumno_id` (nullable), `nombre`, `email`, `telefono`, `dni` (nullable).
- `respuestas jsonb` — `{ question_id: valor }`.
- `estado`: `nuevo` | `contactado` | `convertido` | `descartado` (default `nuevo`).
- `admin_notas text`, `contactado_por uuid`, `contactado_at timestamptz`.
- Índice único parcial `(event_id, email)` para evitar duplicados.
- RLS: insert público (con validación de que el evento tenga `waitlist_habilitada`), select/update solo admin.

Al insertar: si viene con `alumno_id` (logueado), linkea; si no, upsert por email y también mete en `marketing_contacts` (best-effort).

### 4. Formulario público

Componente `EventWaitlistDialog`:
- Detecta sesión: si hay alumno, prellena nombre/email/teléfono/DNI (readonly los que ya tenga) y guarda `alumno_id`.
- Si no hay sesión, muestra los mismos campos editables + validación con zod.
- Renderiza dinámicamente las `waitlist_questions` del evento según su `tipo`.
- Al enviar: RPC `submit_waitlist_entry` (SECURITY DEFINER) que valida evento habilitado + inserta.
- Confirmación in-place: "Listo, quedaste anotado. Te avisamos por mail cuando abramos inscripciones."
- Sin envío de email automático (el aviso se hace después vía mail masivo manual).

Entradas al formulario:
- `EventCard` en `Eventos.tsx` cuando `estado_publicacion = proximamente`.
- Botón secundario en `EventDetail` para eventos `proximamente`.
- Link público directo `/eventos/:slug/lista-espera` (para poder compartirlo por WhatsApp/RRSS).

### 5. Panel admin

Nueva página `/admin/eventos/:id/lista-espera`:
- KPIs: total, nuevos, contactados, convertidos, descartados.
- Tabla con filtros por estado + búsqueda por nombre/email + filtro por respuesta (ej. "los que eligieron marzo").
- Acciones por fila: marcar como contactado/convertido/descartado, agregar nota, ver todas las respuestas en un drawer, WhatsApp directo con el teléfono.
- Botón "Exportar CSV" con las respuestas expandidas en columnas.
- Botón "Copiar emails" para pegar en la herramienta de mail masivo.
- Link "Editar preguntas" que abre el tab correspondiente del editor del evento.

En el sidebar admin: contador de entries con estado `nuevo` (todos los eventos), similar al de solicitudes de alojamiento.

### 6. Alcance excluido de esta primera versión

- Conversión asistida a reserva (queda para después; por ahora el aviso masivo lleva al link del evento y el alumno reserva normal).
- Notificación automática al publicar (confirmaste que se hace manual desde mail masivo).
- Preventa exclusiva / prioridad con token (no lo pediste).

### Detalles técnicos

- Migración crea: `waitlist_question_templates`, `event_waitlist_entries`, columnas nuevas en `events`, RPC `submit_waitlist_entry`, RPC `count_new_waitlist_entries` para el badge.
- GRANTs: templates y entries → `authenticated` + `service_role`; entries también `INSERT` para `anon` vía RPC (la RPC valida).
- Frontend nuevo: `EventWaitlistDialog.tsx`, `WaitlistQuestionsEditor.tsx` (reutilizable en plantillas y evento), `AdminWaitlistTemplates.tsx`, `AdminEventWaitlist.tsx`, página pública `EventWaitlistPage.tsx`.
- Frontend editado: `Eventos.tsx`, `EventDetail.tsx`, editor de evento admin, `AdminLayout.tsx` (badge + link a plantillas).

¿Confirmás y arranco con la migración + backend, o querés ajustar algo antes?