import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Clock, UserCheck, UserX, CreditCard, Mail, FileText,
  RefreshCw, PlusCircle, Edit2, Palmtree, Ban, Play,
  ChevronDown, Activity
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

interface Props {
  alumnoId: string;
}

export const StudentActivityLog = ({ alumnoId }: Props) => {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("student_activity_log")
        .select("*")
        .eq("alumno_id", alumnoId)
        .order("created_at", { ascending: false })
        .limit(50);
      setEntries((data as ActivityEntry[]) || []);
      setLoading(false);
    };
    load();
  }, [alumnoId]);

  if (loading) {
    return (
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5" /> Actividad del alumno
        </h3>
        <p className="text-xs text-muted-foreground animate-pulse">Cargando historial...</p>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5" /> Actividad del alumno
        </h3>
        <p className="text-xs text-muted-foreground">Sin registros de actividad aún.</p>
      </div>
    );
  }

  const visible = showAll ? entries : entries.slice(0, 5);

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
        <Activity className="w-3.5 h-3.5" /> Actividad del alumno
        <Badge variant="secondary" className="text-[10px] ml-auto">{entries.length}</Badge>
      </h3>

      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-[9px] top-2 bottom-2 w-px bg-border" />

        <div className="space-y-0">
          {visible.map((entry) => {
            const Icon = EVENT_ICONS[entry.event_type] || Clock;
            const color = EVENT_COLORS[entry.event_type] || "text-muted-foreground";

            return (
              <div key={entry.id} className="relative pl-7 py-2 group">
                {/* Icon dot */}
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

      {entries.length > 5 && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-xs text-muted-foreground"
          onClick={() => setShowAll(!showAll)}
        >
          <ChevronDown className={`w-3 h-3 mr-1 transition-transform ${showAll ? "rotate-180" : ""}`} />
          {showAll ? "Ver menos" : `Ver todo (${entries.length})`}
        </Button>
      )}
    </div>
  );
};
