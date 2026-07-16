ALTER TYPE public.process_entidad_control ADD VALUE IF NOT EXISTS 'cohort_task';
ALTER TYPE public.process_entidad_control ADD VALUE IF NOT EXISTS 'cohort_kpi';
ALTER TYPE public.process_accion_final ADD VALUE IF NOT EXISTS 'send_cohort_email';

DELETE FROM public.process_instance_stages WHERE instance_id = '538b788b-1a7c-4623-828d-9451a79b2677';
DELETE FROM public.process_instances WHERE id = '538b788b-1a7c-4623-828d-9451a79b2677';
DELETE FROM public.process_template_stages WHERE template_id = '87200c44-f532-4246-a52b-d550c054c167';
DELETE FROM public.process_templates WHERE id = '87200c44-f532-4246-a52b-d550c054c167';