import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp, Eye, Flame, Zap, Activity, Moon, Wind, Dumbbell, Bike, Cog, Target } from "lucide-react";
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

/** Infer minutes for a block from its bullets / title (best-effort). */
function inferBlockMinutes(block: TrainingBlock): number {
  const text = [block.title, ...block.bullets].join(" ");
  // Total minutes like "30'" or "30 min"
  const totalMatch = text.match(/(\d{1,3})\s*(?:'|min|minutos)/i);
  if (totalMatch) return parseInt(totalMatch[1]);
  // Pattern like "4 x 12'"
  const seriesMatch = text.match(/(\d+)\s*x\s*(\d+)\s*(?:'|min)/i);
  if (seriesMatch) return parseInt(seriesMatch[1]) * parseInt(seriesMatch[2]);
  return 0;
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
      if (line === "[object Object]") continue;
      current.bullets.push(line);
    }
  }
  if (current) blocks.push(current);

  // Best-effort minute inference per block
  for (const b of blocks) b.minutes = inferBlockMinutes(b);

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
    if (structured.length > 0) {
      structured.push({ key: "", value: clean });
    } else {
      return null;
    }
  }

  return structured.length >= 2 ? structured : null;
}

// --- Zone & visuals helpers ---
type Zone = "Z1" | "Z2" | "Z3" | "Z4" | "Z5";

function detectZone(...texts: string[]): Zone | null {
  const joined = texts.join(" ").toUpperCase();
  // Explicit Z1-Z5 or "Zona 3"
  const m = joined.match(/Z\s*([1-5])|ZONA\s*([1-5])/);
  if (m) return `Z${m[1] || m[2]}` as Zone;
  // Heuristics by keyword
  if (/RECUPER|CALMA|VUELTA|REGENER/.test(joined)) return "Z1";
  if (/CALOR|ACTIV|BASE/.test(joined)) return "Z2";
  if (/UMBRAL|TEMPO|SOSTEN/.test(joined)) return "Z4";
  if (/MÁXIMO|MAXIMO|SPRINT|VO2/.test(joined)) return "Z5";
  return null;
}

// hsl strings — semantic mapping that fits the dark luxury palette
const ZONE_HSL: Record<Zone, string> = {
  Z1: "195 25% 55%",   // muted cyan/grey — recovery
  Z2: "195 80% 60%",   // brand cyan — easy aerobic
  Z3: "165 70% 55%",   // mint/green — tempo
  Z4: "27 90% 55%",    // brand orange — threshold
  Z5: "0 80% 60%",     // red — vo2/max
};

const ZONE_LABEL: Record<Zone, string> = {
  Z1: "Recuperación",
  Z2: "Aeróbico",
  Z3: "Tempo",
  Z4: "Umbral",
  Z5: "Máximo",
};

function blockIcon(block: TrainingBlock, index: number, total: number, zone: Zone | null) {
  const text = (block.badge + " " + block.title).toUpperCase();
  if (/GIMN|FUERZA|PESA/.test(text)) return Dumbbell;
  if (/TÉCNIC|TECNIC|HABILID/.test(text)) return Target;
  if (/CALOR|ACTIV/.test(text)) return Flame;
  if (/CALMA|VUELTA|RECUPER|REGENER/.test(text)) return Moon;
  if (/SERIE|INTERV|UMBRAL|TEMPO|SPRINT|VO2|MÁXIMO|MAXIMO/.test(text)) return Zap;
  if (/CADENCIA|RPM|MOLINE/.test(text)) return Cog;
  if (/ROD|BICI|RUTA/.test(text)) return Bike;
  // Positional fallback
  if (index === 0) return Flame;
  if (index === total - 1) return Moon;
  if (zone === "Z5" || zone === "Z4") return Zap;
  return Activity;
}

const TIPO_META: Record<string, { label: string; Icon: typeof Bike }> = {
  ruta: { label: "Ruta", Icon: Bike },
  rodillo: { label: "Rodillo", Icon: Cog },
  gimnasio: { label: "Gimnasio", Icon: Dumbbell },
  tecnica: { label: "Técnica", Icon: Target },
};

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
  const [collapsedBlocks, setCollapsedBlocks] = useState<Set<number>>(new Set());

  const DAY_NAMES = [
    t("days.mon"), t("days.tue"), t("days.wed"), t("days.thu"),
    t("days.fri"), t("days.sat"), t("days.sun"),
  ];

  const { totalMinutes, blocks } = useMemo(
    () => parseDescriptionBlocks(entrenamiento.descripcion || ""),
    [entrenamiento.descripcion]
  );

  // Per-block zones (used for both header bar and cards)
  const blockZones = useMemo(
    () => blocks.map(b => detectZone(b.title, b.rpm, b.bullets.join(" "))),
    [blocks]
  );

  // Header proportional bar: prefer parsed block minutes; fallback equal split
  const headerSegments = useMemo(() => {
    if (blocks.length === 0) return [];
    const knownTotal = blocks.reduce((acc, b) => acc + (b.minutes || 0), 0);
    return blocks.map((b, i) => {
      const mins = b.minutes || (knownTotal > 0 ? 0 : 1);
      return {
        widthBase: mins,
        zone: blockZones[i],
      };
    });
  }, [blocks, blockZones]);

  const segTotal = headerSegments.reduce((a, s) => a + s.widthBase, 0) || blocks.length || 1;
  const segs = headerSegments.length > 0
    ? headerSegments.map(s => ({ pct: (s.widthBase || (segTotal ? 0 : 1)) / segTotal * 100, zone: s.zone }))
    : [];

  const tipoMeta = entrenamiento.tipo ? TIPO_META[entrenamiento.tipo] : null;

  const toggleComfort = () => {
    const next = !comfortMode;
    setComfortMode(next);
    localStorage.setItem("training_comfort", next ? "1" : "0");
    setCollapsedBlocks(new Set());
  };

  const toggleBlock = (i: number) => {
    setCollapsedBlocks(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const isExpanded = (i: number) => !collapsedBlocks.has(i);

  return (
    <div className="space-y-5">
      {/* Day tabs */}
      <div className="flex gap-1 px-1 border-b border-border pb-2 overflow-x-auto scrollbar-hide -mx-1">
        {DAY_NAMES.map((name, i) => (
          <button
            key={name}
            onClick={() => onDayChange(i)}
            className={`font-heading font-semibold px-3 py-2.5 transition-all relative rounded-md shrink-0 ${
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

      {/* Hero header: tipo + duración + barra proporcional */}
      {(totalMinutes > 0 || segs.length > 0 || tipoMeta) && (
        <div className="rounded-2xl border border-border bg-card/60 p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1 min-w-0">
              <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-[hsl(195,80%,60%)]">
                Entrenamiento de hoy
              </p>
              <h2 className="font-heading font-bold text-foreground uppercase tracking-tight text-2xl leading-[1.05] truncate">
                {entrenamiento.titulo || "Sesión"}
              </h2>
            </div>
            {tipoMeta && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-primary text-primary-foreground text-[10px] font-heading font-black tracking-wider rounded-full shrink-0 uppercase">
                <tipoMeta.Icon className="w-3 h-3" />
                {tipoMeta.label}
              </span>
            )}
          </div>

          {totalMinutes > 0 && (
            <div className="flex items-end gap-4">
              <div className="flex flex-col">
                <span className="font-heading font-black text-foreground text-5xl leading-none tabular-nums">
                  {totalMinutes}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground mt-1">
                  Minutos
                </span>
              </div>
              {blocks.length > 0 && (
                <>
                  <div className="h-10 w-px bg-border mb-1" />
                  <div className="flex flex-col">
                    <span className="text-xs text-muted-foreground">Bloques</span>
                    <span className="font-heading font-semibold text-foreground">
                      {blocks.length}
                    </span>
                  </div>
                </>
              )}
              <button
                onClick={toggleComfort}
                className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded-md hover:bg-accent/30"
                aria-label="Modo lectura"
              >
                <Eye className="w-3.5 h-3.5" />
                <span className="font-medium hidden sm:inline">{comfortMode ? "Normal" : "Lectura"}</span>
              </button>
            </div>
          )}

          {/* Proportional zone bar */}
          {segs.length > 0 && (
            <div>
              <div className="w-full h-2.5 flex gap-1 rounded-full overflow-hidden">
                {segs.map((s, i) => (
                  <div
                    key={i}
                    className="h-full first:rounded-l-full last:rounded-r-full"
                    style={{
                      width: `${Math.max(s.pct, 3)}%`,
                      backgroundColor: s.zone ? `hsl(${ZONE_HSL[s.zone]})` : "hsl(var(--muted-foreground) / 0.4)",
                    }}
                    title={s.zone ? `${s.zone} · ${ZONE_LABEL[s.zone]}` : "—"}
                  />
                ))}
              </div>
              {/* Tiny legend */}
              <div className="flex flex-wrap gap-2 mt-2">
                {Array.from(new Set(segs.map(s => s.zone).filter(Boolean) as Zone[])).map(z => (
                  <span key={z} className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: `hsl(${ZONE_HSL[z]})` }} />
                    {z} · {ZONE_LABEL[z]}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Training blocks */}
      <div className={`${comfortMode ? "space-y-4" : "space-y-3"}`}>
        {blocks.map((block, i) => (
          <TrainingBlockCard
            key={i}
            block={block}
            index={i}
            total={blocks.length}
            zone={blockZones[i]}
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
  total,
  zone,
  expanded,
  onToggle,
  comfortMode,
}: {
  block: TrainingBlock;
  index: number;
  total: number;
  zone: Zone | null;
  expanded: boolean;
  onToggle: () => void;
  comfortMode: boolean;
}) {
  const structured = useMemo(() => parseStructuredBullets(block.bullets), [block.bullets]);
  const Icon = blockIcon(block, index, total, zone);
  const zoneHsl = zone ? ZONE_HSL[zone] : null;

  return (
    <div
      className="rounded-2xl border border-border bg-card/50 overflow-hidden transition-colors"
      style={zoneHsl ? { borderLeft: `4px solid hsl(${zoneHsl})` } : undefined}
    >
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-accent/20 transition-colors"
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <span
            className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            style={{
              backgroundColor: zoneHsl ? `hsl(${zoneHsl} / 0.12)` : "hsl(var(--muted) / 0.4)",
              color: zoneHsl ? `hsl(${zoneHsl})` : undefined,
            }}
          >
            <Icon className="w-[18px] h-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            {block.badge && (
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground leading-none mb-1">
                {block.badge}
              </p>
            )}
            <p className={`font-heading font-bold text-foreground uppercase tracking-wide truncate leading-tight ${
              comfortMode ? "text-base" : "text-[14px]"
            }`}>
              {block.title}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {block.minutes > 0 && (
            <span className="text-xs font-heading font-semibold text-muted-foreground tabular-nums">
              {block.minutes}'
            </span>
          )}
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Chips row */}
      {(zone || block.rpm) && (
        <div className="px-4 pb-3 flex flex-wrap gap-1.5">
          {zone && (
            <span
              className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-heading font-bold tracking-wider uppercase"
              style={{
                backgroundColor: `hsl(${ZONE_HSL[zone]} / 0.18)`,
                color: `hsl(${ZONE_HSL[zone]})`,
                border: `1px solid hsl(${ZONE_HSL[zone]} / 0.35)`,
              }}
            >
              {zone} · {ZONE_LABEL[zone]}
            </span>
          )}
          {block.rpm && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-heading font-bold tracking-wider uppercase bg-muted/60 text-secondary-foreground border border-border">
              <Cog className="w-3 h-3" />
              {block.rpm}
            </span>
          )}
        </div>
      )}

      {/* Body */}
      {expanded && block.bullets.length > 0 && (
        <div className={`px-4 pb-4 ${comfortMode ? "space-y-2.5" : "space-y-2"} border-t border-border/40 pt-3`}>
          {structured ? (
            <div className={`${comfortMode ? "space-y-2.5" : "space-y-2"}`}>
              {structured.map((item, i) => (
                <div key={i} className={`${item.key ? "flex gap-2" : "flex gap-2 items-start"}`}>
                  {item.key ? (
                    <>
                      <span className={`font-heading font-semibold text-primary/90 shrink-0 ${
                        comfortMode ? "text-sm min-w-[100px]" : "text-[13px] min-w-[90px]"
                      }`}>
                        {item.key}:
                      </span>
                      <span className={`text-secondary-foreground ${
                        comfortMode ? "text-sm leading-[1.7]" : "text-[13px] leading-relaxed"
                      }`}>
                        {item.value}
                      </span>
                    </>
                  ) : (
                    <>
                      <span
                        className="mt-[7px] w-1 h-1 rounded-full shrink-0"
                        style={{ backgroundColor: zoneHsl ? `hsl(${zoneHsl})` : "hsl(var(--primary))" }}
                      />
                      <p className={`text-secondary-foreground ${
                        comfortMode ? "text-sm leading-[1.7]" : "text-[13px] leading-relaxed"
                      }`}>
                        {item.value}
                      </p>
                    </>
                  )}
                </div>
              ))}
            </div>
          ) : (
            block.bullets.map((bullet, i) => (
              <div key={i} className="flex gap-2 items-start">
                <span
                  className="mt-[7px] w-1 h-1 rounded-full shrink-0"
                  style={{ backgroundColor: zoneHsl ? `hsl(${zoneHsl})` : "hsl(var(--primary))" }}
                />
                <p className={`text-secondary-foreground ${
                  comfortMode ? "text-sm leading-[1.8]" : "text-[13px] leading-[1.7]"
                }`}>
                  {bullet.replace(/^[•\-–]\s*/, "")}
                </p>
              </div>
            ))
          )}
        </div>
      )}

      {/* Footer */}
      {expanded && block.footer && (
        <div className="px-4 py-2.5 border-t border-border/40 bg-muted/20">
          <p className="text-[11px] text-muted-foreground font-heading tracking-wide uppercase">
            {block.footer}
          </p>
        </div>
      )}
    </div>
  );
}
