# Auditoría y plan App Store iOS — Reybaud (octubre 2026)

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
