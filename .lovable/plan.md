# Módulo Comunicaciones (Fase 1)

Crear una nueva sección en el admin que centralice los puntos de contacto con el alumno. Arrancamos chico: reorganizamos lo que ya existe y dejamos la base lista para sumar canales en fases siguientes.

## Alcance Fase 1 (esta tarea)

1. **Nueva categoría en el sidebar admin**: "Comunicaciones" (ícono `MessageSquare`), como 5ta categoría propia — al mismo nivel que Principal, Finanzas, Configuración, Tienda.
2. **Ruta nueva**: `/admin/comunicaciones` con layout de tabs.
3. **Tres tabs iniciales** (todos contenido ya existente, sólo reubicado/consolidado):
   - **Banners del home** → monta `EventAnnouncementsManager` en modo "todos los eventos" (lista plana de todas las novedades activas con badge del evento al que pertenecen, filtro por estado vigente/expirada/programada, acción rápida para desactivar). Permite editar haciendo click → navega al evento correspondiente.
   - **Novedades por evento** → selector de evento + render del `EventAnnouncementsManager` actual con el `eventId` elegido (misma UX que hoy en EventsList, sólo accesible desde acá también).
   - **Historial de emails** → tabla read-only sobre `email_send_log` deduplicada por `message_id`, con filtros de rango de fecha (24h/7d/30d), template y status. Stats summary arriba (total, enviados, fallidos, suprimidos). Paginada (50/pág).
4. **No se toca**:
   - El banner del alumno (`HomeNewsCarousel`) queda como está. Descartamos el botón "Gestionar" inline.
   - El `EventAnnouncementsManager` actual dentro de `EventsList` queda funcionando (no rompemos el flujo existente).
   - Nada de RLS nueva, ni edge functions, ni tablas nuevas.

## Fuera de alcance (fases futuras, sólo documentar)

- Fase 2: Editor de templates de email (hoy hardcoded en edge functions).
- Fase 3: Templates de WhatsApp + automatizaciones de pagos con UI de configuración.
- Fase 4: Timeline unificado por alumno (qué se le mandó por cada canal).
- Atajo "Gestionar" desde banner del alumno (contextual, opcional).

## Detalles técnicos

- **Archivos nuevos**:
  - `src/pages/admin/AdminComunicaciones.tsx` — page con Tabs de shadcn.
  - `src/components/admin/comunicaciones/BannersHomeTab.tsx` — lista plana de novedades cross-evento.
  - `src/components/admin/comunicaciones/NovedadesPorEventoTab.tsx` — selector + reuso de `EventAnnouncementsManager`.
  - `src/components/admin/comunicaciones/EmailLogTab.tsx` — dashboard de `email_send_log`.
- **Archivos modificados**:
  - `src/pages/admin/AdminLayout.tsx` → agregar categoría "Comunicaciones" + item.
  - `src/App.tsx` (o router) → registrar ruta protegida `/admin/comunicaciones`.
- **Queries clave** (cliente Supabase):
  - Banners home: `SELECT * FROM event_announcements ORDER BY created_at DESC` con join al evento para mostrar nombre.
  - Email log: query con `DISTINCT ON (message_id)` ordenado por `created_at DESC`, paginado.
- **Permisos**: `ProtectedRoute` con rol `admin` (igual que el resto del módulo admin).
- **Memoria**: actualizar `mem://navigation/admin-sidebar-hierarchy` para incluir la 5ta categoría y crear `mem://features/admin-comunicaciones` describiendo el módulo y las fases futuras.

## Criterios de aceptación

- Admin ve "Comunicaciones" en el sidebar y puede entrar.
- Tab "Banners del home" lista todas las novedades activas con su evento asociado.
- Tab "Novedades por evento" permite elegir un evento y administrar sus novedades (misma UX actual).
- Tab "Historial de emails" muestra stats + tabla filtrable de envíos sin duplicar filas por `message_id`.
- El banner del alumno y el flujo actual en EventsList siguen funcionando sin cambios.
