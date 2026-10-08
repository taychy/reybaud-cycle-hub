# Auditoría: correos del Training Camp San Luis no visibles en Historial

## Hallazgos (solo lectura, producción — el mismo backend que usa la app publicada)

| Envío | Asunto | Estado | Creado (UTC) | Total | Enviados | Fallidos | Destinatarios por estado |
|---|---|---|---|---|---|---|---|
| 80539c78… | Training Camp San Luis – Falta cargar tu apto físico | sent | 08/10 15:26 | 25 | 25 | 0 | sent: 25 |
| 014b3860… | Training Camp San Luis – ¡Tu apto físico está al día! | sent | 08/10 15:31 | 7 | 7 | 0 | sent: 25 → 7 |

- Los dos envíos existen y son los **dos más recientes** de los 25 que hay en total. El Historial carga los últimos 100 (Email masivo) y 200 (Comunicaciones), ordenados del más nuevo al más viejo, sin filtro por fecha ni por evento. Las consultas no tienen ningún filtro que los oculte.
- La ruta funciona: `/admin/comunicaciones?tab=email-masivo` → pestaña "Historial". También aparecen en `/admin/comunicaciones?tab=historial`.
- "Enviado" quiere decir que el proveedor **aceptó** el correo. No confirma que haya llegado al buzón. No se registraron rebotes ni quejas para estos envíos.

## Causa probable: permisos de la cuenta con la que se entra
Solo los usuarios con rol **admin** pueden leer esos envíos. Si no lo tienen, la lista aparece vacía y sin mostrar ningún error. Roles actuales:
- scarlettbonatto@gmail.com: admin, alumno, depósito, coach → **los ve**
- scarlett@ciclismoreybaud.com: solo coach → **no ve nada**
- scarlettbonatto+playreview@gmail.com: sin roles → no ve nada

Si la usuaria entró con scarlett@ciclismoreybaud.com, esa es la causa exacta. Falta confirmar con qué cuenta entró.

## Solución propuesta (requiere tu aprobación, no se aplicó nada)
1. Rápida: entrar con scarlettbonatto@gmail.com.
2. O dar el rol admin a scarlett@ciclismoreybaud.com, si querés que esa cuenta administre.
3. Opcional: si la lista vuelve vacía por falta de permisos, mostrar un aviso del tipo "No tenés permisos para ver el historial" en lugar de una lista vacía sin explicación.

No se reenvió nada ni se modificaron datos.
