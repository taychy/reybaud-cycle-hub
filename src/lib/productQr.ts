// QR de producto. Soporta dos formatos:
//   1. Legacy: el QR contiene únicamente el UUID del producto (sin variante).
//   2. Extendido: JSON `{"p":"<uuid>","v":{"Talle":"M","Color":"Negro"}}`
// Decodifica ambos. Cuando no haya variante, el operador la elige a mano.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface DecodedProductQr {
  productId: string;
  variante: Record<string, string> | null;
}

export const encodeProductQr = (productId: string, variante?: Record<string, string> | null): string => {
  if (variante && Object.keys(variante).length > 0) {
    return JSON.stringify({ p: productId, v: variante });
  }
  return productId;
};

export const decodeProductQr = (raw: string): DecodedProductQr | null => {
  if (!raw) return null;
  const t = raw.trim();
  if (UUID_RE.test(t)) return { productId: t.toLowerCase(), variante: null };
  try {
    const obj = JSON.parse(t);
    if (obj && typeof obj.p === "string" && UUID_RE.test(obj.p)) {
      return {
        productId: obj.p.toLowerCase(),
        variante: obj.v && typeof obj.v === "object" ? obj.v : null,
      };
    }
  } catch {}
  return null;
};

export const variantesEquivalentes = (
  a?: Record<string, any> | null,
  b?: Record<string, any> | null,
): boolean => {
  if (!a && !b) return true;
  if (!a || !b) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => String(a[k]) === String(b[k]));
};

export const formatVariante = (v?: Record<string, any> | null): string => {
  if (!v || Object.keys(v).length === 0) return "—";
  return Object.entries(v).map(([k, val]) => `${k}: ${val}`).join(" · ");
};
