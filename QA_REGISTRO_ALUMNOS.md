# QA — primer registro, recuperación de ficha y correo secundario

## Estado y límites

Esta propuesta vive en la PR #44. No ejecutar altas ni envíos de correo en la base de producción.
La migración `20261112215000_verified_student_registration.sql` debe aplicarse
en un entorno de Supabase de ensayo **antes** de probar las pantallas nuevas.
El código nuevo no debe publicarse hasta completar esta matriz y comprobar
que los clientes públicos no dependen de INSERT anónimo sobre `alumnos`.

## Matriz con identidades ficticias

| Escenario | Pasos | Resultado esperado |
|---|---|---|
| Correo nuevo | Login con correo no registrado → «Crear mi cuenta» | Correo prellenado; ninguna ficha creada todavía |
| Verificación correcta | Solicitar OTP, confirmar enlace o código, completar formulario | Una sola ficha con `user_id` de Auth verificado |
| Verificación vencida | Usar token/código vencido, reintentar | No se crea ficha, se ofrece pedir uno nuevo |
| Email ya registrado | Iniciar registro con correo existente | Se conserva ficha; acceso al flujo de inicio de sesión |
| Mismo DNI, otro correo | Confirmar nuevo email, ingresar DNI de ficha previa | No hay segunda ficha, se ofrece confirmar vínculo desde correo original |
| Vinculación confirmada | Confirmar correo original, iniciar sesión con correo nuevo | `current_alumno_id()` resuelve ficha original; mismas reservas, pagos y CC |
| Mismo teléfono, distinto DNI | Registrar teléfono que ya usa otra persona | No se crea ficha ni se vincula automáticamente; intervención humana |
| Dos pestañas | Enviar datos del mismo usuario simultáneamente | Sólo una ficha; el otro intento devuelve estado `existing` |
| Google nuevo | Ingresar con Google sin ficha anterior | Sesión verificada → completar perfil, sin redirección circular |
| Interrupción | Cerrar y reabrir pestaña antes y después del código | Mantiene datos generales de la pestaña, nunca el DNI guardado |
| Staff y alumnos actuales | Acceso normal para admin/coach y alumno habitual | No se alteran permisos, planes, reservas ni acceso al portal |
| Alta anónima directa | Intentar INSERT por API Data sin autenticarse | Rechazada por RLS |
| Error al consultar | Simular error de búsqueda o RPC | No crear ficha, error recuperable |
| Periodo/pagos | Contratar plan desde ficha nueva y acceder nuevamente | Una única suscripción y pagos íntegros, sin imputación duplicada |

## Condiciones de publicación

1. Confirmar que la migración se ejecuta en una base **aislada**, con Auth y correo de pruebas.
2. Ejecutar tests, compilación y pruebas de navegación con usuarios ficticios.
3. Auditoría RLS, roles y permisos de inserción del resto de funcionalidades públicas.
4. Comparar antes/después las fichas y los saldos de QA, sin tocar los históricos reales.
5. Publicar frontend + cambio de backend de forma coordinada; si hay rollback de frontend,
   no reabrir el INSERT anónimo sin evaluar implicancias de seguridad.
6. Obtener autorización de la responsable de Reybaud para aplicar cambios a producción.
