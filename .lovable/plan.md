# Portal público de cuenta corriente

Inspirado en el ejemplo de Dux: tabla limpia, sin branding pesado, columnas claras (Concepto, Fecha, Moneda, Total, Pagado, Por Pagar, Estado) y un botón verde "$" por fila vencida para pagar.

## 1. Datos visibles en el portal público

**Encabezado:** "Hola, {Nombre} {Inicial_apellido}." (ej: "Hola, Rubén A."). Sin email, sin teléfono, sin DNI, sin domicilio, sin notas internas, sin IDs internos, sin nombre de operador.

**Tabla de deudas (solo lo que realmente debe):**
- Suscripciones: estado `vencida` o `pendiente_verificacion`, **no anuladas/canceladas**, con saldo > 0.
- Reservas de eventos: cuotas (`reservation_installments`) en estado `pendiente`/`vencida` no canceladas.
- Tienda: `store_orders` y `store_preorders` con saldo pendiente y no canceladas.

Columnas: Concepto (ej: "Plan Mensual — Junio 2026", "Evento Bariloche — Cuota 2/3", "Pedido tienda #1234"), Fecha vencimiento, Moneda, Total, Pagado, Por pagar, Estado (badge), Acción ($ Pagar).

**Sección saldo a favor** (si aplica): muestra crédito disponible por moneda, sin detalle de movimientos.

**Lo que NO se muestra:**
- Movimientos individuales de cuenta corriente.
- Ajustes manuales / notas admin / origen técnico.
- Pagos históricos detallados (solo el monto "Pagado" agregado por concepto).
- Datos de contacto, fiscales o médicos.

## 2. Botón "Pagar" por fila

Cada deuda vencida tiene botón verde que abre checkout MP correspondiente:
- Suscripción → `create-mp-preference`
- Reserva/cuota → `create-event-mp-preference`
- Orden tienda → `create-store-order-mp-preference`
- Preventa → `create-preorder-mp-preference`

Si el ítem no tiene integración MP disponible (ajuste manual), se oculta el botón y se muestra "Coordinar con administración" + link WhatsApp a contacto admin.

Retorno de MP → `/pago-resultado` (existente) → webhook `mp-webhook` actualiza el ítem y refresca portal.

## 3. Tokens (tabla `cuenta_corriente_tokens`)

Campos: `id`, `alumno_id`, `token` (uuid v4), `created_at`, `expires_at` (nullable), `revoked_at` (nullable), `last_accessed_at`, `access_count`, `last_user_agent`, `last_ip`.

**Opciones al generar el link (admin):**
- Expiración: 7 días / 30 días / 90 días / sin expiración (default 30 días).
- Revocación manual: botón "Revocar" en la fila del admin.

RLS: tabla cerrada al cliente. Acceso solo vía RPC `SECURITY DEFINER` `get_cuenta_publica(p_token uuid, p_user_agent text, p_ip text)`:
1. Valida token existe, no `revoked_at`, no `expires_at` vencido.
2. Incrementa `access_count`, actualiza `last_accessed_at`, `last_user_agent`, `last_ip`.
3. Devuelve solo: nombre+inicial apellido, deudas filtradas, saldo a favor por moneda.

IP/UA tomados del header en una edge function liviana `cuenta-publica-resolve` que llama al RPC (el cliente no puede setear IP real).

## 4. Admin (`AdminCuentaCorriente.tsx`)

Por fila de alumno:
- 🔗 "Generar link" → dialog con selector de expiración → copia URL `/cuenta/{token}` al portapapeles.
- 📱 "Enviar WhatsApp" → abre wa.me con mensaje pre-armado.
- 🚫 "Revocar" → marca `revoked_at = now()`.
- Tooltip muestra: último acceso, cantidad de accesos, expiración.

## 5. Página `/cuenta/:token`

Ruta pública (sin auth). Diseño limpio inspirado en Dux:
- Header simple con logo Reybaud y saludo "Hola, {Nombre} {I.}"
- Card con total adeudado por moneda
- Tabla de deudas con botón $ verde por fila
- Footer minimal con link a política de privacidad y contacto admin

Si token inválido/vencido/revocado: pantalla "Link no disponible — solicitá uno nuevo a tu coach".

## Archivos

- Migración: tabla `cuenta_corriente_tokens` + RPC `get_cuenta_publica` + RPC `admin_create_cuenta_token` + RPC `admin_revoke_cuenta_token`.
- Edge function: `cuenta-publica-resolve` (captura IP/UA y llama RPC).
- `src/pages/PublicCuentaCorriente.tsx` (nueva)
- `src/components/admin/CuentaPublicLinkDialog.tsx` (nueva)
- `src/pages/admin/AdminCuentaCorriente.tsx` (agrega botones)
- `src/App.tsx` (ruta `/cuenta/:token`)

## Confirmaciones que necesito

1. **Expiración por defecto: 30 días** ¿ok o preferís 90?
2. **¿Mostrar también historial de pagos (últimos 6 meses, solo totales por concepto)** o estrictamente solo deudas vigentes?
3. **¿Avanzo?**
