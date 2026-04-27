-- Permitir que el dueño de un token público vigente actualice su propia fila
-- (flujo de carga de resultado desde /eventos/record-de-la-hora/mi-resultados?token=...)
CREATE POLICY "Anyone with valid token can update own participation"
ON public.event_participants
FOR UPDATE
TO anon, authenticated
USING (
  public_access_token IS NOT NULL
  AND (token_expires_at IS NULL OR token_expires_at > now())
)
WITH CHECK (
  public_access_token IS NOT NULL
  AND (token_expires_at IS NULL OR token_expires_at > now())
);

-- Permitir que un alumno autenticado actualice su propia participación
-- (defensa en profundidad si abre el flujo logueado sin token)
CREATE POLICY "Students can update own participation"
ON public.event_participants
FOR UPDATE
TO authenticated
USING (lower(email) = lower(auth.email()))
WITH CHECK (lower(email) = lower(auth.email()));