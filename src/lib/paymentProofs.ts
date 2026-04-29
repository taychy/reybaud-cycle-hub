import { supabase } from "@/integrations/supabase/client";

/**
 * Genera una URL firmada temporal para visualizar un comprobante
 * almacenado en el bucket privado `payment-proofs`.
 *
 * El valor guardado en `reservation_payments.proof_url` es el path
 * (ej: "{alumno_id}/{reservation_id}/123.pdf"), no una URL.
 */
export const getPaymentProofSignedUrl = async (
  path: string | null | undefined,
  expiresInSeconds = 60 * 10,
): Promise<string | null> => {
  if (!path) return null;
  // Tolerar valores legacy que ya sean URL completa
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const { data, error } = await supabase.storage
    .from("payment-proofs")
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
};
