import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatPrice } from "@/lib/currency";

/**
 * Bloque de landing premium configurable por viaje desde `events.metadata.premium_landing`.
 * Solo se renderiza si el viaje lo tiene configurado; no altera otras landings.
 */
export interface PremiumLandingConfig {
  headline?: string;
  subheadline?: string;
  stats?: { value: string; label: string }[];
  note?: string;
  bikes?: { name: string; spec?: string; image?: string }[];
  preparation?: { quote?: string; body?: string; proposal_internal?: string[] };
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

export default function EventPremiumLanding({ eventId, config, itinerario, isDraftPreview = false }: { eventId: string; config: PremiumLandingConfig; itinerario: ItinerarioItem[]; isDraftPreview?: boolean }) {
  const [pkgs, setPkgs] = useState<Pkg[]>([]);

  useEffect(() => {
    (async () => {
      const { data: p } = await supabase.from("event_packages").select("id,nombre,sena,currency,sort_order").eq("event_id", eventId).eq("activo", true).order("sort_order");
      if (!p?.length) return;
      const { data: s } = await supabase.from("event_package_price_stages").select("package_id,nombre,precio,currency,vigente_hasta,sort_order").in("package_id", p.map((x: any) => x.id)).eq("activo", true).order("sort_order");
      setPkgs(p.map((x: any) => ({ ...x, stages: (s || []).filter((st: any) => st.package_id === x.id) })));
    })();
  }, [eventId]);

  const nav = [
    ["experiencia", "Experiencia"],
    itinerario.length ? ["recorrido", "Recorrido"] : null,
    config.bikes?.length ? ["bicicletas", "Bicicletas"] : null,
    ["que-incluye", "Qué incluye"],
    config.preparation ? ["preparacion", "Preparación"] : null,
    config.kit?.items?.length ? ["kit", "Kit"] : null,
    pkgs.length ? ["precio", "Precio"] : null,
  ].filter(Boolean) as [string, string][];

  const base = pkgs[0];
  const extra = pkgs[1];

  return (
    <div className="space-y-4">
      <nav className="sticky top-0 z-20 -mx-4 px-4 py-2 bg-background/90 backdrop-blur border-b border-border overflow-x-auto">
        <div className="flex gap-4 text-xs font-heading uppercase tracking-wider whitespace-nowrap">
          {nav.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="text-muted-foreground hover:text-foreground transition-colors">{label}</a>
          ))}
        </div>
      </nav>

      <section id="experiencia" className="scroll-mt-14 space-y-3 py-2">
        {config.headline && (
          <h2 className="font-heading font-bold text-3xl md:text-4xl uppercase leading-none text-foreground">
            {config.headline.split(" ").slice(0, -1).join(" ")} <span className={accent}>{config.headline.split(" ").slice(-1)}</span>
          </h2>
        )}
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
      </section>

      {itinerario.length > 0 && (
        <section id="recorrido" className="scroll-mt-14 glass-card rounded-xl p-5 space-y-4">
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
                  <img src={b.image} alt={b.name} loading="lazy" className="w-full aspect-[16/9] object-cover" />
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
                  {ext && <p className="text-xs text-muted-foreground">{extra!.nombre}: <span className="text-foreground">{formatPrice(ext.precio, ext.currency)}</span></p>}
                  <p className="text-[11px] text-muted-foreground pt-1 border-t border-border">{untilLabel(st.vigente_hasta)}</p>
                </div>
              );
            })}
          </div>
          {base.sena ? <p className="text-xs text-muted-foreground">Seña: {formatPrice(base.sena, base.currency)} por persona. Saldo en cuotas.</p> : null}
        </section>
      )}
    </div>
  );
}
