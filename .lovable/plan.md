# Auditoría Camioneta — mercadería marcada "en camioneta" que no aparece

Solo auditoría: no se modificó código, datos ni estados.

## 1. De dónde saca los datos la pantalla Camioneta

La vista Camioneta NO mira el estado del pedido. Lista únicamente las filas de la tabla de ítems de carga (`vehiculo_carga_items`) de la carga abierta, filtradas por carga. El estado "En camioneta" del pedido de tienda (`store_orders.status = 'en_camioneta'`) es un campo totalmente independiente que se puede poner a mano desde Depósito > Pedidos o Admin > Tienda > Pedidos.

Resultado: un pedido puede decir "En camioneta" y no existir para la pantalla Camioneta.

## 2. Casos concretos

| Cliente | Venta | Producto | Cant. | Estado del pedido | En alguna carga | Pagado |
|---|---|---|---|---|---|---|
| Maria Eugenia Louys | #81 (18/09) | Jersey Manga Corta Classique, Blanco XS | 1 | en camioneta | No | Sí (18/09) |
| Rodrigo Alonso | #82 (19/09) | Jersey Manga Corta Classique, Blanco L | 1 | en camioneta | No | No |

Ninguno de los dos tiene fila en los ítems de carga, por eso no se ven. Además hoy no se pueden agregar: las dos cargas vivas (KDT y Villa Nueva) están en estado "En ruta", y el botón de agregar ítems sólo aparece con la carga "Abierta".

(Rodrigo tiene además dos ítems viejos en la lista de entrega "Santini de invierno 26", ya marcados como preparados, sin relación con estas ventas.)

## 3. Inconsistencia global — pedidos "en camioneta" sin representación

6 de 6 pedidos marcados "en camioneta" no tienen ningún ítem cargado. Total de faltantes: **6**.

| Venta | Cliente | Producto | Fecha |
|---|---|---|---|
| #82 | Rodrigo Alonso | Jersey Manga Corta Classique L | 19/09 |
| #81 | Maria Eugenia Louys | Jersey Manga Corta Classique XS | 18/09 |
| #80 | Hernan Martinero Saez | Chaleco Rompeviento M | 16/09 |
| #78 | Victoria Davison | Chaleco Rompeviento Santini M | 11/09 |
| #75 | Victoria Davison | Chaleco Rompeviento Santini M | 09/09 |
| #48 | Accame Patricia | GU Energy Gel Lemon | 12/08 |

## 4. Caso inverso — visibles en Camioneta pero ya no corresponden

3 ítems figuran como "Cargado" en la caja KDT (carga en ruta desde julio) aunque sus ventas ya están **entregadas** desde el 18/08:

- Venta #55 — Gastón Fernández — Jersey Negro Manga Larga Classique
- Venta #56 — Gaston Fernandez — Campera Térmica y Chaleco Rompeviento Classique
- Venta #47 — Aldo Chaves — GU Energy Gel Triberry

También quedan 8 ítems de pedidos externos en estado "Faltante" arrastrados en esa misma carga.

## 5. Causa raíz

Dos fuentes de verdad desconectadas:

1. Marcar un pedido como "En camioneta" desde Pedidos cambia sólo el estado del pedido; no crea el ítem de carga. La incorporación real a la camioneta sólo ocurre al usar "Agregar ítems" dentro de una carga **abierta**.
2. Entregar un pedido desde Pedidos marca el pedido como entregado pero no actualiza el ítem de carga, que queda "Cargado" indefinidamente.
3. Las dos cajas activas (KDT y Villa Nueva) están "En ruta" desde julio/agosto, así que hoy no hay ninguna carga abierta donde sumar lo nuevo — la operación quedó bloqueada de hecho.

## 6. Corrección mínima recomendada (no implementada)

1. **Operativa inmediata:** abrir una carga nueva (o permitir agregar ítems también en cargas "En ruta") y cargar ahí los 6 pedidos pendientes. Sin esto, cualquier arreglo de UI no alcanza.
2. **Vista:** en Camioneta mostrar una alerta "Pedidos marcados en camioneta sin cargar (N)" con acción para incorporarlos a la caja elegida — usa datos ya disponibles, sin backend nuevo.
3. **Sincronía de estados:** al entregar o cancelar un pedido de tienda, marcar su ítem de carga como entregado/retornado; y al cargar un ítem, dejar que eso sea lo que marca el pedido "en camioneta" (ya lo hace hoy), desalentando el cambio manual de estado desde Pedidos.
4. **Limpieza puntual:** cerrar los 3 ítems de ventas ya entregadas y resolver los 8 externos "Faltante" de la caja KDT.

Confirmame cuál de estos pasos querés que implemente y en qué orden.
