import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, Inbox, Mail } from "lucide-react";

interface Props {
  alumno: {
    id: string;
    email: string;
    emails_adicionales?: string[] | null;
  };
}

interface CommunicationItem {
  id: string;
  title: string;
  email: string;
  status: string;
  at: string;
  messageId?: string | null;
}

const INITIAL_COUNT = 8;

const TEMPLATE_LABELS: Record<string, string> = {
  factura_emitida: "Factura emitida",
  weekly_training_digest: "Entrenamiento semanal",
  medical_certificate_request: "Solicitud de apto físico",
  reservation_confirmation: "Confirmación de reserva",
  reservation_confirmed_with_payment: "Reserva confirmada",
  reservation_pago_registrado: "Pago de reserva registrado",
  event_announcement: "Novedad de evento",
  event_manual: "Comunicación de evento",
  coach_feedback: "Feedback del profesor",
  "coach-feedback": "Feedback del profesor",
  renewal_pending: "Renovación pendiente",
  installment_upcoming: "Próxima cuota",
  installment_today: "Cuota con vencimiento hoy",
  installment_overdue: "Cuota vencida",
  delivery_ready_pickup: "Pedido listo para retirar",
  "delivery-ready-pickup": "Pedido listo para retirar",
  programa_inscripcion: "Inscripción a programa",
};

const humanizeTemplate = (name: string | null | undefined) => {
  if (!name) return "Comunicación";
  if (TEMPLATE_LABELS[name]) return TEMPLATE_LABELS[name];
  const text = name.replace(/[-_]+/g, " ").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "Comunicación";
};

const statusLabel = (status: string | null | undefined) => {
  switch ((status || "").toLowerCase()) {
    case "sent": return "Enviado";
    case "pending": return "Pendiente";
    case "bounced": return "Rebotado";
    case "failed": return "Falló";
    case "dlq": return "Error";
    default: return status || "—";
  }
};

const isErrorStatus = (status: string) =>
  ["bounced", "failed", "dlq"].includes((status || "").toLowerCase());

const formatDateTime = (value: string) =>
  new Date(value).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

export const StudentCommunicationsSection = ({ alumno }: Props) => {
  const [items, setItems] = useState<CommunicationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const emailsKey = useMemo(
    () => [alumno.email, ...(alumno.emails_adicionales || [])]
      .filter(Boolean)
      .map((email) => email.trim().toLowerCase())
      .sort()
      .join("|"),
    [alumno.email, alumno.emails_adicionales]
  );

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setExpanded(false);

      const emails = Array.from(new Set(
        [alumno.email, ...(alumno.emails_adicionales || [])]
          .filter(Boolean)
          .map((email) => email.trim().toLowerCase())
      ));

      const recipientsResult = await supabase
        .from("broadcast_recipients")
        .select("id,broadcast_id,email,status,brevo_message_id,sent_at,created_at")
        .eq("alumno_id", alumno.id)
        .order("created_at", { ascending: false })
        .limit(100);

      const logsResult = emails.length
        ? await supabase
            .from("email_send_log")
            .select("id,message_id,template_name,recipient_email,status,metadata,created_at")
            .in("recipient_email", emails)
            .order("created_at", { ascending: false })
            .limit(100)
        : { data: [], error: null };

      if (!active) return;

      if (recipientsResult.error || logsResult.error) {
        console.error("Error loading student communications", recipientsResult.error || logsResult.error);
        setItems([]);
        setLoading(false);
        return;
      }

      const recipients = (recipientsResult.data || []) as any[];
      const broadcastIds = Array.from(new Set(
        recipients.map((row) => row.broadcast_id).filter(Boolean)
      )) as string[];

      let broadcastsById = new Map<string, any>();
      if (broadcastIds.length > 0) {
        const { data: broadcasts, error } = await supabase
          .from("broadcasts")
          .select("id,subject,sent_at,status")
          .in("id", broadcastIds);

        if (!active) return;
        if (error) console.error("Error loading broadcast subjects", error);
        broadcastsById = new Map(((broadcasts || []) as any[]).map((row) => [row.id, row]));
      }

      const broadcastItems: CommunicationItem[] = recipients.map((row) => {
        const broadcast = broadcastsById.get(row.broadcast_id);
        return {
          id: `broadcast-${row.id}`,
          title: broadcast?.subject || "Comunicación general",
          email: row.email || alumno.email,
          status: row.status || broadcast?.status || "pending",
          at: row.sent_at || broadcast?.sent_at || row.created_at,
          messageId: row.brevo_message_id,
        };
      });

      const broadcastMessageIds = new Set(
        broadcastItems.map((item) => item.messageId).filter(Boolean) as string[]
      );

      const logItems: CommunicationItem[] = ((logsResult.data || []) as any[])
        .filter((row) => !row.message_id || !broadcastMessageIds.has(row.message_id))
        .map((row) => ({
          id: `email-${row.id}`,
          title: row.metadata?.subject || humanizeTemplate(row.template_name),
          email: row.recipient_email || alumno.email,
          status: row.status || "pending",
          at: row.created_at,
          messageId: row.message_id,
        }));

      const merged = [...broadcastItems, ...logItems]
        .filter((item) => item.at)
        .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

      if (active) {
        setItems(merged);
        setLoading(false);
      }
    };

    load();
    return () => { active = false; };
  }, [alumno.id, emailsKey]);

  const visible = expanded ? items : items.slice(0, INITIAL_COUNT);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5">
        <Mail className="w-3.5 h-3.5 text-foreground" />
        <h3 className="text-sm font-semibold text-foreground">Comunicaciones</h3>
        {items.length > 0 && (
          <Badge variant="secondary" className="text-[10px] ml-auto">{items.length}</Badge>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Mails enviados al alumno y a sus emails en copia. El estado indica envío técnico, no apertura del mensaje.
      </p>

      {loading && (
        <p className="text-xs text-muted-foreground animate-pulse py-4 text-center">
          Cargando comunicaciones...
        </p>
      )}

      {!loading && items.length === 0 && (
        <div className="flex flex-col items-center py-5 gap-2">
          <Inbox className="w-7 h-7 text-muted-foreground/40" />
          <p className="text-xs text-muted-foreground">No hay comunicaciones registradas.</p>
        </div>
      )}

      {!loading && visible.length > 0 && (
        <div className="divide-y divide-border rounded-md border border-border">
          {visible.map((item) => (
            <div key={item.id} className="p-2.5 space-y-1">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-medium text-foreground leading-snug">{item.title}</p>
                <Badge
                  variant={isErrorStatus(item.status) ? "destructive" : "secondary"}
                  className="text-[10px] shrink-0"
                >
                  {statusLabel(item.status)}
                </Badge>
              </div>
              <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                <span className="truncate" title={item.email}>{item.email}</span>
                <span className="whitespace-nowrap">{formatDateTime(item.at)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && items.length > INITIAL_COUNT && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-xs text-muted-foreground"
          onClick={() => setExpanded((value) => !value)}
        >
          <ChevronDown className={`w-3 h-3 mr-1 transition-transform ${expanded ? "rotate-180" : ""}`} />
          {expanded ? "Ver menos" : `Ver todo (${items.length})`}
        </Button>
      )}
    </div>
  );
};
