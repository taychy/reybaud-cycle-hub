# Descuentos de campaña según forma de pago (Tienda)

Auditoría hecha sobre el estado actual. No se modificó nada.

## a) Hallazgos y riesgos

**Cómo funciona hoy**
- Tablas: `store_campaigns` (nombre, slug, fechas, activa, badge, urgencia) y `store_campaign_items` (producto, `variant_keys` opcional, tipo `porcentaje|precio_fijo`, valor, activo). El alcance ya es explícito por producto/variante: no hay alcance global.
- Fuente de verdad de precio: función SQL `resolver_precio_tienda(product_id, variante)` (SECURITY DEFINER) y el listado `get_promos_tienda_vigentes()` para grillas. Ambas eligen una sola campaña ganadora: menor precio resultante, desempate por `fecha_inicio` más reciente y luego menor `id`. No apilan.
- El espejo en cliente es `src/lib/campaigns.ts` (solo para mostrar) con tests en `src/lib/campaigns.test.ts`.
- Creación de pedidos: `crear_pedido_tienda_alumno` (interno/alumno) y la función de servidor `create-public-store-order` (link público) llaman al resolver y guardan snapshot en `store_order_items` (`precio_lista`, `precio_cobrado`, `campaign_id`, `campaign_nombre`, `discount_pct`). Nunca se toca `store_products.price`.
- Forma de pago: hoy ya existe Mercado Pago y Efectivo tanto en el checkout público como en el interno, pero la forma de pago **no** influye en el precio.
- Datos actuales: 1 campaña activa ("ÚLTIMO STOCK SANTINI - INVIERNO OFF") con 2 productos.

**Riesgos detectados**
1. El resolver se llama hoy sin conocer la forma de pago; si se agrega el filtro sin valor por defecto seguro, la campaña activa dejaría de aplicar. Debe defaultear a "ambas".
2. El checkout público elige la forma de pago al final: si el precio no se recalcula al cambiarla, lo mostrado no coincide con lo cobrado. Hay que recalcular en el mismo evento del cambio.
3. Monedas: los productos pueden estar en USD/EUR y hoy Mercado Pago convierte a ARS con un tipo de cambio de configuración, mientras el pedido en efectivo se guarda igual convertido a ARS. Es una inconsistencia previa, ajena a este pedido; recomendación mínima: no tocarla ahora y solo aplicar el descuento sobre el precio de lista en la moneda del producto, antes de la conversión (que es como ya funciona).
4. Riesgo de doble verdad: `src/lib/campaigns.ts` replica la lógica SQL. Si se agrega la condición de forma de pago hay que hacerlo en ambos lados, con tests que lo cubran.
5. Combos y precio por variante ya tienen comportamiento definido; no se toca.

## b) Diseño mínimo recomendado

Un solo campo nuevo en la campaña:

`store_campaigns.medios_pago text[] NOT NULL DEFAULT '{mp,efectivo}'` con validación de valores permitidos.

- Default seguro: toda campaña existente y nueva aplica a ambos medios (compatibilidad total).
- El resolver recibe un parámetro opcional nuevo `p_metodo text DEFAULT NULL`. Si viene `NULL`, se comporta exactamente como hoy (no filtra) y sirve para las vistrinas donde todavía no se eligió medio de pago; en ese caso se informa además a qué medios aplica la promo para poder aclararlo en pantalla.
- El precio que se cobra se resuelve siempre en el backend pasando el medio de pago real del pedido.
- Si una campaña no aplica al medio elegido, el producto se sigue vendiendo con ese medio, a precio de lista.

## c) Archivos y migraciones a tocar

**Migración nueva (aditiva)**
- `ALTER TABLE store_campaigns ADD COLUMN medios_pago ...` con default y check.
- `CREATE OR REPLACE FUNCTION resolver_precio_tienda(uuid, jsonb, text DEFAULT NULL)` con el filtro por medio y dos columnas de salida nuevas (`aplica_mp`, `aplica_efectivo`). Se conserva la firma anterior creando la nueva con parámetro por defecto para no romper llamadas existentes.
- `CREATE OR REPLACE FUNCTION get_promos_tienda_vigentes()` agregando las mismas dos columnas informativas.
- `crear_pedido_tienda_alumno`: pasar `p_metodo` al resolver.
- No se tocan migraciones previas ni datos históricos.

**Código**
- `src/lib/campaigns.ts` y su test: campo `medios_pago`, filtro por medio en `resolveEffectivePrice`.
- `src/pages/admin/store/StoreCampaigns.tsx`: selector "¿En qué formas de pago aplica?" (Mercado Pago / Efectivo / ambas) en el formulario de campaña, y muestra en el listado.
- `src/pages/admin/store/StoreProducts.tsx`: por producto, mostrar precio de lista, precio con campaña, % y nombre de campaña, y los medios en que aplica; si es solo en algunas variantes, se indica "Promo en talles seleccionados" sin mostrar un precio global falso.
- `src/components/store/PublicCheckoutDialog.tsx` y `src/pages/PublicProduct.tsx`: recálculo del precio al cambiar la forma de pago y aviso "este descuento aplica pagando con X".
- `supabase/functions/create-public-store-order/index.ts`: pasar el medio de pago al resolver antes de crear el pedido y el snapshot.
- `src/components/store/BuyProductDialog.tsx` (compra interna del alumno): mismo recálculo.
- No se toca `PublicStore.tsx`/`TiendaSection.tsx` salvo un texto aclaratorio si la promo es exclusiva de un medio.

## d) Compatibilidad y pruebas

- Default `{mp,efectivo}`: la campaña activa hoy sigue comportándose igual.
- Llamadas actuales al resolver sin el parámetro nuevo siguen funcionando (parámetro con default).
- Pedidos existentes no se tocan: los snapshots ya guardados quedan intactos.
- Efectivo sigue habilitado para todos los productos activos; Mercado Pago no se modifica.
- Tests a agregar en `src/lib/campaigns.test.ts`: campaña solo efectivo consultada como MP devuelve precio de lista; campaña solo MP con efectivo devuelve precio de lista; campaña sin campo (default ambos) mantiene el comportamiento actual; sin medio indicado no filtra; no apila descuentos y conserva la prioridad de menor precio.
- Verificación adicional: prueba en navegador del checkout público alternando forma de pago y comparación del total mostrado contra el pedido creado, más typecheck, suite completa y build. Sin publicar.
