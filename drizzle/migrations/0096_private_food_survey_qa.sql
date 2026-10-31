CREATE TABLE public.trip_food_survey_qa (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid NOT NULL REFERENCES public.events(id), owner_id uuid NOT NULL, case_key text NOT NULL CHECK(case_key IN ('con_pension','sin_pension')), active boolean NOT NULL DEFAULT true, response jsonb, updated_at timestamptz, UNIQUE(event_id,owner_id,case_key)
);
GRANT SELECT ON public.trip_food_survey_qa TO authenticated;
GRANT ALL ON public.trip_food_survey_qa TO service_role;
ALTER TABLE public.trip_food_survey_qa ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_private_qa ON public.trip_food_survey_qa FOR SELECT TO authenticated USING(owner_id=auth.uid() AND active AND public.has_role(auth.uid(),'admin'::public.app_role));
CREATE OR REPLACE FUNCTION public.save_trip_food_survey_qa(p_id uuid,p_data jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE q public.trip_food_survey_qa; d jsonb; t text;
BEGIN
 SELECT * INTO q FROM public.trip_food_survey_qa WHERE id=p_id AND owner_id=auth.uid() AND active AND public.has_role(auth.uid(),'admin'::public.app_role) FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Prueba no disponible para esta cuenta'; END IF;
 IF jsonb_typeof(p_data) IS DISTINCT FROM 'object' OR octet_length(p_data::text)>8000 THEN RAISE EXCEPTION 'Respuesta inválida'; END IF;
 t:=p_data->>'tipo_alimentacion';
 IF t IS NULL OR t NOT IN ('normal','vegetariana','vegana','otra') THEN RAISE EXCEPTION 'Elegí un tipo de alimentación'; END IF;
 IF t='otra' AND length(trim(coalesce(p_data->>'tipo_otra_detalle','')))=0 THEN RAISE EXCEPTION 'Detallá la alimentación'; END IF;
 IF jsonb_typeof(p_data->'tiene_alergias') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Indicá alergias'; END IF;
 IF p_data->>'tiene_alergias'='true' AND (length(trim(coalesce(p_data->>'alergias_detalle','')))=0 OR jsonb_typeof(p_data->'contaminacion_cruzada') IS DISTINCT FROM 'boolean') THEN RAISE EXCEPTION 'Detallá alergias y contaminación cruzada'; END IF;
 IF coalesce(p_data->'comidas_solicitadas','[]'::jsonb)<>'[]'::jsonb THEN RAISE EXCEPTION 'Programa a configurar: no se admiten solicitudes de comidas en esta prueba'; END IF;
 d:=jsonb_build_object('tipo_alimentacion',t,'tipo_otra_detalle',CASE WHEN t='otra' THEN left(trim(p_data->>'tipo_otra_detalle'),200) END,'tiene_alergias',(p_data->>'tiene_alergias')::boolean,'alergias_detalle',CASE WHEN p_data->>'tiene_alergias'='true' THEN left(trim(p_data->>'alergias_detalle'),500) END,'contaminacion_cruzada',CASE WHEN p_data->>'tiene_alergias'='true' THEN (p_data->>'contaminacion_cruzada')::boolean END,'contaminacion_detalle',CASE WHEN p_data->>'tiene_alergias'='true' AND p_data->>'contaminacion_cruzada'='true' THEN left(trim(p_data->>'contaminacion_detalle'),300) END,'observaciones',left(trim(p_data->>'observaciones'),1000),'pension_incluida',q.case_key='con_pension','desayuno_incluido',true,'pension_interes',false,'comidas_solicitadas','[]'::jsonb,'actualizado_at',now(),'qa',true);
 UPDATE public.trip_food_survey_qa SET response=d,updated_at=now() WHERE id=q.id;
 RETURN d;
END $$;
REVOKE ALL ON FUNCTION public.save_trip_food_survey_qa(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_trip_food_survey_qa(uuid,jsonb) TO authenticated;
COMMENT ON TABLE public.trip_food_survey_qa IS 'Private, revocable, owner-scoped QA only; no reservation/payment/addon/checklist writes. active=false revokes access. No meal program is simulated.';