import { useEffect, useState, type ReactNode } from "react";
import type { ReglamentoFields } from "@/lib/eventReglamentoDefaults";
import { supabase } from "@/integrations/supabase/client";
import { formatPrice } from "@/lib/currency";
import { buildWhatsAppUrl } from "@/lib/contactInfo";
import { Button } from "@/components/ui/button";
import EventDriveVideo, { type EventDriveVideoConfig } from "./EventDriveVideo";
import AlpineEditorialLanding from "./AlpineEditorialLanding";

/**
 * Bloque de landing premium configurable por viaje desde `events.metadata.premium_landing`.
 * Solo se renderiza si el viaje lo tiene configurado; no altera otras landings.
 */
export interface PremiumLandingConfig {
  headline?: string;
  hero_image?: string;
  layout_variant?: "editorial_alpine";
  subheadline?: string;
  stats?: { value: string; label: string }[];
  note?: string;
  video?: EventDriveVideoConfig;
  bikes?: { name: string; spec?: string; image?: string }[];
  preparation?: { quote?: string; body?: string; proposal_internal?: string[] };
  /** Servicio opcional existente (asesoría personalizada); solo consulta, nunca compra desde el viaje. */
  individual_prep?: { title?: string; body?: string; cta_label?: string; whatsapp_message?: string };
  kit?: { title?: string; items: string[]; promo_until?: string; note?: string };
}

interface ItinerarioItem { dia?: string; descripcion?: string }
interface Stage { nombre: string; precio: number; currency: string; vigente_hasta: string | null; sort_order: number }
interface Pkg { id: string; nombre: string; sena: number | null; currency: string; stages: Stage[] }

export function getPremiumLanding(metadata: any): PremiumLandingConfig | null {
  const c = metadata?.premium_landing;
  return c && typeof c === "object" ? (c as PremiumLandingConfig) : null;
}

const accent = "text-[hsl(var(--alpine-red))]";

function untilLabel(iso: string | null) {
  if (!iso || iso.startsWith("2099")) return "Desde la etapa final";
  // vigente_hasta guardado en UTC al cierre del día en Argentina: tomar fecha AR
  const d = new Date(iso);
  const ar = new Date(d.getTime() - 3 * 3600 * 1000);
  const [y, m, day] = ar.toISOString().slice(0, 10).split("-");
  return `Hasta ${day}/${m}/${y}`;
}

interface Props {
  eventId: string;
  config: PremiumLandingConfig;
  itinerario: ItinerarioItem[];
  isDraftPreview?: boolean;
  /** Datos funcionales del evento, reubicados en secciones premium (sin duplicar bloques legacy). */
  description?: string | null;
  incluye?: string[];
  noIncluye?: string[];
  reglamento?: ReglamentoFields;
  packagesCta?: ReactNode;
  faq?: string;
}

export default function EventPremiumLanding({ eventId, config, itinerario, isDraftPreview = false, description, incluye = [], noIncluye = [], reglamento, packagesCta, faq }: Props) {
  const [pkgs, setPkgs] = useState<Pkg[]>([]);

  useEffect(() => {
    (async () => {
      const { data: p } = await supabase.from("event_packages").select("id,nombre,sena,currency,sort_order").eq("event_id", eventId).eq("activo", true).order("sort_order");
      if (!p?.length) return;
      const { data: s } = await supabase.from("event_package_price_stages").select("package_id,nombre,precio,currency,vigente_hasta,sort_order").in("package_id", p.map((x: any) => x.id)).eq("activo", true).order("sort_order");
      setPkgs(p.map((x: any) => ({ ...x, stages: (s || []).filter((st: any) => st.package_id === x.id) })));
    })();
  }, [eventId]);

  const terms = reglamento ? ([
    ["Política de seña", reglamento.politica_sena],
    ["Política de pagos", reglamento.politica_pagos],
    ["Política de cancelación", reglamento.politica_cancelacion],
    ["Reglamento", reglamento.reglamento_texto],
  ].filter(([, b]) => !!b) as [string, string][]) : [];
  const hasTerms = terms.length > 0 || !!reglamento?.reglamento_url;

  const nav = [
    ["experiencia", "Experiencia"],
    itinerario.length ? ["recorrido", "Recorrido"] : null,
    config.bikes?.length ? ["bicicletas", "Bicicletas"] : null,
    incluye.length || noIncluye.length ? ["que-incluye", "Qué incluye"] : null,
    config.preparation ? ["preparacion", "Preparación"] : null,
    config.individual_prep ? ["preparacion-individual", "Individual"] : null,
    config.kit?.items?.length ? ["kit", "Kit"] : null,
    pkgs.length ? ["precio", "Precio"] : null,
    hasTerms ? ["condiciones", "Condiciones"] : null,
    faq ? ["preguntas", "Preguntas"] : null,
  ].filter(Boolean) as [string, string][];

  const base = pkgs[0];
  const extra = pkgs[1];

  if (config.layout_variant === "editorial_alpine") {
    return (
      <AlpineEditorialLanding
        config={config}
        itinerario={itinerario}
        incluye={incluye}
        noIncluye={noIncluye}
        reglamento={reglamento}
        packagesCta={packagesCta}
        faq={faq}
        base={base}
        isDraftPreview={isDraftPreview}
      />
    );
  }

  return (
    <div className="space-y-4">
      <nav aria-label="Secciones del viaje" className="sticky top-0 z-20 -mx-4 px-4 py-2 bg-background/90 backdrop-blur border-b border-border overflow-x-auto">
        <div className="flex gap-4 text-xs font-heading uppercase tracking-wider whitespace-nowrap">
          {nav.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="py-2 text-muted-foreground hover:text-foreground transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">{label}</a>
          ))}
        </div>
      </nav>

      <section id="experiencia" className="scroll-mt-14 space-y-3 py-2">
        {config.subheadline && <p className="text-sm text-muted-foreground uppercase tracking-[0.2em]">{config.subheadline}</p>}
        {!!config.stats?.length && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border rounded-xl overflow-hidden border border-border">
            {config.stats.map((s) => (
              <div key={s.label} className="bg-card p-4">
                <p className="font-heading font-bold text-2xl text-foreground">{s.value}</p>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
        )}
        {config.note && <p className="text-[11px] text-muted-foreground">{config.note}</p>}
        {description && (
          <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-line border-l-2 border-[hsl(var(--alpine-red))] pl-4">{description}</p>
        )}
      </section>

      {config.video && <EventDriveVideo video={config.video} />}

      {itinerario.length > 0 && (
        <section id="recorrido" className="scroll-mt-14 border-y border-border py-6 space-y-4">
          <h3 className="font-heading font-semibold text-sm uppercase tracking-wide text-foreground">Recorrido</h3>
          <ol className="relative border-l border-border ml-3 space-y-5">
            {itinerario.map((it, i) => (
              <li key={i} className="pl-5 relative">
                <span className="absolute -left-[13px] top-0 w-6 h-6 rounded-full bg-[hsl(var(--alpine-red))] text-[10px] font-heading font-bold flex items-center justify-center text-primary-foreground">{i + 1}</span>
                <p className="text-xs font-heading font-semibold uppercase tracking-wide text-foreground">{it.dia}</p>
                <p className="text-sm text-muted-foreground">{it.descripcion}</p>
              </li>
            ))}
          </ol>
        </section>
      )}

      {!!config.bikes?.length && (
        <section id="bicicletas" className="scroll-mt-14 space-y-3">
          <h3 className="font-heading font-semibold text-sm uppercase tracking-wide text-foreground">Bicicletas</h3>
          <div className="grid md:grid-cols-2 gap-3">
            {config.bikes.map((b) => (
              <div key={b.name} className="glass-card rounded-xl overflow-hidden">
                {b.image ? (
                  <div className="w-full aspect-[16/10] bg-white p-3 sm:p-4">
                    <img src={b.image} alt={`Bicicleta de referencia: ${b.name}`} loading="lazy" className="h-full w-full object-contain" />
                  </div>
                ) : isDraftPreview ? (
                  <div className="w-full aspect-[16/9] flex items-center justify-center border-b border-dashed border-border text-[11px] uppercase tracking-wider text-muted-foreground">
                    Foto pendiente de autorización
                  </div>
                ) : null}
                <div className="p-4 border-t-2 border-[hsl(var(--alpine-red))]">
                  <p className="font-heading font-bold uppercase text-foreground">{b.name}</p>
                  {b.spec && <p className="text-sm text-muted-foreground">{b.spec}</p>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {(incluye.length > 0 || noIncluye.length > 0) && (
        <section id="que-incluye" className="scroll-mt-14 space-y-3" aria-labelledby="que-incluye-title">
          <h3 id="que-incluye-title" className="font-heading font-semibold text-sm uppercase tracking-wide text-foreground">Qué incluye</h3>
          <div className="grid md:grid-cols-2 gap-px bg-border rounded-xl overflow-hidden border border-border">
            {incluye.length > 0 && (
              <div className="bg-card p-5 space-y-3">
                <p className={`text-[11px] font-heading uppercase tracking-[0.2em] ${accent}`}>Incluido</p>
                <ul className="space-y-2">
                  {incluye.map((x) => (
                    <li key={x} className="flex gap-3 text-sm text-foreground"><span aria-hidden className={accent}>—</span><span>{x}</span></li>
                  ))}
                </ul>
              </div>
            )}
            {noIncluye.length > 0 && (
              <div className="bg-card p-5 space-y-3">
                <p className="text-[11px] font-heading uppercase tracking-[0.2em] text-muted-foreground">No incluido</p>
                <ul className="space-y-2">
                  {noIncluye.map((x) => (
                    <li key={x} className="flex gap-3 text-sm text-muted-foreground"><span aria-hidden>×</span><span>{x}</span></li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}

      {config.preparation && (
        <section id="preparacion" className="scroll-mt-14 rounded-xl p-6 bg-card border-l-4 border-[hsl(var(--alpine-red))] space-y-3">
          <p className={`text-[11px] font-heading uppercase tracking-[0.2em] ${accent}`}>Preparación específica Reybaud</p>
          {config.preparation.quote && <p className="font-heading text-xl md:text-2xl leading-snug text-foreground">{config.preparation.quote}</p>}
          {config.preparation.body && <p className="text-sm text-muted-foreground">{config.preparation.body}</p>}
          {isDraftPreview && !!config.preparation.proposal_internal?.length && (
            <div className="rounded-lg border border-dashed border-border p-3 space-y-2">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Propuesta a confirmar — interno, no visible al público</p>
              <ul className="grid sm:grid-cols-2 gap-2">
                {config.preparation.proposal_internal.map((x) => (
                  <li key={x} className="text-sm text-foreground/80 flex gap-2"><span className={accent}>—</span>{x}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {config.individual_prep && (
        <section id="preparacion-individual" className="scroll-mt-14 glass-card rounded-xl p-5 space-y-3 border border-dashed border-border">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-heading font-semibold text-sm uppercase tracking-wide text-foreground">{config.individual_prep.title || "Preparación individual (opcional)"}</h3>
            <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border border-border text-muted-foreground">Servicio adicional · no incluido en el viaje</span>
          </div>
          {config.individual_prep.body && <p className="text-sm text-muted-foreground">{config.individual_prep.body}</p>}
          <Button asChild variant="outline" className="h-auto whitespace-normal text-center border-primary px-4 py-3 text-xs font-heading uppercase tracking-wide hover:bg-primary/10 hover:text-foreground">
          <a
            href={buildWhatsAppUrl(config.individual_prep.whatsapp_message || "Hola, quiero consultar por el entrenamiento personalizado.")}
            target="_blank"
            rel="noopener noreferrer"
          >
            {config.individual_prep.cta_label || "Consultar entrenamiento personalizado"}
          </a>
          </Button>
        </section>
      )}

      {!!config.kit?.items?.length && (
        <section id="kit" className="scroll-mt-14 glass-card rounded-xl p-5 space-y-4">
          <div className="space-y-1">
            <p className={`text-[11px] font-heading uppercase tracking-[0.2em] ${accent}`}>Beneficio de lanzamiento</p>
            <h3 className="font-heading font-semibold text-sm uppercase tracking-wide text-foreground">{config.kit.title || "Kit del Conquistador"}</h3>
          </div>
          <ul className="grid sm:grid-cols-2 gap-2">
            {config.kit.items.map((item, i) => (
              <li key={i} className="rounded-lg border border-border bg-card p-3 flex items-start gap-3">
                <span className="w-6 h-6 shrink-0 rounded-full bg-[hsl(var(--alpine-red))] text-[10px] font-heading font-bold flex items-center justify-center text-primary-foreground">{i + 1}</span>
                <span className="text-sm text-foreground">{item}</span>
              </li>
            ))}
          </ul>
          {config.kit.promo_until && (
            <p className="text-sm text-foreground">
              Incluido <span className={`font-heading font-semibold ${accent}`}>sin costo adicional</span> para reservas efectuadas hasta el {config.kit.promo_until}.
            </p>
          )}
          {config.kit.note && <p className="text-[11px] text-muted-foreground">{config.kit.note}</p>}
          {isDraftPreview && (
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground border border-dashed border-border rounded-lg p-2">
              Imágenes ilustrativas pendientes — no hay fotos definitivas de los productos
            </p>
          )}
        </section>
      )}

      {base && base.stages.length > 0 && (
        <section id="precio" className="scroll-mt-14 space-y-3">
          <h3 className="font-heading font-semibold text-sm uppercase tracking-wide text-foreground">Precio por persona</h3>
          <div className="grid md:grid-cols-3 gap-3">
            {base.stages.map((st, i) => {
              const ext = extra?.stages[i];
              return (
                <div key={st.nombre} className={`rounded-xl p-5 bg-card border ${i === 0 ? "border-[hsl(var(--alpine-red))]" : "border-border"} space-y-2`}>
                  <p className={`text-[11px] font-heading uppercase tracking-wider ${i === 0 ? accent : "text-muted-foreground"}`}>{st.nombre}</p>
                  <p className="font-heading font-bold text-2xl text-foreground">{formatPrice(st.precio, st.currency)}</p>
                  <p className="text-xs text-muted-foreground">{base.nombre}</p>
                  {ext && extra && <p className="text-xs text-muted-foreground">{extra.nombre}: <span className="text-foreground">{formatPrice(ext.precio, ext.currency)}</span></p>}
                  <p className="text-[11px] text-muted-foreground pt-1 border-t border-border">{untilLabel(st.vigente_hasta)}</p>
                </div>
              );
            })}
          </div>
          {base.sena ? <p className="text-xs text-muted-foreground">Seña: {formatPrice(base.sena, base.currency)} por persona. Saldo en cuotas.</p> : null}
          {packagesCta && <div className="pt-2">{packagesCta}</div>}
        </section>
      )}

      {hasTerms && (
        <section id="condiciones" className="scroll-mt-14 space-y-3" aria-labelledby="condiciones-title">
          <h3 id="condiciones-title" className="font-heading font-semibold text-sm uppercase tracking-wide text-foreground">Condiciones</h3>
          <div className="rounded-xl border border-border bg-card divide-y divide-border">
            {terms.map(([title, body]) => (
              <details key={title} className="group p-4">
                <summary className="cursor-pointer list-none flex items-center justify-between text-xs font-heading uppercase tracking-wider text-foreground">
                  {title}<span aria-hidden className={`${accent} group-open:rotate-45 transition-transform`}>+</span>
                </summary>
                <p className="pt-3 text-sm text-muted-foreground whitespace-pre-line leading-relaxed">{body}</p>
              </details>
            ))}
            {reglamento?.reglamento_url && (
              <a href={reglamento.reglamento_url} target="_blank" rel="noopener noreferrer" className="block p-4 text-xs font-heading uppercase tracking-wider text-foreground hover:bg-muted/20">Ver reglamento completo</a>
            )}
          </div>
        </section>
      )}
      {!hasTerms && isDraftPreview && (
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground border border-dashed border-border rounded-lg p-2">
          Interno: condiciones de seña, pagos y cancelación aún no cargadas para este viaje
        </p>
      )}
      {faq && <section id="preguntas" className="scroll-mt-14 border-t border-border py-5 space-y-3"><h3 className="font-heading uppercase text-sm text-foreground">Preguntas frecuentes</h3><p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">{faq}</p></section>}
    </div>
  );
}
