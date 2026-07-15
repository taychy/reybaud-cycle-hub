# Plan: Gestión de Formación Inicial + Playbooks

Tres pasos incrementales, cada uno entregable por separado. Empezamos por el **Paso 1** y validamos antes de seguir.

---

## Paso 1 — Dashboard Programa Formación (equivalente a Viajes)

**Ruta:** `/admin/programas` → lista de cohortes / ediciones.
**Ruta detalle:** `/admin/programas/:cohortId` → panel operativo estilo `EventReservationsOpsPanel`.

### Qué reutilizamos
- Estructura visual de `AdminEventReservationsOpsPanel` (tabs, KPIs top, tabla de inscriptos).
- `EventManagement` como referencia de layout de detalle.
- La inscripción ya existe hoy vía `enroll-programa` → crea `suscripciones` con `plan_id = plan de Formación Inicial`.

### Modelo de "cohorte"
Sin tabla nueva por ahora. Una **cohorte = un plan** en `planes` con `nombre` tipo *"Formación Inicial – Marzo 2026"*, `fecha_inicio`, `fecha_fin`, `cupo`, `precio`. Los inscriptos son `suscripciones` de ese plan. Si más adelante hace falta metadata específica del cohort (playbook state, checklist config), se agrega tabla `programa_cohort_config` opcional.

### Tabs del detalle
1. **Overview** — KPIs: inscriptos / cupo, pagados / pendientes, monto recaudado, días para inicio.
2. **Inscriptos** — Tabla filtrable: nombre, teléfono, estado pago (cuota 1 / cuota 2), fecha inscripción, WhatsApp directo, ver perfil.
3. **Playbook** *(vacío en Paso 1, se llena en Paso 2)*.
4. **Comunicaciones** — histórico de emails enviados (lee `email_send_log` filtrado por `suscripcion_id`).

### Sidebar admin
Nuevo item **"Programas"** en la categoría *Principal*, al lado de *Eventos*.

---

## Paso 2 — Playbook embebido + botón "Flujo"

**Ubicación del playbook:** dentro de la plantilla del plan/programa (nueva pestaña en `ManagePlanes` → edición de plan → tab *Playbook*). Reutiliza `process_templates` linkeando por `metadata.plan_id`.

### Flujo
- En `ManagePlanes`, al editar el plan de Formación Inicial, aparece tab **Playbook** que embebe el editor de `AdminProcessTemplates` filtrado a la plantilla de ese plan (o crea una si no existe).
- En el dashboard de la cohorte (Paso 1), botón **"Flujo"** abre/reanuda un `process_instance` de esa plantilla vinculado al `plan_id` (cohort).
- Se agregan a `process_template_stages` dos nuevos `entidad_control` posibles: `cohort_kpi` (auto-tildable si KPI cumplido, ej. *inscriptos ≥ mínimo*) y `cohort_task` (genera tarea en `tareas` con owner).
- Steps humanos → auto-crean `tarea` asignada al rol/persona configurada. Al completar la tarea, se completa la etapa.
- Steps con dato existente (ej. *"Landing publicada"*, *"Cupo cerrado"*) → auto-tildan cuando la condición se cumple.

### Alcance MVP del playbook para Formación Inicial
10 etapas máximo (nivel cohorte). Steps por alumno quedan para iteración 2 del Paso 2 si hace falta.

---

## Paso 3 — Vista global "Procesos activos"

Nuevo item en sidebar admin *Principal*: **"Procesos"**. Tabla única con todos los `process_instances` en estado `en_curso`, columnas: plantilla, entidad (cohort/evento/pedido), etapa actual, responsable, iniciado, ETA. Click → abre el runner correspondiente.

---

## Decisiones técnicas clave

- **Sin tabla nueva** en Paso 1. Se apoya 100% en `planes` + `suscripciones` + `email_send_log`.
- **Playbook = `process_templates`** existente, con nuevos tipos de `entidad_control` en Paso 2.
- **Cohorte = plan**. Si en el futuro hace falta más metadata, agregamos `programa_cohort_config` sin romper.
- **Continuidad G4→G3→G1**: se maneja como step del playbook ("*Ofrecer G4 con descuento de cohort*") que genera tareas de contacto por alumno. No hay grupo efímero.
- No se toca el flujo del alumno ni la landing.

---

## Entregable de este turno

Solo **Paso 1** (dashboard). Al aprobarlo, seguimos con Paso 2. Al aprobar Paso 2, Paso 3.

Archivos que se crearán / editarán en Paso 1:
- `src/pages/admin/AdminProgramas.tsx` (lista de cohortes)
- `src/pages/admin/AdminProgramaDetalle.tsx` (panel operativo)
- `src/App.tsx` (rutas)
- Sidebar admin (item "Programas")

¿Arranco con Paso 1?
