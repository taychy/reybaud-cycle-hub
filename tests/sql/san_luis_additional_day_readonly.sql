-- Read-only regression: provisional extras must never be offered for purchase.
WITH expected(id, price, package_id) AS (
  VALUES
    ('a2a86448-789a-4f86-bf5b-c2b1e179c111'::uuid, 280000, 'a6a7db8f-7218-4b4c-94f2-cc2392cd76bc'::uuid),
    ('a2a86448-789a-4f86-bf5b-c2b1e179c112'::uuid, 315000, '0089ec6a-12ec-4939-aa74-d472fa27793f'::uuid),
    ('a2a86448-789a-4f86-bf5b-c2b1e179c113'::uuid, 220000, 'ba2a995b-d609-4f98-9538-84d6e72c607a'::uuid)
), actual AS (
  SELECT e.*, a.precio, a.currency, a.tipo, a.categoria, a.max_por_participante,
    a.aplica_a_paquetes, a.activo, a.event_id
  FROM expected e LEFT JOIN public.event_addons a ON a.id=e.id
)
SELECT 'three_records' AS rule, count(event_id)=3 AS passed FROM actual
UNION ALL SELECT 'double_280000', coalesce(bool_and(precio=280000),false) FROM actual WHERE price=280000
UNION ALL SELECT 'individual_315000', coalesce(bool_and(precio=315000),false) FROM actual WHERE price=315000
UNION ALL SELECT 'triple_220000', coalesce(bool_and(precio=220000),false) FROM actual WHERE price=220000
UNION ALL SELECT 'inactive', coalesce(bool_and(activo=false),false) FROM actual
UNION ALL SELECT 'one_per_participant', coalesce(bool_and(max_por_participante=1),false) FROM actual
UNION ALL SELECT 'exact_package_scope', coalesce(bool_and(aplica_a_paquetes=ARRAY[package_id]),false) FROM actual
UNION ALL SELECT 'optional_service_ars', coalesce(bool_and(tipo='opcional' AND categoria='servicio' AND currency='ARS'),false) FROM actual
UNION ALL SELECT 'san_luis_only', coalesce(bool_and(event_id='67b4e85d-b00b-4b74-9644-99458d948c65'::uuid),false) FROM actual
UNION ALL SELECT 'no_contracts', NOT EXISTS (
  SELECT 1 FROM public.reservation_addons r JOIN expected e ON e.id=r.addon_id
);