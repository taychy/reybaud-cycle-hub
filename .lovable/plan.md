
# Plan: Chequeo colaborativo + Edad + Cumpleaños

## 1. Chequeo WhatsApp con coach acompañante
- Migración: agregar `coaches_participantes uuid[]` a `whatsapp_check_runs` (default `{}`).
- Al iniciar un run nuevo, modal con selector:
  - Radio: "Solo yo" / "Con otro coach"
  - Si "Con otro": multi-select de coaches activos.
- Guardar en el run. Mostrar los nombres en:
  - Header del run activo.
  - Historial (columna "Con").
- El coach acompañante también ve el run en su historial (`coach_id = auth.uid() OR auth.uid() = ANY(coaches_participantes)`).

## 2. Chequeo anterior + Home coach con tareas

### 2a. Chequeo anterior (dentro del run nuevo)
- Al iniciar un chequeo, arriba de la lista, tarjeta colapsable **"Últimos ítems con problema (chequeo del {fecha} por {coach})"**.
- Query: último run cerrado del mismo grupo → items donde `estado != 'ok'`.
- Cada item muestra: alumno, categoría, nota anterior. Solo lectura.

### 2b. Tareas de chequeo en Home coach
- Reusar tabla `tareas` (ya tiene reasignación, estados, historial, realtime — decisión confirmada).
- Al cerrar un run, trigger crea una `tarea` por cada item con problema:
  - `tipo='automatica'`, `origen='whatsapp_check'`
  - `rol_destino='coach'`, `asignado_user_id = coach_id` del run
  - `entidad_tipo='alumno'`, `entidad_id=alumno_id`
  - `titulo`: "Revisar {categoría} - {alumno}"
  - `descripcion`: nota del check
  - `dedupe_key`: `wa_check:{run_id}:{item_id}` para evitar duplicados en re-cierres.
- Nueva tarjeta en `CoachDashboard.tsx`: **"Pendientes de chequeo"** (colapsada, badge rojo con contador).
  - Query: `tareas` con `origen='whatsapp_check'`, `asignado_user_id=coachUserId`, `estado in ('pendiente','en_curso')`.
  - Cada fila con 3 botones:
    - **Resolver** → estado='hecha' + nota opcional.
    - **Descartar** → estado='hecha' con `nota_cierre='descartado'`.
    - **Reasignar** → selector de coach → update `asignado_user_id`.
  - Se registra todo en `tareas_historial` (ya existe).

## 3 y 4. Edad del alumno
- Migración: `ALTER TABLE alumnos ADD COLUMN fecha_nacimiento date`.
- En ficha del alumno (admin) y en "Mi perfil" (alumno): input date editable.
- Helper `calcularEdad(fecha_nacimiento)` en `src/lib/dates.ts`.
- En `CoachChequeoAlumnos.tsx`: mostrar edad al lado del nombre — `Juan Pérez · 42`.
- Fallback si no hay fecha cargada: no mostrar nada (sin "N/D").

## 5. Cumpleaños en dashboard admin
- Nuevo componente `BirthdayWidget.tsx` en el home admin (`AdminDashboard.tsx`).
- Tabs: **Hoy** · **Esta semana** · **Este mes**.
- Query: alumnos activos con `fecha_nacimiento` cuyo mes/día caiga en el rango.
- Cada fila: avatar, nombre, edad que cumple, teléfono, botón **WhatsApp**.
- Plantilla editable en tabla `broadcast_templates` (crear registro seed `birthday_greeting` con variables `{nombre}` y `{edad}`).
- Botón WhatsApp: abre `wa.me/{tel}?text={plantilla_renderizada}` usando `waLink()` existente.
- Opcional: columna `alumnos.ultimo_saludo_cumple_year int` para marcar "ya saludado este año" y no repetir el CTA principal (se ve tildado).

## Orden de implementación
1. Migración: `fecha_nacimiento` en alumnos + `coaches_participantes` en runs + trigger tareas.
2. Ficha alumno editable (admin y self).
3. Edad visible en chequeo.
4. Chequeo colaborativo (modal al iniciar + historial).
5. Bloque "chequeo anterior" dentro del run.
6. Tarjeta "Pendientes" en Home coach + acciones.
7. Widget cumpleaños en dashboard admin + plantilla WA.

## Detalles técnicos
- **RLS `tareas`**: ya permite lectura por `asignado_user_id = auth.uid()`, no hay que tocar.
- **Trigger de creación de tareas**: `AFTER UPDATE OF estado ON whatsapp_check_runs WHEN NEW.estado='cerrado'`, itera `whatsapp_check_items` con problema.
- **Realtime**: `useTareas` ya se suscribe a `tareas`, la tarjeta de home se actualiza sola.
- **Historial en run**: el bloque "chequeo anterior" hace una consulta única al abrir el run, no bloquea.
- **Cumpleaños**: query con `to_char(fecha_nacimiento, 'MM-DD')` comparando contra fechas actuales (evita problemas de año bisiesto solo para 29/02, se muestra el 28/02 en años no bisiestos).
- **Timezone**: `fecha_nacimiento` como `date` sin hora — sin drift.

## Fuera de alcance
- Envío automatizado de WhatsApp (queda manual con `wa.me`).
- Notificación push al coach cuando le reasignan.
- Estadísticas históricas de tareas resueltas.
