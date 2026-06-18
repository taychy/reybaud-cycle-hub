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
        <div className="rounded-lg border border-border/40 overflow-hidden">
          {rb.dias.map((d, i) => (
            <div key={i} className={`grid grid-cols-12 gap-2 px-3 py-2 text-xs ${i % 2 === 0 ? "bg-muted/20" : "bg-muted/10"}`}>
              <div className="col-span-1 text-primary font-heading font-semibold">{d.numero}</div>
              <div className="col-span-5 truncate">{d.titulo}</div>
              <div className="col-span-2 text-muted-foreground whitespace-nowrap">{d.fecha}</div>
              <div className="col-span-2 text-cyan text-right whitespace-nowrap">{d.km}{d.km && d.km !== "—" ? " km" : ""}</div>
              <div className="col-span-2 text-right">
                {d.gpx_url ? (
                  <a href={d.gpx_url} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline">
                    GPX <ExternalLink className="w-3 h-3" />
                  </a>
                ) : (
                  <span className="text-muted-foreground">{d.desnivel}</span>
                )}
              </div>
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
