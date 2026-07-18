# Chequeo de alumnos (uso interno del staff)

Espacio dentro del perfil del coach donde, elegido un grupo, recorre alumno por alumno, califica en varias dimensiones y suma notas al timeline. **Solo visible para staff (coach + admin + super admin). El alumno nunca lo ve.**

## Escalas (multi-dimensional 1–5)

Dos bloques, cada dimensión con nota 1–5 (íconos/estrellas) + comentario corto opcional:

**Técnico**
- Postura sobre la bici
- Cadencia / pedaleo
- Manejo y trazada
- Potencia / fuerza

**Rendimiento y actitud**
- Estado físico general
- Constancia / asistencia
- Actitud y compromiso
- Progreso vs. último chequeo

Cada dimensión guarda el número + texto opcional. Se muestra un **promedio técnico** y **promedio rendimiento** calculados.

## Flujo del coach

1. Entra a **Coach → "Chequeo de alumnos"** (nueva tarjeta en el dash, misma familia visual que "Chequeo WhatsApp").
2. Elige **grupo** (los grupos que el coach tiene asignados; admin ve todos).
3. Ve la lista de alumnos del grupo con:
   - Foto/nombre
   - Último nivel técnico y rendimiento (badges de color)
   - Fecha del último chequeo (o "sin chequeo" en gris)
4. Toca un alumno → panel lateral con:
   - Sliders/estrellas por cada dimensión (pre-cargados con la última evaluación → **la va actualizando**, no crea uno nuevo por sesión)
   - Campo "Nota de esta actualización" → se agrega al **timeline** con fecha, autor y snapshot de las notas de ese momento
   - Botón "Guardar"
5. Timeline por alumno visible dentro del mismo panel (histórico de notas de cualquier coach).

## Modelo de datos

**`alumno_evaluaciones_coach`** (una fila por alumno — se va actualizando)
- `alumno_id`, `coach_id_ultimo` (quien actualizó por última vez)
- 8 columnas de puntaje (postura, cadencia, manejo, potencia, fisico, constancia, actitud, progreso)
- 8 columnas de comentario corto por dimensión (opcional)
- `promedio_tecnico`, `promedio_rendimiento` (generados)
- `updated_at`

**`alumno_evaluaciones_coach_notas`** (timeline append-only)
- `alumno_id`, `coach_id`, `nota`, `snapshot_scores` (jsonb con los 8 valores al momento), `created_at`

## RLS / permisos

- SELECT/INSERT/UPDATE: sólo roles `coach`, `admin`, `super_admin` (helper `has_role`).
- Alumno no tiene ningún endpoint que exponga estas tablas.
- Sin exposición pública.

## UI

- Nueva ruta: `/coach/chequeo-alumnos`
- Reutiliza patrones de `WhatsappCheckRuns` / lista de alumnos por grupo
- Panel lateral (Sheet) para editar la evaluación — no navega a otra página, para poder pasar rápido de un alumno a otro
- Badges de color por nivel (1 rojo → 5 verde)
- Admin lo ve también desde su portal (mismo componente reutilizado en `/admin/chequeo-alumnos`)

## Fuera de alcance (para después)

- Comparativas grupales / ranking
- Export CSV
- Vista del alumno (queda expresamente descartado)
