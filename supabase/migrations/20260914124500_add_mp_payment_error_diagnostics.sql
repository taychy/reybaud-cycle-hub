alter table public.suscripciones
  add column if not exists mp_status_detail text,
  add column if not exists mp_error_code text,
  add column if not exists mp_error_message text;
