import { useState } from "react";
import { CheckCircle2, XCircle, ChevronDown } from "lucide-react";

interface EventInclusionsProps {
  incluye?: any;
  noIncluye?: any;
  incluyeText?: string;
  noIncluyeText?: string;
  /** When true (trips/camps), collapsed by default to keep the view tidy */
  defaultCollapsed?: boolean;
}

/** Parse a value (array or newline/bullet/semicolon-separated string) into a list of items.
 *  IMPORTANTE: no partimos por comas ni puntos para no fragmentar oraciones del admin
 *  (ej. "Transporte a San Luis, aéreo o terrestre." debe ser UN solo ítem).
 */
function toItems(val: any, textFallback?: string): string[] {
  // Prefer array if it has usable strings (one item per line ya cargado)
  if (Array.isArray(val) && val.length > 0) {
    const arr = val
      .filter((x: any) => typeof x === "string" && x.trim())
      .map((x: string) => x.trim());
    if (arr.length > 0) {
      // If the array contains a single long string with line/bullet separators, expand it
      if (arr.length === 1) return splitText(arr[0]);
      return dedupe(arr);
    }
  }
  if (typeof textFallback === "string" && textFallback.trim()) {
    return splitText(textFallback);
  }
  return [];
}

function splitText(s: string): string[] {
  // Strip an intro like "Incluye en todos los paquetes:" if present
  const cleaned = s.replace(/^.*?(?:incluye|no incluye)[^:]*:\s*/i, "");
  // Split SOLO por saltos de línea, bullets o punto y coma.
  // No partimos por coma/punto: rompe oraciones naturales.
  const raw = cleaned
    .split(/\r?\n|•|·|;/)
    .map((x) => x.replace(/^[-–—•·*]\s*/, "").trim())
    .filter(Boolean);
  return dedupe(raw);
}

function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = item.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

export default function EventInclusions({
  incluye,
  noIncluye,
  incluyeText,
  noIncluyeText,
  defaultCollapsed = false,
}: EventInclusionsProps) {
  const incluyeItems = toItems(incluye, incluyeText);
  const noIncluyeItems = toItems(noIncluye, noIncluyeText);
  const [open, setOpen] = useState(!defaultCollapsed);

  if (incluyeItems.length === 0 && noIncluyeItems.length === 0) return null;

  return (
    <div className="glass-card rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 p-5 text-left hover:bg-muted/20 transition-colors"
        aria-expanded={open}
      >
        <div className="flex items-center gap-3 min-w-0">
          <h3 className="font-heading font-semibold text-sm text-foreground uppercase tracking-wide">
            ¿Qué incluye?
          </h3>
          <span className="text-[11px] text-muted-foreground whitespace-nowrap">
            {incluyeItems.length > 0 && (
              <span className="text-emerald-400">{incluyeItems.length} incluido{incluyeItems.length === 1 ? "" : "s"}</span>
            )}
            {incluyeItems.length > 0 && noIncluyeItems.length > 0 && <span className="mx-1.5 text-muted-foreground/40">·</span>}
            {noIncluyeItems.length > 0 && (
              <span>{noIncluyeItems.length} no incluido{noIncluyeItems.length === 1 ? "" : "s"}</span>
            )}
          </span>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="px-5 pb-5 pt-1 grid grid-cols-1 sm:grid-cols-2 gap-4 animate-fade-in">
          {incluyeItems.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold text-emerald-400 uppercase tracking-[0.18em]">Incluye</p>
              <ul className="space-y-1.5">
                {incluyeItems.map((item, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2.5 rounded-lg border-l-2 border-emerald-400/60 bg-emerald-500/5 px-3 py-2 text-sm text-foreground/90 leading-snug"
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {noIncluyeItems.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.18em]">No incluye</p>
              <ul className="space-y-1.5">
                {noIncluyeItems.map((item, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2.5 rounded-lg border-l-2 border-muted-foreground/30 bg-muted/30 px-3 py-2 text-sm text-muted-foreground leading-snug"
                  >
                    <XCircle className="w-4 h-4 text-muted-foreground/70 mt-0.5 shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
