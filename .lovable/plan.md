# Encuesta gastronómica: participar sin cuenta

## Resultado
El mismo enlace permitirá elegir **Tengo cuenta** o **No tengo cuenta**. El segundo camino tendrá dos pasos pequeños: identificación y encuesta, sin contraseña ni alta de usuario.

## Acceso y privacidad
1. Pedir nombre, apellido y DNI con validación; responder siempre de forma neutral, sin revelar coincidencias ni el contacto completo.
2. Cuando haya una única reserva confirmada que coincida inequívocamente, enviar un código al email ya guardado. Verificarlo antes de mostrar paquete o respuestas anteriores.
3. Tras verificar, abrir la encuesta existente con permiso temporal exclusivo de gastronomía; nunca entregar el enlace general de reserva ni acceso a pagos. Permitir editar mientras la verificación siga vigente.
4. Si no llega el código, falta contacto o hay ambigüedad, permitir completar una encuesta nueva sin mostrar paquete ni respuestas previas. Guardarla en una bandeja administrativa privada como **pendiente de verificar**, sin tocar ninguna reserva.
5. Administradores autorizados revisarán los pendientes, confirmarán identidad y reserva explícitamente y conciliarán con auditoría. Si ya hay respuesta, mostrar conflicto y exigir decisión; nunca sobrescribir silenciosamente.

## Comidas y compatibilidad
- Desayuno incluido; pensión informada únicamente después de verificar y desde el paquete.
- Sin pensión verificada: interés todas/individual/ninguna a ARS 35.000 por comida, sin total ni compra porque el programa está pendiente.
- En la recepción no verificada, recoger preferencias e interés opcional sin afirmar qué incluye el paquete; la revisión resolverá su pertinencia.
- Mantener el acceso de alumnos autenticados y no alterar reservas, fechas, precios, pagos, comidas ni Extras.

## Seguridad y pruebas
- Códigos con caducidad, límite de intentos, consumo único y permisos revocables; tokens solo en memoria, nunca en URL.
- Proteger datos sanitarios con acceso público de lectura denegado; validar todas las operaciones en servidor y registrar auditoría sin DNI en logs.
- Probar OTP con envíos simulados, alternativa pendiente, edición, duplicados, DNI erróneo, coincidencias ambiguas, canceladas, permisos y vistas móvil/escritorio. No enviar pruebas a participantes reales.
- Verificar que reservas y pagos permanezcan intactos; dejar la interfaz lista para que la usuaria publique después de revisar.

## Decisión necesaria: límites de abuso
Lovable Cloud no tiene una protección estándar de límites por IP para este flujo. Se propone una protección específica con contadores privados y operaciones atómicas: **5 solicitudes por identidad/evento y 20 por IP cada 15 minutos; 5 intentos por código; código de 10 minutos y sesión de encuesta de 30 minutos**. Los valores son propuestos, no reglas comerciales existentes. Requiere aceptar esta alternativa antes de implementarla.

## Detalle técnico
- Reutilizar `TripFoodSurveyDrawer` con adaptador exclusivo de encuesta verificada, sin reutilizar tokens amplios de reserva.
- Resolver candidatos en servidor por documento normalizado y nombre/apellido, incluyendo alumnos y externos, deduplicando por reserva; no inferir por nombre ni crear fichas.
- Servicio de correo existente verificado en `notify.reybaud-app.com`; un único mensaje de verificación por solicitud, sin campañas ni nuevas colas de correo.
- Incorporar almacenamiento privado de desafíos/sesiones, límites y recepción pendiente, con permisos explícitos y validación administrativa server-side.
- Integrar bandeja pendiente en Viaje → Reportes → Gastronomía.

---

# Auditoría anterior: App Store iOS — Reybaud (octubre 2026)

Solo auditoría: no se cambió código, configuración ni se desplegó. Se contrastó la checklist de julio 2026 con lo que hay hoy en el proyecto.

## Estado real

| Área | Ya implementado | Faltante | Bloqueante |
|---|---|---|---|
| 1. Capacitor / iOS | Capacitor 8 (core, cli) y proyecto Android | No está el paquete iOS ni la carpeta del proyecto iPhone. El nombre de la app es "reybaud-cycle-hub" | **Sí.** La app apunta a la vista previa de desarrollo (`server.url` lovableproject.com) con `cleartext: true`. Apple la rechazaría y mostraría la versión en edición, no la publicada |
| 2. Inicio de sesión | Código por email y Google (`Login.tsx`) | Iniciar sesión con Apple: no existe. Falta probar Google dentro de la app iPhone | **Sí.** Apple exige su propio botón si se ofrece Google (4.8) |
| 3. Eliminar cuenta | — | No hay botón ni proceso de borrado. Hay que conservar facturas y registros fiscales | **Sí** (5.1.1(v)) |
| 4. Privacidad | Hay página de privacidad y términos | Revisar contenido: certificados médicos, pagos, Mercado Pago, Google, proveedor de mails, cómo borrar la cuenta y contacto. No encontré Meta Pixel en el inicio de la app; hay que confirmarlo antes de responder la encuesta de privacidad de Apple | Sí, para enviar a revisión |
| 5. Pagos | Solo servicios presenciales, viajes y productos físicos, por Mercado Pago (exentos de compra dentro de la app según 3.1.3(e)) | Revisar textos: que no digan "desbloquear" ni "premium" | Riesgo medio |
| 6. Permisos y enlaces | Se usa cámara en depósito y coach | Textos de permiso de cámara y fotos (se crean junto con el proyecto iPhone). Revisar enlaces a WhatsApp y Mercado Pago. No hay notificaciones push | Sí, sin los textos la app se cierra al abrir la cámara |
| 7. Imágenes | Íconos web 192 y 512 | Ícono 1024 sin transparencia, pantalla de inicio, capturas de iPhone 6.9"/6.5" | Sí, para la ficha |
| 8. Pruebas y Apple | — | Cuenta Apple Developer, Mac con Xcode 26 o posterior, certificados, TestFlight, cuenta demo para revisión | **Sí, depende de ustedes** |
| 9. Compatibilidad | Web y Android en uso | Cambiar la dirección del servidor también afecta Android; borrar cuenta y Apple tocan a todos los usuarios | Riesgo a controlar |

## Depende de credenciales Apple (no lo puedo hacer yo)
- Inscripción en Apple Developer (USD 99/año) y validación de identidad.
- Crear la app en App Store Connect con el mismo identificador.
- Firma, certificados y subida desde Xcode en una Mac.
- Iniciar sesión con Apple en la app iPhone puede requerir datos propios de Apple (Service ID y clave). Hay que confirmarlo al configurarlo.

## Plan, de menor a mayor riesgo
1. **Decisiones sin código:** nombre final, identificador definitivo (hoy `app.lovable.reybaudcyclehub`, compartido con Android; no cambiarlo si Android ya está en Play), cuenta demo y email de privacidad.
2. **Trámite Apple** en paralelo: cuenta de desarrollador y ficha.
3. **Privacidad y textos de pago:** actualizar la página de privacidad y revisar textos de planes, eventos y tienda. Sin efecto en pagos.
4. **Iniciar sesión con Apple:** botón al lado de Google, que vincule por email a la ficha existente sin duplicar alumnos. Probar en web primero.
5. **Eliminar cuenta:** pedido con doble confirmación, período para arrepentirse, anonimiza datos personales y certificado médico; conserva facturas, pagos y registros obligatorios. Requiere tu aprobación del alcance.
6. **Configurar iOS:** agregar el paquete iOS, quitar la vista previa y `cleartext` de la configuración que se compila, textos de permisos, ícono y pantalla de inicio. Verificar que Android no cambie.
7. **En tu Mac:** crear el proyecto iPhone, probar en simulador y en un iPhone real (inicio de sesión, Google, Apple, Mercado Pago, WhatsApp, cámara), compilar con Xcode 26+ y subir a TestFlight.
8. **Capturas y envío a revisión.** Es normal que haya una o dos rondas de correcciones.

## Detalle técnico
- `capacitor.config.ts`: `server.url` debe salir del build de producción (solo para recarga en desarrollo); `appName` "Reybaud".
- Agregar `@capacitor/ios` 8.x; Info.plist: `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`, `NSPhotoLibraryAddUsageDescription`.
- Apple: `supabase--configure_social_auth` + `lovable.auth.signInWithOAuth("apple")`; respetar el vínculo de identidad por email.
- Borrado: RPC SECURITY DEFINER con marca de pedido + tarea programada de anonimización; nunca borrar facturas, pagos, `pagado_at` ni auditoría.
- WKWebView: confirmar que el popup de Google/Apple vuelve a la app; enlaces `wa.me` y Mercado Pago deben abrirse por fuera.
