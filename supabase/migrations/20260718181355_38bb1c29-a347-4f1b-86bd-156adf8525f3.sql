
ALTER TABLE public.suscripciones DISABLE TRIGGER USER;
UPDATE public.suscripciones SET mp_payment_id=NULL
WHERE id IN (
  'adc0b07e-2a1e-42c2-811c-3a981a40192f',
  'b2b1f7e7-2663-498e-bb4a-ec3c06be7666',
  '0f609a0e-447e-47fa-b844-218561722a33',
  '40af12c6-b3c2-4cd0-8e9d-a8c711145e9b',
  'e071645e-44ac-4a06-8c5d-ea92c1e7f038',
  '8d4994bf-0501-49b2-be50-a9e4ee0adac9',
  '58f33c0d-8389-4555-b5e2-d634e2d78dfb'
);
ALTER TABLE public.suscripciones ENABLE TRIGGER USER;
