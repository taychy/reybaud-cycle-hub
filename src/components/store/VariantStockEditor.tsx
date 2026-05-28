import { Input } from "@/components/ui/input";
import { useMemo } from "react";

interface VariantSpec { name: string; options: string[] }

interface Props {
  variants: any;
  stock: Record<string, number>;
  onChange: (v: Record<string, number>) => void;
}

/** Genera todas las combinaciones cartesianas como signatures "Talle:M|Color:Negro" */
export const buildCombos = (specs: VariantSpec[]): string[] => {
  if (!specs.length) return [];
  const valid = specs.filter((s) => s.name && s.options.length > 0);
  if (!valid.length) return [];
  let combos: string[][] = [[]];
  for (const s of valid) {
    const next: string[][] = [];
    for (const c of combos) {
      for (const opt of s.options) next.push([...c, `${s.name}:${opt}`]);
    }
    combos = next;
  }
  return combos.map((c) => c.join("|"));
};

const VariantStockEditor = ({ variants, stock, onChange }: Props) => {
  const specs = useMemo<VariantSpec[]>(() => {
    if (!Array.isArray(variants)) return [];
    return variants.filter((v) => v?.name && Array.isArray(v?.options));
  }, [variants]);
  const combos = useMemo(() => buildCombos(specs), [specs]);

  if (!combos.length) return null;

  return (
    <div className="rounded-lg border border-border p-3 space-y-2 bg-muted/10">
      <label className="text-xs font-heading uppercase text-muted-foreground">
        Stock por variante
      </label>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {combos.map((sig) => (
          <div key={sig} className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground truncate" title={sig}>
              {sig.replace(/\|/g, " · ")}
            </span>
            <Input
              type="number"
              min={0}
              value={stock[sig] ?? 0}
              onChange={(e) => onChange({ ...stock, [sig]: Number(e.target.value || 0) })}
              className="h-8 text-sm"
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default VariantStockEditor;
