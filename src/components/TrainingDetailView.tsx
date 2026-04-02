import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp, Eye } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import type { Tables } from "@/integrations/supabase/types";

type Entrenamiento = Tables<"entrenamientos">;

interface TrainingBlock {
  badge: string;
  title: string;
  rpm: string;
  minutes: number;
  bullets: string[];
  footer: string;
}

function extractBadge(trabajo: string): { badge: string; title: string } {
  const match = trabajo.match(/^([A-ZÁÉÍÓÚ\s]{2,12}?)(?:\s{2,}|\s*[-–]\s*|\s+(?=[A-ZÁÉÍÓÚ][a-záéíóú]))/);
  if (match) {
    const badge = match[1].trim();
    const title = trabajo.slice(match[0].length).trim();
    if (badge.length <= 10 && title.length > 0) {
      return { badge, title };
    }
  }
  const words = trabajo.split(/\s+/);
  if (words.length > 1 && words[0].length <= 8 && words[0] === words[0].toUpperCase()) {
    return { badge: words[0], title: words.slice(1).join(" ") };
  }
  return { badge: "", title: trabajo };
}

export function parseDescriptionBlocks(descripcion: string): { totalMinutes: number; blocks: TrainingBlock[] } {
  const lines = descripcion.split("\n");
  let totalMinutes = 0;
  const blocks: TrainingBlock[] = [];
  let current: TrainingBlock | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const minMatch = line.match(/^⏱\s*(\d+)\s*min/i);
    if (minMatch) {
      totalMinutes = parseInt(minMatch[1]);
      continue;
    }

    if (line.startsWith("▸")) {
      if (current) blocks.push(current);
      const headerText = line.slice(1).trim();
      let trabajo = headerText;
      let rpm = "";
      const rpmMatch = headerText.match(/\[([^\]]+)\]\s*$/);
      if (rpmMatch) {
        rpm = rpmMatch[1];
        trabajo = headerText.slice(0, rpmMatch.index).trim();
      }
      const { badge, title } = extractBadge(trabajo);
      current = { badge, title: title || trabajo, rpm, minutes: 0, bullets: [], footer: "" };
      continue;
    }

    if (line.startsWith("🔗")) continue;
    if (line.startsWith("💪")) continue;
    if (line.startsWith("•") && line.includes("http")) continue;

    if (current) {
      const cadMatch = line.match(/^cadencia[:\s]/i);
      if (cadMatch) {
        current.footer = line;
        continue;
      }
      // Skip [object Object] artifacts from bad imports
      if (line === "[object Object]") continue;
      current.bullets.push(line);
    }
  }
  if (current) blocks.push(current);

  return { totalMinutes, blocks };
}

// --- Structured bullet parsing ---
function parseStructuredBullets(bullets: string[]): { key: string; value: string }[] | null {
  const keywords = ["objetivo", "zona", "cadencia", "series", "pausa", "descanso", "observ", "rpm", "duración", "intensidad", "recuper"];
  const structured: { key: string; value: string }[] = [];

  for (const b of bullets) {
    const clean = b.replace(/^[•\-–]\s*/, "").trim();
    const colonMatch = clean.match(/^([^:]{2,20}):\s*(.+)/i);
    if (colonMatch) {
      const keyLower = colonMatch[1].toLowerCase().trim();
      if (keywords.some(k => keyLower.includes(k))) {
        structured.push({ key: colonMatch[1].trim(), value: colonMatch[2].trim() });
        continue;
      }
    }
    // If we already have structured items, add as generic
    if (structured.length > 0) {
      structured.push({ key: "", value: clean });
    } else {
      return null; // Not structured content
    }
  }

  return structured.length >= 2 ? structured : null;
}

interface TrainingDetailViewProps {
  entrenamiento: Entrenamiento;
  alumnoName: string;
  selectedDayIndex: number;
  onDayChange: (index: number) => void;
}

export default function TrainingDetailView({
  entrenamiento,
  alumnoName,
  selectedDayIndex,
  onDayChange,
}: TrainingDetailViewProps) {
  const { t } = useTranslation();
  const [comfortMode, setComfortMode] = useState(() => localStorage.getItem("training_comfort") === "1");
  const [expandedBlocks, setExpandedBlocks] = useState<Set<number>>(new Set());

  const DAY_NAMES = [
    t("days.mon"), t("days.tue"), t("days.wed"), t("days.thu"),
    t("days.fri"), t("days.sat"), t("days.sun"),
  ];

  const { totalMinutes, blocks } = useMemo(
    () => parseDescriptionBlocks(entrenamiento.descripcion || ""),
    [entrenamiento.descripcion]
  );

  const toggleComfort = () => {
    const next = !comfortMode;
    setComfortMode(next);
    localStorage.setItem("training_comfort", next ? "1" : "0");
    if (next) {
      // In comfort mode, collapse all except first
      setExpandedBlocks(new Set([0]));
    } else {
      setExpandedBlocks(new Set());
    }
  };

  const toggleBlock = (i: number) => {
    setExpandedBlocks(prev => {
      const next = new Set(prev);
      if (comfortMode) {
        // Accordion: only one open at a time
        if (next.has(i)) {
          next.delete(i);
        } else {
          next.clear();
          next.add(i);
        }
      } else {
        if (next.has(i)) next.delete(i);
        else next.add(i);
      }
      return next;
    });
  };

  // In normal mode, all are expanded by default (expandedBlocks is empty = show all)
  const isExpanded = (i: number) => {
    if (!comfortMode) return !expandedBlocks.has(i); // toggle hides
    return expandedBlocks.has(i); // toggle shows
  };

  const sizeClass = comfortMode ? "comfort" : "";

  return (
    <div className={`space-y-5 ${sizeClass}`}>
      {/* Duration + comfort toggle */}
      <div className="flex items-center justify-between px-1">
        {totalMinutes > 0 ? (
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-heading font-bold text-primary tracking-wide">
              ⏱ {totalMinutes} min
            </span>
          </div>
        ) : <span />}
        <button
          onClick={toggleComfort}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded-md hover:bg-accent/30"
          aria-label="Modo lectura"
        >
          <Eye className="w-4 h-4" />
          <span className="font-medium">{comfortMode ? "Vista normal" : "Modo lectura"}</span>
        </button>
      </div>

      {/* Day tabs - larger touch targets */}
      <div className="flex justify-between px-1 border-b border-border pb-2">
        {DAY_NAMES.map((name, i) => (
          <button
            key={name}
            onClick={() => onDayChange(i)}
            className={`font-heading font-semibold px-3 py-2.5 transition-all relative rounded-md ${
              comfortMode ? "text-base" : "text-sm"
            } ${
              i === selectedDayIndex
                ? "text-primary bg-primary/10 after:absolute after:bottom-[-9px] after:left-1/2 after:-translate-x-1/2 after:w-3/4 after:h-[3px] after:bg-primary after:rounded-full"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/20"
            }`}
          >
            {name}
          </button>
        ))}
      </div>

      {/* Training blocks */}
      <div className={`${comfortMode ? "space-y-5" : "space-y-4"}`}>
        {blocks.map((block, i) => (
          <TrainingBlockCard
            key={i}
            block={block}
            index={i}
            expanded={isExpanded(i)}
            onToggle={() => toggleBlock(i)}
            comfortMode={comfortMode}
          />
        ))}
      </div>

      {blocks.length === 0 && entrenamiento.descripcion && (
        <div className={`rounded-xl border border-border bg-card/80 ${comfortMode ? "p-6" : "p-5"}`}>
          <p className={`text-secondary-foreground whitespace-pre-wrap ${
            comfortMode ? "text-lg leading-[1.8]" : "text-[15px] leading-relaxed"
          }`}>
            {entrenamiento.descripcion}
          </p>
        </div>
      )}
    </div>
  );
}

function TrainingBlockCard({
  block,
  index,
  expanded,
  onToggle,
  comfortMode,
}: {
  block: TrainingBlock;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  comfortMode: boolean;
}) {
  const structured = useMemo(() => parseStructuredBullets(block.bullets), [block.bullets]);

  return (
    <div className="training-block-card rounded-xl overflow-hidden shadow-xl shadow-black/30">
      {/* Header - always visible, acts as summary + toggle */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-4 training-block-header border-b border-primary/20 text-left"
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {block.badge && (
            <span className={`font-heading font-bold uppercase tracking-wider text-primary bg-background/60 px-2.5 py-1 rounded-md border border-primary/30 shrink-0 ${
              comfortMode ? "text-xs" : "text-[11px]"
            }`}>
              {block.badge}
            </span>
          )}
          <span className={`font-heading font-bold text-foreground tracking-wide truncate ${
            comfortMode ? "text-lg" : "text-[15px]"
          }`}>
            {block.title}
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-2">
          {block.rpm && (
            <span className={`font-heading text-primary/80 font-semibold ${
              comfortMode ? "text-sm" : "text-xs"
            }`}>
              {block.rpm}
            </span>
          )}
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Body - expandable */}
      {expanded && block.bullets.length > 0 && (
        <div className={`training-block-body ${comfortMode ? "px-5 py-5 space-y-3" : "px-5 py-4 space-y-2"}`}>
          {structured ? (
            // Structured display
            <div className={`${comfortMode ? "space-y-3" : "space-y-2"}`}>
              {structured.map((item, i) => (
                <div key={i} className={`${item.key ? "flex gap-2" : ""}`}>
                  {item.key ? (
                    <>
                      <span className={`font-heading font-semibold text-primary/90 shrink-0 ${
                        comfortMode ? "text-base min-w-[110px]" : "text-[15px] min-w-[95px]"
                      }`}>
                        {item.key}:
                      </span>
                      <span className={`text-secondary-foreground ${
                        comfortMode ? "text-base leading-[1.7]" : "text-[15px] leading-relaxed"
                      }`}>
                        {item.value}
                      </span>
                    </>
                  ) : (
                    <p className={`text-secondary-foreground ${
                      comfortMode ? "text-base leading-[1.7]" : "text-[15px] leading-relaxed"
                    }`}>
                      • {item.value}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            // Regular bullets with improved spacing
            block.bullets.map((bullet, i) => (
              <p key={i} className={`text-secondary-foreground ${
                comfortMode ? "text-base leading-[1.8]" : "text-[15px] leading-[1.7]"
              }`}>
                {bullet.startsWith("•") || bullet.startsWith("-") ? bullet : `• ${bullet}`}
              </p>
            ))
          )}
        </div>
      )}

      {/* Footer */}
      {expanded && block.footer && (
        <div className={`border-t border-primary/10 training-block-footer ${
          comfortMode ? "px-5 py-3.5" : "px-5 py-3"
        }`}>
          <p className={`text-primary/70 font-heading tracking-wide ${
            comfortMode ? "text-sm" : "text-xs"
          }`}>
            {block.footer}
          </p>
        </div>
      )}
    </div>
  );
}
