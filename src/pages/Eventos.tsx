import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CalendarDays,
  MapPin,
  Users,
  ChevronRight,
  SlidersHorizontal,
  ArrowLeft,
  X,
} from "lucide-react";
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
  image_url: string | null;
  location: string | null;
  price: number | null;
  currency: string;
  duration_days: number | null;
  duration_nights: number | null;
  max_capacity: number | null;
  spots_taken: number;
  level: string | null;
}

type TabFilter = "todos" | "escuela" | "viajes";

const escuelaTypes = ["record_hora", "carrera", "otro"];
const viajesTypes = ["camp", "viaje"];

const typeLabels: Record<string, string> = {
  record_hora: "Record",
  camp: "Camp",
  carrera: "Carrera",
  otro: "Evento",
  viaje: "Viaje",
};

const placeholderImages: Record<string, string> = {
  camp: "https://images.unsplash.com/photo-1541625602330-2277a4c46182?w=600&h=400&fit=crop",
  viaje: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600&h=400&fit=crop",
  carrera: "https://images.unsplash.com/photo-1517649763962-0c623066013b?w=600&h=400&fit=crop",
  record_hora: "https://images.unsplash.com/photo-1534787238916-9ba6764efd4f?w=600&h=400&fit=crop",
  otro: "https://images.unsplash.com/photo-1571188654248-7a89213915f7?w=600&h=400&fit=crop",
};

/* ─── Event Card ─── */
const EventCard = ({ event, onClick }: { event: Event; onClick: () => void }) => {
  const isPaid = event.price != null && event.price > 0;
  const spotsLeft =
    event.max_capacity != null ? event.max_capacity - event.spots_taken : null;
  const d = new Date(event.date + "T12:00:00");
  const dateStr = d.toLocaleDateString("es-AR", { day: "numeric", month: "short" });

  return (
    <div
      className="group rounded-2xl overflow-hidden bg-card border border-border/50 shadow-sm hover:shadow-md transition-all cursor-pointer"
      onClick={onClick}
    >
      {/* Image */}
      <div className="relative aspect-[4/3] overflow-hidden">
        <img
          src={event.image_url || placeholderImages[event.type] || placeholderImages.otro}
          alt={event.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          loading="lazy"
        />
        {/* Tag badge */}
        <div className="absolute top-2.5 left-2.5">
          {isPaid ? (
            <Badge className="bg-primary text-primary-foreground text-[10px] font-heading uppercase tracking-wider px-2.5 py-1 shadow-lg">
              Reservar
            </Badge>
          ) : (
            <Badge className="bg-accent text-accent-foreground text-[10px] font-heading uppercase tracking-wider px-2.5 py-1 shadow-lg">
              Gratuito
            </Badge>
          )}
        </div>
        {/* Duration pill */}
        {event.duration_days && (
          <div className="absolute bottom-2.5 left-2.5">
            <span className="bg-black/60 backdrop-blur-sm text-white text-[10px] font-heading px-2.5 py-1 rounded-full">
              {event.duration_days} día{event.duration_days > 1 ? "s" : ""}
              {event.duration_nights ? ` / ${event.duration_nights} noche${event.duration_nights > 1 ? "s" : ""}` : ""}
            </span>
          </div>
        )}
        {/* Type pill */}
        <div className="absolute top-2.5 right-2.5">
          <span className="bg-black/50 backdrop-blur-sm text-white text-[10px] font-heading uppercase tracking-wider px-2 py-0.5 rounded-full">
            {typeLabels[event.type] || event.type}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="p-3.5 space-y-2">
        <h3 className="font-heading font-semibold text-sm text-foreground leading-tight line-clamp-2">
          {event.title}
        </h3>

        <div className="flex flex-col gap-1">
          {event.location && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="w-3 h-3 text-primary shrink-0" />
              <span className="truncate">{event.location}</span>
            </span>
          )}
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarDays className="w-3 h-3 text-primary shrink-0" />
            {dateStr}
          </span>
        </div>

        {/* Level & Spots */}
        <div className="flex items-center gap-2 flex-wrap">
          {event.level && (
            <span className="text-[10px] font-heading uppercase tracking-wider px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
              {event.level}
            </span>
          )}
          {spotsLeft != null && (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Users className="w-3 h-3" />
              {spotsLeft > 0 ? `${spotsLeft} cupos` : "Agotado"}
            </span>
          )}
        </div>

        {/* Price + CTA */}
        <div className="flex items-end justify-between pt-1 border-t border-border/50">
          {isPaid ? (
            <div>
              <p className="text-[10px] text-muted-foreground">Precio por persona</p>
              <p className="text-lg font-bold font-heading text-primary leading-none">
                {event.currency === "USD" ? "US$" : event.currency === "EUR" ? "€" : "$"}{" "}
                {event.price!.toLocaleString("es-AR")}
              </p>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">Evento gratuito</span>
          )}
          <Button
            size="sm"
            variant={isPaid ? "gold" : "outline"}
            className="text-xs h-8 px-3"
            onClick={(e) => {
              e.stopPropagation();
              onClick();
            }}
          >
            {isPaid ? "Reservar" : "Ver detalle"}
            <ChevronRight className="w-3.5 h-3.5 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
};

/* ─── Featured Banner Carousel ─── */
const FeaturedBanner = ({ events, onSelect }: { events: Event[]; onSelect: (id: string) => void }) => {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (events.length <= 1) return;
    const interval = setInterval(() => setCurrent((p) => (p + 1) % events.length), 5000);
    return () => clearInterval(interval);
  }, [events.length]);

  if (events.length === 0) return null;
  const ev = events[current];

  return (
    <div
      className="relative rounded-2xl overflow-hidden cursor-pointer group"
      onClick={() => onSelect(ev.id)}
    >
      <div className="aspect-[2/1] md:aspect-[3/1]">
        <img
          src={ev.image_url || placeholderImages[ev.type] || placeholderImages.otro}
          alt={ev.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
      </div>
      <div className="absolute bottom-0 left-0 right-0 p-4 space-y-1">
        <Badge className="bg-primary text-primary-foreground text-[10px] font-heading uppercase">
          Destacado
        </Badge>
        <h2 className="text-white font-heading font-bold text-lg leading-tight">{ev.title}</h2>
        <div className="flex items-center gap-3 text-white/80 text-xs">
          {ev.location && (
            <span className="flex items-center gap-1">
              <MapPin className="w-3 h-3" /> {ev.location}
            </span>
          )}
          <span className="flex items-center gap-1">
            <CalendarDays className="w-3 h-3" />{" "}
            {new Date(ev.date + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "short" })}
          </span>
        </div>
      </div>
      {/* Dots */}
      {events.length > 1 && (
        <div className="absolute bottom-2 right-4 flex gap-1.5">
          {events.map((_, i) => (
            <button
              key={i}
              onClick={(e) => { e.stopPropagation(); setCurrent(i); }}
              className={`w-2 h-2 rounded-full transition-all ${i === current ? "bg-primary w-5" : "bg-white/50"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
};

/* ─── Filter Sheet ─── */
const FilterSheet = ({
  open,
  onClose,
  levelFilter,
  setLevelFilter,
  levels,
}: {
  open: boolean;
  onClose: () => void;
  levelFilter: string | null;
  setLevelFilter: (v: string | null) => void;
  levels: string[];
}) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md bg-card rounded-t-2xl p-5 space-y-4 animate-fade-in">
        <div className="flex items-center justify-between">
          <h3 className="font-heading font-semibold text-foreground">Filtros</h3>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-heading uppercase tracking-wider text-muted-foreground">Nivel</p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setLevelFilter(null)}
              className={`px-3 py-1.5 rounded-full text-xs font-heading transition-colors ${!levelFilter ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
            >
              Todos
            </button>
            {levels.map((l) => (
              <button
                key={l}
                onClick={() => setLevelFilter(l)}
                className={`px-3 py-1.5 rounded-full text-xs font-heading transition-colors ${levelFilter === l ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        <Button variant="gold" className="w-full" onClick={onClose}>
          Aplicar
        </Button>
      </div>
    </div>
  );
};

/* ─── Main Content ─── */
export const EventosContent = () => {
  const navigate = useNavigate();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabFilter>("todos");
  const [levelFilter, setLevelFilter] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);

  useEffect(() => {
    supabase
      .from("events")
      .select("*")
      .eq("is_active", true)
      .order("date", { ascending: true })
      .then(({ data }) => {
        if (data) setEvents(data as unknown as Event[]);
        setLoading(false);
      });
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = events.filter((e) => e.date >= today);

  const filtered = upcoming.filter((e) => {
    if (tab === "escuela" && !escuelaTypes.includes(e.type)) return false;
    if (tab === "viajes" && !viajesTypes.includes(e.type)) return false;
    if (levelFilter && e.level !== levelFilter) return false;
    return true;
  });

  const featured = upcoming.filter(
    (e) => viajesTypes.includes(e.type) || (e.image_url && e.price)
  ).slice(0, 5);

  const levels = [...new Set(events.map((e) => e.level).filter(Boolean))] as string[];

  const tabs: { key: TabFilter; label: string }[] = [
    { key: "todos", label: "Todos" },
    { key: "escuela", label: "Escuela" },
    { key: "viajes", label: "Viajes & Camps" },
  ];

  return (
    <div className="w-full max-w-lg mx-auto space-y-5 animate-fade-in pb-4">
      {/* Header */}
      <div className="pt-2">
        <h1 className="text-2xl font-heading font-bold text-foreground">Eventos</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Encontrá tu próxima experiencia</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`whitespace-nowrap px-4 py-2 rounded-full text-xs font-heading font-semibold transition-all ${
              tab === t.key
                ? "bg-primary text-primary-foreground shadow-md"
                : "bg-muted/60 text-muted-foreground hover:bg-muted"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center text-muted-foreground animate-pulse py-12">Cargando...</div>
      ) : (
        <>
          {/* Featured Banner */}
          {tab !== "escuela" && featured.length > 0 && (
            <FeaturedBanner events={featured} onSelect={(id) => navigate(`/eventos/${id}`)} />
          )}

          {/* Events Grid */}
          {filtered.length === 0 ? (
            <div className="text-center py-12 space-y-2">
              <p className="text-muted-foreground text-sm">No hay eventos disponibles.</p>
              <p className="text-xs text-muted-foreground">Probá cambiando los filtros.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {filtered.map((e) => (
                <EventCard key={e.id} event={e} onClick={() => navigate(`/eventos/${e.id}`)} />
              ))}
            </div>
          )}
        </>
      )}

      {/* Floating Filter Button */}
      {levels.length > 0 && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40">
          <Button
            variant="outline"
            className="rounded-full shadow-lg bg-card border-border/80 px-5 gap-2"
            onClick={() => setFilterOpen(true)}
          >
            <SlidersHorizontal className="w-4 h-4" />
            Filtrar
            {levelFilter && (
              <span className="ml-1 w-2 h-2 rounded-full bg-primary inline-block" />
            )}
          </Button>
        </div>
      )}

      <FilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        levelFilter={levelFilter}
        setLevelFilter={setLevelFilter}
        levels={levels}
      />
    </div>
  );
};

/* ─── Standalone Page ─── */
const Eventos = () => {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="flex items-center gap-3 px-5 pt-5 pb-2">
        <button onClick={() => navigate("/alumno")} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <img src={logo} alt="Ciclismo Reybaud" className="w-8 h-8" />
      </header>
      <main className="flex-1 px-4 pb-24">
        <EventosContent />
      </main>
      <BottomNav activeTab="eventos" />
    </div>
  );
};

export default Eventos;
