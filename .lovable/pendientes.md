# Pendientes

Lista de ideas/features acordadas pero pospuestas. No ejecutar sin autorización explícita.

---

## 1. CRM unificado de Personas + Google Contacts como agenda maestra
**Fecha:** 2026-06-22
**Estado:** Diseñado, sin ejecutar.

### Objetivo
Unificar alumnos, exalumnos, contactos, interesados y clientes externos en una sola ficha de "Persona", con capa CRM (estado comercial, intereses, seguimiento) y Google Contacts como fuente maestra de datos de contacto.

### Diseño acordado (reutilizando lo existente, evitando cambios estructurales)

**Parte 1 — Persona única sin tabla nueva**
- Reutilizar tabla `alumnos` como base de personas (ya tiene nombre, email, teléfono, estado, grupo, notas, sede, origen).
- Agregar 2 columnas:
  - `tipo_persona` enum: `contacto | interesado | alumno | exalumno | cliente_externo`
  - `estado_comercial` enum: `nuevo | en_seguimiento | activo | exalumno | no_interesado | recontactar`
- Derivación automática:
  - Con suscripción activa → `alumno` / `activo`
  - Tuvo y hoy no → `exalumno`
  - Nunca tuvo → `contacto` / `interesado`
- Relajar NOT NULL de campos pensados solo para alumno real (DNI, grupo, sede) cuando `tipo_persona != alumno`. **Punto delicado a confirmar antes de migrar.**

**Parte 2 — CRM de seguimiento (tablas chicas nuevas)**
- `persona_intereses`: `alumno_id`, `servicio` (escuela, particulares, distancia, san_luis, girona, 7lagos, gran_fondo, tienda, bike_fitting, otro), `nivel_interes` (1-5), `fecha_consulta`, `nota`, `responsable_id`, `proxima_accion_fecha`, `proxima_accion_texto`, `estado` (abierto/ganado/perdido).
- Extender `alumno_notas` (ya existe) con `tipo` (llamada/whatsapp/email/reunión/nota), `responsable_id`, `proxima_accion_fecha` en vez de crear `persona_interacciones` aparte.
- Reutilizar `student_activity_log` para el historial automático.

**Parte 3 — Listas inteligentes en Novedades / Broadcasts**
- Sin tablas nuevas. Ya existen `broadcasts`, `broadcast_recipients`, `broadcast_templates`, `emisor_segmento_config`.
- Agregar filtros en el selector de destinatarios por: `tipo_persona`, `estado_comercial`, `persona_intereses.servicio`, combinaciones ("todos menos no_interesado").

**Parte 4 — Google Contacts como agenda maestra (etapa 2)**
- Conector Google People API (mismo proveedor que `google_calendar` y `google_mail` ya disponibles).
- Import inicial: traer todo de Google → upsert en `alumnos` matcheando por email/teléfono normalizado (ya tenemos `phoneNormalize.ts` y `nameMatch.ts`).
- Sync periódica: Google = fuente de verdad para nombre/teléfono/email. App = fuente de verdad para estado comercial, intereses, historial, suscripciones.
- Push back: cuando la app crea/edita un contacto, reflejarlo en Google con etiqueta `Reybaud-App`.
- Pantalla de duplicados: detecta por teléfono normalizado idéntico, email idéntico, o `nameMatchScore >= 0.8`. Permite unificar (merge a un `alumno_id`, mover suscripciones/pagos/eventos), elegir campo ganador, marcar "no es duplicado".
- Merge delicado por FKs en decenas de tablas → RPC `merge_personas(keep_id, remove_id)` transaccional.

### Orden de ejecución cuando se retome
1. Migración suave: `tipo_persona` + `estado_comercial` en `alumnos`, relajar NOT NULL, derivar valores iniciales.
2. CRM básico: `persona_intereses` + extender `alumno_notas`. UI tab "CRM" en ficha de alumno.
3. Filtros por tipo/estado/interés en Novedades / Broadcasts.
4. Google Contacts: conectar, import, sync, pantalla de duplicados con merge.

### Lo que NO hacer
- No crear tabla `personas` separada de `alumnos` (rompe todas las FKs).
- No hacer Google fuente única sin espejo local (la app se rompe si Google falla).
- No arrancar por la sync con Google antes de tener `tipo_persona` y duplicados resueltos.
