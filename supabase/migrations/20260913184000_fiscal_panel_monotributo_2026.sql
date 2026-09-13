-- ARCA Monotributo thresholds effective from 2026-08-01 + consolidated fiscal view.
create table if not exists public.monotributo_categoria_parametros (
  categoria text not null check (categoria in ('A','B','C','D','E','F','G','H','I','J','K')),
  vigencia_desde date not null,
  ingresos_brutos_limite numeric(16,2) not null check (ingresos_brutos_limite > 0),
  fuente text,
  created_at timestamptz not null default now(),
  primary key (categoria,vigencia_desde)
);
alter table public.monotributo_categoria_parametros enable row level security;
drop policy if exists "Admins can read monotributo parameters" on public.monotributo_categoria_parametros;
create policy "Admins can read monotributo parameters" on public.monotributo_categoria_parametros for select to authenticated using (public.has_role(auth.uid(),'admin'));
revoke insert,update,delete on public.monotributo_categoria_parametros from authenticated;
grant select on public.monotributo_categoria_parametros to authenticated;
insert into public.monotributo_categoria_parametros(categoria,vigencia_desde,ingresos_brutos_limite,fuente) values
('A','2026-08-01',12009410.45,'ARCA'),('B','2026-08-01',17595182.74,'ARCA'),('C','2026-08-01',24670494.31,'ARCA'),('D','2026-08-01',30628651.43,'ARCA'),('E','2026-08-01',36028231.33,'ARCA'),('F','2026-08-01',45151659.41,'ARCA'),('G','2026-08-01',53995798.87,'ARCA'),('H','2026-08-01',81924660.37,'ARCA'),('I','2026-08-01',91699761.90,'ARCA'),('J','2026-08-01',105012519.20,'ARCA'),('K','2026-08-01',126610838.75,'ARCA')
on conflict(categoria,vigencia_desde) do update set ingresos_brutos_limite=excluded.ingresos_brutos_limite,fuente=excluded.fuente;

update public.emisores_fiscales
set categoria_monotributo='F'
where regexp_replace(cuit,'[^0-9]','','g')='23951153834';

with x as (
  select distinct on(categoria) categoria,ingresos_brutos_limite
  from public.monotributo_categoria_parametros
  where vigencia_desde<=current_date
  order by categoria,vigencia_desde desc
)
update public.emisores_fiscales e
set limite_anual_ars=x.ingresos_brutos_limite
from x
where e.categoria_monotributo=x.categoria
  and coalesce(e.condicion_iva,'') ilike '%monotribut%';

create or replace function public.sync_emisor_monotributo_limite()
returns trigger
language plpgsql
set search_path=public
as $$
declare v numeric(16,2);
begin
  if new.categoria_monotributo in ('A','B','C','D','E','F','G','H','I','J','K') then
    select ingresos_brutos_limite into v
    from public.monotributo_categoria_parametros
    where categoria=new.categoria_monotributo and vigencia_desde<=current_date
    order by vigencia_desde desc
    limit 1;
    if v is not null then new.limite_anual_ars:=v; end if;
  elsif new.categoria_monotributo='RI' then
    new.limite_anual_ars:=null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_emisor_monotributo_limite on public.emisores_fiscales;
create trigger trg_sync_emisor_monotributo_limite
before insert or update of categoria_monotributo on public.emisores_fiscales
for each row execute function public.sync_emisor_monotributo_limite();

create or replace view public.emisor_facturado_anual with(security_invoker=true) as
with limits as (
  select distinct on(categoria) categoria,vigencia_desde,ingresos_brutos_limite
  from public.monotributo_categoria_parametros
  where vigencia_desde<=current_date
  order by categoria,vigencia_desde desc
),
maxr as (
  select max(ingresos_brutos_limite) limite_max_regimen from limits
),
app as (
  select e.id emisor_id,
    coalesce(sum(case
      when f.cae is not null and f.estado='emitida' and f.fecha_emision is not null and f.fecha_emision>=current_date-interval '12 months'
      then case when f.tipo_comprobante in(3,8,13) then -f.monto else f.monto end
      else 0 end),0) facturado_app_12m
  from public.emisores_fiscales e
  left join public.facturas f on f.emisor_id=e.id
  group by e.id
),
hist as (
  select e.id emisor_id,
    coalesce(sum(case
      when h.fecha_emision>=current_date-interval '12 months'
      then case when h.clase='nota_credito' then -h.importe_total else h.importe_total end
      else 0 end),0) facturado_historico_12m
  from public.emisores_fiscales e
  left join public.fiscal_historical_documents h on h.emisor_id=e.id
  group by e.id
),
b as (
  select e.id emisor_id,e.nombre_fiscal,e.cuit,e.categoria_monotributo,
    l.vigencia_desde limite_vigencia_desde,
    coalesce(l.ingresos_brutos_limite,e.limite_anual_ars) limite_anual_ars,
    coalesce(a.facturado_app_12m,0) facturado_app_12m,
    coalesce(h.facturado_historico_12m,0) facturado_historico_12m,
    coalesce(a.facturado_app_12m,0)+coalesce(h.facturado_historico_12m,0) facturado_anual,
    m.limite_max_regimen
  from public.emisores_fiscales e
  left join limits l on l.categoria=e.categoria_monotributo
  left join app a on a.emisor_id=e.id
  left join hist h on h.emisor_id=e.id
  cross join maxr m
)
select
  b.emisor_id,
  b.nombre_fiscal,
  b.cuit,
  b.limite_anual_ars,
  b.facturado_anual,
  case when b.limite_anual_ars is null or b.limite_anual_ars=0 then null else round(b.facturado_anual/b.limite_anual_ars*100,2) end porcentaje_uso,
  case when b.limite_anual_ars is null or b.limite_anual_ars=0 then null else greatest(b.limite_anual_ars-b.facturado_anual,0) end cupo_disponible,
  b.categoria_monotributo,
  b.limite_vigencia_desde,
  b.limite_max_regimen,
  b.facturado_app_12m,
  b.facturado_historico_12m,
  case when b.limite_anual_ars is null or b.limite_anual_ars=0 then null else greatest(b.facturado_anual-b.limite_anual_ars,0) end exceso_categoria,
  coalesce((select l2.categoria from limits l2 where b.facturado_anual<=l2.ingresos_brutos_limite order by l2.ingresos_brutos_limite limit 1),'FUERA_REGIMEN') categoria_por_ingresos,
  greatest(coalesce(b.limite_max_regimen,0)-b.facturado_anual,0) disponible_hasta_max_regimen
from b;

grant select on public.emisor_facturado_anual to authenticated;
