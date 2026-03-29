import { useMemo } from "react";
import { useTranslation } from "react-i18next";
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
      current.bullets.push(line);
    }
  }
  if (current) blocks.push(current);

  return { totalMinutes, blocks };
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
  const DAY_NAMES = [
    t("days.mon"), t("days.tue"), t("days.wed"), t("days.thu"),
    t("days.fri"), t("days.sat"), t("days.sun"),
  ];

  const { totalMinutes, blocks } = useMemo(
    () => parseDescriptionBlocks(entrenamiento.descripcion || ""),
    [entrenamiento.descripcion]
  );

  return (
    <div className="space-y-4">
      {totalMinutes > 0 && (
        <div className="text-center">
          <p className="text-sm text-muted-foreground font-heading">
            — {totalMinutes} min —
          </p>
        </div>
      )}

      <div className="flex justify-between px-1 border-b border-border pb-1">
        {DAY_NAMES.map((name, i) => (
          <button
            key={name}
            onClick={() => onDayChange(i)}
            className={`text-xs font-heading font-semibold px-2.5 py-1.5 transition-colors relative ${
              i === selectedDayIndex
                ? "text-primary after:absolute after:bottom-[-5px] after:left-1/2 after:-translate-x-1/2 after:w-full after:h-[2px] after:bg-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {name}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {blocks.map((block, i) => (
          <TrainingBlockCard key={i} block={block} />
        ))}
      </div>

      {blocks.length === 0 && entrenamiento.descripcion && (
        <div className="rounded-lg border border-border bg-card/80 p-5">
          <p className="text-sm text-secondary-foreground whitespace-pre-wrap leading-relaxed">
            {entrenamiento.descripcion}
          </p>
        </div>
      )}
    </div>
  );
}

function TrainingBlockCard({ block }: { block: TrainingBlock }) {
  return (
    <div className="training-block-card rounded-lg overflow-hidden shadow-xl shadow-black/30">
      <div className="flex items-center justify-between px-4 py-3 training-block-header border-b border-primary/20">
        <div className="flex items-center gap-2.5">
          {block.badge && (
            <span className="text-[10px] font-heading font-bold uppercase tracking-wider text-primary bg-background/60 px-2 py-0.5 rounded border border-primary/30">
              {block.badge}
            </span>
          )}
          <span className="text-sm font-heading font-bold text-foreground tracking-wide">
            {block.title}
          </span>
        </div>
        {block.rpm && (
          <span className="text-xs font-heading text-primary/80 font-semibold">
            {block.rpm}
          </span>
        )}
      </div>

      {block.bullets.length > 0 && (
        <div className="px-4 py-3 space-y-1.5 training-block-body">
          {block.bullets.map((bullet, i) => (
            <p key={i} className="text-[13px] text-secondary-foreground leading-relaxed">
              {bullet.startsWith("•") || bullet.startsWith("-") ? bullet : `• ${bullet}`}
            </p>
          ))}
        </div>
      )}

      {block.footer && (
        <div className="px-4 py-2.5 border-t border-primary/10 training-block-footer">
          <p className="text-xs text-primary/70 font-heading tracking-wide">
            {block.footer}
          </p>
        </div>
      )}
    </div>
  );
}
