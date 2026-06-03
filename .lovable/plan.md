# Sistema de bajas — Flujo dual alumno/admin

## 1. Modelo de datos

### Nueva tabla `bajas_solicitudes`
Registro único por solicitud. Estado central del flujo.

Campos:
- `id`, `alumno_id`, `created_at`, `updated_at`
- `origen`: `alumno` | `admin` (quién la generó)
- `solicitada_por_user_id` (auth.uid del solicitante)
- `motivo` (enum: `economico`, `horarios`, `lesion_salud`, `viaje_vacaciones`, `cambio_actividad`, `disconforme_servicio`, `otro`)
- `motivo_otro_detalle` (text, opcional)
- `comentario` (text, opcional)
- `estado`: `solicitada` | `confirmada` | `evitada` | `cancelada_por_alumno`
- **Snapshot al momento de la solicitud** (jsonb `snapshot`):
  - planes activos (id, nombre, fecha_fin, estado, auto_renovacion)
  - saldo deudor por moneda
  - tenía auto_renovación activa (bool)
  - reservas futuras de eventos/viajes (array con id + nombre + fecha)
  - antigüedad en días (desde primera suscripción)
- `confirmada_at`, `confirmada_por_user_id`, `confirmada_notas`
- `email_notificado` (bool, default según checkbox admin)
- `evitada_at`, `evitada_motivo` (text libre admin: "habló por WA, retomó", etc.)

RLS:
- Alumno: SELECT/INSERT de las suyas (vía `auth.email() = alumno.email`)
- Admin: ALL
- Service role: ALL

### Cambios en `alumnos`
Agregar (si no existen):
- `fecha_baja` (date)
- `motivo_baja` (text)
- `baja_solicitud_id` (uuid → bajas_solicitudes)
- `baja_confirmada_por_user_id` (uuid)
- `reactivada_at`, `reactivada_por_user_id` (para auditar reactivaciones)

### Vista `vw_bajas_metricas_mensuales`
Por mes (`YYYY-MM`):
- solicitadas, confirmadas, evitadas
- breakdown por motivo
- breakdown por plan que tenía
- promedio antigüedad
- % con deuda al solicitar
- % con auto_renovación activa
- reactivados en el mes

Alimenta el centro de control mensual del Super Admin.

## 2. Flujo alumno — "Solicitar baja"

**Ubicación**: dentro de `/alumno/pagos` → sección "Mis planes" (StudentPayments), al pie como acción destructiva discreta.

**UX**:
1. Botón secundario "Darme de baja de la escuela" (rojo suave, no botón principal).
2. Click abre un `Dialog` de 2 pasos:
   - **Paso 1 — Información**: explica qué implica (cancelación de planes, apagar renovación, pérdida de acceso, historial conservado, posibilidad de volver). CTA "Continuar".
   - **Paso 2 — Motivo**: `Select` con las 7 opciones obligatorias + `Textarea` "Comentario (opcional)" que pasa a obligatorio si elige "disconforme" u "otro". Checkbox de confirmación "Entiendo que mi solicitud será revisada por administración antes de hacerse efectiva". CTA "Enviar solicitud".
3. Al enviar: insert en `bajas_solicitudes` con snapshot armado server-side (RPC `request_baja_alumno`), toast "Solicitud enviada. Te contactaremos a la brevedad.", el alumno ve un banner persistente en su dashboard: "Tu solicitud de baja está en revisión" con botón "Cancelar solicitud" (mientras esté en `solicitada`).

**Importante**: la solicitud NO ejecuta nada operativo. Los planes siguen activos, la renovación sigue activa, el acceso sigue activo, hasta que admin confirme.

## 3. Flujo admin — Gestión de solicitudes

### 3a. Tarea automática al recibir solicitud
Trigger AFTER INSERT en `bajas_solicitudes` con `origen='alumno'`:
- Crea fila en `tareas` (origen `baja_solicitada`, prioridad `alta`, rol `admin`, dedupe por `baja_id`).
- Encola email interno (opcional, configurable).

### 3b. Nueva pestaña en ManageStudents: "Solicitudes de baja"
Tabla con: alumno, fecha solicitud, motivo, antigüedad, deuda, planes activos, estado. Filtros por estado + motivo + mes.

Acciones por fila:
- **"Confirmar baja"** → abre dialog (ver 3d)
- **"Marcar como retenido"** → pide motivo libre, pasa estado a `evitada`, cierra tarea
- **"Ver detalle"** → drawer con snapshot completo + historial del alumno

### 3c. Baja iniciada por admin (sin solicitud previa)
Botón **"Dar de baja"** en la ficha/drawer del alumno (StudentManagementDrawer). Atajo: crea `bajas_solicitudes` con `origen='admin'` y `estado='solicitada'` y abre directamente el dialog de confirmación. Motivo también obligatorio.

### 3d. Dialog "Confirmar baja"
Muestra:
- Resumen del snapshot (planes activos que se van a cancelar, deuda actual, reservas futuras)
- ⚠️ Warning si saldo deudor > 0: "Este alumno registra un saldo pendiente de $X ARS / $Y USD. Si confirmás la baja, la deuda queda registrada en su cuenta corriente."
- ⚠️ Warning si reservas futuras > 0: "Tiene N reserva(s) futura(s) de eventos/viajes. No se cancelarán automáticamente — revisar aparte."
- Textarea "Notas internas" (opcional)
- Checkbox "Enviar email de notificación al alumno" (default ON)
- AlertDialog de doble confirmación al hacer click en "Confirmar baja definitiva"

### 3e. Ejecución de la baja (RPC `confirm_baja_alumno`)
SECURITY DEFINER, transaccional:
1. Validar caller es admin
2. Listar suscripciones operativas (estados: `activa`, `pendiente`, `pendiente_verificacion`, `pago_pendiente`, `acceso_pausado`, `pausa`) no canceladas
3. `UPDATE suscripciones SET estado='cancelada', cancelada_at=now(), cancelada_motivo='Baja del alumno — <motivo>', auto_renovacion=false, auto_cobro_activo=false`
4. `UPDATE alumnos SET estado='inactivo', grupo='Sin grupo', fecha_baja=CURRENT_DATE, motivo_baja=<motivo>, baja_solicitud_id=<id>, baja_confirmada_por_user_id=auth.uid()`
5. `UPDATE bajas_solicitudes SET estado='confirmada', confirmada_at=now(), confirmada_por_user_id=auth.uid()`
6. Cerrar tareas relacionadas (`auto_resolve_tareas_automaticas` o cierre directo de la tarea `baja_solicitada`)
7. Insertar en `audit_log` + `logStudentActivity`
8. Devolver IDs de subs con preapproval MP activo

Después de la RPC, edge function llama a `cancel-mp-preapproval` por cada uno (fuera de transacción) y, si email opt-in, encola notificación con `enqueue_email`.

## 4. Reactivación

Botón "Reactivar alumno" en la ficha de un alumno `inactivo`:
- AlertDialog: "El alumno pasará a estado activo pero NO se restauran sus suscripciones anteriores. Deberá contratar un nuevo plan."
- Confirmar → `UPDATE alumnos SET estado='activo', grupo='Sin grupo', reactivada_at=now(), reactivada_por_user_id=auth.uid()` y registra en audit_log.
- Las suscripciones canceladas siguen canceladas. La cuenta corriente y todo el historial intactos.

## 5. Lo que NO se toca

- Historial de suscripciones, pagos, reservas, cuenta corriente, facturas
- Reservas de eventos/viajes (solo warning, decisión manual)
- Datos del alumno (email, teléfono, perfil)
- Si tiene deuda, la baja procede igual — la deuda queda en cuenta corriente

## 6. Indicadores mensuales

Nueva card en el centro de control Super Admin:
"Bajas del mes" con:
- Solicitadas / Confirmadas / Retenidas
- Mini gráfico de motivos
- Listado clickeable que abre la pestaña "Solicitudes de baja" con filtro mes aplicado

---

## Detalles técnicos

**Archivos a crear**:
- Migración: `bajas_solicitudes` + columnas en `alumnos` + RPC `request_baja_alumno` + RPC `confirm_baja_alumno` + RPC `reactivar_alumno` + trigger tarea + vista métricas
- `src/components/student/RequestBajaDialog.tsx` (alumno)
- `src/components/admin/ConfirmBajaDialog.tsx` (admin)
- `src/components/admin/BajasSolicitudesList.tsx` (pestaña admin)
- `src/components/admin/ReactivateAlumnoButton.tsx`
- Hook `useBajaSolicitud` para banner del alumno
- Edge function `process-baja-confirmacion` (orquesta MP + email post-RPC)

**Archivos a modificar**:
- `StudentPayments.tsx` — agregar botón "Solicitar baja" + banner si hay solicitud pendiente
- `ManageStudents.tsx` — nueva pestaña "Solicitudes de baja"
- `StudentManagementDrawer.tsx` — botones "Dar de baja" / "Reactivar"
- Centro de control Super Admin — card de métricas
- `tareas` — agregar origen `baja_solicitada` al listado de auto-resolve

**Notificaciones**:
- Email al alumno (opt-in): "Tu baja fue procesada. Acceso hasta hoy. Historial conservado."
- Email interno al admin cuando llega una solicitud nueva (configurable)

**Email templates** nuevos: `baja-confirmada-alumno`, `baja-solicitada-admin`.

¿Avanzo con todo el plan tal cual, o querés ajustar algo antes (ej: motivos, dejar la baja por admin sin pasar por `bajas_solicitudes`, simplificar métricas)?
