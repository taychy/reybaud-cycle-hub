import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Bell, AlertTriangle, CreditCard, MapPin, FileText, Route, Megaphone, ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Announcement {
  id: string;
  title: string;
  content: string;
  category: string;
  is_highlighted: boolean;
  published_at: string;
}

interface EventAnnouncementsProps {
  eventId: string;
}

const categoryConfig: Record<string, { label: string; icon: typeof Bell; className: string }> = {
  importante: { label: "Importante", icon: AlertTriangle, className: "bg-destructive/15 text-destructive border-destructive/30" },
  pago: { label: "Pago", icon: CreditCard, className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  logistica: { label: "Logística", icon: MapPin, className: "bg-sky-500/15 text-sky-400 border-sky-500/30" },
  documentacion: { label: "Documentación", icon: FileText, className: "bg-violet-500/15 text-violet-400 border-violet-500/30" },
  recorrido: { label: "Recorrido", icon: Route, className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  general: { label: "General", icon: Megaphone, className: "bg-muted text-muted-foreground border-border" },
};

const EventAnnouncements = ({ eventId }: EventAnnouncementsProps) => {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("event_announcements" as any)
      .select("*")
      .eq("event_id", eventId)
      .eq("visible", true)
      .order("sort_order", { ascending: true })
      .order("published_at", { ascending: false })
      .then(({ data }) => {
        if (data) setAnnouncements(data as any[]);
        setLoading(false);
      });
  }, [eventId]);

  if (loading) return null;

  return (
    <div className="glass-card rounded-xl p-5 space-y-3 animate-fade-in">
      <div className="flex items-center gap-2">
        <Bell className="w-5 h-5 text-primary" />
        <h3 className="font-heading font-semibold text-sm text-foreground uppercase tracking-wide">
          Novedades del evento
        </h3>
      </div>

      {announcements.length === 0 ? (
        <p className="text-xs text-muted-foreground">Todavía no hay novedades cargadas para este evento.</p>
      ) : (
        <div className="space-y-2">
          {announcements.map((a) => {
            const cat = categoryConfig[a.category] || categoryConfig.general;
            const isExpanded = expandedId === a.id;
            const needsTruncation = a.content.length > 120;

            return (
              <div
                key={a.id}
                className={`rounded-lg border p-3 space-y-1.5 transition-colors ${
                  a.is_highlighted ? "bg-primary/5 border-primary/20" : "bg-muted/20 border-border/30"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 shrink-0 ${cat.className}`}>
                      {cat.label}
                    </Badge>
                    <span className="text-sm font-medium text-foreground truncate">{a.title}</span>
                  </div>
                  {a.is_highlighted && (
                    <Badge className="bg-primary/20 text-primary text-[10px] shrink-0">Nueva</Badge>
                  )}
                </div>

                <p className="text-xs text-muted-foreground whitespace-pre-line">
                  {needsTruncation && !isExpanded ? a.content.slice(0, 120) + "..." : a.content}
                </p>

                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(a.published_at).toLocaleDateString("es-AR", { day: "numeric", month: "short" })}
                  </span>
                  {needsTruncation && (
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : a.id)}
                      className="text-[10px] text-primary flex items-center gap-0.5"
                    >
                      {isExpanded ? <>Menos <ChevronUp className="w-3 h-3" /></> : <>Más <ChevronDown className="w-3 h-3" /></>}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default EventAnnouncements;
