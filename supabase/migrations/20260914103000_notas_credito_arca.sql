-- Notas de crédito ARCA vinculadas a facturas emitidas desde Reybaud.
-- Se almacenan separadas de facturas para no alterar la operación de cobros/facturación.

create table if not exists public.notas_credito (
  id uuid primary key default gen_random_uuid(),
  factura_origen_id uuid not null references public.facturas(id) on delete restrict,
  emisor_id uuid not null references public.emisores_fiscales(id) on delete restrict,
  alumno_id uuid null references public.alumnos(id) on delete set null,
  cliente_nombre text not null,
  cliente_cuit text null,
  condicion_fiscal text not null default 'consumidor_final',
  concepto text not null,
  monto numeric(14,2) not null check (monto > 0),
  moneda text not null default 'ARS',
  motivo text null,
  estado text not null default 'procesando',
  numero_comprobante text null,
  tipo_comprobante integer not null check (tipo_comprobante in (3, 8, 13)),
  letra_comprobante text not null check (letra_comprobante in ('A','B','C')),
  cae text null,
  cae_vencimiento date null,
  fecha_emision timestamptz null,
  error_detalle text null,
  idempotency_key uuid not null unique,
  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notas_credito_factura_origen_idx
  on public.notas_credito (factura_origen_id, created_at desc);
create index if not exists notas_credito_emisor_fecha_idx
  on public.notas_credito (emisor_id, fecha_emision desc)
  where estado = 'emitida';
create unique index if not exists notas_credito_identidad_fiscal_uidx
  on public.notas_credito (emisor_id, tipo_comprobante, numero_comprobante)
  where numero_comprobante is not null;

alter table public.notas_credito enable row level security;

drop policy if exists "Admins can read credit notes" on public.notas_credito;
create policy "Admins can read credit notes"
  on public.notas_credito
  for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

grant select on public.notas_credito to authenticated;
revoke insert, update, delete on public.notas_credito from authenticated;

-- Reserva atómica del monto a acreditar. Bloquea la factura mientras valida
-- para impedir que dos notas parciales concurrentes superen el total original.
create or replace function public.reserve_nota_credito(
  p_factura_id uuid,
  p_monto numeric,
  p_motivo text,
  p_idempotency_key uuid,
  p_usuario_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_factura public.facturas%rowtype;
  v_acreditado numeric(14,2);
  v_existing uuid;
  v_nota_id uuid;
  v_tipo_nc integer;
  v_letra text;
begin
  if p_idempotency_key is null then
    raise exception 'idempotency_key requerido';
  end if;

  select id into v_existing
  from public.notas_credito
  where idempotency_key = p_idempotency_key;

  if v_existing is not null then
    return v_existing;
  end if;

  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto de la nota de crédito debe ser mayor a cero';
  end if;

  select * into v_factura
  from public.facturas
  where id = p_factura_id
  for update;

  if not found then
    raise exception 'Factura no encontrada';
  end if;

  if v_factura.estado <> 'emitida' or v_factura.cae is null or v_factura.numero_comprobante is null then
    raise exception 'La factura debe estar emitida con CAE para generar una nota de crédito';
  end if;

  if v_factura.tipo_comprobante not in (1, 6, 11) then
    raise exception 'Tipo de factura no soportado para nota de crédito';
  end if;

  select coalesce(sum(monto), 0)
    into v_acreditado
  from public.notas_credito
  where factura_origen_id = p_factura_id
    and estado in ('procesando', 'emitida');

  if round(v_acreditado + p_monto, 2) > round(v_factura.monto, 2) then
    raise exception 'El monto supera el saldo disponible de la factura';
  end if;

  v_tipo_nc := case v_factura.tipo_comprobante when 1 then 3 when 6 then 8 when 11 then 13 end;
  v_letra := case v_factura.tipo_comprobante when 1 then 'A' when 6 then 'B' when 11 then 'C' end;

  insert into public.notas_credito (
    factura_origen_id,
    emisor_id,
    alumno_id,
    cliente_nombre,
    cliente_cuit,
    condicion_fiscal,
    concepto,
    monto,
    moneda,
    motivo,
    estado,
    tipo_comprobante,
    letra_comprobante,
    idempotency_key,
    created_by
  ) values (
    v_factura.id,
    v_factura.emisor_id,
    v_factura.alumno_id,
    v_factura.cliente_nombre,
    v_factura.cliente_cuit,
    v_factura.condicion_fiscal,
    'Nota de crédito · ' || v_factura.concepto,
    round(p_monto, 2),
    coalesce(v_factura.moneda, 'ARS'),
    nullif(trim(p_motivo), ''),
    'procesando',
    v_tipo_nc,
    v_letra,
    p_idempotency_key,
    p_usuario_id
  )
  returning id into v_nota_id;

  return v_nota_id;
end;
$$;

revoke all on function public.reserve_nota_credito(uuid,numeric,text,uuid,uuid) from public, authenticated;
grant execute on function public.reserve_nota_credito(uuid,numeric,text,uuid,uuid) to service_role;

-- El control fiscal descuenta las notas de crédito emitidas por Reybaud además
-- de las notas importadas desde el histórico ARCA.
create or replace view public.emisor_facturado_anual
with (security_invoker = true)
as
with current_limits as (
  select distinct on (categoria)
    categoria,
    vigencia_desde,
    ingresos_brutos_limite
  from public.monotributo_categoria_parametros
  where vigencia_desde <= current_date
  order by categoria, vigencia_desde desc
),
max_regimen as (
  select max(ingresos_brutos_limite) as limite_max_regimen
  from current_limits
),
app_facturas as (
  select
    e.id as emisor_id,
    coalesce(sum(
      case
        when f.cae is not null
          and f.estado = 'emitida'
          and f.fecha_emision is not null
          and f.fecha_emision >= (current_date - interval '12 months')
        then case when f.tipo_comprobante in (3, 8, 13) then -f.monto else f.monto end
        else 0::numeric
      end
    ), 0::numeric) as facturado_facturas_12m
  from public.emisores_fiscales e
  left join public.facturas f on f.emisor_id = e.id
  group by e.id
),
app_notas as (
  select
    e.id as emisor_id,
    coalesce(sum(
      case
        when nc.estado = 'emitida'
          and nc.cae is not null
          and nc.fecha_emision is not null
          and nc.fecha_emision >= (current_date - interval '12 months')
        then nc.monto
        else 0::numeric
      end
    ), 0::numeric) as notas_credito_12m
  from public.emisores_fiscales e
  left join public.notas_credito nc on nc.emisor_id = e.id
  group by e.id
),
historico as (
  select
    e.id as emisor_id,
    coalesce(sum(
      case
        when h.fecha_emision >= (current_date - interval '12 months')
        then case when h.clase = 'nota_credito' then -h.importe_total else h.importe_total end
        else 0::numeric
      end
    ), 0::numeric) as facturado_historico_12m
  from public.emisores_fiscales e
  left join public.fiscal_historical_documents h on h.emisor_id = e.id
  group by e.id
),
base as (
  select
    e.id as emisor_id,
    e.nombre_fiscal,
    e.cuit,
    e.categoria_monotributo,
    cl.vigencia_desde as limite_vigencia_desde,
    coalesce(cl.ingresos_brutos_limite, e.limite_anual_ars) as limite_anual_ars,
    coalesce(af.facturado_facturas_12m, 0::numeric) - coalesce(an.notas_credito_12m, 0::numeric) as facturado_app_12m,
    coalesce(an.notas_credito_12m, 0::numeric) as notas_credito_app_12m,
    coalesce(h.facturado_historico_12m, 0::numeric) as facturado_historico_12m,
    coalesce(af.facturado_facturas_12m, 0::numeric) - coalesce(an.notas_credito_12m, 0::numeric) + coalesce(h.facturado_historico_12m, 0::numeric) as facturado_anual,
    mr.limite_max_regimen
  from public.emisores_fiscales e
  left join current_limits cl on cl.categoria = e.categoria_monotributo
  left join app_facturas af on af.emisor_id = e.id
  left join app_notas an on an.emisor_id = e.id
  left join historico h on h.emisor_id = e.id
  cross join max_regimen mr
)
select
  b.*,
  case
    when b.limite_anual_ars is null or b.limite_anual_ars = 0 then null::numeric
    else round((b.facturado_anual / b.limite_anual_ars) * 100::numeric, 2)
  end as porcentaje_uso,
  case
    when b.limite_anual_ars is null or b.limite_anual_ars = 0 then null::numeric
    else greatest(b.limite_anual_ars - b.facturado_anual, 0::numeric)
  end as cupo_disponible,
  case
    when b.limite_anual_ars is null or b.limite_anual_ars = 0 then null::numeric
    else greatest(b.facturado_anual - b.limite_anual_ars, 0::numeric)
  end as exceso_categoria,
  coalesce(
    (
      select cl2.categoria
      from current_limits cl2
      where b.facturado_anual <= cl2.ingresos_brutos_limite
      order by cl2.ingresos_brutos_limite asc
      limit 1
    ),
    'FUERA_REGIMEN'
  ) as categoria_por_ingresos,
  greatest(coalesce(b.limite_max_regimen, 0::numeric) - b.facturado_anual, 0::numeric) as disponible_hasta_max_regimen
from base b;

grant select on public.emisor_facturado_anual to authenticated;
