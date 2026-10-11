/** Lectura conservadora de etiquetas impresas durante el chequeo físico.
 * Identifica pedidos sólo por número o por al menos dos palabras del cliente.
 * La UI siempre solicita confirmación antes de registrar una etiqueta por OCR.
 */
type ItemEtiqueta = {
  id: string;
  cliente_nombre: string;
  producto: string | null;
  variante: string | null;
};
type OrdenEtiqueta = { order_number?: number | null };

const norm = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").trim();

const distanciaUno = (a: string, b: string): boolean => {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1 || Math.min(a.length, b.length) < 5) return false;
  let i = 0, j = 0, errores = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++errores > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else { i++; j++; }
  }
  return true;
};

const numerosDePedido = (raw: string): Set<number> => {
  const nums = new Set<number>();
  // En etiquetas de ecommerce suelen imprimir "#205" o "Pedido N° 205".
  const clean = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const rx = /(?:#\s*|\b(?:pedido|orden|order|nro|numero|num)\s*(?:n\s*[°ºo.]?\s*)?[:#-]?\s*)(\d{1,8})\b/gi;
  for (const m of clean.matchAll(rx)) nums.add(Number(m[1]));
  // Etiquetas antiguas: el número se imprime solo en la cabecera.
  for (const line of clean.split(/\r?\n/).slice(0, 3)) {
    const m = line.trim().match(/^#?\s*(\d{2,7})\s*$/);
    if (m) nums.add(Number(m[1]));
  }
  return nums;
};

export function buscarPorEtiquetaImpresa<T extends ItemEtiqueta>(
  raw: string,
  pendientes: T[],
  orderForItem: Record<string, string>,
  ordenes: Record<string, OrdenEtiqueta>,
): T[] {
  if (!raw.trim()) return [];
  const texto = norm(raw);
  const tokens = texto.split(" ").filter(Boolean);
  const numeros = numerosDePedido(raw);
  const porNumero = pendientes.filter((it) => {
    const n = ordenes[orderForItem[it.id]]?.order_number;
    return typeof n === "number" && numeros.has(n);
  });
  const porNombre = pendientes.filter((it) => {
    const palabras = norm(it.cliente_nombre).split(" ").filter((s) => s.length >= 3);
    if (palabras.length < 2) return false;
    const acertadas = palabras.filter((p) =>
      tokens.some((t) => t === p || distanciaUno(t, p)));
    return acertadas.length >= 2;
  });

  // Número y nombre contradictorios: no adivinar la identidad.
  if (porNumero.length && porNombre.length) {
    const ids = new Set(porNombre.map((x) => x.id));
    const comunes = porNumero.filter((it) => ids.has(it.id));
    if (!comunes.length) return [];
    return comunes;
  }
  const candidatos = porNumero.length ? porNumero : porNombre;
  if (candidatos.length < 2) return candidatos;
  // Desambiguar por descripción, pero nunca por una palabra genérica aislada.
  const porProducto = candidatos.filter((it) => {
    const palabras = norm([it.producto, it.variante].filter(Boolean).join(" ")).split(" ")
      .filter((s) => s.length >= 5);
    return palabras.some((p) => tokens.includes(p));
  });
  return porProducto.length ? porProducto : candidatos;
}
