import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { CalendarDays, ChevronRight, Tag, ChevronDown, ChevronUp, ArrowLeft } from "lucide-react";
import logo from "@/assets/logo.png";

interface Event {
  id: string;
  title: string;
  description: string | null;
  date: string;
  start_time: string | null;
  end_time: string | null;
  type: string;
  is_active: boolean;
  visible_to_students: boolean;
}

const typeLabels: Record<string, string> = {
  record_hora: "Record",
  camp: "Camp",
  carrera: "Carrera",
  otro: "Evento",
};

const EventCard = ({ event, onClick }: { event: Event; onClick: () => void }) => {
  const d = new Date(event.date + "T12:00:00");
  const dayName = d.toLocaleDateString("es-AR", { weekday: "short" });
  const dayNum = d.getDate();
  const monthName = d.toLocaleDateString("es-AR", { month: "short" });

  return (
    <div
      className="glass-card rounded-xl p-4 flex items-center gap-4 cursor-pointer hover:border-primary/30 transition-colors"
      onClick={onClick}
    >
      <div className="flex flex-col items-center justify-center w-14 shrink-0">
        <span className="text-[10px] uppercase font-heading text-muted-foreground">{dayName}</span>
        <span className="text-2xl font-bold font-heading text-foreground leading-none">{dayNum}</span>
        <span className="text-[10px] uppercase font-heading text-muted-foreground">{monthName}</span>
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        <h3 className="font-heading font-semibold text-foreground truncate">{event.title}</h3>
        <span className="inline-block text-[10px] font-heading uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/15 text-primary">
          {typeLabels[event.type] || event.type}
        </span>
      </div>
      <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
    </div>
  );
};

const Eventos = () => {
  const navigate = useNavigate();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPast, setShowPast] = useState(false);

  useEffect(() => {
    supabase
      .from("events")
      .select("*")
      .eq("is_active", true)
      .order("date", { ascending: true })
      .then(({ data }) => {
        if (data) setEvents(data as Event[]);
        setLoading(false);
      });
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = events.filter((e) => e.date >= today);
  const past = events.filter((e) => e.date < today).reverse();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="flex items-center gap-3 px-5 pt-5 pb-2">
        <button onClick={() => navigate(-1)} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <img src={logo} alt="Ciclismo Reybaud" className="w-8 h-8" />
      </header>

      <main className="flex-1 px-4 pb-24">
        <div className="w-full max-w-md mx-auto space-y-5 animate-fade-in">
          <div className="text-center space-y-1 pt-2">
            <h1 className="text-xl font-heading font-semibold text-foreground">Eventos</h1>
            <p className="text-xs text-muted-foreground">Próximos y pasados</p>
          </div>

          {loading ? (
            <div className="text-center text-muted-foreground animate-pulse py-8">Cargando...</div>
          ) : (
            <>
              {/* Upcoming */}
              <div className="space-y-3">
                <h2 className="text-xs font-heading uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <CalendarDays className="w-3.5 h-3.5" /> Próximos
                </h2>
                {upcoming.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No hay más eventos próximos.</p>
                ) : (
                  upcoming.map((e) => (
                    <EventCard key={e.id} event={e} onClick={() => navigate(`/eventos/${e.id}`)} />
                  ))
                )}
              </div>

              {/* Past */}
              {past.length > 0 && (
                <div className="space-y-3">
                  <button
                    onClick={() => setShowPast(!showPast)}
                    className="text-xs font-heading uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 hover:text-foreground transition-colors"
                  >
                    <Tag className="w-3.5 h-3.5" /> Pasados ({past.length})
                    {showPast ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                  {showPast &&
                    past.map((e) => (
                      <EventCard key={e.id} event={e} onClick={() => navigate(`/eventos/${e.id}`)} />
                    ))}
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default Eventos;
