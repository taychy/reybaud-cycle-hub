// Topes anuales monotributo AFIP (servicios). Actualizar cuando AFIP los modifique.
// Última actualización: agosto 2025.
export interface MonotributoCategoria {
  id: string;
  label: string;
  tope_anual_ars: number;
}

export const MONOTRIBUTO_CATEGORIAS: MonotributoCategoria[] = [
  { id: "A", label: "Cat. A", tope_anual_ars: 7_813_063.45 },
  { id: "B", label: "Cat. B", tope_anual_ars: 11_447_046.44 },
  { id: "C", label: "Cat. C", tope_anual_ars: 16_050_091.57 },
  { id: "D", label: "Cat. D", tope_anual_ars: 19_926_340.85 },
  { id: "E", label: "Cat. E", tope_anual_ars: 23_439_190.34 },
  { id: "F", label: "Cat. F", tope_anual_ars: 29_374_695.90 },
  { id: "G", label: "Cat. G", tope_anual_ars: 35_128_502.31 },
  { id: "H", label: "Cat. H", tope_anual_ars: 53_298_417.30 },
  { id: "RI", label: "Resp. Inscripto (sin tope)", tope_anual_ars: 0 },
];

export function getTopeByCategoria(catId: string | null | undefined): number | null {
  if (!catId) return null;
  const c = MONOTRIBUTO_CATEGORIAS.find((m) => m.id === catId);
  if (!c) return null;
  return c.tope_anual_ars || null;
}
