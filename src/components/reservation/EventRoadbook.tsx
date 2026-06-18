import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Map, ExternalLink, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Roadbook, normalizeRoadbook } from "@/lib/roadbook";

interface Props { eventId: string }

const EventRoadbook = ({ eventId }: Props) => {
  const [rb, setRb] = useState<Roadbook | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("events" as any)
      .select("roadbook")
      .eq("id", eventId)
      .maybeSingle()
      .then(({ data }) => {
        const raw = (data as any)?.roadbook;
        if (raw) setRb(normalizeRoadbook(raw));
        setLoading(false);
      });
  }, [eventId]);

  if (loading || !rb) return null;

  // Si no hay nada útil cargado, no renderizamos.
  const hasItin = rb.dias?.some((d) => d.titulo || d.fecha);
  if (!hasItin && !rb.intro) return null;

  return (
    <div className="glass-card rounded-xl p-5 space-y-4 animate-fade-in">
      <div className="flex items-center gap-2">
        <Map className="w-5 h-5 text-primary" />
        <h3 className="font-heading font-semibold text-sm text-foreground uppercase tracking-wide">Roadbook</h3>
      </div>

      {rb.intro && <p className="text-xs text-muted-foreground leading-relaxed">{rb.intro}</p>}

      {(rb.fechas_label || rb.recorrido_label) && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
          <div className="text-[10px] uppercase tracking-[0.22em] text-primary font-heading">Fechas</div>
          {rb.fechas_label && <div className="text-sm font-semibold mt-0.5">{rb.fechas_label}</div>}
          {rb.recorrido_label && <div className="text-xs text-muted-foreground mt-0.5">{rb.recorrido_label}</div>}
        </div>
      )}

      {/* Itinerario */}
      <div className="space-y-1.5">
        <div className="text-[10px] uppercase tracking-[0.18em] text-primary font-heading flex items-center gap-1.5">
          <span className="w-4 h-px bg-primary inline-block" /> Itinerario
        </div>
        <div className="space-y-1.5">
          {rb.dias.map((d, i) => (
            <div
              key={i}
              className="rounded-lg border border-border/40 bg-muted/10 p-3 flex items-start gap-3"
            >
              <div className="shrink-0 w-8 h-8 rounded-md bg-primary/10 border border-primary/30 flex items-center justify-center text-primary font-heading font-bold text-sm">
                {d.numero}
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                <div className="text-sm font-medium text-foreground leading-tight break-words">
                  {d.titulo || "—"}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                  {d.fecha && <span>{d.fecha}</span>}
                  {d.km && d.km !== "—" && (
                    <span className="text-cyan font-medium">{d.km} km</span>
                  )}
                  {d.desnivel && d.desnivel !== "—" && (
                    <span>↑ {d.desnivel}</span>
                  )}
                </div>
                {d.hotel && (
                  <div className="text-[11px] text-muted-foreground/80 flex items-center gap-1 truncate">
                    <MapPin className="w-3 h-3 text-cyan shrink-0" />
                    <span className="truncate">{d.hotel}</span>
                  </div>
                )}
              </div>
              {d.gpx_url && (
                <a
                  href={d.gpx_url}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold text-primary border border-primary/30 hover:bg-primary/10 rounded-md px-2 py-1.5 self-center"
                >
                  GPX <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Bienvenida / Clima / Salida */}
      {(["bienvenida", "clima", "salida"] as const).map((key) => {
        const s = rb[key];
        if (!s.enabled || !s.contenido) return null;
        return (
          <div key={key} className="rounded-lg border border-border/40 bg-muted/10 p-3 space-y-1">
            <div className="text-[10px] uppercase tracking-[0.18em] text-primary font-heading">{s.titulo}</div>
            <p className="text-xs text-foreground/90 whitespace-pre-line leading-relaxed">{s.contenido}</p>
          </div>
        );
      })}

      {/* Alojamientos */}
      {rb.alojamientos?.some((h) => h.nombre) && (
        <div className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-[0.18em] text-primary font-heading flex items-center gap-1.5">
            <span className="w-4 h-px bg-primary inline-block" /> Alojamientos
          </div>
          <div className="space-y-1.5">
            {rb.alojamientos.filter((h) => h.nombre).map((h, i) => {
              const inner = (
                <>
                  <div className="text-[10px] uppercase tracking-[0.22em] text-cyan font-heading">{h.pais}</div>
                  <div className="text-sm font-medium flex items-center gap-1 mt-0.5">
                    <MapPin className="w-3.5 h-3.5 text-cyan" /> {h.nombre}
                    {h.url && <ExternalLink className="w-3 h-3 text-primary ml-auto" />}
                  </div>
                </>
              );
              const cls = "block rounded-lg border border-border/40 border-l-2 border-l-cyan bg-muted/10 p-2.5";
              return h.url ? (
                <a key={i} href={h.url} target="_blank" rel="noreferrer" className={cls}>{inner}</a>
              ) : (
                <div key={i} className={cls}>{inner}</div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default EventRoadbook;
