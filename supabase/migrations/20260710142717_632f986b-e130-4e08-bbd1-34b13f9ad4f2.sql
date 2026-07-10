CREATE INDEX IF NOT EXISTS idx_facturas_estado_cae ON public.facturas (estado, cae);
CREATE INDEX IF NOT EXISTS idx_facturas_ref_emitida ON public.facturas (referencia_tipo, referencia_id) WHERE estado = 'emitida' AND cae IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_facturas_created_at ON public.facturas (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_facturacion_cola_estado_pagado ON public.facturacion_cola (estado, pagado_at DESC);