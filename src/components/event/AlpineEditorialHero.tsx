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
  imageUrl?: string;
}

export default function AlpineEditorialHero({
  title, subtitle, dateLabel, days, nights, price, currency, capacity, imageUrl,
}: Props) {
  const isConquest = title.toLocaleLowerCase("es-AR").includes("gran conquista alpina");

  return (
    <header className="relative isolate overflow-hidden bg-[#101011] px-4 pb-6 pt-40 text-[#f7f5f1] sm:pt-52 md:pb-10">
      {/* Fotografía auténtica del Passo dello Stelvio. No usar ilustraciones vectoriales en la portada. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <img
          src={imageUrl || "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a0/Stelvio_Pass_%28Unsplash%29.jpg/1280px-Stelvio_Pass_%28Unsplash%29.jpg"}
          alt=""
          loading="eager"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover object-[48%_center] sm:object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#080a0c]/45 via-[#080a0c]/55 to-[#101011]" />
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
