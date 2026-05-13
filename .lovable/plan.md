# Centro de Control → Gestor de Tareas multi-rol

## Concepto

El Centro de Control deja de ser solo un tablero de alertas y pasa a ser un **inbox de tareas operativas** filtrado por el rol del usuario logueado. Cada tarea tiene responsable, vencimiento, estado y trazabilidad. Conviven tareas generadas automáticamente por reglas del sistema con tareas creadas manualmente por un admin.

## Roles soportados

- **Super Admin** — ve todas las tareas de todos los roles + las suyas.
- **Admin** — ve tareas de rol `admin` + las asignadas a su persona.
- **Coach** — ve tareas de rol `coach` + las asignadas a su persona.
- **Depósito** — ve tareas de rol `deposito` + las asignadas a su persona.

## Modelo de datos

Tabla nueva `tareas`:

- `tipo` (`automatica` | `manual` | `recurrente`)
- `origen` (clave estable: `whatsapp_check`, `alumno_inactivo_30d`, `coach_sin_feedback_14d`, `certificado_por_vencer`, `pago_pendiente_validar`, `stock_bajo`, `manual`, etc.)
- `titulo`, `descripcion`
- `rol_destino` (`super_admin` | `admin` | `coach` | `deposito`)
- `asignado_user_id` (nullable — si está, prevalece sobre el rol)
- `entidad_tipo` + `entidad_id` (deep-link opcional: alumno, suscripción, evento, etc.)
- `prioridad` (`baja` | `media` | `alta` | `critica`)
- `fecha_vencimiento` (date, nullable)
- `estado` (`pendiente` | `en_curso` | `hecha` | `pospuesta`)
- `pospuesta_hasta` (date, nullable)
- `nota_cierre`, `cerrada_por`, `cerrada_at`
- `dedupe_key` (texto único, evita duplicados de la misma tarea automática)
- `created_by`, `created_at`, `updated_at`

Tabla `tareas_historial` para auditoría (cambios de estado, reasignaciones, notas).

RLS:
- Super Admin: ALL
- Admin/Coach/Depósito: SELECT/UPDATE de tareas de su rol o asignadas a su `user_id`
- Solo Admin/Super Admin pueden crear tareas manuales

## UI del Centro de Control

Reemplazo de la vista actual por 3 zonas:

```text
┌─────────────────────────────────────────────────┐
│  KPIs:  Pendientes  En curso  Vencidas  Hoy     │
├─────────────────────────────────────────────────┤
│  Tabs:  [Mis tareas] [Por rol] [Todas*]         │
│  Filtros: prioridad · origen · vencimiento      │
│                              [+ Nueva tarea]    │
├─────────────────────────────────────────────────┤
│  Lista de tareas (cards):                       │
│   • Título + chip de origen + chip de rol       │
│   • Vencimiento (rojo si vencida)               │
│   • Botones: Tomar · En curso · Posponer · ✓    │
│   • Click → drawer con detalle, historial,      │
│     deep-link a la entidad relacionada          │
└─────────────────────────────────────────────────┘
```

`*Todas` solo visible para Super Admin.

Debajo, en colapsable, se mantienen los paneles existentes (alumnos en riesgo, feedback de coaches, actividad de coaches) como **datos de contexto** — ya no como alertas sueltas, porque las tareas las resumen.

## Generación automática (Fase 1, sin cron)

Función SQL `generate_tareas_automaticas()` (SECURITY DEFINER) que se ejecuta on-demand al entrar al centro de control + botón manual "Refrescar tareas". Reglas iniciales:

- **WhatsApp check** — días 5-7 y 15-17 → tarea para `admin` por cada grupo no cerrado.
- **Alumno inactivo +30d** activo con plan → tarea `admin`, prioridad alta.
- **Coach sin feedback +14d** → tarea para ese `coach` específico.
- **Certificado médico vencido o por vencer (30d)** → tarea `admin`.
- **Pagos `pendiente_verificacion` >48h** → tarea `admin`, prioridad alta.

Cada regla usa `dedupe_key` (ej: `whatsapp_check:Avanzado:2026-05`) para no duplicar.

Más adelante (Fase 2) se programa con `pg_cron` y se agregan reglas de depósito.

## Tareas manuales

Drawer "Nueva tarea":
- Título, descripción, prioridad, vencimiento
- Rol destino (obligatorio)
- Asignar a persona (opcional, lista filtrada por rol)
- Vincular entidad (opcional: buscar alumno/evento)

## Ciclo de vida

`pendiente` → `en_curso` → `hecha` (con nota opcional)
- "Posponer" pide nueva fecha y motivo, vuelve a `pendiente` cuando llega esa fecha.
- Cerrar tarea registra `cerrada_por` + `cerrada_at` + nota → escribe en `tareas_historial`.

## Integración con la alarma de WhatsApp

El componente `WhatsAppCheckAlert` se transforma en **generador de tareas** en lugar de banner aislado: si estamos en ventana 5-7 / 15-17, crea tareas por grupo. La alarma roja desaparece — ahora las tareas vencidas son la señal.

## Entregables

1. Migración: tabla `tareas`, `tareas_historial`, función `generate_tareas_automaticas()`, RLS, índices.
2. Hook `useTareas(role, userId)` con realtime.
3. Componentes: `TareasInbox`, `TareaCard`, `TareaDrawer`, `NuevaTareaDialog`.
4. Refactor `SuperAdminControl.tsx` para usar el inbox como vista principal.
5. Adaptar `WhatsAppCheckAlert` para generar tareas.
6. KPIs por rol en el header.

## Fuera de alcance (ahora)

- Notificaciones por email/push de tareas.
- `pg_cron` automático (lo dejamos para Fase 2 cuando las reglas estén estables).
- Tareas para rol `student`.
- Comentarios/colaboración multi-usuario en una tarea.

¿Avanzo con esta arquitectura, o querés ajustar alguna regla automática inicial o el set de estados antes de empezar?
