ALTER VIEW public.vw_pagos_inconsistencias SET (security_invoker = on);
GRANT SELECT ON public.vw_pagos_inconsistencias TO authenticated;
GRANT SELECT ON public.vw_pagos_inconsistencias TO service_role;