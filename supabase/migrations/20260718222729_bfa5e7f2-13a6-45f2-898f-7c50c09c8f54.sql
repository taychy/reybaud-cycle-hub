
ALTER TYPE marketing_contact_type ADD VALUE IF NOT EXISTS 'whatsapp_web';

ALTER TABLE public.marketing_contacts
  ADD COLUMN IF NOT EXISTS telefono_normalizado text,
  ADD COLUMN IF NOT EXISTS capturado_por_email text,
  ADD COLUMN IF NOT EXISTS capturado_por_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS marketing_contacts_telefono_normalizado_unique
  ON public.marketing_contacts (telefono_normalizado)
  WHERE telefono_normalizado IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_marketing_contacts_capturado_por
  ON public.marketing_contacts (capturado_por_email, created_at DESC);

-- Update normalize trigger to also populate telefono_normalizado (AR format 549 + area + number)
CREATE OR REPLACE FUNCTION public.marketing_contacts_normalize()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  digits text;
BEGIN
  NEW.email := lower(trim(NEW.email));
  IF NEW.telefono IS NOT NULL AND length(trim(NEW.telefono)) > 0 THEN
    digits := regexp_replace(NEW.telefono, '\D', '', 'g');
    -- strip 00 prefix
    IF left(digits, 2) = '00' THEN digits := substring(digits, 3); END IF;
    -- strip country code 549 or 54
    IF left(digits, 3) = '549' THEN digits := substring(digits, 4);
    ELSIF left(digits, 2) = '54' THEN digits := substring(digits, 3);
    END IF;
    -- strip leading zeros
    WHILE left(digits, 1) = '0' LOOP digits := substring(digits, 2); END LOOP;
    -- strip "15" between area and number if long
    IF length(digits) > 10 THEN
      FOR i IN 2..4 LOOP
        IF length(digits) - i >= 8 AND substring(digits, i+1, 2) = '15' THEN
          IF length(substring(digits, 1, i) || substring(digits, i+3)) = 10 THEN
            digits := substring(digits, 1, i) || substring(digits, i+3);
            EXIT;
          END IF;
        END IF;
      END LOOP;
    END IF;
    IF length(digits) BETWEEN 10 AND 11 THEN
      NEW.telefono_normalizado := '549' || right(digits, 10);
    ELSE
      NEW.telefono_normalizado := NULL;
    END IF;
  ELSE
    NEW.telefono_normalizado := NULL;
  END IF;
  RETURN NEW;
END;
$$;
