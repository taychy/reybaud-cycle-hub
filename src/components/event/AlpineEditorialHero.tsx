import { CalendarDays } from "lucide-react";
import { formatPrice } from "@/lib/currency";

interface Props {
  title: string;
  subtitle?: string;
  dateLabel: string;
  days?: number | null;
  nights?: number | null;
  price?: number | null;
  currency?: string | null;
  capacity?: number | null;
}

export default function AlpineEditorialHero({
  title, subtitle, dateLabel, days, nights, price, currency, capacity,
}: Props) {
  const isConquest = title.toLocaleLowerCase("es-AR").includes("gran conquista alpina");

  return (
    <header className="relative isolate overflow-hidden bg-[#101011] px-4 pb-6 pt-40 text-[#f7f5f1] sm:pt-52 md:pb-10">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-80 overflow-hidden bg-gradient-to-b from-[#24262b] to-[#111113]">
        <svg viewBox="0 0 800 340" preserveAspectRatio="xMidYMax slice" className="absolute inset-0 h-full w-full" role="img" aria-label="Silueta de montañas alpinas">
          <defs>
            <linearGradient id="alpineMountain" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#3e414a" />
              <stop offset="1" stopColor="#17181d" />
            </linearGradient>
          </defs>
          <path d="M-80 330 L138 152 L228 240 L382 35 L520 175 L630 95 L840 300 L840 340 L-80 340 Z" fill="url(#alpineMountain)" />
          <path d="M345 88 L382 35 L420 86 L396 76 L382 91 L369 76 Z" fill="#e8e7e3" />
          <path d="M-30 334 L120 255 L218 318 L399 162 L527 281 L683 240 L840 340 Z" fill="#15161a" opacity=".9" />
        </svg>
      </div>
      <div className="relative z-10 mx-auto max-w-5xl">
        {capacity != null && (
          <p className="mb-5 inline-flex max-w-full items-center rounded-lg bg-[#e73531] px-3 py-2 font-heading text-xs font-semibold uppercase tracking-widest text-white sm:text-sm">
            Viaje itinerante · Solo {capacity} cupos
          </p>
        )}
        <h1 className="max-w-3xl font-heading text-[clamp(3.4rem,10vw,6.4rem)] font-black uppercase leading-[.9] tracking-tight">
          {isConquest ? <>La Gran<br />Conquista<br />Alpina</> : title}
        </h1>
        {subtitle && <p className="mt-3 text-base tracking-wide text-zinc-300 sm:text-xl">{subtitle}</p>}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-[#1c1c1f] p-4 shadow-xl sm:p-5">
          <div className="space-y-3">
            <p className="flex items-center gap-2.5 text-sm font-medium sm:text-base">
              <CalendarDays className="h-5 w-5 shrink-0 text-zinc-200" aria-hidden="true" />
              {dateLabel}
            </p>
            <div className="flex flex-wrap gap-2">
              {days != null && <span className="rounded-full bg-[#2a2b30] px-3 py-1 text-xs text-zinc-200">{days} días</span>}
              {nights != null && <span className="rounded-full bg-[#2a2b30] px-3 py-1 text-xs text-zinc-200">{nights} noches</span>}
            </div>
          </div>
          {price != null && (
            <a href="#precio" className="ml-auto text-right focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#e73531]" aria-label="Ver precios y paquetes">
              <span className="block text-[11px] uppercase tracking-[0.15em] text-zinc-400">Desde</span>
              <span className="font-heading text-3xl font-black text-[#ff5754] sm:text-4xl">{formatPrice(price, currency || "EUR")}</span>
            </a>
          )}
        </div>
      </div>
    </header>
  );
}
