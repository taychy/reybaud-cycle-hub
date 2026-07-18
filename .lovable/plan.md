# Captura de contactos de WhatsApp Web (Natalia)

Objetivo: cuando Natalia atiende WhatsApp Web en la compu, quede registrado el contacto (nombre, apellido, email, teléfono) en Reybaud sí o sí, y si ya es alumno se auto-vincule.

## Alcance (fase 1)

**Sí incluye:**
1. Edge function `register-whatsapp-contact` que recibe `{ nombre, apellido, email, telefono, notas }` y decide: vincular a `alumnos` existente por teléfono normalizado o email, o crear en `marketing_contacts` como prospecto.
2. Panel admin `/admin/contactos-whatsapp` con listado, filtro por día/quién atendió/estado (alumno vs prospecto), y contador de conversión.
3. Extensión Chrome MV3 que se pega al costado de WhatsApp Web con un mini-form (nombre, apellido, email, teléfono pre-cargado del chat abierto si se puede leer del DOM, notas). Botón "Guardar en Reybaud". Login con `natalia@ciclismoreybaud.com` vía magic link (usa sesión de Reybaud). Empaquetado como zip descargable desde `/admin/contactos-whatsapp`.

**No incluye (fase 2, después):**
- Auto-lectura de mensajes del chat.
- Envío automático de las 3 preguntas al contacto por WhatsApp (Meta no lo permite sin API oficial).
- Sincronizar Google Contacts (queda pendiente en `.lovable/pendientes.md`, lo hablamos después como pidió).

## Detalle técnico

### 1. DB
- Tabla `marketing_contacts` ya existe (20 columnas). Reusar. Verificar que tenga: `nombre`, `apellido`, `email`, `telefono`, `telefono_normalizado`, `origen`, `capturado_por_email`, `capturado_por_id`, `alumno_id` (nullable), `notas`, `created_at`. Si falta alguno, migración chica para agregarlo.
- Índice único suave: `telefono_normalizado` (para dedupe).

### 2. Edge function `register-whatsapp-contact`
- `verify_jwt = true` (Natalia loguea).
- Normaliza teléfono con lógica AR (reutilizar `phoneNormalize.ts`, portada a Deno).
- Busca match:
  - `alumnos` por `telefono_normalizado` o `email` → si existe, upsert en `marketing_contacts` con `alumno_id` seteado y log a `student_activity_log` ("Contacto WhatsApp registrado por Natalia").
  - Si no, upsert en `marketing_contacts` como prospecto (`alumno_id = null`).
- Devuelve `{ status: 'alumno' | 'prospecto', alumno_id?, contact_id }`.

### 3. Panel admin `/admin/contactos-whatsapp`
- Tabs: **Hoy**, **Últimos 7 días**, **Prospectos sin convertir**, **Convertidos a alumno**.
- Tabla con: fecha, atendido por, nombre, teléfono, email, estado (alumno/prospecto), notas, botón "Ver ficha alumno" o "Crear alumno desde este prospecto".
- KPI arriba: contactos hoy, % convertidos, prospectos abiertos.
- Botón "Descargar extensión (.zip)" que sirve el artefacto desde `/public/reybaud-whatsapp.zip`.

### 4. Extensión Chrome MV3
- Estructura en `extension/`:
  - `manifest.json` con `content_scripts` en `https://web.whatsapp.com/*`.
  - `content.js` inyecta panel flotante al costado del chat con el mini-form.
  - `content.js` intenta leer el teléfono del chat activo desde el DOM (best-effort, si Meta cambia el selector se degrada a input manual — no rompe).
  - `popup.html` para login (magic link a Reybaud) y ver últimos guardados.
  - `background.js` guarda la sesión en `chrome.storage.local` y llama a la edge function con el token.
- Empaquetado con `nix run nixpkgs#zip` a `public/reybaud-whatsapp.zip`.
- README en `/admin/contactos-whatsapp` con los 4 pasos de instalación (Developer mode → Load unpacked).

## Orden de ejecución
1. Migración chica en `marketing_contacts` si faltan columnas + índice.
2. Edge function `register-whatsapp-contact` + deploy.
3. Página `/admin/contactos-whatsapp` (listado + KPIs + descarga).
4. Extensión Chrome (form + login + integración con edge function) + empaquetado.
5. Documentar instalación en el panel admin.

Después de que Natalia lo pruebe una semana, avanzamos con Google Contacts (fase 2, ya está anotado en `.lovable/pendientes.md`).
