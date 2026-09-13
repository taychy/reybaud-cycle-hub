// Topes de ingresos brutos del Monotributo publicados por ARCA.
// Valores de aplicación desde el 01/08/2026.
export interface MonotributoCategoria {
  id: string;
  label: string;
  tope_anual_ars: number;
}

export const MONOTRIBUTO_CATEGORIAS: MonotributoCategoria[] = [
  { id: "A", label: "Cat. A", tope_anual_ars: 12_009_410.45 },
  { id: "B", label: "Cat. B", tope_anual_ars: 17_595_182.74 },
  { id: "C", label: "Cat. C", tope_anual_ars: 24_670_494.31 },
  { id: "D", label: "Cat. D", tope_anual_ars: 30_628_651.43 },
  { id: "E", label: "Cat. E", tope_anual_ars: 36_028_231.33 },
  { id: "F", label: "Cat. F", tope_anual_ars: 45_151_659.41 },
  { id: "G", label: "Cat. G", tope_anual_ars: 53_995_798.87 },
  { id: "H", label: "Cat. H", tope_anual_ars: 81_924_660.37 },
  { id: "I", label: "Cat. I", tope_anual_ars: 91_699_761.90 },
  { id: "J", label: "Cat. J", tope_anual_ars: 105_012_519.20 },
  { id: "K", label: "Cat. K", tope_anual_ars: 126_610_838.75 },
  { id: "RI", label: "Resp. Inscripto (sin tope)", tope_anual_ars: 0 },
];

export function getTopeByCategoria(catId: string | null | undefined): number | null {
  if (!catId) return null;
  const c = MONOTRIBUTO_CATEGORIAS.find((m) => m.id === catId);
  if (!c) return null;
  return c.tope_anual_ars || null;
}
