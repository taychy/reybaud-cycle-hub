
-- Desactivar trigger de guard mientras hacemos el fix de auditoría
ALTER TABLE public.suscripciones DISABLE TRIGGER USER;

-- BANCHI
UPDATE public.suscripciones SET estado='cancelada', cancelada_at=NOW(),
  cancelada_motivo='Duplicado junio: pago MP 167330983579 corresponde a julio. Reasignado.',
  notas = COALESCE(notas,'') || E'\n[AUDIT 2026-07-18] Anulada por duplicado.'
WHERE id='adc0b07e-2a1e-42c2-811c-3a981a40192f';
UPDATE public.suscripciones SET mp_payment_id='167330983579', metodo_pago='mercadopago',
  fecha_inicio='2026-07-01', fecha_fin='2026-07-31', estado='activa',
  notas = COALESCE(NULLIF(notas,''),'') || E'\n[AUDIT 2026-07-18] Reasignado pago MP 167330983579.'
WHERE id='569e7d93-6a3f-429b-a5eb-395d7217ba2b';

-- BRISANOFF
UPDATE public.suscripciones SET estado='cancelada', cancelada_at=NOW(),
  cancelada_motivo='Duplicado junio: pago MP 166876750634 corresponde a julio. Reasignado.',
  notas = COALESCE(notas,'') || E'\n[AUDIT 2026-07-18] Anulada por duplicado.'
WHERE id='b2b1f7e7-2663-498e-bb4a-ec3c06be7666';
UPDATE public.suscripciones SET mp_payment_id='166876750634', metodo_pago='mercadopago',
  fecha_inicio='2026-07-01', fecha_fin='2026-07-31', estado='activa',
  notas = COALESCE(NULLIF(notas,''),'') || E'\n[AUDIT 2026-07-18] Reasignado pago MP 166876750634.'
WHERE id='fc1e3172-a9a5-436c-905d-6857530fefa4';

-- DONATO BERTOLDI
UPDATE public.suscripciones SET estado='cancelada', cancelada_at=NOW(),
  cancelada_motivo='Duplicado junio: pago MP 167416957872 corresponde a julio. Reasignado.',
  notas = COALESCE(notas,'') || E'\n[AUDIT 2026-07-18] Anulada por duplicado.'
WHERE id='0f609a0e-447e-47fa-b844-218561722a33';
UPDATE public.suscripciones SET mp_payment_id='167416957872', metodo_pago='mercadopago',
  fecha_inicio='2026-07-01', fecha_fin='2026-07-31', estado='activa',
  notas = COALESCE(NULLIF(notas,''),'') || E'\n[AUDIT 2026-07-18] Reasignado pago MP 167416957872.'
WHERE id='c5862d1c-d7da-446b-89bd-ef2322a002da';

-- EPP
UPDATE public.suscripciones SET estado='cancelada', cancelada_at=NOW(),
  cancelada_motivo='Duplicado junio: pago MP 167424181264 corresponde a julio. Reasignado.',
  notas = COALESCE(notas,'') || E'\n[AUDIT 2026-07-18] Anulada por duplicado.'
WHERE id='40af12c6-b3c2-4cd0-8e9d-a8c711145e9b';
UPDATE public.suscripciones SET mp_payment_id='167424181264', metodo_pago='mercadopago',
  fecha_inicio='2026-07-01', fecha_fin='2026-07-31', estado='activa',
  notas = COALESCE(NULLIF(notas,''),'') || E'\n[AUDIT 2026-07-18] Reasignado pago MP 167424181264.'
WHERE id='89eda2f9-d10d-4bc3-ac1f-254936494b97';

-- IGLESINI
UPDATE public.suscripciones SET estado='cancelada', cancelada_at=NOW(),
  cancelada_motivo='Duplicado junio: pago MP 168243251924 corresponde a julio. Reasignado.',
  notas = COALESCE(notas,'') || E'\n[AUDIT 2026-07-18] Anulada por duplicado.'
WHERE id='e071645e-44ac-4a06-8c5d-ea92c1e7f038';
UPDATE public.suscripciones SET mp_payment_id='168243251924', metodo_pago='mercadopago',
  fecha_inicio='2026-07-01', fecha_fin='2026-07-31', estado='activa',
  notas = COALESCE(NULLIF(notas,''),'') || E'\n[AUDIT 2026-07-18] Reasignado pago MP 168243251924.'
WHERE id='978901e0-5076-4c1a-b937-4ff0baef66c8';

-- LAYA
UPDATE public.suscripciones SET estado='cancelada', cancelada_at=NOW(),
  cancelada_motivo='Duplicado junio: pago MP 167482071676 corresponde a julio. Reasignado.',
  notas = COALESCE(notas,'') || E'\n[AUDIT 2026-07-18] Anulada por duplicado.'
WHERE id='8d4994bf-0501-49b2-be50-a9e4ee0adac9';
UPDATE public.suscripciones SET mp_payment_id='167482071676', metodo_pago='mercadopago',
  fecha_inicio='2026-07-01', fecha_fin='2026-07-31', estado='activa',
  notas = COALESCE(NULLIF(notas,''),'') || E'\n[AUDIT 2026-07-18] Reasignado pago MP 167482071676.'
WHERE id='7633ca82-fa7b-4d9f-848d-38e8c625b3d6';

-- SOKYRANSKY
UPDATE public.suscripciones SET estado='cancelada', cancelada_at=NOW(),
  cancelada_motivo='Duplicado junio: pago MP 166814995472 corresponde a julio (MP muestra un pago por mes). Reasignado.',
  notas = COALESCE(notas,'') || E'\n[AUDIT 2026-07-18] Anulada por duplicado.'
WHERE id='58f33c0d-8389-4555-b5e2-d634e2d78dfb';
UPDATE public.suscripciones SET mp_payment_id='166814995472', metodo_pago='mercadopago',
  fecha_inicio='2026-07-01', fecha_fin='2026-07-31', estado='activa',
  notas = COALESCE(NULLIF(notas,''),'') || E'\n[AUDIT 2026-07-18] Reasignado pago MP 166814995472.'
WHERE id='d8d46bb1-d339-4705-aae3-1a83b8e21a6b';

-- Reactivar triggers
ALTER TABLE public.suscripciones ENABLE TRIGGER USER;
