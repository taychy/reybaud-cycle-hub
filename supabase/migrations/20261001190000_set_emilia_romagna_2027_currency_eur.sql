-- Emilia Romagna 2027: align base event currency with packages and payment plans.
-- Scope: this event only. Prices, installments, packages and other fields are unchanged.

UPDATE public.events
SET currency = 'EUR'
WHERE id = '4c37ae21-fa91-415c-aede-4b0b5240b424'::uuid
  AND currency IS DISTINCT FROM 'EUR';
