DROP POLICY IF EXISTS gasto_categorias_read ON public.gasto_categorias;
CREATE POLICY gasto_categorias_read ON public.gasto_categorias FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.is_super_admin(auth.uid()));
DROP POLICY IF EXISTS gasto_reglas_read ON public.gasto_reglas_categoria;
CREATE POLICY gasto_reglas_read ON public.gasto_reglas_categoria FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.is_super_admin(auth.uid()));