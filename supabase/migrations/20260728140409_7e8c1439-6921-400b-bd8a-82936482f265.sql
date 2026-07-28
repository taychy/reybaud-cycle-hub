CREATE OR REPLACE FUNCTION public.marketing_contacts_normalize()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  digits text;
BEGIN
  NEW.email := lower(trim(NEW.email));
  IF NEW.telefono IS NOT NULL AND length(trim(NEW.telefono)) > 0 THEN
    digits := regexp_replace(NEW.telefono, '\D', '', 'g');
    IF left(digits, 2) = '00' THEN digits := substring(digits, 3); END IF;
    IF left(digits, 3) = '549' THEN digits := substring(digits, 4);
    ELSIF left(digits, 2) = '54' THEN digits := substring(digits, 3);
    END IF;
    WHILE left(digits, 1) = '0' LOOP digits := substring(digits, 2); END LOOP;
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

  -- Evitar violar el índice único parcial de teléfono: si ya existe otro
  -- contacto con el mismo teléfono normalizado, dejamos el campo en NULL
  -- (el teléfono textual se conserva) en vez de abortar la operación.
  IF NEW.telefono_normalizado IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.marketing_contacts mc
     WHERE mc.telefono_normalizado = NEW.telefono_normalizado
       AND mc.id <> NEW.id
  ) THEN
    NEW.telefono_normalizado := NULL;
  END IF;

  RETURN NEW;
END;
$function$;