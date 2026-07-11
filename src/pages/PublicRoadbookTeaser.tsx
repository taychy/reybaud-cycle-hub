import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Map, MapPin, Clock, MessageCircle, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { normalizeRoadbook, Roadbook } from "@/lib/roadbook";
import { buildWhatsAppUrl } from "@/lib/contactInfo";

type State =
  | { status: "loading" }
  | { status: "not_found" }
  | { status: "expired"; nombre?: string; eventTitle?: string }
  | {
      status: "ok";
      nombre: string;
      apellido: string;
      event: { id: string; titulo: string; imagen_url?: string | null; fecha_inicio?: string | null; fecha_fin?: string | null };
      roadbook: Roadbook;
    };

const ExpiredView = ({ nombre, eventTitle }: { nombre?: string; eventTitle?: string }) => {
  const msg = eventTitle
    ? `Hola! Vi el roadbook de ${eventTitle} pero el link me venció. ¿Me podés mandar la info actualizada?`
    : "Hola! El link de roadbook que me pasaron venció. ¿Me podés mandar la info actualizada?";
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-md text-center space-y-5">
        <div className="w-16 h-16 rounded-full bg-destructive/10 border border-destructive/30 flex items-center justify-center mx-auto">
          <Clock className="w-8 h-8 text-destructive" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-heading font-bold">Este link venció</h1>
          <p className="text-sm text-muted-foreground">
            {nombre ? `${nombre}, ` : ""}escribinos y te mandamos la info actualizada del camp.
          </p>
        </div>
        <div className="flex flex-col gap-2 pt-2">
          <a href={buildWhatsAppUrl(msg)} target="_blank" rel="noreferrer">
            <Button className="w-full" size="lg">
              <MessageCircle className="w-4 h-4 mr-2" /> Hablar por WhatsApp
            </Button>
          </a>
          <a href="mailto:hola@reybaud-app.com?subject=Roadbook%20camp">
            <Button variant="outline" className="w-full" size="lg">
              <Mail className="w-4 h-4 mr-2" /> Escribir por email
            </Button>
          </a>
        </div>
      </div>
    </div>
  );
};

const PublicRoadbookTeaser = () => {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    if (!token) return;
    (async () => {
      const { data, error } = await supabase.rpc("get_prospect_roadbook" as any, { _token: token });
      if (error || !data) return setState({ status: "not_found" });
      const d = data as any;
      if (d.status === "not_found") return setState({ status: "not_found" });
      if (d.status === "expired") return setState({ status: "expired", nombre: d.nombre, eventTitle: d.event?.titulo });
      setState({
        status: "ok",
        nombre: d.nombre,
        apellido: d.apellido,
        event: d.event,
        roadbook: normalizeRoadbook(d.roadbook),
      });
    })();
  }, [token]);

  if (state.status === "loading") {
    return <div className="min-h-screen bg-background flex items-center justify-center text-sm text-muted-foreground">Cargando…</div>;
  }
  if (state.status === "not_found") {
    return <ExpiredView />;
  }
  if (state.status === "expired") {
    return <ExpiredView nombre={state.nombre} eventTitle={state.eventTitle} />;
  }

  const { event, roadbook: rb, nombre } = state;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Hero */}
      <div className="relative h-56 sm:h-72 w-full overflow-hidden border-b">
        {event.imagen_url ? (
          <img src={event.imagen_url} alt={event.titulo} className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-primary/30 to-background" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
        <div className="relative h-full max-w-3xl mx-auto px-4 flex flex-col justify-end pb-5">
          <div className="text-[10px] tracking-[0.22em] uppercase text-primary font-heading mb-1">Roadbook · Vista teaser</div>
          <h1 className="font-heading font-bold text-2xl sm:text-3xl">{event.titulo}</h1>
          {rb.fechas_label && <p className="text-sm text-muted-foreground mt-1">{rb.fechas_label}</p>}
        </div>
      </div>

      <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-5">
        <p className="text-sm text-muted-foreground">
          Hola {nombre}, este es el resumen del viaje. Cuando reserves te compartimos el detalle completo (hoteles, GPX, etc.).
        </p>

        {rb.intro && (
          <div className="rounded-xl border p-4 bg-card">
            <p className="text-sm leading-relaxed">{rb.intro}</p>
          </div>
        )}

        {(rb.fechas_label || rb.recorrido_label) && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
            <div className="text-[10px] uppercase tracking-[0.22em] text-primary font-heading">Fechas</div>
            {rb.fechas_label && <div className="text-base font-semibold mt-1">{rb.fechas_label}</div>}
            {rb.recorrido_label && (
              <div className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" /> {rb.recorrido_label}
              </div>
            )}
          </div>
        )}

        {/* Itinerario teaser */}
        {rb.dias.length > 0 && (
          <div className="rounded-xl border p-4 bg-card space-y-3">
            <div className="flex items-center gap-2">
              <Map className="w-4 h-4 text-primary" />
              <h2 className="font-heading text-sm uppercase tracking-wide">Itinerario · {rb.dias.length} días</h2>
            </div>
            <div className="space-y-2">
              {rb.dias.map((d, i) => (
                <div key={i} className="rounded-lg border p-3 flex items-start gap-3 bg-muted/10">
                  <div className="w-8 h-8 rounded-md bg-primary/10 border border-primary/30 flex items-center justify-center text-primary font-heading font-bold text-sm shrink-0">
                    {d.numero || i + 1}
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="text-sm font-medium">{d.titulo || "—"}</div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                      {d.fecha && <span>{d.fecha}</span>}
                      {d.km && d.km !== "—" && <span className="text-cyan-500 font-medium">{d.km} km</span>}
                      {d.desnivel && d.desnivel !== "—" && <span>↑ {d.desnivel}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Secciones */}
        {(["bienvenida", "clima", "salida"] as const).map((key) => {
          const s = rb[key];
          if (!s?.enabled || !s.contenido) return null;
          return (
            <div key={key} className="rounded-xl border p-4 bg-card space-y-2">
              <div className="text-[10px] uppercase tracking-[0.22em] text-primary font-heading">{s.titulo}</div>
              <p className="text-sm whitespace-pre-line leading-relaxed">{s.contenido}</p>
            </div>
          );
        })}

        {/* CTA de contacto */}
        <div className="rounded-xl border p-5 bg-card text-center space-y-3">
          <div className="font-heading text-sm uppercase tracking-wide">¿Te interesa?</div>
          <p className="text-sm text-muted-foreground">
            Escribinos para reservar tu lugar o resolver cualquier duda.
          </p>
          <a
            href={buildWhatsAppUrl(`Hola! Vi el roadbook de ${event.titulo} y me gustaría más info.`)}
            target="_blank"
            rel="noreferrer"
          >
            <Button size="lg" className="w-full sm:w-auto">
              <MessageCircle className="w-4 h-4 mr-2" /> Hablar por WhatsApp
            </Button>
          </a>
        </div>

        <div className="text-center text-[11px] text-muted-foreground pt-4">
          Reybaud Ciclismo · Vista privada para prospectos
        </div>
      </div>
    </div>
  );
};

export default PublicRoadbookTeaser;
