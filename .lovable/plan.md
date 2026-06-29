# Procesos guiados de Depósito — Fase 1

Sistema de gestión de tareas con procesos establecidos, plantillas reusables y stepper visual para el usuario de depósito.

## Decisiones confirmadas

1. **Ubicación admin:** sub-sección "Gestión de plantillas de procesos" dentro de `Resumen` del dashboard admin.
2. **Entidad de control etapa 2:** **ambas, configurable por plantilla** (campo `entidad_control` en la etapa: `store_preorder` | `supplier_order` | `ninguna`).
3. **Destinatario reporte final:** **se elige al lanzar cada instancia** (un combo en el "Iniciar proceso" con los admins disponibles).
4. **Alertas de stock actuales:** se mantienen arriba en `/deposito/alertas`; los procesos van debajo en la misma ruta.
5. **Plantillas precargadas Fase 1:** 3 — Ingreso de mercadería, Devolución a proveedor, Conteo de stock.

## Arquitectura de datos

4 tablas nuevas:

- **`process_templates`** — plantillas reusables.
  Campos clave: `nombre`, `descripcion`, `rol_destino` (default `deposito`), `icono`, `activo`, `created_by`.

- **`process_template_stages`** — etapas ordenadas de cada plantilla.
  Campos clave: `template_id`, `orden`, `titulo`, `instrucciones`, `requiere_foto` (bool), `requiere_nota` (bool), `entidad_control` (enum: `none|store_preorder|supplier_order`), `accion_final` (enum: `none|send_report`).

- **`process_instances`** — ejecución concreta de una plantilla.
  Campos clave: `template_id`, `iniciado_por` (user), `asignado_a` (user, opcional), `destinatario_reporte_email`, `estado` (`en_curso|completada|cancelada`), `started_at`, `completed_at`, `metadata` jsonb.

- **`process_instance_stages`** — estado por etapa.
  Campos clave: `instance_id`, `template_stage_id`, `orden`, `estado` (`pendiente|en_curso|completada`), `foto_url`, `nota`, `entidad_ref_id` (uuid del preorder/orden vinculado), `completed_by`, `completed_at`.

Trigger: al insertar `process_instance` se crean automáticamente sus `process_instance_stages` desde el template, en orden.

RLS:
- Admin/super_admin: full access a plantillas + instancias.
- `deposito`: lee plantillas activas, lee/actualiza instancias asignadas o de su rol, completa etapas.

GRANTs: `authenticated` (SELECT/INSERT/UPDATE en instancias y stages, SELECT en templates), `service_role` ALL.

## UI

### Admin → Resumen → "Gestión de plantillas de procesos"
- Listado de plantillas con toggle activo/inactivo.
- Editor por plantilla:
  - Datos generales (nombre, descripción, icono, rol destino).
  - Lista ordenable de etapas (drag&drop) con: título, instrucciones (textarea/markdown), checks "Requiere foto" / "Requiere nota", combo `entidad_control`, combo `accion_final`.
- Botón "Crear plantilla nueva".

### Depósito → `/deposito/alertas`
Layout:
1. **Arriba:** card actual de alertas de stock (sin tocar).
2. **Abajo, sección "Procesos":**
   - Botones grandes "Iniciar: {plantilla}" (uno por plantilla activa).
   - Lista de instancias en curso del usuario (con badge de etapa actual y % progreso).

### Diálogo "Iniciar proceso"
- Confirmación + combo "Destinatario del reporte final" (lista de admins activos).
- Crea la instancia y navega al stepper.

### Stepper de ejecución (`/deposito/procesos/:instanceId`)
- Header: nombre del proceso, progreso (1/3), botón "Pausar".
- Card de la etapa actual:
  - Instrucciones.
  - Si `requiere_foto`: uploader (Supabase Storage, bucket `process-photos`).
  - Si `requiere_nota`: textarea.
  - Si `entidad_control != none`: selector del preorder/orden a controlar + checklist visible.
  - Botón "Confirmar etapa" (deshabilitado hasta cumplir requisitos).
- Avance automático a la próxima etapa.
- En la última etapa, si `accion_final = send_report`: dispara edge function `process-complete-instance`.

## Edge function `process-complete-instance`
Genera HTML del reporte (plantilla + etapas + fotos + notas + entidad vinculada + tiempos), lo envía por mail al `destinatario_reporte_email` de la instancia, marca `estado = completada` y `completed_at`. Reusa el sender existente (`notify-reservation` con tipo `novedad`) para evitar nueva infra.

## Plantillas precargadas (seed en la misma migración)

**1. Ingreso de mercadería al depósito** (3 etapas)
- Recepción de mercadería: foto de la factura del proveedor + nota con cantidades recibidas.
- Control contra pedido: `entidad_control = store_preorder` (o supplier_order si existe) + nota de discrepancias.
- Reporte final: confirmación + `accion_final = send_report`.

**2. Devolución a proveedor** (3 etapas)
- Identificación de productos a devolver: nota con motivo + foto opcional.
- Preparación y empaque: foto del paquete listo.
- Reporte final: confirmación + mail al admin.

**3. Conteo de stock** (3 etapas)
- Conteo físico por categoría: nota con totales.
- Comparación con sistema: nota con diferencias.
- Reporte final: mail al admin con resumen.

## Storage
Bucket nuevo `process-photos` (privado). Policies: deposito/admin pueden insertar; admin/super_admin pueden leer todo; deposito puede leer sus propias subidas.

## Plan de entrega

1. Migración (tablas + RLS + GRANTs + bucket + seed de 3 plantillas).
2. Hook `useProcesses` (lista templates activos, instancias del user, completar etapa, iniciar instancia).
3. Pantalla admin "Gestión de plantillas" dentro de Resumen.
4. Refactor `/deposito/alertas` (stock arriba, procesos abajo + diálogo iniciar).
5. Stepper `/deposito/procesos/:instanceId`.
6. Edge function `process-complete-instance` + mail HTML.
7. Probar flujo end-to-end con la plantilla "Ingreso de mercadería".

## Fuera de alcance Fase 1
- Plantillas para otros roles (coach/admin) — se reutiliza la misma arquitectura cambiando `rol_destino` en Fase 2.
- CRUD de `supplier_orders` (si se elige esa entidad en una plantilla, en Fase 1 queda como input de texto libre; el mini-CRUD entra en Fase 2 si se necesita).
- Recordatorios / SLA por etapa.

¿Apruebo y arranco con la migración?
