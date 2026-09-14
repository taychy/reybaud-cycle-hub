-- The credit-note fiscal view adds a new output column. PostgreSQL cannot
-- reorder/add it in-place with CREATE OR REPLACE VIEW, so recreate safely.
drop view if exists public.emisor_facturado_anual;
