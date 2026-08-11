CREATE TABLE IF NOT EXISTS public.qa_backfill_test_results (
  id bigserial PRIMARY KEY,
  run_at timestamptz NOT NULL DEFAULT now(),
  test integer NOT NULL,
  estado text NOT NULL,
  nombre text,
  detalle text
);
GRANT SELECT ON public.qa_backfill_test_results TO authenticated;
GRANT ALL ON public.qa_backfill_test_results TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.qa_backfill_test_results_id_seq TO service_role;
ALTER TABLE public.qa_backfill_test_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "qa results admin read" ON public.qa_backfill_test_results;
CREATE POLICY "qa results admin read" ON public.qa_backfill_test_results
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DELETE FROM public.qa_backfill_test_results;
INSERT INTO public.qa_backfill_test_results (test, estado, nombre, detalle)
SELECT test, estado, nombre, detalle FROM public.run_backfill_preview_tests();