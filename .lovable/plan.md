# Auditoría tienda: alumno vs invitado y pedido #105 (solo lectura)

No se cambió código ni datos, y no se crearon pedidos ni pagos.

## 1. Rutas y puntos donde se crea o avanza un pedido

Tienda pública (invitado):
- Catálogo: `/tienda` → `src/pages/PublicStore.tsx`. La tarjeta completa es un `Link` a `/tienda/producto/:id` (línea 109).
- Detalle y checkout: `/tienda/producto/:id` → `src/pages/PublicProduct.tsx`. Envía el formulario a la función `create-public-store-order`.
- Creación del pedido: `supabase/functions/create-public-store-order/index.ts`, INSERT en `store_orders` en las líneas 117-138 (`origen_registro='tienda_publica'`, estado `pendiente_pago`) y en `store_order_items` en las líneas 145-157. Después crea la preferencia de Mercado Pago y guarda `mp_preference_id` (línea 232).
- URLs públicas reales: https://reybaud-app.com/tienda y https://www.reybaud-app.com/tienda.

Tienda del alumno (dentro de la app):
- Catálogo: `src/components/TiendaSection.tsx` (y `HomeTrainingExtras.tsx`). No hay ruta de detalle ni carrito: la compra es de un solo producto.
- Checkout: `src/components/store/BuyProductDialog.tsx`. Primero revisa duplicados de las últimas 24 h (líneas 135-170). Después crea el pedido con la RPC `crear_pedido_tienda_alumno` (línea 172) y llama a `create-store-order-mp-preference` (línea 192), que pasa el estado a `pendiente_pago` (líneas 99-108 de esa función).
- Otro INSERT manual: `src/components/checkout/ManualPaymentConfirm.tsx:145`.

Cambios de estado y stock:
- Disparadores en `store_orders`: `trg_store_order_stock_egreso` (descuenta stock al insertar o cambiar `status`), `trg_store_orders_facturacion` y `trg_set_store_order_delivered_at`. **No existe un disparador que actualice `updated_at`.** Por eso `updated_at` = `created_at` en todos los pedidos, y ese dato no sirve para fechar cambios.
- Paso a «en camioneta»: `src/pages/deposito/DepositoCamioneta.tsx:1039`, dentro de `addSelected`. Se quita al sacar el ítem de la carga (líneas 1063-1070).

## 2. Por qué tocar la tarjeta no abre el detalle (app del alumno)

Evidencia en `TiendaSection.tsx`, líneas 59-66: si el producto se compra dentro de la app (`checkout_mode='in_app'`) o está en preventa, la tarjeta es un `div` sin acción. Solo el botón «Comprar» o «Reservar» hace algo (líneas 119 y 127). Los demás productos son un enlace a la tienda externa de Tiendanube (`STORE_URL`, línea 16). No existe una vista de detalle para el alumno. La tienda pública sí funciona bien, porque toda la tarjeta es un enlace.

## 3. Pedido #105 (Sergio G Brukman)

Evidencia:
- Se creó el 09/10 a las 02:40 UTC desde la tienda pública. Ese camino exige completar nombre, email, teléfono y forma de entrega, y enviar el formulario. Mirar la página no basta para crear un pedido.
- Tiene `mp_preference_id`, así que se generó el link de pago. No tiene `mp_payment_id`, `mp_status` ni `pagado_at`: el pago nunca se aprobó.
- Producto: 1 Jersey Negro Manga Larga Classique 2XL, entrega en clase KDT, $90.400.
- El 10/10 a las 16:34 UTC se agregó un ítem del pedido a una caja de camioneta `en_ruta` (abierta desde el 29/07). Ese paso pasó el pedido a `en_camioneta`.
- No hay registros en el historial de auditoría para este pedido.

Causa (confirmada en el código): en «Agregar a la carga», `loadCandidates` (líneas 932-938) lista **todos** los pedidos no entregados ni cancelados, incluidos los que no están pagados. Además, la línea 993 preselecciona los de la misma sede. Nada bloquea los pedidos con `pendiente_pago` o `pendiente_pago_efectivo`, y la pantalla no muestra el estado del pago.

Hipótesis (sin confirmar):
- No se sabe qué usuario de depósito hizo la carga: `vehiculo_carga_items` no guarda autor y no hay historial.
- Que el cliente haya abandonado el pago es probable, pero no está verificado.

## 4. Otros pedidos afectados

Pedidos sin `pagado_at` en estado logístico avanzado:
- **#102** (tienda pública, efectivo): en camioneta desde el 09/10 a las 13:49, por el mismo mecanismo.
- **#109** (manual, sin forma de pago): en camioneta, sin ítem de carga, así que el estado está desincronizado.
- Entregados sin pago: #19 (MP cancelado), #20, #83 y #93. Hay que confirmar con caja si se cobraron por otra vía.

Cualquier carga a la camioneta puede repetir el problema con pedidos sin pagar.

## 5. Correcciones propuestas (para aprobar después)

1. **Carga a la camioneta:** excluir los pedidos sin `pagado_at` de los candidatos, salvo efectivo contra entrega si así se decide. No preseleccionar pedidos sin pago y mostrar una etiqueta «Sin pago».
2. **Bloqueo en la base de datos:** un disparador que impida pasar a `en_camioneta`, `listo_retiro`, `enviado` o `entregado` sin `pagado_at`, con una excepción explícita y registrada para efectivo.
3. **Disparador de `updated_at`** en `store_orders` y autor (`cargado_por`) en `vehiculo_carga_items`, para que cada cambio quede registrado.
4. **App del alumno:** que toda la tarjeta (imagen y nombre) abra el mismo diálogo de compra, o una vista de detalle, sin crear ningún pedido hasta confirmar.
5. **Datos reales:** no tocar #105, #102 ni #109 sin tu decisión. Opción: sacarlos de la carga para que vuelvan a `preparando`, previa verificación física.
6. **Pruebas sin datos reales:** pruebas de la función de candidatos (excluye pedidos sin pago) y SQL reversible con BEGIN/ROLLBACK para el bloqueo de estados y para `updated_at`.

## Decisiones pendientes

- Si los pedidos en efectivo pueden viajar en la camioneta antes de cobrarse (cobro contra entrega).
- Qué hacer con #105, #102 y #109.
