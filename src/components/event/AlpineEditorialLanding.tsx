import { useState, type ReactNode } from "react";
import { Bike, Check, ChevronDown, CupSoda, Flag, MapPin, Mountain, Play, Route, Shirt, ShoppingBag, X } from "lucide-react";
import EventDriveVideo from "./EventDriveVideo";
import type { PremiumLandingConfig } from "./EventPremiumLanding";
import type { ReglamentoFields } from "@/lib/eventReglamentoDefaults";
import { formatPrice } from "@/lib/currency";

interface Itinerary { dia?: string; descripcion?: string }
interface Package { nombre: string; sena: number | null; currency: string; stages: unknown[] }
interface Props {
  config: PremiumLandingConfig;
  itinerario: Itinerary[];
  incluye: string[];
  noIncluye: string[];
  reglamento?: ReglamentoFields;
  packagesCta?: ReactNode;
  faq?: string;
  base?: Package;
  isDraftPreview: boolean;
}

function stageParts(raw: string) {
  const distance = raw.match(/\b\d{1,3}\s*km\b/i)?.[0];
  const ascent = raw.match(/\+\s*\d{1,2}(?:\.\d{3})?\s*m\b/i)?.[0];
  let description = raw
    .replace(/:?\s*\d{1,3}\s*km\s*,?\s*\+\s*\d{1,2}(?:\.\d{3})?\s*m\.?/gi, ".")
    .replace(/\s*Total aproximado:.*$/i, "")
    .replace(/^\s*\.\s*/, "")
    .replace(/\.\s*\./g, ".")
    .replace(/\s{2,}/g, " ")
    .trim();
  return { distance, ascent, description };
}

function MountainPoster() {
  return (
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 700 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="posterGlow" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#383b47" />
          <stop offset=".65" stopColor="#a55d48" />
          <stop offset="1" stopColor="#e39460" />
        </linearGradient>
      </defs>
      <rect width="700" height="300" fill="url(#posterGlow)" />
      <path d="M0 290 L156 155 L292 270 L420 88 L570 249 L700 163 L700 300 L0 300Z" fill="#27232a" opacity=".85" />
      <path d="M0 300 L198 253 L332 300 L508 182 L700 300Z" fill="#342b30" />
    </svg>
  );
}

export default function AlpineEditorialLanding({
  config, itinerario, incluye, noIncluye, reglamento, packagesCta, faq, base, isDraftPreview,
}: Props) {
  const [showVideo, setShowVideo] = useState(false);
  const stats = config.stats || [];
  const icons = [Route, Bike, Mountain, Flag];
  const terms = reglamento ? ([
    ["Política de seña", reglamento.politica_sena],
    ["Política de pagos", reglamento.politica_pagos],
    ["Política de cancelación", reglamento.politica_cancelacion],
    ["Reglamento", reglamento.reglamento_texto],
  ].filter(([, body]) => Boolean(body)) as [string, string][]) : [];

  const nav = [
    ["experiencia", "Experiencia"],
    ["recorrido", "Recorrido"],
    ["bicicletas", "Bicicletas"],
    ["que-incluye", "Qué incluye"],
    ...(config.kit?.items?.length ? [["kit", "Kit"]] : []),
    ["preparacion", "Preparación"],
    ["precio", "Precio"],
    ["condiciones", "Condiciones"],
  ];

  const titleClass = "font-heading text-[1.55rem] font-black uppercase leading-none tracking-tight sm:text-3xl";
  const countryList = "Gavia, Bernina, Stelvio, Resia, Innsbruck y Dolomitas";
  const stages = stats.find((s) => s.label.toLowerCase().includes("etapa"))?.value || "7";
  const km = stats.find((s) => s.label.toLowerCase().includes("distancia"))?.value || "538 km";
  const climb = stats.find((s) => s.label.toLowerCase().includes("desnivel"))?.value || "+11.610 m";

  return (
    <div className="space-y-0 text-[#f4f3f1]">
      <nav aria-label="Secciones del viaje" className="sticky top-0 z-20 -mx-4 overflow-x-auto border-b border-white/10 bg-[#101011]/95 px-4 backdrop-blur-md">
        <div className="flex min-w-max gap-7">
          {nav.map(([id, label], i) => (
            <a key={id} href={"#" + id} className={"border-b-2 py-4 font-heading text-sm font-bold uppercase tracking-wider transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#e73531] " + (i === 0 ? "border-[#e73531] text-white" : "border-transparent text-zinc-400 hover:text-white")}>
              {label}
            </a>
          ))}
        </div>
      </nav>

      <section id="experiencia" className="scroll-mt-16 space-y-7 pt-9">
        {stats.length > 0 && (
          <div className="space-y-5">
            <h2 className={titleClass}>El viaje en cifras</h2>
            <div className="grid grid-cols-2 gap-3">
              {stats.map((stat, i) => {
                const Icon = icons[i % icons.length];
                return (
                  <div key={stat.label} className="min-h-32 rounded-2xl border border-white/10 bg-[#1c1c1e] p-4 sm:p-5">
                    <Icon className="mb-3 h-6 w-6 text-[#ff5754]" aria-hidden="true" />
                    <p className="font-heading text-3xl font-black leading-none sm:text-4xl">{stat.value}</p>
                    <p className="mt-1.5 text-[10px] uppercase tracking-[.16em] text-zinc-400 sm:text-xs">{stat.label}</p>
                  </div>
                );
              })}
            </div>
            {config.note && <p className="text-xs text-zinc-400">{config.note}</p>}
          </div>
        )}

        <div className="space-y-4">
          <h2 className={titleClass}>Experiencia</h2>
          <p className="max-w-2xl text-base leading-relaxed text-zinc-300">
            Un Training Camp por los Alpes, pensado para vivirlo sin improvisar.
          </p>
          <ul className="space-y-3 text-sm text-zinc-200 sm:text-base">
            <li className="flex items-start gap-3"><Flag className="mt-0.5 h-5 w-5 shrink-0 text-[#ff5754]" aria-hidden="true" /><span>Training Camp de {stages} etapas</span></li>
            <li className="flex items-start gap-3"><Mountain className="mt-0.5 h-5 w-5 shrink-0 text-[#ff5754]" aria-hidden="true" /><span>{km} · {climb} aprox.</span></li>
            <li className="flex items-start gap-3"><MapPin className="mt-0.5 h-5 w-5 shrink-0 text-[#ff5754]" aria-hidden="true" /><span>{countryList}</span></li>
          </ul>
          <p className="text-xs text-zinc-400">Fechas y condiciones de cancelación: a confirmar.</p>
        </div>

        {config.video && (
          <div>
            {!showVideo ? (
              <button type="button" aria-label="Reproducir video del recorrido" onClick={() => setShowVideo(true)} className="relative block aspect-[16/9] w-full overflow-hidden rounded-2xl text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#e73531]">
                <MountainPoster />
                <span className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                <span className="absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/75 text-white">
                  <Play className="ml-1 h-6 w-6 fill-current" aria-hidden="true" />
                </span>
                <span className="absolute bottom-4 left-4 text-sm font-semibold text-white">Ver video del recorrido</span>
              </button>
            ) : (
              <EventDriveVideo video={config.video} />
            )}
          </div>
        )}
      </section>

      {itinerario.length > 0 && (
        <section id="recorrido" className="scroll-mt-16 space-y-6 pt-12">
          <h2 className={titleClass}>Recorrido</h2>
          <ol className="relative ml-4 space-y-6 border-l-2 border-white/15">
            {itinerario.map((day, i) => {
              const { distance, ascent, description } = stageParts(day.descripcion || "");
              return (
                <li key={i} className="relative pl-8">
                  <span className="absolute -left-[17px] top-0 flex h-8 w-8 items-center justify-center rounded-full bg-[#e73531] font-heading text-sm font-bold text-white">{i + 1}</span>
                  <h3 className="font-heading text-base font-bold uppercase leading-tight tracking-wide sm:text-lg">{day.dia}</h3>
                  {description && <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{description}</p>}
                  {(distance || ascent) && (
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      {distance && <span className="rounded-full bg-[#292a2e] px-3 py-1 text-xs text-zinc-200">{distance}</span>}
                      {ascent && <span className="rounded-full bg-[#292a2e] px-3 py-1 text-xs text-zinc-200">{ascent}</span>}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
          <p className="text-xs text-zinc-400">Total aprox.: {km} y {climb} en {stages} etapas. Datos sujetos a validación técnica.</p>
        </section>
      )}

      {!!config.bikes?.length && (
        <section id="bicicletas" className="scroll-mt-16 space-y-5 pt-12">
          <h2 className={titleClass}>Bicicletas</h2>
          <div className="grid grid-cols-2 gap-3 sm:gap-5">
            {config.bikes.map((bike) => {
              const isScott = bike.name.toLowerCase().includes("scott");
              return (
                <div key={bike.name} className="overflow-hidden rounded-2xl border border-white/10 bg-[#1c1c1e]">
                  <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-[#f5f5f5]">
                    {bike.image ? (
                      <img
                        src={bike.image}
                        alt={"Bicicleta de referencia " + bike.name}
                        loading="lazy"
                        className="h-full w-full object-contain"
                        style={{ transform: isScott ? "scale(1.33)" : "scale(1.05)", transformOrigin: "center" }}
                      />
                    ) : <Bike className="h-14 w-14 text-zinc-500" aria-hidden="true" />}
                  </div>
                  <div className="min-h-[95px] border-t-[3px] border-[#e73531] p-3 sm:p-4">
                    <p className="font-heading text-sm font-bold uppercase leading-tight sm:text-lg">{bike.name}</p>
                    {bike.spec && <p className="mt-1 text-xs leading-snug text-zinc-400 sm:text-sm">{bike.spec}</p>}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-zinc-500">Imágenes ilustrativas. Modelo, color y configuración sujetos a confirmación del proveedor.</p>
        </section>
      )}

      {(incluye.length > 0 || noIncluye.length > 0) && (
        <section id="que-incluye" className="scroll-mt-16 space-y-5 pt-12">
          <h2 className={titleClass}>Qué incluye</h2>
          <div className="rounded-2xl border border-white/10 bg-[#1c1c1e] px-4 py-5 sm:px-6">
            {incluye.length > 0 && (
              <div>
                <p className="mb-4 text-xs font-bold uppercase tracking-[.16em] text-emerald-400">Incluido</p>
                <ul className="space-y-3.5">
                  {incluye.map((item) => (
                    <li key={item} className="flex items-start gap-3 text-sm leading-relaxed text-zinc-200">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" /><span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {noIncluye.length > 0 && (
              <div className="mt-6 border-t border-white/10 pt-5">
                <p className="mb-3 text-xs font-bold uppercase tracking-[.16em] text-zinc-400">No incluido</p>
                <ul className="space-y-2.5">
                  {noIncluye.map((item) => (
                    <li key={item} className="flex items-start gap-3 text-sm text-zinc-400">
                      <X className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}


      {!!config.kit?.items?.length && (
        <section id="kit" className="scroll-mt-16 space-y-4 pt-12">
          <div>
            <h2 className={titleClass}>{config.kit.title || "Kit del Conquistador"}</h2>
            <p className="mt-2 text-sm text-zinc-400">Tu equipamiento oficial para el viaje.</p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {([
              { name: "Jersey", Icon: Shirt },
              { name: "Bolso", Icon: ShoppingBag },
              { name: "Caramañola", Icon: CupSoda },
            ] as const).map(({ name, Icon }) => (
              <div key={name} className="flex min-h-28 flex-col items-center justify-center gap-3 rounded-xl border border-white/10 bg-[#1c1c1e] px-2 py-4 text-center sm:min-h-36">
                <Icon className="h-8 w-8 text-[#ff5754] sm:h-10 sm:w-10" strokeWidth={1.7} aria-hidden="true" />
                <span className="font-heading text-sm font-bold uppercase tracking-wide text-white sm:text-base">{name}</span>
              </div>
            ))}
          </div>
          {config.kit.note && (
            <p className="text-xs leading-relaxed text-zinc-400">{config.kit.note}</p>
          )}
        </section>
      )}

      {config.preparation && (
        <section id="preparacion" className="scroll-mt-16 pt-10">
          <div className="rounded-2xl border border-[#e73531]/25 bg-gradient-to-b from-[#2a171b] to-[#1c1c1e] p-5 sm:p-7">
            <p className="text-xs font-semibold uppercase tracking-[.14em] text-[#ff5754]">Preparación específica Reybaud</p>
            <p className="mt-3 font-heading text-2xl font-black uppercase leading-tight text-white sm:text-3xl">{config.preparation.quote}</p>
            {config.preparation.body && (
              <details className="group mt-5">
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-lg border border-[#e73531] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#e73531]/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff5754] [&::-webkit-details-marker]:hidden">
                  <span>Cómo nos preparamos</span>
                  <ChevronDown className="h-5 w-5 shrink-0 text-[#ff5754] transition-transform group-open:rotate-180" aria-hidden="true" />
                </summary>
                <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-zinc-300">{config.preparation.body}</p>
              </details>
            )}
            {config.individual_prep && (
              <p className="mt-4 text-xs leading-relaxed text-zinc-300">
                Preparación individual opcional disponible como servicio adicional, con costo aparte.
              </p>
            )}
          </div>
        </section>
      )}

      {(base || packagesCta) && (
        <section id="precio" className="scroll-mt-16 space-y-4 pt-7">
          {base?.sena != null && <p className="text-sm text-zinc-300">Seña de {formatPrice(Number(base.sena), base.currency)} por persona. Saldo en cuotas.</p>}
          {packagesCta && <div>{packagesCta}</div>}
          {isDraftPreview && <p className="text-[11px] text-zinc-500">Vista previa interna: las reservas permanecen desactivadas.</p>}
        </section>
      )}

      {terms.length > 0 && (
        <section id="condiciones" className="scroll-mt-16 space-y-5 pt-12">
          <h2 className={titleClass}>Condiciones</h2>
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#1c1c1e] divide-y divide-white/10">
            {terms.map(([title, body], i) => (
              <details key={title} className="group p-4 sm:p-5" open={i === 0 && title === "Política de seña" ? true : undefined}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-heading text-sm font-bold uppercase tracking-wide sm:text-base">
                  {title}<ChevronDown className="h-5 w-5 shrink-0 text-zinc-400 transition-transform group-open:rotate-180" aria-hidden="true" />
                </summary>
                <p className="pt-3 text-sm leading-relaxed text-zinc-400 whitespace-pre-line">{body}</p>
              </details>
            ))}
            {reglamento?.reglamento_url && (
              <a href={reglamento.reglamento_url} target="_blank" rel="noopener noreferrer" className="block p-4 text-sm underline">Ver reglamento completo</a>
            )}
          </div>
        </section>
      )}
      {faq && <section id="preguntas" className="space-y-2 pt-10"><h2 className={titleClass}>Preguntas frecuentes</h2><p className="whitespace-pre-line text-sm leading-relaxed text-zinc-400">{faq}</p></section>}
    </div>
  );
}
