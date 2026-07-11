
# Rediseño del Dashboard de Roadbook

Convertir `EventRoadbookEditor` (hoy un accordion plano) en un panel completo con: barra sticky de estado, secciones en cards, drag-and-drop en días, sistema de plantillas reutilizables entre eventos, y un módulo de "compartir con prospectos" con links teaser únicos, expiración, tracking de apertura y captura de leads.

## 1. Base de datos (nueva migración)

**`roadbook_templates`** — plantillas reutilizables
- `id uuid pk`, `nombre text`, `roadbook jsonb`, `created_by uuid`, `created_at`, `updated_at`
- RLS: admin/super_admin lectura y escritura. GRANT a `authenticated` + `service_role`.

**`roadbook_prospect_links`** — links teaser por prospecto
- `id uuid pk`, `event_id uuid fk events`, `token text unique` (nanoid ~20 chars)
- `nombre text`, `apellido text`, `email text` (los 3 obligatorios)
- `expires_at timestamptz`, `opened_at timestamptz null`, `open_count int default 0`
- `created_by uuid`, `created_at`
- RLS: admin lee/escribe; `anon` puede SELECT por token vía RPC `get_prospect_roadbook(token)` que devuelve versión teaser (sin hoteles ni gpx) + valida expiración y actualiza `opened_at`.
- GRANT SELECT/INSERT/UPDATE al `authenticated`, GRANT ALL a `service_role`. Sin GRANT a `anon` (se accede solo por RPC security definer).

## 2. Componente principal — `EventRoadbookEditor.tsx` (rewrite)

Layout: barra sticky arriba + cards apiladas.

**Sticky bar**
- Ícono Map + "Roadbook del viaje" + badge estado dinámico (`Guardado` verde / `Sin guardar` gris / `Publicada` naranja si `roadbook_published_at` existe)
- Botones derecha: `Plantillas ▾` (DropdownMenu con plantillas guardadas), `Compartir` (scroll a sección compartir), `Guardar` (primario)
- Estado `dirty` calculado por diff shallow del roadbook cargado vs actual

**Card "Información general"**: bajada, fechas, recorrido (idem actual pero en card con título e ícono).

**Card "Itinerario · N días"**
- Cada día: fila con drag handle (`@dnd-kit/sortable`, ya instalado), número, título inline editable, chevron para expandir
- Expandido: km, desnivel, hotel, gpx_url, botón eliminar
- Primer día expandido por defecto; resto colapsado
- Botón "+ Agregar día" al final

**Cards Alojamientos / Bienvenida / Clima / Día de salida**: accordion colapsado por defecto (títulos con fecha si aplica).

**Card "Plantillas guardadas"**
- Fetch de `roadbook_templates`
- Cada fila: nombre + "Actualizada hace X" + botón `Usar` (confirma si hay `dirty`, reemplaza estado)
- Botón dashed "+ Guardar este roadbook como plantilla" → modal con nombre → INSERT

**Card "Compartir con clientes potenciales"**
- Badge outline "Vista teaser" + subtítulo aclaratorio
- Form: Nombre, Apellido, Email (los 3 required), select expiración (7/15/30 días)
- Botón "Generar y enviar link": inserta en `roadbook_prospect_links`, invoca edge function `send-prospect-roadbook` que manda el email con el link teaser
- Lista debajo: prospectos con nombre, email, "vence en X días" / "venció hace X días", badge estado:
  - Verde "Abrió hace X días" si `opened_at`
  - Gris "Sin abrir" si null y no expirado
  - Rojo "Expirado" si vencido

## 3. Vista pública teaser — `src/pages/PublicRoadbookTeaser.tsx`

Ruta `/roadbook/:token` (agregar a `App.tsx`, sin auth).
- Llama RPC `get_prospect_roadbook(token)`; si válido: renderiza roadbook **teaser** (intro, fechas, recorrido, itinerario con día/título/km/desnivel/fecha, secciones bienvenida/clima/salida) — **sin hoteles exactos por noche ni links GPX**
- Si expirado o inexistente: pantalla dedicada con ícono Clock, título "Este link venció", texto y 2 botones: primario WhatsApp (usa `contactInfo`), secundario email
- Trackea apertura la primera vez (RPC hace UPDATE)

## 4. Edge function — `supabase/functions/send-prospect-roadbook/index.ts`

Recibe `{ linkId }`, arma email con branding del proyecto (naranja + Oswald), muestra teaser del recorrido, CTA "Ver detalles del viaje" apuntando a `${SITE_URL}/roadbook/:token`. Se despacha vía cola existente (`enqueue_email` con purpose `transactional` + template `prospect-roadbook`). Sin adjuntos.

Registrar template en `_shared/transactional-email-templates/prospect-roadbook.tsx` + registry.

## 5. Integración `EventsList` (donde ya vive el editor)

- Card "Novedades del evento" y "Encuesta de cierre" quedan **fuera** del rediseño del roadbook (mantienen su lugar actual)
- El editor se muestra igual, pero ahora ocupa más espacio; ajustar solo si hay overflow

## 6. Detalles técnicos

- `dirty`: `useMemo(() => JSON.stringify(rb) !== JSON.stringify(loadedRb), ...)`
- Drag & drop: reusar `DndContext` + `SortableContext` con estrategia `verticalListSortingStrategy` (ya usado en `EventSurveyManager`)
- Email prospecto: idempotency key = `prospect-link-{id}`
- Filtrado teaser: helper `toTeaserRoadbook(rb)` en `src/lib/roadbook.ts` que devuelve nuevo objeto sin `hotel` en días, sin `gpx_url` y sin array `alojamientos`
- Timezone: mostrar "vence en X días" con `Math.ceil((expires_at - now) / 86400000)` sin `Date` directo sobre strings

## Archivos afectados

Nuevos:
- `supabase/migrations/<ts>_roadbook_templates_and_prospects.sql`
- `src/pages/PublicRoadbookTeaser.tsx`
- `supabase/functions/send-prospect-roadbook/index.ts`
- `supabase/functions/_shared/transactional-email-templates/prospect-roadbook.tsx`

Editados:
- `src/components/admin/EventRoadbookEditor.tsx` (rewrite)
- `src/lib/roadbook.ts` (helper teaser + tipos)
- `src/App.tsx` (ruta pública)
- `_shared/transactional-email-templates/registry.ts`
- `src/integrations/supabase/types.ts` (regenerado tras migración)

## Fuera de scope (confirmar)

- Editar la vista del alumno logueado (`EventRoadbook.tsx`) — sigue igual
- Cambiar cómo se envía el mail del roadbook a participantes ya inscriptos — sigue igual
- Novedades / Encuesta de cierre — se dejan como están (solo se acomoda el layout circundante si hace falta)

¿Avanzo con todo el plan tal cual, o querés ajustar algo antes (por ej: sacar plantillas por ahora, o dejar links de prospectos sin envío de email automático)?
