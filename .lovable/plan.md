# Auditoría (solo lectura): Tienda > Productos y stock > Promociones y campaña "Fin de invierno"

No se modificó código, base de datos ni configuración.

## 1) Qué es hoy la pestaña "Promociones"

Es **sólo navegación y curaduría visual. No existe ningún descuento real.**

- `StorePromotions.tsx` administra únicamente la tabla `store_quick_access` (nombre, ícono, `filter_tag`, orden, activo) y permite quitar productos de "Destacados" (`store_products.featured`).
- No toca precios, ni fechas de vigencia, ni stock, ni checkout.
- Peor aún: la tienda del alumno (`TiendaSection.tsx`) **no lee `store_quick_access`**; tiene una lista fija (Ofertas, Combos, Top ventas, Nuevos, Últimas) y al tocar "Ofertas" simplemente escribe la palabra "OFERTA" en el buscador, que filtra por **nombre de producto**. O sea, hoy los accesos rápidos que edita el admin no tienen efecto en la app.
- `store_banners` sí tiene `start_date` / `end_date`, pero el frontend filtra sólo por `active = true`: las fechas **no se respetan**.

## 2) Cómo se arma y muestra el precio hoy

- `store_products` tiene: `price`, `old_price`, `discount` (entero, sólo decorativo), `tag`, `currency`, `variants`, `variant_stock`, `stock`, y para combos `is_combo`, `combo_pricing_mode` (`sum` | `fixed`), `combo_price`, más `store_combo_items.precio_individual`.
- El "precio tachado" ya existe visualmente: la app y la tienda pública muestran `old_price` tachado + `price` grande + badge de `-{discount}%` y `tag` (OFERTA / NUEVO / OUTLET / ÚLTIMA UNIDAD).
- **Pero es 100% manual y sin vigencia**: el admin edita `price` y `old_price` a mano en `StoreProducts`. `discount` es un número suelto que no se calcula ni se valida contra `price`/`old_price`. Terminada la campaña hay que volver producto por producto a restaurar el precio.
- No hay campos de fecha de promo, ni histórico de precio de producto (`precio_historial` existe pero es de **planes**, no de tienda), ni promo por variante/talle.
- `descuento_pct`, `precio_oficial` y `promo_activa` existen en `store_products` pero pertenecen al flujo de **productos externos** (`scrape-external-product`), no a campañas.

## 3) Cómo cobra el checkout (riesgo clave)

- `BuyProductDialog` calcula `total = product.price * cantidad` en el cliente y lo inserta en `store_orders` / `store_order_items.unit_price`.
- `create-store-order-mp-preference` **no recalcula nada**: lee `total` y `unit_price` ya guardados en la orden y arma la preferencia de Mercado Pago con eso.
- `create-public-store-order` sí relee `store_products.price` en el servidor (y valida stock/variante), así que la tienda pública es más segura que la interna.

Consecuencia para una campaña: si el precio promocional se calcula en el frontend, el flujo interno cobraría lo que diga el cliente. **La promo tiene que resolverse del lado del servidor.**

## 4) Alcance mínimo y lógico para "Fin de invierno"

Modelo nuevo, aditivo, sin tocar lo existente:

```text
store_campaigns
  id, nombre, slug, descripcion
  fecha_inicio, fecha_fin (timestamptz)
  activa (bool)
  badge_texto ("FIN DE INVIERNO"), badge_color
  mostrar_urgencia (bool)  -- "termina en X días"

store_campaign_items
  id, campaign_id
  product_id
  variant_selection jsonb NULL   -- NULL = todo el producto; con valor = sólo ese talle/color
  tipo ('porcentaje' | 'precio_fijo')
  valor numeric
  activo
```

Regla de resolución (una sola función SQL, fuente de verdad):

```text
precio_efectivo(product_id, variante) =
  si hay item de campaña vigente (activa y now() entre fechas)
     → precio_fijo, o round(price * (1 - pct/100))
  si no → price
  devuelve además: precio_lista (= price), descuento_pct, campaign_id, badge
```

Qué se reutiliza:
- `old_price` / `discount` / `tag` como **salida visual**: la UI ya sabe pintar tachado + badge. No hay que rediseñar la card, sólo alimentarla con el precio efectivo (`precio_lista` tachado, `precio_efectivo` grande).
- `variant_stock` para limitar la promo a talles concretos y para mostrar "quedan 2".
- `store_banners` con `start_date`/`end_date` para el hero de campaña (arreglando el filtro por fecha).
- `store_quick_access` como filtro real "Fin de invierno" (una vez que `TiendaSection` lo lea de verdad).

Qué falta y hay que construir:
1. Las dos tablas + la función `precio_efectivo`.
2. Que **el servidor** use `precio_efectivo` al crear la orden: en `create-public-store-order` y en una RPC equivalente para el flujo interno de `BuyProductDialog`, en lugar de confiar en el total del cliente.
3. Snapshot en la orden: guardar en `store_order_items` el `precio_lista`, el `precio_cobrado` y el `campaign_id`. Así la facturación y los reportes muestran el descuento real y la campaña queda auditada aunque después se apague.
4. Combos: definir explícitamente que la campaña **no** se aplica dentro de un combo con `combo_pricing_mode = 'fixed'` (ya tiene precio cerrado); para `sum` se decide si se descuenta cada componente o el combo entero. Sin esa regla, un combo con componentes en promo puede terminar con doble descuento.
5. Cierre de campaña: al pasar `fecha_fin` el precio vuelve solo a `price`. Nada que restaurar a mano.

## 5) Riesgos

- **Doble descuento** combo + campaña (mitigado por la regla del punto 4).
- **Precio cobrado ≠ precio mostrado** si el flujo interno sigue calculando en el cliente: es el riesgo más caro y el que obliga a mover el cálculo al servidor.
- **Facturación**: la factura debe emitirse por el precio efectivamente cobrado; el snapshot en la orden lo garantiza.
- **Stock**: la promo no debe cambiar la lógica de descuento de stock; sólo el precio. Si se promociona por variante, validar que esa variante tenga stock antes de mostrar el badge.
- **Uso indebido de `old_price`**: si se sigue editando a mano en paralelo a las campañas, van a convivir dos verdades. Conviene que, con campaña vigente, la UI ignore `old_price` manual.
- Órdenes ya creadas antes del inicio de la campaña deben mantener su precio original (el snapshot lo resuelve).

## 6) UX simple para Admin

Reemplazar la pestaña "Promociones" (hoy casi vacía de valor) por **Campañas**:

1. **Lista de campañas** con estado (Programada / Activa / Finalizada), rango de fechas y cantidad de productos.
2. **Crear campaña** en un solo formulario: nombre, fechas, texto del badge, switch "mostrar urgencia".
3. **Seleccionar productos**: tabla con buscador y checkbox, filtro por categoría, y opción "sólo estos talles" por producto. Botón "aplicar el mismo % a todos los seleccionados" y posibilidad de sobrescribir uno puntual con precio fijo.
4. **Vista previa** al costado mostrando exactamente la card que verá el alumno (tachado + promo + badge).
5. **Un solo botón**: Activar / Pausar. Sin edición masiva de precios.

Los accesos rápidos actuales quedan como están, pero conectados de verdad al listado del alumno.

---

Nada de esto está implementado ni se implementará hasta que se apruebe.
