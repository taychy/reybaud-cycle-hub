alter table gastos
  add column if not exists unidad_negocio text not null default 'compartido'
  check (unidad_negocio in ('escuela', 'tienda', 'viajes', 'compartido'));

alter table gastos_recurrentes
  add column if not exists unidad_negocio text not null default 'compartido'
  check (unidad_negocio in ('escuela', 'tienda', 'viajes', 'compartido'));

alter table gastos_ejecuciones
  add column if not exists unidad_negocio text
  check (unidad_negocio in ('escuela', 'tienda', 'viajes', 'compartido'));

create or replace function fn_gastos_ejecuciones_inherit_unidad()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.unidad_negocio is null then
    select unidad_negocio into new.unidad_negocio
    from gastos_recurrentes
    where id = new.recurrente_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_gastos_ejecuciones_inherit_unidad on gastos_ejecuciones;
create trigger trg_gastos_ejecuciones_inherit_unidad
  before insert on gastos_ejecuciones
  for each row
  execute function fn_gastos_ejecuciones_inherit_unidad();

update gastos
  set unidad_negocio = 'escuela'
  where categoria = 'Honorarios' and unidad_negocio = 'compartido';

update gastos_recurrentes
  set unidad_negocio = 'escuela'
  where categoria = 'Honorarios' and unidad_negocio = 'compartido';

alter table gastos
  add column if not exists liquidacion_id uuid references liquidaciones_mensuales(id);

create unique index if not exists gastos_liquidacion_id_unique
  on gastos (liquidacion_id)
  where liquidacion_id is not null;

create or replace function pay_liquidacion_coach(
  p_liquidacion_id uuid,
  p_coach_id uuid,
  p_mes text,
  p_monto numeric,
  p_moneda text default 'ARS'
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coach_nombre text;
  v_existing uuid;
begin
  if p_monto is null or p_monto <= 0 then
    raise exception 'Monto inválido para liquidar: %', p_monto;
  end if;

  select id into v_existing from gastos where liquidacion_id = p_liquidacion_id;
  if v_existing is not null then
    raise exception 'Esta liquidación ya generó el gasto % — no se puede duplicar.', v_existing;
  end if;

  select nombre into v_coach_nombre from coaches where id = p_coach_id;

  update liquidaciones_mensuales
    set estado = 'pagada', fecha_pago = now()
    where id = p_liquidacion_id;

  insert into gastos (
    fecha, descripcion, categoria, subcategoria, proveedor,
    monto, moneda, forma_pago, origen_registro,
    unidad_negocio, liquidacion_id
  ) values (
    current_date,
    'Liquidación ' || coalesce(v_coach_nombre, p_coach_id::text) || ' - ' || p_mes,
    'Honorarios', 'Liquidación docente', v_coach_nombre,
    p_monto, p_moneda, 'transferencia', 'liquidacion_coach',
    'escuela', p_liquidacion_id
  );
end;
$$;

grant execute on function pay_liquidacion_coach(uuid, uuid, text, numeric, text) to authenticated;