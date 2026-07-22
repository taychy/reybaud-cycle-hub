import { useState, KeyboardEvent } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { X, Plus } from "lucide-react";

interface ItemsChipsEditorProps {
  /** Newline-separated string stored in DB (one item per line) */
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  accent?: "emerald" | "muted";
  /** Sugerencias de otros eventos — clickeables para agregar rápido */
  suggestions?: string[];
}

/** Parse the stored text into items. Preserve commas inside an item. */
function parse(value: string): string[] {
  if (!value) return [];
  return value
    .split(/\r?\n|•|·|;/)
    .map((x) => x.replace(/^[-–—•·*]\s*/, "").trim())
    .filter(Boolean);
}

export default function ItemsChipsEditor({
  value,
  onChange,
  placeholder = "Escribí un ítem y Enter…",
  accent = "emerald",
  suggestions = [],
}: ItemsChipsEditorProps) {
  const items = parse(value);
  const [draft, setDraft] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  const norm = (s: string) => s.toLowerCase().trim();
  const usedSet = new Set(items.map(norm));
  const availableSuggestions = suggestions.filter((s) => s && !usedSet.has(norm(s)));

  const addSuggestion = (s: string) => {
    if (usedSet.has(norm(s))) return;
    commit([...items, s]);
  };

  const commit = (nextItems: string[]) => {
    onChange(nextItems.join("\n"));
  };

  const addDraft = () => {
    const v = draft.trim();
    if (!v) return;
    commit([...items, v]);
    setDraft("");
  };

  const remove = (i: number) => {
    const next = items.filter((_, idx) => idx !== i);
    commit(next);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addDraft();
    } else if (e.key === "Backspace" && !draft && items.length > 0) {
      // quick remove last
      remove(items.length - 1);
    }
  };

  const chipCls =
    accent === "emerald"
      ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-100"
      : "border-muted-foreground/30 bg-muted/40 text-foreground/80";

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          onBlur={addDraft}
          placeholder={placeholder}
        />
        <Button type="button" variant="outline" size="icon" onClick={addDraft} aria-label="Agregar">
          <Plus className="w-4 h-4" />
        </Button>
      </div>
      {items.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {items.map((it, i) => (
            <li
              key={`${it}-${i}`}
              className={`group flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${chipCls}`}
            >
              <span className="whitespace-pre-wrap break-words max-w-[280px]">{it}</span>
              <button
                type="button"
                onClick={() => remove(i)}
                className="opacity-60 hover:opacity-100 transition"
                aria-label={`Quitar ${it}`}
              >
                <X className="w-3 h-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[11px] text-muted-foreground italic">Sin ítems aún.</p>
      )}
      <p className="text-[10px] text-muted-foreground">
        Tip: Enter para agregar · Backspace en vacío borra el último · las comas se conservan dentro del ítem.
      </p>
      {availableSuggestions.length > 0 && (
        <div className="rounded-md border border-border/40 bg-muted/10 p-2 space-y-1.5">
          <button
            type="button"
            onClick={() => setShowSuggestions((v) => !v)}
            className="text-[11px] text-primary hover:underline flex items-center gap-1"
          >
            {showSuggestions ? "Ocultar" : "Ver"} sugerencias de otros camps ({availableSuggestions.length})
          </button>
          {showSuggestions && (
            <ul className="flex flex-wrap gap-1.5">
              {availableSuggestions.map((s, i) => (
                <li key={`sug-${i}`}>
                  <button
                    type="button"
                    onClick={() => addSuggestion(s)}
                    className="inline-flex items-center gap-1 rounded-full border border-dashed border-primary/40 bg-primary/5 hover:bg-primary/15 text-primary px-2.5 py-1 text-[11px] transition"
                    title="Click para agregar"
                  >
                    <Plus className="w-3 h-3" />
                    <span className="whitespace-pre-wrap break-words max-w-[260px] text-left">{s}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
