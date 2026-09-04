# Auditoría: Natalia no puede entrar por /admin/login

Solo lectura. No se modificó código, base de datos ni configuración.

## 1) Causa más probable

El botón queda en "ENVIANDO..." para siempre porque el envío del código **no tiene manejo de fallas de red/tiempo de espera**, y en este momento la base de datos del proyecto está respondiendo de forma intermitente.

Evidencia concreta:

- La función que envía el código (`src/pages/AdminLogin.tsx`, `handleSendOtp`, líneas 161-216) usa `try { ... } finally { finishOtpRequest() }`. **No hay `catch`**: cada `setLoading(false)` está dentro del camino feliz. Si `supabase.rpc("check_admin_or_coach_email")` o `supabase.auth.signInWithOtp` lanza (error de red, corte de conexión, fetch abortado) o nunca resuelve, `loading` queda en `true` de forma permanente y el botón muestra "Enviando..." indefinidamente. No hay temporizador de seguridad en esta ruta (sí lo hay para la verificación de rol, `ROLE_CHECK_TIMEOUT_MS`, pero no para el envío).
- El servicio de autenticación registró hoy fallas reales contra la base: `504` con `error: context deadline exceeded` y `400` con `failed to connect to host=localhost user=supabase_auth_admin database=postgres` (20:52 UTC, referer `https://reybaud.lovable.app`).
- Durante esta misma auditoría, dos consultas de lectura fallaron con "connection pooler unavailable" y otras funcionaron: la base está intermitente ahora mismo.

Es decir: falla de infraestructura intermitente + ausencia de `catch`/timeout en la pantalla = spinner eterno en lugar de un mensaje de error.

Causa secundaria (agravante, no la principal): si una petición queda colgada, `startOtpRequest()` puede dejar el candado tomado, y `canRequestOtpAgain` corta reintentos dentro de 8 segundos **sin mostrar ningún mensaje** (línea 174-177), por lo que reintentar parece "no hacer nada".

## 2) ¿El bloqueo es antes o después de enviar el correo?

**Antes o durante el envío**, no después. Hay dos puntos posibles y ambos están antes de que el correo salga:
- validación del email de staff (`check_admin_or_coach_email`) — requiere base de datos;
- `signInWithOtp` — requiere el servicio de auth, que a su vez requiere base de datos (es exactamente lo que falló con 504).

Dato relevante: en `auth.users`, Natalia tiene `recovery_sent_at = 2026-09-04 19:56:01 UTC`, o sea que **un intento sí llegó a generar y despachar un código a las 19:56**. Los intentos posteriores (20:52 en adelante) coinciden con los errores 504/400 de conexión a base.

## 3) ¿Natalia está correctamente registrada y autorizada?

Sí, sin observaciones:
- `auth.users`: `natalia@ciclismoreybaud.com`, id `988fd721-...`, email confirmado el 2026-02-27, **sin baneo ni borrado**, último ingreso 2026-08-06.
- Roles: `admin`, `deposito`, `alumno`.
- `admin_profiles`: existe con `status = active`.
- La función de autorización devuelve `true` para su email.

No es un problema de permisos ni de alta.

## 4) Cambio mínimo recomendado (no aplicado)

En `src/pages/AdminLogin.tsx`, dentro de `handleSendOtp`:

1. Agregar un bloque `catch` que muestre un error legible ("No pudimos conectarnos. Probá de nuevo en un minuto.") y mover `setLoading(false)` al `finally`, junto a `finishOtpRequest()`. Esto solo cambia el estado de la pantalla, no la lógica de auth.
2. Envolver la llamada a `check_admin_or_coach_email` y a `signInWithOtp` en una carrera con un tiempo límite (mismo patrón ya usado en `checkAppRole`, ~10 s), para que una conexión colgada termine en mensaje de error en vez de spinner eterno.
3. Cuando `canRequestOtpAgain` bloquea por el enfriamiento de 8 s, mostrar un aviso corto en vez de salir en silencio.

Fuera de código: revisar la salud/estabilidad de la base del proyecto, que es la falla de fondo.

## 5) Workarounds inmediatos y seguros

- Reintentar el envío pasados 1-2 minutos, **recargando la página antes** (F5). La recarga limpia el candado interno de petición en curso y el estado de "Enviando...".
- Usar el código que ya se generó a las 19:56 UTC si aún está en su correo y no venció; si venció, pedir uno nuevo tras recargar.
- Alternativa equivalente: entrar con Google en el login principal con la misma casilla `natalia@ciclismoreybaud.com` y luego ir a `/admin` (sus roles ya están asignados, el portal la deja pasar).
- Si la base sigue intermitente, ninguna de las dos vías funcionará hasta que se normalice: el síntoma será el mismo para cualquier usuario de staff, no solo Natalia.

## Notas

- Cambios recientes revisados: las últimas migraciones (2026-09-04) son de campañas de tienda y del resumen semanal de entrenamientos; **ninguna toca login, roles ni la función de validación de staff** (última modificación de `check_admin_or_coach_email`: 2026-06-03).
- No se ejecutó ninguna escritura ni cambio de configuración durante esta auditoría.
