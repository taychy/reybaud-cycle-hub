-- A nota in 'enviando' is already reserved and must continue blocking that amount.
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
    and estado in ('procesando', 'enviando', 'emitida');

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
