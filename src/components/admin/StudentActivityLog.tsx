import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Clock, UserCheck, CreditCard, Mail, FileText,
  RefreshCw, PlusCircle, Edit2, Palmtree, Ban, Play,
  ChevronDown, Activity, Inbox
} from "lucide-react";

interface ActivityEntry {
  id: string;
  event_type: string;
  title: string;
  description: string | null;
  actor_email: string | null;
  actor_role: string;
  reference_type: string | null;
  reference_label: string | null;
  created_at: string;
}

const EVENT_ICONS: Record<string, typeof Clock> = {
  alta: PlusCircle,
  estado_usuario: UserCheck,
  estado_suscripcion: FileText,
  cambio_plan: CreditCard,
  pago: CreditCard,
  email_enviado: Mail,
  reenvio_invitacion: RefreshCw,
  edicion_datos: Edit2,
  vacaciones: Palmtree,
  bloqueo: Ban,
  reactivacion: Play,
};

const EVENT_COLORS: Record<string, string> = {
  alta: "text-green-500",
  estado_usuario: "text-primary",
  estado_suscripcion: "text-accent",
  cambio_plan: "text-[hsl(var(--chart-4))]",
  pago: "text-green-500",
  email_enviado: "text-blue-400",
  reenvio_invitacion: "text-blue-400",
  edicion_datos: "text-muted-foreground",
  vacaciones: "text-[hsl(var(--chart-3))]",
  bloqueo: "text-destructive",
  reactivacion: "text-green-500",
};

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  super_admin: "Super Admin",
  sistema: "Sistema",
  alumno: "Alumno",
  coach: "Coach",
};

type FilterKey = "todo" | "acciones" | "mails" | "pagos" | "planes";

const FILTER_TYPES: Record<FilterKey, string[] | null> = {
  todo: null,
  acciones: ["alta", "estado_usuario", "edicion_datos", "reactivacion", "bloqueo", "vacaciones"],
  mails: ["email_enviado", "reenvio_invitacion"],
  pagos: ["pago"],
  planes: ["cambio_plan", "estado_suscripcion"],
};

const FILTER_LABELS: Record<FilterKey, string> = {
  todo: "Todo",
  acciones: "Acciones",
  mails: "Mails",
  pagos: "Pagos",
  planes: "Planes",
};

const INITIAL_COUNT = 10;

interface Props {
  alumnoId: string;
}

export const StudentActivityLog = ({ alumnoId }: Props) => {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("todo");
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setLoading(true);
    setFilter("todo");
    setExpanded(false);
    supabase
      .from("student_activity_log")
      .select("*")
      .eq("alumno_id", alumnoId)
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data }) => {
        setEntries((data as ActivityEntry[]) || []);
        setLoading(false);
      });
  }, [alumnoId]);

  const filtered = filter === "todo"
    ? entries
    : entries.filter((e) => FILTER_TYPES[filter]?.includes(e.event_type));

  const visible = expanded ? filtered : filtered.slice(0, INITIAL_COUNT);
  const hasMore = filtered.length > INITIAL_COUNT;

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

  // Count per filter for badges
  const counts: Record<FilterKey, number> = {
    todo: entries.length,
    acciones: entries.filter((e) => FILTER_TYPES.acciones!.includes(e.event_type)).length,
    mails: entries.filter((e) => FILTER_TYPES.mails!.includes(e.event_type)).length,
    pagos: entries.filter((e) => FILTER_TYPES.pagos!.includes(e.event_type)).length,
    planes: entries.filter((e) => FILTER_TYPES.planes!.includes(e.event_type)).length,
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-1.5">
        <Activity className="w-3.5 h-3.5 text-foreground" />
        <h3 className="text-sm font-semibold text-foreground">Actividad del alumno</h3>
        {entries.length > 0 && (
          <Badge variant="secondary" className="text-[10px] ml-auto">{entries.length}</Badge>
        )}
      </div>

      {/* Filter tabs */}
      {entries.length > 0 && (
        <div className="flex gap-1 flex-wrap">
          {(Object.keys(FILTER_LABELS) as FilterKey[]).map((key) => {
            const isActive = filter === key;
            const count = counts[key];
            if (key !== "todo" && count === 0) return null;
            return (
              <button
                key={key}
                onClick={() => { setFilter(key); setExpanded(false); }}
                className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                  isActive
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-secondary/50 text-muted-foreground border-border hover:bg-secondary"
                }`}
              >
                {FILTER_LABELS[key]}
                {count > 0 && <span className="ml-1 opacity-70">{count}</span>}
              </button>
            );
          })}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <p className="text-xs text-muted-foreground animate-pulse py-4 text-center">
          Cargando historial...
        </p>
      )}

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <div className="flex flex-col items-center py-6 gap-2">
          <Inbox className="w-8 h-8 text-muted-foreground/40" />
          <p className="text-xs text-muted-foreground text-center">
            {filter === "todo"
              ? "Todavía no hay movimientos registrados para este alumno."
              : `Sin registros de tipo "${FILTER_LABELS[filter]}".`}
          </p>
        </div>
      )}

      {/* Timeline */}
      {!loading && visible.length > 0 && (
        <div className="relative">
          <div className="absolute left-[9px] top-2 bottom-2 w-px bg-border" />
          <div className="space-y-0">
            {visible.map((entry) => {
              const Icon = EVENT_ICONS[entry.event_type] || Clock;
              const color = EVENT_COLORS[entry.event_type] || "text-muted-foreground";
              return (
                <div key={entry.id} className="relative pl-7 py-2">
                  <div className={`absolute left-0 top-2.5 w-[19px] h-[19px] rounded-full bg-card border border-border flex items-center justify-center ${color}`}>
                    <Icon className="w-2.5 h-2.5" />
                  </div>
                  <div className="space-y-0.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-medium text-foreground leading-tight">{entry.title}</p>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">
                        {formatDate(entry.created_at)}
                      </span>
                    </div>
                    {entry.description && (
                      <p className="text-[11px] text-muted-foreground leading-snug">{entry.description}</p>
                    )}
                    <div className="flex items-center gap-2 flex-wrap">
                      {entry.reference_label && (
                        <span className="text-[10px] bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded">
                          {entry.reference_label}
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground">
                        {entry.actor_email
                          ? `${ROLE_LABELS[entry.actor_role] || entry.actor_role} · ${entry.actor_email}`
                          : ROLE_LABELS[entry.actor_role] || entry.actor_role}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Ver todo / Ver menos */}
      {!loading && hasMore && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-xs text-muted-foreground"
          onClick={() => setExpanded(!expanded)}
        >
          <ChevronDown className={`w-3 h-3 mr-1 transition-transform ${expanded ? "rotate-180" : ""}`} />
          {expanded ? "Ver menos" : `Ver todo (${filtered.length})`}
        </Button>
      )}
    </div>
  );
};
