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
}: ItemsChipsEditorProps) {
  const items = parse(value);
  const [draft, setDraft] = useState("");

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
    </div>
  );
}
