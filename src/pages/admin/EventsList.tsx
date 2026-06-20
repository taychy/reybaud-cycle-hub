import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  Plus,
  Pencil,
  Copy,
  Trash2,
  Eye,
  EyeOff,
  CalendarDays,
  SlidersHorizontal,
  X,
  Users,
  Link2,
  Trophy,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getPublicEventLink, copyToClipboard } from "@/lib/eventLinks";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import EventForm, {
  eventFormFromRow,
  eventFormToPayload,
  type EventFormData,
} from "@/components/admin/EventForm";
import AdminEventReservations from "@/components/admin/AdminEventReservations";
import EventAnnouncementsManager from "@/components/admin/EventAnnouncementsManager";
import EventRoadbookEditor from "@/components/admin/EventRoadbookEditor";

/* ─── Type groupings ─── */
type TabFilter = "todos" | "escuela" | "carrera" | "camp_viaje";

const tabGroups: Record<TabFilter, string[]> = {
  todos: [],
  escuela: ["record_hora", "otro"],
  carrera: ["carrera"],
  camp_viaje: ["camp", "viaje"],
};

const tabs: { key: TabFilter; label: string; color: string; bg: string }[] = [
  { key: "todos", label: "Todos", color: "text-foreground", bg: "bg-muted" },
  { key: "escuela", label: "Escuela", color: "text-sky-300", bg: "bg-sky-500/20" },
  { key: "carrera", label: "Carrera", color: "text-orange-300", bg: "bg-orange-500/20" },
  { key: "camp_viaje", label: "Camp / Viaje", color: "text-violet-300", bg: "bg-violet-500/20" },
];

const typeToGroup = (type: string): TabFilter => {
  if (["record_hora", "otro"].includes(type)) return "escuela";
  if (type === "carrera") return "carrera";
  if (["camp", "viaje"].includes(type)) return "camp_viaje";
  return "escuela";
};

const typeDisplayLabels: Record<string, string> = {
  record_hora: "Record",
  otro: "Evento",
  carrera: "Carrera",
  camp: "Camp",
  viaje: "Viaje",
};

const statusLabels: Record<string, { label: string; color: string }> = {
  borrador: { label: "Borrador", color: "border-yellow-500/50 text-yellow-400" },
  publicado: { label: "Publicado", color: "border-emerald-500/50 text-emerald-400" },
  finalizado: { label: "Finalizado", color: "border-muted text-muted-foreground" },
  cancelado: { label: "Cancelado", color: "border-red-500/50 text-red-400" },
};

interface Event {
  id: string;
  title: string;
  description: string | null;
  short_description: string | null;
  date: string;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  type: string;
  status: string;
  is_active: boolean;
  visible_to_students: boolean;
  show_public: boolean;
  same_day: boolean;
  is_own_event: boolean;
  image_url: string | null;
  location: string | null;
  price: number | null;
  currency: string;
  duration_days: number | null;
  duration_nights: number | null;
  max_capacity: number | null;
  spots_taken: number;
  level: string | null;
  metadata: Record<string, any>;
  payment_mode?: "cuotas" | "simple";
}

const EventsList = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabFilter>("todos");
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [publishedFilter, setPublishedFilter] = useState<string>("all");

  // Form state
  const [formOpen, setFormOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [saving, setSaving] = useState(false);
  const [reservationsEvent, setReservationsEvent] = useState<Event | null>(null);

  const fetchEvents = async () => {
    const { data, error } = await supabase
      .from("events")
      .select("*")
      .order("date", { ascending: false });

    if (!error && data) setEvents(data as unknown as Event[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  /* ─── Filtering ─── */
  const filtered = events.filter((e) => {
    if (tab !== "todos" && !tabGroups[tab].includes(e.type)) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !e.title.toLowerCase().includes(q) &&
        !(e.location || "").toLowerCase().includes(q)
      )
        return false;
    }
    if (statusFilter !== "all" && e.status !== statusFilter) return false;
    if (publishedFilter === "published" && !e.visible_to_students) return false;
    if (publishedFilter === "unpublished" && e.visible_to_students) return false;
    return true;
  });

  /* ─── CRUD ─── */
  const openCreate = () => {
    setEditingEvent(null);
    setFormOpen(true);
  };

  const openEdit = (ev: Event) => {
    setEditingEvent(ev);
    setFormOpen(true);
  };

  const duplicateEvent = async (ev: Event) => {
    const { id, spots_taken, ...rest } = ev;
    const { error } = await supabase.from("events").insert({
      ...rest,
      title: `${ev.title} (copia)`,
      spots_taken: 0,
      status: "borrador",
    } as any);
    if (error) {
      toast({ title: "Error", description: "No se pudo duplicar.", variant: "destructive" });
    } else {
      toast({ title: "Duplicado", description: "Evento duplicado correctamente." });
      fetchEvents();
    }
  };

  const deleteEvent = async (id: string) => {
    const { error } = await supabase.from("events").delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: "No se pudo eliminar.", variant: "destructive" });
    } else {
      toast({ title: "Eliminado" });
      fetchEvents();
    }
  };

  const saveEvent = async (formData: EventFormData) => {
    if (!formData.title || !formData.date) {
      toast({ title: "Faltan datos", description: "Título y fecha son obligatorios.", variant: "destructive" });
      return;
    }
    setSaving(true);

    const payload = eventFormToPayload(formData);

    let error;
    if (editingEvent) {
      // Preserve installments mirror (managed by EventInstallmentsEditor) to avoid
      // overwriting with stale form state when the user clicks "Guardar cambios".
      const { data: freshEv } = await supabase
        .from("events")
        .select("metadata")
        .eq("id", editingEvent.id)
        .maybeSingle();
      const freshMeta = (freshEv?.metadata as Record<string, any>) || {};
      const mergedMeta = {
        ...(payload.metadata as Record<string, any> || {}),
        installments: freshMeta.installments ?? (payload.metadata as any)?.installments,
        installments_enabled: freshMeta.installments_enabled ?? (payload.metadata as any)?.installments_enabled,
      };
      ({ error } = await supabase.from("events").update({ ...(payload as any), metadata: mergedMeta }).eq("id", editingEvent.id));
    } else {
      ({ error } = await supabase.from("events").insert(payload as any));
    }

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: editingEvent ? "Actualizado" : "Creado" });
      setFormOpen(false);
      fetchEvents();
    }
    setSaving(false);
  };

  /* ─── Badge color by group ─── */
  const typeBadge = (type: string) => {
    const group = typeToGroup(type);
    const t = tabs.find((t) => t.key === group);
    return (
      <span className={`text-[10px] font-heading uppercase tracking-wider px-2 py-0.5 rounded-full ${t?.bg || "bg-muted"} ${t?.color || "text-foreground"}`}>
        {typeDisplayLabels[type] || type}
      </span>
    );
  };

  const activeFilters = statusFilter !== "all" || publishedFilter !== "all";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold uppercase tracking-wider">Eventos</h1>
          <p className="text-sm text-muted-foreground">{events.length} eventos en total</p>
        </div>
        <Button variant="gold" onClick={openCreate} className="gap-2">
          <Plus className="w-4 h-4" /> Nuevo Evento
        </Button>
      </div>

      {/* Tab Filters */}
      <div className="flex gap-2 flex-wrap">
        {tabs.map((t) => {
          const isActive = tab === t.key;
          const count = t.key === "todos"
            ? events.length
            : events.filter((e) => tabGroups[t.key].includes(e.type)).length;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 rounded-xl text-sm font-heading font-semibold transition-all flex items-center gap-2 ${
                isActive
                  ? `${t.bg} ${t.color} ring-1 ring-current shadow-md`
                  : "bg-card/50 text-muted-foreground hover:bg-card border border-border/50"
              }`}
            >
              {t.label}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isActive ? "bg-white/10" : "bg-muted"}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search + Secondary Filters */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre o ubicación..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button
          variant={activeFilters ? "default" : "outline"}
          size="icon"
          onClick={() => setShowFilters(!showFilters)}
          className="relative"
        >
          <SlidersHorizontal className="w-4 h-4" />
          {activeFilters && (
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-primary" />
          )}
        </Button>
      </div>

      {/* Secondary Filters */}
      {showFilters && (
        <div className="flex flex-wrap gap-3 items-end p-4 rounded-lg bg-card/50 border border-border/50">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Estado</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="borrador">Borrador</SelectItem>
                <SelectItem value="publicado">Publicado</SelectItem>
                <SelectItem value="finalizado">Finalizado</SelectItem>
                <SelectItem value="cancelado">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Visible en app</Label>
            <Select value={publishedFilter} onValueChange={setPublishedFilter}>
              <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="published">Visible</SelectItem>
                <SelectItem value="unpublished">Oculto</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {activeFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setStatusFilter("all"); setPublishedFilter("all"); }}
              className="text-xs gap-1"
            >
              <X className="w-3 h-3" /> Limpiar
            </Button>
          )}
        </div>
      )}

      {/* Events List */}
      {loading ? (
        <div className="text-center text-muted-foreground animate-pulse py-8">Cargando...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-muted-foreground py-12">
          <CalendarDays className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No hay eventos que coincidan.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((ev) => {
            const d = new Date(ev.date + "T12:00:00");
            const dateStr = d.toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" });
            const endDateStr = ev.end_date && ev.end_date !== ev.date
              ? new Date(ev.end_date + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" })
              : null;
            const st = statusLabels[ev.status] || statusLabels.borrador;
            return (
              <div
                key={ev.id}
                className="glass-card rounded-lg p-4 flex flex-col sm:flex-row sm:items-center gap-3"
              >
                {/* Info */}
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-sm truncate">{ev.title}</h3>
                    {typeBadge(ev.type)}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <CalendarDays className="w-3 h-3" /> {dateStr}{endDateStr ? ` → ${endDateStr}` : ""}
                    </span>
                    {ev.location && <span className="truncate">{ev.location}</span>}
                  </div>
                </div>

                {/* Status badges */}
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="outline" className={`text-[10px] ${st.color}`}>
                    {st.label}
                  </Badge>
                  {ev.visible_to_students ? (
                    <Badge variant="outline" className="text-[10px] border-sky-500/50 text-sky-400 gap-1">
                      <Eye className="w-3 h-3" /> Visible
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] border-muted text-muted-foreground gap-1">
                      <EyeOff className="w-3 h-3" /> Oculto
                    </Badge>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="sm" onClick={() => setReservationsEvent(ev)} title="Reservas">
                    <Users className="w-4 h-4" />
                  </Button>
                  {ev.type === "record_hora" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate(`/admin/eventos/participantes?eventId=${ev.id}`)}
                      title="Participantes y resultados"
                    >
                      <Trophy className="w-4 h-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      const url = getPublicEventLink(ev.id);
                      const ok = await copyToClipboard(url);
                      toast({
                        title: ok ? "Link copiado" : "No se pudo copiar",
                        description: ok ? url : "Copialo manualmente desde el detalle del evento.",
                      });
                    }}
                    title="Copiar link público"
                  >
                    <Link2 className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => openEdit(ev)} title="Editar">
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => duplicateEvent(ev)} title="Duplicar">
                    <Copy className="w-4 h-4" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" title="Eliminar">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>¿Eliminar "{ev.title}"?</AlertDialogTitle>
                        <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteEvent(ev.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                          Eliminar
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Sheet – wide right-side drawer */}
      <Sheet open={formOpen} onOpenChange={setFormOpen}>
        <SheetContent side="right" className="w-full sm:max-w-3xl lg:max-w-4xl xl:max-w-5xl overflow-y-auto">
          <SheetHeader className="pb-2">
            <SheetTitle className="font-heading uppercase tracking-wider">
              {editingEvent ? "Editar Evento" : "Nuevo Evento"}
            </SheetTitle>
            <SheetDescription className="sr-only">
              Formulario de creación y edición de eventos
            </SheetDescription>
          </SheetHeader>

          <EventForm
            key={editingEvent?.id || "new"}
            initialData={editingEvent ? eventFormFromRow(editingEvent) : undefined}
            isEditing={!!editingEvent}
            eventId={editingEvent?.id}
            saving={saving}
            onSave={saveEvent}
            onCancel={() => setFormOpen(false)}
            onDuplicate={editingEvent ? () => { duplicateEvent(editingEvent); setFormOpen(false); } : undefined}
            onDelete={editingEvent ? () => { deleteEvent(editingEvent.id); setFormOpen(false); } : undefined}
          />
        </SheetContent>
      </Sheet>

      {/* Reservations Sheet – full-width drawer */}
      <Sheet open={!!reservationsEvent} onOpenChange={(open) => !open && setReservationsEvent(null)}>
        <SheetContent side="bottom" className="h-[95vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader className="pb-2">
            <SheetTitle className="font-heading uppercase tracking-wider text-xl">
              Reservas — {reservationsEvent?.title}
            </SheetTitle>
            <SheetDescription className="sr-only">Panel de gestión de reservas del evento</SheetDescription>
          </SheetHeader>
          {reservationsEvent && (
            <div className="space-y-6 pb-8">
              <AdminEventReservations
                eventId={reservationsEvent.id}
                eventTitle={reservationsEvent.title}
                eventCurrency={reservationsEvent.currency}
                eventPrice={reservationsEvent.price}
                eventNature={reservationsEvent.metadata?.event_nature as string | undefined}
                eventType={(reservationsEvent as any).type as string | undefined}
                eventMetadata={reservationsEvent.metadata as Record<string, any> | undefined}
                eventDate={reservationsEvent.date}
                eventLocation={reservationsEvent.location}
                eventMaxCapacity={reservationsEvent.max_capacity}
                eventStatus={reservationsEvent.status}
                eventPaymentMode={(reservationsEvent as any).payment_mode || "cuotas"}
              />
              <div className="border-t border-border pt-6">
                <EventRoadbookEditor eventId={reservationsEvent.id} eventTitle={reservationsEvent.title} />
              </div>
              <div className="border-t border-border pt-6">
                <EventAnnouncementsManager eventId={reservationsEvent.id} />
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default EventsList;
