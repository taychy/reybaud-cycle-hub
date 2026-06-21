import { AlertTriangle, Info, Sparkles } from "lucide-react";

interface Props {
  texto?: string | null;
  tipo?: string | null;        // 'info' | 'warning' | 'promo'
  hasta?: string | null;       // ISO timestamp
  activo?: boolean | null;
}

const STYLES: Record<string, { wrap: string; icon: any; iconColor: string }> = {
  info:    { wrap: "border-sky-500/40 bg-sky-500/10 text-sky-100",       icon: Info,           iconColor: "text-sky-400" },
  warning: { wrap: "border-amber-500/40 bg-amber-500/10 text-amber-100", icon: AlertTriangle,  iconColor: "text-amber-400" },
  promo:   { wrap: "border-emerald-500/40 bg-emerald-500/10 text-emerald-100", icon: Sparkles, iconColor: "text-emerald-400" },
};

const EventPriceBanner = ({ texto, tipo, hasta, activo }: Props) => {
  if (!activo || !texto || !texto.trim()) return null;
  if (hasta) {
    const limit = new Date(hasta).getTime();
    if (!Number.isNaN(limit) && limit < Date.now()) return null;
  }
  const style = STYLES[tipo || "info"] || STYLES.info;
  const Icon = style.icon;
  return (
    <div className={`rounded-xl border ${style.wrap} px-4 py-3 flex items-start gap-3 animate-fade-in`}>
      <Icon className={`w-5 h-5 mt-0.5 shrink-0 ${style.iconColor}`} />
      <div className="text-sm leading-snug whitespace-pre-line">{texto}</div>
    </div>
  );
};

export default EventPriceBanner;
