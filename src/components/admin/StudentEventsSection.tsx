import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, CheckCircle2, Inbox, MapPin } from "lucide-react";

interface Props {
  alumnoId: string;
}

interface StudentEventItem {
  id: string;
  eventId: string;
  title: string;
  date: string | null;
  endDate: string | null;
  location: string | null;
  status: string;
  checkinAt: string | null;
  packageName: string | null;
}

const formatDate = (date: string | null) =>
  date ? date.split("-").reverse().join("/") : "Fecha sin definir";

const formatRange = (date: string | null, endDate: string | null) => {
  if (!date) return "Fecha sin definir";
  if (!endDate || endDate === date) return formatDate(date);
  return `${formatDate(date)} — ${formatDate(endDate)}`;
};

const statusLabel = (status: string) => {
  switch ((status || "").toLowerCase()) {
    case "reserva_confirmada": return "Confirmado";
    case "solicitud_enviada": return "Solicitud enviada";
    case "cancelada":
    case "cancelado": return "Cancelado";
    default: return status ? status.replace(/_/g, " ") : "—";
  }
};

const isCancelled = (status: string) =>
  ["cancelada", "cancelado", "cancelled"].includes((status || "").toLowerCase());

export const StudentEventsSection = ({ alumnoId }: Props) => {
  const [items, setItems] = useState<StudentEventItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);

      const { data: reservations, error } = await supabase
        .from("event_reservations")
        .select("id,event_id,estado,reservation_status,checkin_at,created_at,package_nombre_snapshot")
        .eq("alumno_id", alumnoId)
        .order("created_at", { ascending: false })
        .limit(100);

      if (!active) return;
      if (error) {
        console.error("Error loading student event reservations", error);
        setItems([]);
        setLoading(false);
        return;
      }

      const rows = (reservations || []) as any[];
      const eventIds = Array.from(new Set(rows.map((row) => row.event_id).filter(Boolean))) as string[];
      let eventsById = new Map<string, any>();

      if (eventIds.length > 0) {
        const { data: events, error: eventsError } = await supabase
          .from("events")
          .select("id,title,date,end_date,location,status")
          .in("id", eventIds);

        if (!active) return;
        if (eventsError) console.error("Error loading student events", eventsError);
        eventsById = new Map(((events || []) as any[]).map((row) => [row.id, row]));
      }

      const merged = rows.map((row) => {
        const event = eventsById.get(row.event_id);
        return {
          id: row.id,
          eventId: row.event_id,
          title: event?.title || "Evento",
          date: event?.date || null,
          endDate: event?.end_date || null,
          location: event?.location || null,
          status: row.reservation_status || row.estado || "—",
          checkinAt: row.checkin_at || null,
          packageName: row.package_nombre_snapshot || null,
        } satisfies StudentEventItem;
      });

      if (active) {
        setItems(merged);
        setLoading(false);
      }
    };

    load();
    return () => { active = false; };
  }, [alumnoId]);

  const now = new Date();
  const today = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");

  const upcoming = items
    .filter((item) => !isCancelled(item.status) && (item.endDate || item.date || "") >= today)
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""));

  const previous = items
    .filter((item) => !upcoming.some((future) => future.id === item.id))
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  const renderItem = (item: StudentEventItem) => (
    <div key={item.id} className="p-2.5 space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-foreground leading-snug">{item.title}</p>
        {item.checkinAt ? (
          <Badge variant="secondary" className="text-[10px] shrink-0 gap-1">
            <CheckCircle2 className="w-3 h-3" /> Asistió
          </Badge>
        ) : (
          <Badge variant={isCancelled(item.status) ? "destructive" : "secondary"} className="text-[10px] shrink-0">
            {statusLabel(item.status)}
          </Badge>
        )}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <CalendarDays className="w-3 h-3" />
          {formatRange(item.date, item.endDate)}
        </span>
        {item.location && (
          <span className="flex items-center gap-1">
            <MapPin className="w-3 h-3" />
            {item.location}
          </span>
        )}
      </div>
      {item.packageName && (
        <p className="text-[10px] text-muted-foreground">Paquete: {item.packageName}</p>
      )}
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5">
        <CalendarDays className="w-3.5 h-3.5 text-foreground" />
        <h3 className="text-sm font-semibold text-foreground">Eventos</h3>
        {items.length > 0 && (
          <Badge variant="secondary" className="text-[10px] ml-auto">{items.length}</Badge>
        )}
      </div>

      {loading && (
        <p className="text-xs text-muted-foreground animate-pulse py-4 text-center">
          Cargando eventos...
        </p>
      )}

      {!loading && items.length === 0 && (
        <div className="flex flex-col items-center py-5 gap-2">
          <Inbox className="w-7 h-7 text-muted-foreground/40" />
          <p className="text-xs text-muted-foreground">No hay participaciones en eventos registradas.</p>
        </div>
      )}

      {!loading && upcoming.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Próximos</p>
          <div className="divide-y divide-border rounded-md border border-border">
            {upcoming.map(renderItem)}
          </div>
        </div>
      )}

      {!loading && previous.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Anteriores</p>
          <div className="divide-y divide-border rounded-md border border-border">
            {previous.map(renderItem)}
          </div>
        </div>
      )}
    </div>
  );
};
