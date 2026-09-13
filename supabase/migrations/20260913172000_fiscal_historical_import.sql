-- Fiscal historical import registry.
-- Imported ARCA comprobantes live separately from operational facturas.
-- All writes go through import_fiscal_history(), which re-checks duplicates server-side.

create table if not exists public.fiscal_import_batches (
  id uuid primary key default gen_random_uuid(),
  emisor_id uuid not null references public.emisores_fiscales(id) on delete restrict,
  source_filename text not null,
  source_cuit text not null,
  source_total_documents integer not null default 0,
  imported_documents integer not null default 0,
  skipped_app_documents integer not null default 0,
  skipped_historical_documents integer not null default 0,
  source_facturas_total numeric(16,2) not null default 0,
  source_notas_credito_total numeric(16,2) not null default 0,
  source_neto_fiscal numeric(16,2) not null default 0,
  imported_facturas_total numeric(16,2) not null default 0,
  imported_notas_credito_total numeric(16,2) not null default 0,
  imported_neto_fiscal numeric(16,2) not null default 0,
  created_by uuid null,
  created_at timestamptz not null default now()
);

create table if not exists public.fiscal_historical_documents (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid not null references public.fiscal_import_batches(id) on delete restrict,
  emisor_id uuid not null references public.emisores_fiscales(id) on delete restrict,
  source_row_number integer null,
  fecha_emision date not null,
  tipo_comprobante smallint not null check (tipo_comprobante in (1, 3, 6, 8, 11, 13)),
  clase text not null check (clase in ('factura', 'nota_credito')),
  letra char(1) not null check (letra in ('A', 'B', 'C')),
  punto_venta integer not null check (punto_venta > 0),
  numero_comprobante bigint not null check (numero_comprobante > 0),
  cae text null,
  cliente_doc_tipo text null,
  cliente_doc_nro text null,
  cliente_nombre text null,
  moneda text not null default '$',
  importe_total numeric(16,2) not null check (importe_total >= 0),
  origen text not null default 'historico_arca' check (origen = 'historico_arca'),
  created_at timestamptz not null default now(),
  unique (emisor_id, tipo_comprobante, punto_venta, numero_comprobante)
);

create index if not exists fiscal_historical_documents_emisor_fecha_idx
  on public.fiscal_historical_documents (emisor_id, fecha_emision);

create index if not exists fiscal_historical_documents_batch_idx
  on public.fiscal_historical_documents (import_batch_id);

alter table public.fiscal_import_batches enable row level security;
alter table public.fiscal_historical_documents enable row level security;

-- Historical fiscal data is admin-only. Client-side writes remain disabled;
-- imports are performed atomically by the RPC below.
drop policy if exists "Admins can read fiscal import batches" on public.fiscal_import_batches;
create policy "Admins can read fiscal import batches"
  on public.fiscal_import_batches
  for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "Admins can read fiscal historical documents" on public.fiscal_historical_documents;
create policy "Admins can read fiscal historical documents"
  on public.fiscal_historical_documents
  for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

revoke insert, update, delete on public.fiscal_import_batches from authenticated;
revoke insert, update, delete on public.fiscal_historical_documents from authenticated;
grant select on public.fiscal_import_batches to authenticated;
grant select on public.fiscal_historical_documents to authenticated;

create or replace function public.import_fiscal_history(
  p_emisor_id uuid,
  p_source_filename text,
  p_source_cuit text,
  p_documents jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch_id uuid;
  v_emisor_cuit text;
  v_doc jsonb;
  v_tipo integer;
  v_punto integer;
  v_numero bigint;
  v_importe numeric(16,2);
  v_fecha date;
  v_clase text;
  v_letra char(1);
  v_numero_formateado text;
  v_existing_amount numeric(16,2);
  v_source_count integer := 0;
  v_imported_count integer := 0;
  v_skipped_app integer := 0;
  v_skipped_historical integer := 0;
  v_source_facturas numeric(16,2) := 0;
  v_source_nc numeric(16,2) := 0;
  v_imported_facturas numeric(16,2) := 0;
  v_imported_nc numeric(16,2) := 0;
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'admin') then
    raise exception 'Forbidden: admin role required';
  end if;

  if jsonb_typeof(p_documents) is distinct from 'array' then
    raise exception 'p_documents debe ser un array JSON';
  end if;

  select regexp_replace(cuit, '[^0-9]', '', 'g')
    into v_emisor_cuit
  from public.emisores_fiscales
  where id = p_emisor_id;

  if v_emisor_cuit is null then
    raise exception 'Emisor fiscal no encontrado';
  end if;

  if regexp_replace(coalesce(p_source_cuit, ''), '[^0-9]', '', 'g') <> v_emisor_cuit then
    raise exception 'El CUIT del archivo no coincide con el emisor fiscal seleccionado';
  end if;

  insert into public.fiscal_import_batches (
    emisor_id,
    source_filename,
    source_cuit,
    created_by
  ) values (
    p_emisor_id,
    coalesce(nullif(trim(p_source_filename), ''), 'ARCA - Mis Comprobantes Emitidos.xlsx'),
    v_emisor_cuit,
    auth.uid()
  ) returning id into v_batch_id;

  for v_doc in select value from jsonb_array_elements(p_documents)
  loop
    v_source_count := v_source_count + 1;

    v_tipo := (v_doc->>'tipoComprobante')::integer;
    v_punto := (v_doc->>'puntoVenta')::integer;
    v_numero := (v_doc->>'numeroComprobante')::bigint;
    v_importe := round((v_doc->>'importeTotal')::numeric, 2);
    v_fecha := (v_doc->>'fechaEmision')::date;

    if v_tipo not in (1, 3, 6, 8, 11, 13) then
      raise exception 'Tipo de comprobante no soportado en fila %', coalesce(v_doc->>'rowNumber', '?');
    end if;
    if v_punto <= 0 or v_numero <= 0 or v_importe < 0 then
      raise exception 'Comprobante inválido en fila %', coalesce(v_doc->>'rowNumber', '?');
    end if;

    v_clase := case when v_tipo in (1, 6, 11) then 'factura' else 'nota_credito' end;
    v_letra := case when v_tipo in (1, 3) then 'A' when v_tipo in (6, 8) then 'B' else 'C' end;
    v_numero_formateado := lpad(v_punto::text, 5, '0') || '-' || lpad(v_numero::text, 8, '0');

    if v_clase = 'factura' then
      v_source_facturas := v_source_facturas + v_importe;
    else
      v_source_nc := v_source_nc + v_importe;
    end if;

    -- Re-check operational invoices immediately before inserting history.
    select round(monto::numeric, 2)
      into v_existing_amount
    from public.facturas
    where emisor_id = p_emisor_id
      and tipo_comprobante = v_tipo
      and numero_comprobante = v_numero_formateado
      and estado = 'emitida'
      and cae is not null
    limit 1;

    if found then
      if abs(v_existing_amount - v_importe) > 0.01 then
        raise exception 'Conflicto: % existe en Reybaud por %, pero ARCA informa %',
          v_numero_formateado, v_existing_amount, v_importe;
      end if;
      v_skipped_app := v_skipped_app + 1;
      continue;
    end if;

    -- Re-check previously imported history as a second idempotency barrier.
    select importe_total
      into v_existing_amount
    from public.fiscal_historical_documents
    where emisor_id = p_emisor_id
      and tipo_comprobante = v_tipo
      and punto_venta = v_punto
      and numero_comprobante = v_numero
    limit 1;

    if found then
      if abs(v_existing_amount - v_importe) > 0.01 then
        raise exception 'Conflicto histórico: % ya fue importado por %, pero ARCA informa %',
          v_numero_formateado, v_existing_amount, v_importe;
      end if;
      v_skipped_historical := v_skipped_historical + 1;
      continue;
    end if;

    insert into public.fiscal_historical_documents (
      import_batch_id,
      emisor_id,
      source_row_number,
      fecha_emision,
      tipo_comprobante,
      clase,
      letra,
      punto_venta,
      numero_comprobante,
      cae,
      cliente_doc_tipo,
      cliente_doc_nro,
      cliente_nombre,
      moneda,
      importe_total
    ) values (
      v_batch_id,
      p_emisor_id,
      nullif(v_doc->>'rowNumber', '')::integer,
      v_fecha,
      v_tipo,
      v_clase,
      v_letra,
      v_punto,
      v_numero,
      nullif(v_doc->>'cae', ''),
      nullif(v_doc->>'clienteDocTipo', ''),
      nullif(v_doc->>'clienteDocNro', ''),
      nullif(v_doc->>'clienteNombre', ''),
      coalesce(nullif(v_doc->>'moneda', ''), '$'),
      v_importe
    );

    v_imported_count := v_imported_count + 1;
    if v_clase = 'factura' then
      v_imported_facturas := v_imported_facturas + v_importe;
    else
      v_imported_nc := v_imported_nc + v_importe;
    end if;
  end loop;

  update public.fiscal_import_batches
  set
    source_total_documents = v_source_count,
    imported_documents = v_imported_count,
    skipped_app_documents = v_skipped_app,
    skipped_historical_documents = v_skipped_historical,
    source_facturas_total = v_source_facturas,
    source_notas_credito_total = v_source_nc,
    source_neto_fiscal = v_source_facturas - v_source_nc,
    imported_facturas_total = v_imported_facturas,
    imported_notas_credito_total = v_imported_nc,
    imported_neto_fiscal = v_imported_facturas - v_imported_nc
  where id = v_batch_id;

  return jsonb_build_object(
    'batch_id', v_batch_id,
    'source_total_documents', v_source_count,
    'imported_documents', v_imported_count,
    'skipped_app_documents', v_skipped_app,
    'skipped_historical_documents', v_skipped_historical,
    'source_neto_fiscal', v_source_facturas - v_source_nc,
    'imported_neto_fiscal', v_imported_facturas - v_imported_nc
  );
end;
$$;

revoke all on function public.import_fiscal_history(uuid, text, text, jsonb) from public;
grant execute on function public.import_fiscal_history(uuid, text, text, jsonb) to authenticated;
