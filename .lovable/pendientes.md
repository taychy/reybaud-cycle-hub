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

---

## 2. Preparación App Store iOS (submission review checklist)
**Fecha:** 2026-07-01
**Estado:** Sin ejecutar. Requiere cuenta Apple Developer ($99/año) antes de arrancar código.

### Bloqueantes técnicos (código a implementar)

**B1. Botón "Eliminar mi cuenta" en dashboard alumno** — Guideline 5.1.1(v).
- Ubicación: `StudentDashboard` → sección Ajustes/Perfil.
- Flujo: AlertDialog doble confirmación → RPC `request_account_deletion(alumno_id)` que marque `alumnos.deletion_requested_at` y `estado='inactivo'`, cierre sesión, envíe email de confirmación.
- Grace period 14 días para revertir (soft delete). Cron `hard-delete-accounts` diario que borre definitivamente los que superen grace.
- Debe borrar/anonimizar: `alumnos`, `alumno_familiares`, `alumno_notas`, `feedback_coach`, tokens, medical cert. Preservar: facturas AFIP (obligación fiscal), `student_activity_log` anonimizado.

**B2. Sign in with Apple** — Guideline 4.8 (obligatorio si ofrecés Google login).
- Habilitar provider Apple en Lovable Cloud (managed, no requiere credenciales propias).
- Agregar botón "Continuar con Apple" en `Login.tsx` al lado del de Google.
- Testear que crea el registro correcto en `alumnos` con email.

**B3. Copys de pagos revisados** — Guideline 3.1.3(e) (servicios físicos exentos de IAP).
- Auditar textos en `PlanSelection`, `EventDetail`, `Tienda`: dejar explícito que se paga clase presencial / viaje / producto físico. Nunca decir "desbloquear", "premium", "features".
- Ver memoria `mem://business/app-store-compliance-iap` — ya lo cubre pero conviene doble check antes del submit.

**B4. Share nativo (Capacitor Share)** en vez de `window.open(whatsapp://)`.
- Reemplazar en: reservas → compartir, eventos → compartir, roadbook, results.
- `@capacitor/share` ya se puede agregar.

**B5. Permisos con strings descriptivos** en `Info.plist` (post `npx cap add ios`).
- `NSCameraUsageDescription`: "Se usa para escanear QR de productos y eventos".
- `NSPhotoLibraryUsageDescription`: "Se usa para subir tu certificado médico y fotos de perfil".
- `NSPhotoLibraryAddUsageDescription`: "Se usa para guardar tu roadbook o QR del evento".

### Bloqueantes no-código (trámites)

**T1. Cuenta Apple Developer** — $99/año. Requiere DNI/pasaporte + validación 24-48hs.

**T2. Certificados y provisioning profile** — se generan desde Xcode una vez que hay cuenta.

**T3. Privacy Policy actualizada** — revisar `PrivacyPolicy.tsx` para cubrir:
- Datos recolectados (email, tel, foto, cert médico, ubicación de eventos).
- Terceros: Lovable Cloud (Supabase), Mercado Pago, Google, Open-Meteo, AFIP.
- Cómo pedir borrado (link a botón B1).
- Contacto de privacidad (email).

**T4. Assets App Store**:
- Icono 1024×1024 sin transparencia.
- Splash screen (usar Capacitor plugin).
- Screenshots: 6.5" (iPhone 14 Plus) y 6.7" (iPhone 15 Pro Max) mínimo. Idealmente 5 por tamaño.
- Preview video opcional (30s).

**T5. Ficha App Store Connect**:
- Nombre: "Reybaud" (o similar corto).
- Subtítulo (30 chars): "Ciclismo. Escuela y viajes."
- Categoría primaria: Sports. Secundaria: Health & Fitness.
- Keywords (100 chars).
- Descripción (4000 chars).
- Support URL + Marketing URL.
- Edad: 4+.
- Cuenta demo para review: alumno + admin con contraseña fija.

**T6. `capacitor.config.ts`** para iOS:
- Agregar `ios: { contentInset: "automatic", scheme: "reybaud" }`.
- Splash: `SplashScreen: { launchShowDuration: 2000, backgroundColor: "#0F172A" }`.

### Orden de ejecución sugerido cuando se retome
1. B1 + B2 (bloqueantes duros, además sirven para Android y PWA).
2. T3 (privacy policy) + T4 (assets).
3. B3 + B4 + B5 (pulido).
4. T1 + T2 (trámites Apple).
5. `npx cap add ios`, probar en simulador, `npx cap open ios`, subir via Xcode a TestFlight.
6. Submit a review.

### Notas
- Rechazo en primera ronda es normal (esperar 1-2 iteraciones).
- Review de Apple: 24-72hs por iteración.
- Estimación total (con cuenta ya creada): 3-5 días laborales.

