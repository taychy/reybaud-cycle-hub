Vamos a resolver los 4 puntos en un solo pase, respetando que ambos emails queden persistidos en la ficha y en la base de mails masivos.

## 1. Contador de inscriptos siempre real

- La landing y el card de admin hoy leen `planes.inscripciones_actuales`, una columna cacheada que quedó en 0 aunque haya 2 suscripciones reales (caso Programa Iniciación 2026/2).
- Cambio: crear una vista `planes_con_inscriptos` que calcula el count real desde `suscripciones` (estados `activa`, `pendiente_pago`, `pendiente_verificacion`) y adaptar `FormacionInicial.tsx`, `AdminProgramas.tsx` y `AdminProgramaDetalle.tsx` para leer de ahí.
- Además, agregar un trigger sobre `suscripciones` que mantenga `planes.inscripciones_actuales` sincronizado ante insert/update/delete, y correr una migración de "seed" que recalcule los valores existentes.

## 2. Email de confirmación al inscribirse

- La edge `enroll-programa` hoy crea la ficha + suscripción, pero **no encola ningún email** al alumno.
- Cambio: al confirmarse el pago (o al quedar `pendiente_verificacion` para transferencia), llamar a `send-transactional-email` con una nueva plantilla `programa-inscripcion-confirmada` que incluya nombre del programa, fecha de inicio, monto, método de pago y próximos pasos.
- Agregar la plantilla en `supabase/functions/_shared/transactional-email-templates/`, registrarla en `registry.ts`, y desplegar.

## 3. Login automático en la app

- Hoy `enroll-programa` inserta en `alumnos` pero no crea el usuario en `auth.users` — por eso Hernán quedó con ficha sin acceso.
- Cambio: cuando la inscripción queda pagada, la edge invita al alumno vía `supabase.auth.admin.inviteUserByEmail` (o genera magic-link OTP) usando el mismo email de la ficha, y guarda `alumnos.user_id` cuando el usuario acepta.
- Si el alumno ya tiene `auth.users` con ese email, saltamos la invitación y solo linkeamos `user_id`.
- Se agrega un botón "Reenviar invitación" en `AdminProgramaDetalle` para los casos históricos (Hernán, y cualquier otro que ya tenga ficha sin login).

## 4. Alumno con dos emails distintos — regla combinada

Guardamos siempre ambos emails para que ninguno se pierda ni de la ficha ni de la base de marketing.

**a) Detección al inscribirse (bloqueo por documento):**
- Antes de crear la ficha, `enroll-programa` busca coincidencia por `documento` (y como fallback por `telefono` + `nombre_apellido` normalizados).
- Si ya existe una ficha con ese documento pero **distinto email**:
  - No se crea una segunda ficha.
  - La suscripción y el pago se vinculan a la ficha existente.
  - El email nuevo se agrega a `alumnos.emails_adicionales` (columna que ya existe).
  - Se sincroniza `marketing_contacts` para que el email nuevo también quede como contacto (linkeado al mismo `alumno_id`, con flag `es_email_secundario=true`).
  - Se muestra al alumno un mensaje: "Detectamos que ya estás registrado con `xxx@yyy.com`. Vinculamos esta inscripción a tu ficha y te enviamos el acceso a ese email."

**b) Merge asistido en admin (para casos que ya se filtraron, tipo Hernán):**
- Nueva RPC `merge_alumnos(alumno_ganador uuid, alumno_perdedor uuid)` que dentro de una transacción:
  - Mueve `suscripciones`, `pagos`, `student_activity_log`, `cuenta_ajustes`, `objetivos_alumno`, `entrenamientos_realizados`, `reservation_*`, `event_participants`, `event_reservations`, `feedback_coach`, `alumno_familiares`, `alumno_notas` y todas las relaciones que apuntan a `alumno_id` de la ficha perdedora hacia la ganadora.
  - Agrega el email de la perdedora a `emails_adicionales` de la ganadora (si no está).
  - Sincroniza `marketing_contacts`: reasigna filas al alumno ganador y marca el email secundario.
  - Si la ficha perdedora tenía `user_id` y la ganadora no, transfiere el `user_id`.
  - Marca la ficha perdedora como `estado='fusionada'` + `fusionada_en=alumno_ganador` (soft delete) para preservar auditoría, no se borra físicamente.
- Nueva UI en el detalle del alumno: botón "Fusionar con otra ficha" que abre un buscador, muestra un diff (nombre, documento, teléfono, emails, suscripciones, pagos totales) y pide doble confirmación con `AlertDialog`. Solo Super Admin y Admin pueden ejecutarlo.
- Bonus: en el listado de alumnos, un badge "Posible duplicado" cuando otro alumno comparte documento o teléfono, con link directo al merge.

**c) Persistencia de ambos emails en la base masiva:**
- `emails_adicionales` en `alumnos` guarda todos los emails secundarios (ya existe la columna, la aprovechamos).
- En `marketing_contacts` agregamos las columnas `alumno_id` (fk) y `es_email_secundario` si no existen, y sincronizamos con un trigger:
  - Insert/update en `alumnos.email` → upsert primario en `marketing_contacts`.
  - Insert/update en `alumnos.emails_adicionales` → upsert cada email como secundario del mismo `alumno_id`.
  - Al fusionar fichas, los emails secundarios de la perdedora se reasignan a la ganadora.

## Detalles técnicos

**Archivos que se van a tocar:**
- `supabase/migrations/…_planes_inscriptos_view_trigger.sql` — vista, trigger de contador, seed.
- `supabase/migrations/…_marketing_contacts_link_alumno.sql` — columnas `alumno_id`, `es_email_secundario`, trigger de sync desde `alumnos`.
- `supabase/migrations/…_merge_alumnos_rpc.sql` — RPC `merge_alumnos` (SECURITY DEFINER, solo admins), campo `estado='fusionada'` + `fusionada_en`.
- `supabase/functions/enroll-programa/index.ts` — detección por documento, upsert en ficha existente, invitación de login, envío del email de confirmación.
- `supabase/functions/_shared/transactional-email-templates/programa-inscripcion-confirmada.tsx` + `registry.ts` — plantilla nueva.
- `src/pages/FormacionInicial.tsx`, `src/pages/admin/AdminProgramas.tsx`, `src/pages/admin/AdminProgramaDetalle.tsx` — leer contador desde vista.
- `src/components/admin/AlumnoMergeDialog.tsx` (nuevo) + integración en la vista de detalle del alumno — buscador + diff + confirmación.
- `src/pages/admin/AdminProgramaDetalle.tsx` — botón "Reenviar invitación de login".

**Endpoint de deploy:** al terminar, redeployamos `enroll-programa` y `send-transactional-email`.

**Caso Hernán como validación:** apenas mergee `7d5f8d1a…` (yahoo, con login) hacia `192f3879…` (nokia, con la suscripción) — o al revés según prefieras — queda una sola ficha con ambos emails, la suscripción del programa activa y el login funcionando. Confirmame antes cuál es el email que va a usar como primario.
