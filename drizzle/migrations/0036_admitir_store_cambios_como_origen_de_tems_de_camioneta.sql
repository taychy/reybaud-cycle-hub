ALTER TABLE public.vehiculo_carga_items DROP CONSTRAINT IF EXISTS vehiculo_carga_items_source_table_check;
ALTER TABLE public.vehiculo_carga_items ADD CONSTRAINT vehiculo_carga_items_source_table_check
CHECK (source_table = ANY (ARRAY['delivery_list_items','store_order_items','store_preorders','pedidos_externos','store_cambios']));