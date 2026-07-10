## Cargar credenciales MP de Josilene Do Nascimento

La cuenta ya está creada en `cuentas_mp` (slug `josilene_do_nascimento`, activa) y espera estos 3 secrets en el entorno de edge functions:

- `MP_ACCESS_TOKEN_JOSILENE_DO_NASCIMENTO` — Access Token (privado, `APP_USR-...`)
- `MP_PUBLIC_KEY_JOSILENE_DO_NASCIMENTO` — Public Key (`APP_USR-...`)
- `MP_WEBHOOK_SECRET_JOSILENE_DO_NASCIMENTO` — Clave secreta del webhook de MP

### Pasos

1. Abrir el formulario seguro con `add_secret` para los 3 nombres exactos de arriba (una sola tanda). Vos pegás los valores desde el panel de Mercado Pago de Josilene:
   - Access Token / Public Key: MP → *Tus integraciones* → aplicación → *Credenciales de producción*.
   - Webhook Secret: en la misma app → *Notificaciones / Webhooks* → *Clave secreta*.
2. Una vez guardados, quedan disponibles automáticamente en `resolveCuentaMP` (ya lee `secret_name_token`, `secret_name_pubkey`, `secret_name_webhook`). No hace falta desplegar nada.
3. Verificación rápida: ir a `/admin/pagos → Cuentas MP`, seleccionar la cuenta de Josilene y correr *Sincronizar movimientos* (últimos 7 días). Si el token es válido, aparecen pagos o "0 nuevos" sin error `token_no_configurado`.

### Notas
- No se modifica código ni base de datos: solo se cargan valores en Secrets.
- Si en el futuro rota alguna key, usar `update_secret` sobre el mismo nombre.