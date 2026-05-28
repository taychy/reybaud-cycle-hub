import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Plus, Shirt, GripVertical, ChevronLeft, ChevronRight } from "lucide-react";

export interface VariantSpec {
  name: string;
  options: string[];
}

interface Props {
  value: any;
  onChange: (v: VariantSpec[]) => void;
}

const PRESETS: { label: string; spec: VariantSpec }[] = [
  { label: "Talles ropa", spec: { name: "Talle", options: ["XS", "S", "M", "L", "XL", "XXL"] } },
  { label: "Talles calzado", spec: { name: "Talle", options: ["38", "39", "40", "41", "42", "43", "44", "45"] } },
  { label: "Colores básicos", spec: { name: "Color", options: ["Negro", "Blanco", "Rojo", "Azul"] } },
  { label: "Tipo", spec: { name: "Tipo", options: ["Hombre", "Mujer", "Unisex"] } },
];

const normalize = (v: any): VariantSpec[] => {
  if (!v) return [];
  if (Array.isArray(v)) {
    return v
      .filter((x) => x && typeof x === "object" && x.name)
      .map((x) => ({ name: String(x.name), options: Array.isArray(x.options) ? x.options.map(String) : [] }));
  }
  if (typeof v === "string") {
    try { return normalize(JSON.parse(v)); } catch { return []; }
  }
  return [];
};

const VariantsEditor = ({ value, onChange }: Props) => {
  const specs = useMemo(() => normalize(value), [value]);
  const [draftOption, setDraftOption] = useState<Record<number, string>>({});

  const update = (next: VariantSpec[]) => onChange(next);

  const addSpec = (preset?: VariantSpec) => {
    if (preset && specs.some((s) => s.name.toLowerCase() === preset.name.toLowerCase())) return;
    update([...specs, preset ? { ...preset } : { name: "", options: [] }]);
  };

  const removeSpec = (i: number) => update(specs.filter((_, idx) => idx !== i));

  const renameSpec = (i: number, name: string) =>
    update(specs.map((s, idx) => (idx === i ? { ...s, name } : s)));

  const addOption = (i: number) => {
    const opt = (draftOption[i] || "").trim();
    if (!opt) return;
    if (specs[i].options.includes(opt)) {
      setDraftOption({ ...draftOption, [i]: "" });
      return;
    }
    update(specs.map((s, idx) => (idx === i ? { ...s, options: [...s.options, opt] } : s)));
    setDraftOption({ ...draftOption, [i]: "" });
  };

  const removeOption = (i: number, opt: string) =>
    update(specs.map((s, idx) => (idx === i ? { ...s, options: s.options.filter((o) => o !== opt) } : s)));

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs font-heading uppercase text-muted-foreground">Variantes (ej. talle, color)</label>
        <p className="text-[11px] text-muted-foreground">Si el producto no tiene variantes, dejá vacío.</p>
      </div>

      {specs.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground text-center">
          Sin variantes configuradas
        </div>
      )}

      {specs.map((s, i) => (
        <div key={i} className="rounded-lg border border-border p-3 space-y-2 bg-muted/20">
          <div className="flex items-center gap-2">
            <Shirt className="w-4 h-4 text-primary shrink-0" />
            <Input
              value={s.name}
              onChange={(e) => renameSpec(i, e.target.value)}
              placeholder="Nombre (Talle, Color...)"
              className="h-8 text-sm"
            />
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeSpec(i)}>
              <X className="w-4 h-4 text-destructive" />
            </Button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {s.options.map((o) => (
              <span key={o} className="inline-flex items-center gap-1 rounded-full bg-primary/15 text-primary text-xs px-2 py-0.5">
                {o}
                <button type="button" onClick={() => removeOption(i, o)} className="hover:text-destructive">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>

          <div className="flex gap-2">
            <Input
              value={draftOption[i] || ""}
              onChange={(e) => setDraftOption({ ...draftOption, [i]: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); addOption(i); }
              }}
              placeholder="Agregar opción (Enter)"
              className="h-8 text-sm"
            />
            <Button type="button" size="sm" variant="outline" onClick={() => addOption(i)}>
              <Plus className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      ))}

      <div className="flex flex-wrap gap-2 pt-1">
        <Button type="button" size="sm" variant="outline" onClick={() => addSpec()}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Nueva variante
        </Button>
        {PRESETS.map((p) => (
          <Button
            key={p.label}
            type="button"
            size="sm"
            variant="ghost"
            className="text-xs"
            onClick={() => addSpec(p.spec)}
          >
            + {p.label}
          </Button>
        ))}
      </div>
    </div>
  );
};

export default VariantsEditor;
