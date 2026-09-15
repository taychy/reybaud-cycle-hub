-- Chequeo físico de camioneta: registrar la cantidad que el empleado ve
-- sin inferir automáticamente entregas, faltantes, devoluciones ni movimientos de stock.

alter table public.vehiculo_chequeo_scans
  add column if not exists cantidad_vista integer;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'vehiculo_chequeo_scans_cantidad_vista_nonnegative'
      and conrelid = 'public.vehiculo_chequeo_scans'::regclass
  ) then
    alter table public.vehiculo_chequeo_scans
      add constraint vehiculo_chequeo_scans_cantidad_vista_nonnegative
      check (cantidad_vista is null or cantidad_vista >= 0);
  end if;
end $$;

create or replace function public.close_vehiculo_chequeo_observacional(
  _chequeo_id uuid,
  _notas text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_carga_id uuid;
  v_total_lineas integer := 0;
  v_lineas_registradas integer := 0;
  v_esperado integer := 0;
  v_visto integer := 0;
  v_coinciden integer := 0;
  v_faltan integer := 0;
  v_sobran integer := 0;
  v_resumen jsonb;
begin
  select carga_id
    into v_carga_id
  from public.vehiculo_chequeos
  where id = _chequeo_id
    and estado = 'en_curso'
  for update;

  if v_carga_id is null then
    raise exception 'Chequeo no encontrado o ya cerrado';
  end if;

  select
    count(*)::integer,
    count(s.id)::integer,
    coalesce(sum(i.cantidad), 0)::integer,
    coalesce(sum(
      case
        when s.id is null then 0
        when s.cantidad_vista is null then i.cantidad
        else s.cantidad_vista
      end
    ), 0)::integer,
    count(*) filter (
      where s.id is not null
        and coalesce(s.cantidad_vista, i.cantidad) = i.cantidad
    )::integer,
    coalesce(sum(
      greatest(
        i.cantidad - case
          when s.id is null then 0
          when s.cantidad_vista is null then i.cantidad
          else s.cantidad_vista
        end,
        0
      )
    ), 0)::integer,
    coalesce(sum(
      greatest(
        case
          when s.id is null then 0
          when s.cantidad_vista is null then i.cantidad
          else s.cantidad_vista
        end - i.cantidad,
        0
      )
    ), 0)::integer
  into
    v_total_lineas,
    v_lineas_registradas,
    v_esperado,
    v_visto,
    v_coinciden,
    v_faltan,
    v_sobran
  from public.vehiculo_carga_items i
  left join public.vehiculo_chequeo_scans s
    on s.chequeo_id = _chequeo_id
   and s.item_id = i.id
  where i.carga_id = v_carga_id
    and i.estado = 'cargado';

  if v_lineas_registradas < v_total_lineas then
    raise exception 'Faltan registrar % línea(s) del chequeo', v_total_lineas - v_lineas_registradas;
  end if;

  v_resumen := jsonb_build_object(
    'lineas', v_total_lineas,
    'lineas_registradas', v_lineas_registradas,
    'esperado', v_esperado,
    'visto', v_visto,
    'coinciden', v_coinciden,
    'faltan_unidades', v_faltan,
    'sobran_unidades', v_sobran
  );

  update public.vehiculo_chequeos
  set estado = 'cerrado',
      closed_at = now(),
      notas = nullif(btrim(_notas), ''),
      resumen = v_resumen
  where id = _chequeo_id;

  return v_resumen;
end;
$$;

grant execute on function public.close_vehiculo_chequeo_observacional(uuid, text) to authenticated;
