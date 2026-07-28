ALTER TABLE public.gastos DROP CONSTRAINT IF EXISTS gastos_unidad_negocio_check;
ALTER TABLE public.gastos ADD CONSTRAINT gastos_unidad_negocio_check CHECK (unidad_negocio = ANY (ARRAY['escuela'::text,'tienda'::text,'viajes'::text,'compartido'::text,'personal'::text]));
ALTER TABLE public.gastos_recurrentes DROP CONSTRAINT IF EXISTS gastos_recurrentes_unidad_negocio_check;
ALTER TABLE public.gastos_recurrentes ADD CONSTRAINT gastos_recurrentes_unidad_negocio_check CHECK (unidad_negocio = ANY (ARRAY['escuela'::text,'tienda'::text,'viajes'::text,'compartido'::text,'personal'::text]));
ALTER TABLE public.gastos_ejecuciones DROP CONSTRAINT IF EXISTS gastos_ejecuciones_unidad_negocio_check;
ALTER TABLE public.gastos_ejecuciones ADD CONSTRAINT gastos_ejecuciones_unidad_negocio_check CHECK (unidad_negocio = ANY (ARRAY['escuela'::text,'tienda'::text,'viajes'::text,'compartido'::text,'personal'::text]));