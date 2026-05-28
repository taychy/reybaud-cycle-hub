import { useEffect, useState } from "react";
import { Type } from "lucide-react";

const STORAGE_KEY = "student_font_scale";
const SCALES = [
  { id: "1", label: "A", pct: 100 },
  { id: "2", label: "A+", pct: 112 },
  { id: "3", label: "A++", pct: 125 },
] as const;

function applyScale(pct: number) {
  document.documentElement.style.fontSize = `${pct}%`;
}

export function initFontScale() {
  const saved = localStorage.getItem(STORAGE_KEY);
  const s = SCALES.find((x) => x.id === saved) ?? SCALES[0];
  applyScale(s.pct);
}

export default function FontSizeToggle({ className = "" }: { className?: string }) {
  const [idx, setIdx] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    const i = SCALES.findIndex((x) => x.id === saved);
    return i >= 0 ? i : 0;
  });

  useEffect(() => {
    const s = SCALES[idx];
    applyScale(s.pct);
    localStorage.setItem(STORAGE_KEY, s.id);
  }, [idx]);

  const next = () => setIdx((i) => (i + 1) % SCALES.length);
  const current = SCALES[idx];

  return (
    <button
      type="button"
      onClick={next}
      aria-label={`Tamaño de letra: ${current.label}. Tocá para cambiar.`}
      title="Tamaño de letra"
      className={`inline-flex items-center gap-1.5 rounded-full border border-border bg-card/60 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-card transition-colors ${className}`}
    >
      <Type className="w-3.5 h-3.5 text-primary" />
      <span>{current.label}</span>
    </button>
  );
}
