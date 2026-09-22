-- Automatiza la conciliación de movimientos de Mercado Pago sin intervención manual.
-- Sync: cada 5 minutos.
-- Enriquecimiento de identidad: cada 30 minutos, desplazado para ejecutarse luego del sync.
-- El secreto se genera dentro de la base (no queda expuesto en el repositorio).

create extension if not exists pg_cron;
create extension if not exists pg_net;

create table if not exists public.automation_internal_secrets (
  name text primary key,
  secret text not null,
  created_at timestamptz not null default now(),
  rotated_at timestamptz
);

alter table public.automation_internal_secrets enable row level security;
revoke all on table public.automation_internal_secrets from anon, authenticated;

insert into public.automation_internal_secrets (name, secret)
values (
  'mp_reconciliation',
  replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
)
on conflict (name) do nothing;

do $$
declare
  v_secret text;
  v_sync_command text;
  v_enrich_command text;
begin
  select secret
    into v_secret
  from public.automation_internal_secrets
  where name = 'mp_reconciliation';

  if v_secret is null then
    raise exception 'mp_reconciliation automation secret missing';
  end if;

  -- Evitar jobs duplicados si la migración se reejecuta.
  perform cron.unschedule(jobid)
  from cron.job
  where jobname in ('mp-reconciliation-sync', 'mp-reconciliation-enrich');

  v_sync_command := format(
    $cmd$
      select net.http_post(
        url := 'https://tgqfakfloonbunwkdoug.supabase.co/functions/v1/sync-mp-account-movements',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-automation-key', %L
        ),
        body := '{"days":7}'::jsonb,
        timeout_milliseconds := 30000
      );
    $cmd$,
    v_secret
  );

  v_enrich_command := format(
    $cmd$
      select net.http_post(
        url := 'https://tgqfakfloonbunwkdoug.supabase.co/functions/v1/enrich-mp-settlement-report',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-automation-key', %L
        ),
        body := '{"days":30}'::jsonb,
        timeout_milliseconds := 60000
      );
    $cmd$,
    v_secret
  );

  perform cron.schedule(
    'mp-reconciliation-sync',
    '*/5 * * * *',
    v_sync_command
  );

  perform cron.schedule(
    'mp-reconciliation-enrich',
    '7,37 * * * *',
    v_enrich_command
  );

  -- Dispara un primer sync de 30 días para reprocesar el backlog existente.
  perform net.http_post(
    url := 'https://tgqfakfloonbunwkdoug.supabase.co/functions/v1/sync-mp-account-movements',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-automation-key', v_secret
    ),
    body := '{"days":30}'::jsonb,
    timeout_milliseconds := 30000
  );
end
$$;
