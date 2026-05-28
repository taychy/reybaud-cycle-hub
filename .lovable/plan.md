# Plan: Tienda v2 + Multi-cuentas MP

Antes de tocar código quiero confirmar la arquitectura porque tu respuesta abrió un tema grande (multi-MP) que conviene separar en fases.

---

## Fase A — Variantes en productos normales (checkout in-app)

### Base de datos
- `store_products`: agregar
  - `variants jsonb` (independiente de `preorder_variants`)
  - `checkout_mode text` con valores `'in_app'` | `'tienda_nube'` (default `'tienda_nube'` para no romper lo actual)
  - `tienda_emisor_id uuid` referencia a `cuentas_facturacion` (cuál CUIT usar al facturar ventas de tienda)
- Nueva tabla `store_orders` (si no existe ya con suficiente detalle): `alumno_id`, `product_id`, `variant_selection jsonb`, `cantidad`, `precio_unitario`, `total`, `moneda`, `mp_payment_id`, `mp_status`, `estado`, `metodo_pago`, `origen_registro`, `notas`.

### Frontend
- `ProductForm` admin: `VariantsEditor` siempre visible (no solo preventa). Toggle "Checkout dentro de la app" → si activo, mostrar selector de cuenta MP/emisor.
- Card de producto en Tienda alumno: si `checkout_mode='in_app'` y tiene variantes → abre drawer de compra con selección de variante + MP. Si `'tienda_nube'` → redirect como hoy.
- Nuevo edge function `create-store-order-mp-preference` (gemelo de `create-preorder-mp-preference`).

---

## Fase B — Multi-cuentas MP + Facturación segmentada

Hoy el sistema asume **una sola cuenta MP** (`MP_ACCESS_TOKEN` como secret global) y **una sola configuración de facturación**. Vos querés separar por origen: suscripciones, tienda, viajes.

### Propuesta
- Nueva tabla `mp_accounts`:
  - `id`, `nombre` ("MP Cuotas", "MP Tienda", "MP Viajes")
  - `access_token` (cifrado / vía secret name), `public_key`
  - `cuenta_facturacion_id` (a qué CUIT factura por default)
  - `activo bool`
- Nueva tabla `mp_routing` (o columna en cada tabla origen):
  - `origen text` (`'suscripcion' | 'store' | 'evento' | 'preventa'`)
  - `mp_account_id`
  - default por origen, pero override por producto/evento si hace falta (`store_products.mp_account_id`, `events.mp_account_id`).
- Edge functions (`create-mp-preference`, `create-event-mp-preference`, `create-preorder-mp-preference`, `create-store-order-mp-preference`, `process-card-payment`) leen el token de `mp_accounts` según el origen en vez del secret global. El secret global queda como fallback.
- Admin UI nueva en **Configuración → Cuentas de cobro**: alta/edición de cuentas MP, prueba de conexión (ping a `/users/me`), asignación a origen.
- `auto-facturar` ya recibe `cuit_emisor_id`; lo sigue usando, pero ahora viene resuelto desde el `mp_account.cuenta_facturacion_id` correspondiente.

### Implicancias
- Los `access_token` de MP los seguís guardando como **secrets** (no en DB plano). La tabla `mp_accounts` guarda el **nombre del secret** (ej. `MP_TOKEN_TIENDA`) y los edge functions hacen `Deno.env.get(account.secret_name)`. Vas a tener que pegar los tokens vía el modal de secrets una vez por cuenta.
- Webhooks: cada cuenta MP tiene su propia URL de webhook. Probablemente alcance con un único `mp-webhook` que mire `external_reference` (ya identifica el origen) y resuelva la cuenta. Si MP exige webhook distinto por cuenta, configuramos URLs `mp-webhook?account=tienda`.

---

## Fase C — Combos de preventa

### Modelo flexible (acepta tus dos casos)
- `store_products.is_combo bool`
- `store_products.combo_pricing_mode`: `'sum'` (suma componentes) | `'fixed'` (precio combo fijo con descuento implícito)
- `store_products.combo_price numeric` (cuando `fixed`)
- `store_products.sena_mode`: `'porcentaje'` | `'monto_fijo'`
- `store_products.sena_valor numeric`

- Nueva tabla `store_combo_items`:
  - `combo_id` (FK a `store_products`)
  - `component_product_id` (FK a `store_products`, **nullable** → si es null, es sub-ítem interno)
  - `internal_name text`, `internal_variants jsonb` (cuando es sub-ítem interno sin producto propio)
  - `precio_individual numeric` (precio si el cliente compra suelto)
  - `obligatorio bool`
  - `sort_order int`

→ Esto resuelve tu "¿pueden ser las dos opciones?": sí, cada item puede apuntar a un producto reusable **o** definirse inline.

### Stock cruzado (clave para no sobrevender)
- Cuando el combo **no es preventa**: stock disponible = `min(stock disponible por talle equivalente de cada componente)`.
  - Ej. combo Campera+Chaleco talle M = `min(stock_campera_M, stock_chaleco_M)`.
  - Esto requiere que las variantes de los componentes compartan dimensión "Talle" con el mismo nombre. Si no matchean, marcamos el combo como "configuración inválida" en admin.
- Cuando el combo **es preventa**: stock ilimitado (pedido al proveedor), respetando `preorder_total_units` global si se setea.
- Helper RPC `get_combo_stock(combo_id, variant_selection)` que centraliza esta lógica.

### Reserva
- `store_preorders` agrega: `modalidad ('combo' | 'individual')`, `items jsonb` (`[{component_id|internal_idx, variantes, cantidad, precio}]`), `sena_calculada numeric`.
- `PreorderReserveDialog` con 2 tabs: **Combo completo** (configurar variante por componente, ver precio combo y seña) / **Elegir por separado** (checkboxes por componente con precio individual, total dinámico, seña proporcional).
- Seña = `sena_valor` si `sena_mode='monto_fijo'` (cuando combo completo) o `% * total` si `'porcentaje'` (siempre que sea split, o si admin elige %).

### Público `/preventa/:id`
- Si `is_combo`: muestra componentes con foto, precio combo vs precio sumado (badge "ahorrás $X"), ambos caminos de compra.

---

## Orden de implementación que propongo

1. **Fase A** primero (variantes + checkout in-app, usando el secret MP actual). Valor inmediato, bajo riesgo.
2. **Fase C** (combos de preventa con stock cruzado). Independiente de B.
3. **Fase B** (multi-cuentas MP). Es la más invasiva: toca todos los edge functions de pago + webhook + facturación. Vale la pena hacerla aislada para no mezclarla con bugs de tienda.

---

## Lo que necesito confirmar antes de migrar

1. **Fase B ahora o después?** ¿La empezamos en este mismo ciclo o primero A+C y B queda para el próximo? (Recomiendo separarla.)
2. **¿Cuántas cuentas MP vas a tener** al arrancar? (Para saber si la UI de cuentas vale la pena ya o hardcodeo 2-3 slots.)
3. **Sub-ítems internos del combo**: ¿necesitan stock propio o son puramente descriptivos? (Si no tienen stock, no se pueden vender sueltos — solo dentro del combo.)
4. **Combo no-preventa**: ¿lo vas a usar? ¿O por ahora todos los combos son preventa y el stock cruzado lo dejamos para después?

Decime y arranco con las migraciones.