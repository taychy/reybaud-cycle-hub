import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp, Eye, Flame, Zap, Activity, Moon, Dumbbell, Bike, Cog, Target, Gauge } from "lucide-react";
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
    if (badge.length <= 10 && title.length > 0) return { badge, title };
  }
  const words = trabajo.split(/\s+/);
  if (words.length > 1 && words[0].length <= 8 && words[0] === words[0].toUpperCase()) {
    return { badge: words[0], title: words.slice(1).join(" ") };
  }
  return { badge: "", title: trabajo };
}

function inferBlockMinutes(block: TrainingBlock): number {
  const text = [block.title, ...block.bullets].join(" ");
  const totalMatch = text.match(/(\d{1,3})\s*(?:'|min|minutos)/i);
  if (totalMatch) return parseInt(totalMatch[1]);
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
    if (minMatch) { totalMinutes = parseInt(minMatch[1]); continue; }
    if (line.startsWith("▸")) {
      if (current) blocks.push(current);
      const headerText = line.slice(1).trim();
      let trabajo = headerText;
      let rpm = "";
      const rpmMatch = headerText.match(/\[([^\]]+)\]\s*$/);
      if (rpmMatch) { rpm = rpmMatch[1]; trabajo = headerText.slice(0, rpmMatch.index).trim(); }
      const { badge, title } = extractBadge(trabajo);
      current = { badge, title: title || trabajo, rpm, minutes: 0, bullets: [], footer: "" };
      continue;
    }
    if (line.startsWith("🔗")) continue;
    if (line.startsWith("💪")) continue;
    if (line.startsWith("•") && line.includes("http")) continue;
    if (current) {
      const cadMatch = line.match(/^cadencia[:\s]/i);
      if (cadMatch) { current.footer = line; continue; }
      if (line === "[object Object]") continue;
      current.bullets.push(line);
    }
  }
  if (current) blocks.push(current);
  for (const b of blocks) b.minutes = inferBlockMinutes(b);
  return { totalMinutes, blocks };
}

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
    if (structured.length > 0) structured.push({ key: "", value: clean });
    else return null;
  }
  return structured.length >= 2 ? structured : null;
}

type Zone = "Z1" | "Z2" | "Z3" | "Z4" | "Z5";

function detectZone(...texts: string[]): Zone | null {
  const joined = texts.join(" ").toUpperCase();
  const m = joined.match(/Z\s*([1-5])|ZONA\s*([1-5])/);
  if (m) return `Z${m[1] || m[2]}` as Zone;
  if (/RECUPER|CALMA|VUELTA|REGENER/.test(joined)) return "Z1";
  if (/CALOR|ACTIV|BASE/.test(joined)) return "Z2";
  if (/UMBRAL|TEMPO|SOSTEN/.test(joined)) return "Z4";
  if (/MÁXIMO|MAXIMO|SPRINT|VO2/.test(joined)) return "Z5";
  return null;
}

const ZONE_HSL: Record<Zone, string> = {
  Z1: "195 25% 55%",
  Z2: "195 80% 60%",
  Z3: "165 70% 55%",
  Z4: "27 90% 55%",
  Z5: "0 80% 60%",
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

  const blockZones = useMemo(
    () => blocks.map(b => detectZone(b.title, b.rpm, b.bullets.join(" "))),
    [blocks]
  );

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
    <div className="space-y-4">
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

      {/* Top strip: tipo + total min + comfort toggle */}
      {(totalMinutes > 0 || tipoMeta) && (
        <div className="flex items-center justify-between gap-2 px-1">
          <div className="flex items-center gap-2">
            {tipoMeta && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-primary text-primary-foreground text-[10px] font-heading font-black tracking-wider rounded-full uppercase">
                <tipoMeta.Icon className="w-3 h-3" />
                {tipoMeta.label}
              </span>
            )}
            {totalMinutes > 0 && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-card border border-border text-[11px] font-heading font-bold uppercase tracking-wider text-foreground">
                <Activity className="w-3 h-3 text-primary" />
                {totalMinutes} min
              </span>
            )}
            {blocks.length > 0 && (
              <span className="text-[11px] text-muted-foreground font-medium">
                {blocks.length} {blocks.length === 1 ? "bloque" : "bloques"}
              </span>
            )}
          </div>
          <button
            onClick={toggleComfort}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded-md hover:bg-accent/30"
            aria-label="Modo lectura"
          >
            <Eye className="w-3.5 h-3.5" />
            <span className="font-medium">{comfortMode ? "Normal" : "Lectura"}</span>
          </button>
        </div>
      )}

      {/* Training blocks - dashboard cards */}
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

// --- Inline pill renderers ---
function ZonePill({ z }: { z: Zone }) {
  const c = ZONE_HSL[z];
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-heading font-black tracking-wider uppercase align-middle mx-0.5"
      style={{
        backgroundColor: `hsl(${c} / 0.18)`,
        color: `hsl(${c})`,
        border: `1px solid hsl(${c} / 0.35)`,
      }}
    >
      {z}
    </span>
  );
}

function DurChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-heading font-bold tabular-nums bg-muted/60 text-foreground border border-border/60 align-middle mx-0.5">
      {children}
    </span>
  );
}

function RpmChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-heading font-bold uppercase bg-muted/60 text-secondary-foreground border border-border/60 align-middle mx-0.5">
      <Cog className="w-2.5 h-2.5" />
      {children}
    </span>
  );
}

/** Replace inline mentions of "Zona: N", "Z3", "100 RPM" with pills. */
function inlineTokens(text: string): ReactNode[] {
  const re = /Zona[:\s]+(\d)(?:\s*[-/]\s*(\d))?|\bZ([1-5])\b|(\d+(?:\/\d+)?)\s*RPM\b/gi;
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(<span key={`t${key++}`}>{text.slice(last, m.index)}</span>);
    if (m[1]) {
      out.push(<ZonePill key={`z${key++}`} z={`Z${m[1]}` as Zone} />);
      if (m[2]) out.push(<ZonePill key={`z${key++}`} z={`Z${m[2]}` as Zone} />);
    } else if (m[3]) {
      out.push(<ZonePill key={`z${key++}`} z={`Z${m[3]}` as Zone} />);
    } else if (m[4]) {
      out.push(<RpmChip key={`r${key++}`}>{m[4]} RPM</RpmChip>);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(<span key={`t${key++}`}>{text.slice(last)}</span>);
  return out;
}

/** "2-1", "3", "2/3" -> array of zones */
function parseZoneValue(value: string): Zone[] {
  const nums = value.match(/[1-5]/g) || [];
  return nums.map(n => `Z${n}` as Zone);
}

/** Detect interval row: "10' Zona: 1", "6 × 1'30\" Zona: 3". */
function parseIntervalRow(b: string): { duration: string; zones: Zone[]; rest: string } | null {
  const clean = b.replace(/^[•\-–]\s*/, "").trim();
  const durMatch = clean.match(/^(\d+(?:\s*[×x]\s*\d+(?:['′]\s*\d*\s*["″]?)?)?(?:\s*['′]\s*\d*\s*["″]?)?)\s+/);
  if (!durMatch) return null;
  const rest1 = clean.slice(durMatch[0].length);
  const zMatch = rest1.match(/^Zona[:\s]+(\d)(?:\s*[-/]\s*(\d))?/i);
  if (!zMatch) return null;
  const zones: Zone[] = [`Z${zMatch[1]}` as Zone];
  if (zMatch[2]) zones.push(`Z${zMatch[2]}` as Zone);
  const rest = rest1.slice(zMatch[0].length).replace(/^[\s,;:.\-]+/, "").trim();
  return { duration: durMatch[1].trim(), zones, rest };
}



function MetricTile({
  Icon,
  label,
  value,
  colorHsl,
  emphasis,
}: {
  Icon: typeof Bike;
  label: string;
  value: string;
  colorHsl?: string | null;
  emphasis?: boolean;
}) {
  return (
    <div className={`rounded-xl p-2.5 flex items-center gap-2.5 ${emphasis ? "bg-muted/60" : "bg-muted/30"} border border-border/50`}>
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
        style={{
          backgroundColor: colorHsl ? `hsl(${colorHsl} / 0.12)` : "hsl(var(--muted) / 0.5)",
          color: colorHsl ? `hsl(${colorHsl})` : undefined,
        }}
      >
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <p
          className="text-[11px] font-heading font-bold uppercase tracking-wide leading-tight truncate"
          style={{ color: colorHsl ? `hsl(${colorHsl})` : undefined }}
        >
          {value}
        </p>
        <p className="text-[9px] text-muted-foreground uppercase font-bold tracking-wider leading-tight">
          {label}
        </p>
      </div>
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
  const isPrimary = zone === "Z4" || zone === "Z5";

  return (
    <div
      className={`rounded-2xl overflow-hidden transition-colors ${
        isPrimary ? "bg-card border border-border shadow-lg shadow-black/30" : "bg-card/40 border border-border/60"
      }`}
      style={zoneHsl ? { borderLeftWidth: "4px", borderLeftColor: `hsl(${zoneHsl})` } : undefined}
    >
      {/* Header row */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 px-4 pt-3.5 pb-3 text-left"
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <span
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{
              backgroundColor: zoneHsl ? `hsl(${zoneHsl} / 0.14)` : "hsl(var(--muted) / 0.5)",
              color: zoneHsl ? `hsl(${zoneHsl})` : undefined,
            }}
          >
            <Icon className="w-5 h-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p
              className="text-[10px] font-heading font-bold uppercase tracking-[0.14em] leading-none mb-1"
              style={{ color: zoneHsl ? `hsl(${zoneHsl})` : "hsl(var(--muted-foreground))" }}
            >
              {block.badge || `Bloque ${index + 1}`}
            </p>
            <p className={`font-heading font-bold text-foreground uppercase tracking-wide leading-tight ${
              comfortMode ? "text-base" : "text-[15px]"
            }`}>
              {block.title}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="text-right">
            {block.minutes > 0 && (
              <span className="block font-heading font-black text-foreground text-xl leading-none tabular-nums">
                {block.minutes}'
              </span>
            )}
            <span className="text-[9px] text-muted-foreground uppercase font-bold tracking-widest">
              Duración
            </span>
          </div>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Metric tiles grid */}
      {(zone || block.rpm) && (
        <div className="px-4 pb-3 grid grid-cols-2 gap-2">
          <MetricTile
            Icon={Zap}
            label="Intensidad"
            value={zone ? `${zone} · ${ZONE_LABEL[zone]}` : "—"}
            colorHsl={zoneHsl}
            emphasis={isPrimary}
          />
          <MetricTile
            Icon={Gauge}
            label="Cadencia"
            value={block.rpm || "Libre"}
            emphasis={isPrimary}
          />
        </div>
      )}

      {/* Body */}
      {expanded && block.bullets.length > 0 && (
        <BlockBody
          bullets={block.bullets}
          structured={structured}
          zoneHsl={zoneHsl}
          comfortMode={comfortMode}
        />
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
