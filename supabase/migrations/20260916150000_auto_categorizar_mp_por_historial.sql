-- Autocategorización conservadora de egresos de Mercado Pago.
--
-- Objetivo:
--   * reutilizar una categorización humana previa para la misma contraparte MP;
--   * no usar IA / tokens;
--   * no tocar movimientos internos, devoluciones ni pagos a profesores;
--   * dejar pendientes los casos ambiguos o desconocidos.
--
-- La clave estable usada para aprender es raw.collector.id. Sólo se automatiza
-- cuando todas las categorizaciones históricas de esa contraparte coinciden en
-- categoría + subcategoría + unidad de negocio.

create or replace function public.autocategorizar_mp_por_historial_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_collector text;
  v_variantes integer := 0;
  v_template record;
begin
  -- Sólo egresos todavía no resueltos.
  if new.direccion is distinct from 'egreso' or new.gasto_id is not null then
    return new;
  end if;

  -- Devoluciones/reembolsos deben mantener su flujo específico.
  if exists (
    select 1
    from public.devoluciones d
    where d.mp_movement_id = new.id
  ) then
    return new;
  end if;

  if lower(coalesce(new.description, '')) ~ '(devoluc|refund|reembolso|chargeback|contracargo)' then
    return new;
  end if;

  v_collector := nullif(new.raw #>> '{collector,id}', '');
  if v_collector is null then
    return new;
  end if;

  -- Los pagos a profesores necesitan además el vínculo con coach; se conservan
  -- en el flujo especializado actual para no perder esa relación.
  if exists (
    select 1
    from public.coach_mp_contrapartes cp
    where cp.mp_collector_id = v_collector
  ) then
    return new;
  end if;

  -- Si la misma contraparte fue clasificada de más de una manera, no adivinamos.
  select count(*)
    into v_variantes
  from (
    select distinct
      g.categoria,
      coalesce(g.subcategoria, '') as subcategoria,
      coalesce(g.unidad_negocio, 'compartido') as unidad_negocio
    from public.mp_account_movements h
    join public.gastos g on g.id = h.gasto_id
    where h.id <> new.id
      and h.gasto_id is not null
      and h.direccion = 'egreso'
      and nullif(h.raw #>> '{collector,id}', '') = v_collector
      and coalesce(h.currency, 'ARS') = coalesce(new.currency, 'ARS')
  ) x;

  if v_variantes <> 1 then
    return new;
  end if;

  -- Reutilizamos los datos de la categorización humana más reciente.
  select
    g.categoria,
    g.subcategoria,
    g.descripcion,
    g.proveedor,
    coalesce(g.unidad_negocio, 'compartido') as unidad_negocio
  into v_template
  from public.mp_account_movements h
  join public.gastos g on g.id = h.gasto_id
  where h.id <> new.id
    and h.gasto_id is not null
    and h.direccion = 'egreso'
    and nullif(h.raw #>> '{collector,id}', '') = v_collector
    and coalesce(h.currency, 'ARS') = coalesce(new.currency, 'ARS')
  order by h.categorizado_at desc nulls last, h.fecha_movimiento desc
  limit 1;

  if v_template.categoria is null then
    return new;
  end if;

  perform public.mp_egreso_to_gasto(
    _movement_id => new.id,
    _categoria => v_template.categoria,
    _subcategoria => nullif(v_template.subcategoria, ''),
    _descripcion => coalesce(nullif(v_template.descripcion, ''), new.description, 'Egreso Mercado Pago'),
    _proveedor => nullif(v_template.proveedor, ''),
    _unidad_negocio => v_template.unidad_negocio,
    _notas => 'Autocategorizado por historial exacto de contraparte MP'
  );

  return new;
exception
  when others then
    -- La automatización nunca debe bloquear la importación de movimientos.
    raise warning 'No se pudo autocategorizar movimiento MP %: %', new.id, sqlerrm;
    return new;
end;
$$;

drop trigger if exists trg_autocategorizar_mp_por_historial on public.mp_account_movements;
create trigger trg_autocategorizar_mp_por_historial
after insert or update of direccion, gasto_id on public.mp_account_movements
for each row
when (new.direccion = 'egreso' and new.gasto_id is null)
execute function public.autocategorizar_mp_por_historial_trigger();

-- Procesa también el backlog actual. El UPDATE no cambia datos: sólo dispara el
-- trigger en pendientes existentes y cada caso sigue pasando por los filtros de
-- seguridad anteriores.
update public.mp_account_movements
set direccion = direccion
where direccion = 'egreso'
  and gasto_id is null;
