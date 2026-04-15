import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Bell, AlertTriangle, CreditCard, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import type { EffectiveSubStatus } from "@/lib/subscriptionStatus";

interface NewsItem {
  id: string;
  type: "event_announcement" | "subscription_warning";
  title: string;
  preview: string;
  badge: "Nuevo" | "Importante" | "Pago" | null;
  eventId?: string;
  eventTitle?: string;
}

interface HomeNewsCarouselProps {
  alumnoId: string;
  subscriptionStatus?: EffectiveSubStatus;
  subscriptionDaysLeft?: number;
  fechaFin?: string | null;
}

const HomeNewsCarousel = ({ alumnoId, subscriptionStatus, subscriptionDaysLeft, fechaFin }: HomeNewsCarouselProps) => {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchNews = async () => {
      // 1. Get event IDs where student has active reservations
      const { data: reservations } = await supabase
        .from("event_reservations")
        .select("event_id, events!inner(id, title)")
        .eq("alumno_id", alumnoId)
        .not("reservation_status", "in", '("cancelada","rechazada")') as any;

      const eventMap = new Map<string, string>();
      const eventIds: string[] = [];
      if (reservations) {
        for (const r of reservations) {
          const eid = r.event_id;
          if (!eventMap.has(eid)) {
            eventMap.set(eid, r.events?.title || "Evento");
            eventIds.push(eid);
          }
        }
      }

      const newsItems: NewsItem[] = [];

      // 2. Fetch announcements for those events
      if (eventIds.length > 0) {
        const { data: announcements } = await supabase
          .from("event_announcements")
          .select("*")
          .in("event_id", eventIds)
          .eq("visible", true)
          .order("is_highlighted", { ascending: false })
          .order("published_at", { ascending: false })
          .limit(3);

        if (announcements) {
          for (const a of announcements) {
            newsItems.push({
              id: a.id,
              type: "event_announcement",
              title: eventMap.get(a.event_id) || "Evento",
              preview: a.title + (a.content ? ` — ${a.content.slice(0, 60)}` : ""),
              badge: a.is_highlighted
                ? (a.category === "importante" ? "Importante" : "Nuevo")
                : null,
              eventId: a.event_id,
              eventTitle: eventMap.get(a.event_id),
            });
          }
        }
      }

      // 3. Subscription warning
      if (subscriptionStatus === "pago_pendiente" && subscriptionDaysLeft !== undefined) {
        newsItems.unshift({
          id: "sub-warning",
          type: "subscription_warning",
          title: "Mensualidad",
          preview: subscriptionDaysLeft > 0
            ? `Tu plan venció. Tenés ${subscriptionDaysLeft} día${subscriptionDaysLeft !== 1 ? "s" : ""} para regularizar tu pago.`
            : "Hoy es el último día para regularizar tu pago y mantener tu acceso.",
          badge: "Pago",
        });
      } else if (fechaFin && subscriptionStatus === "activa") {
        // Warn if expiring within 5 days
        const fin = new Date(fechaFin + "T23:59:59");
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const diff = Math.ceil((fin.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        if (diff >= 0 && diff <= 5) {
          newsItems.unshift({
            id: "sub-expiring",
            type: "subscription_warning",
            title: "Mensualidad",
            preview: diff === 0
              ? "Tu plan vence hoy. Renovalo para mantener tu acceso."
              : `Tu plan vence en ${diff} día${diff !== 1 ? "s" : ""}. Renovalo a tiempo.`,
            badge: "Pago",
          });
        }
      }

      setItems(newsItems);
    };

    fetchNews();
  }, [alumnoId, subscriptionStatus, subscriptionDaysLeft, fechaFin]);

  // Auto-rotate
  useEffect(() => {
    if (items.length <= 1) return;
    intervalRef.current = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % items.length);
    }, 5000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [items.length]);

  if (items.length === 0) return null;

  const handleClick = (item: NewsItem) => {
    if (item.type === "subscription_warning") {
      navigate("/alumno/pagos");
    } else if (item.eventId) {
      navigate(`/alumno`, { state: { tab: "eventos", eventId: item.eventId } });
    }
  };

  const current = items[activeIndex];

  const badgeClass =
    current.badge === "Importante"
      ? "bg-destructive/15 text-destructive border-destructive/30"
      : current.badge === "Pago"
      ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
      : "bg-primary/15 text-primary border-primary/30";

  const IconComponent = current.type === "subscription_warning" ? CreditCard
    : current.badge === "Importante" ? AlertTriangle
    : Bell;

  return (
    <div className="w-full">
      <button
        onClick={() => handleClick(current)}
        className="w-full text-left rounded-xl border border-border/50 bg-card/80 backdrop-blur-sm p-4 space-y-2 shadow-lg shadow-black/10 transition-all hover:border-primary/30 active:scale-[0.98]"
      >
        <div className="flex items-center gap-2">
          <IconComponent className="w-4 h-4 text-primary shrink-0" />
          <span className="text-[11px] font-heading font-semibold uppercase tracking-wider text-muted-foreground truncate flex-1">
            {current.title}
          </span>
          {current.badge && (
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 shrink-0 ${badgeClass}`}>
              {current.badge}
            </Badge>
          )}
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2">{current.preview}</p>

        {/* Dots indicator */}
        {items.length > 1 && (
          <div className="flex items-center justify-center gap-1.5 pt-1">
            {items.map((_, i) => (
              <button
                key={i}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveIndex(i);
                  if (intervalRef.current) clearInterval(intervalRef.current);
                }}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${
                  i === activeIndex ? "bg-primary" : "bg-muted-foreground/30"
                }`}
              />
            ))}
          </div>
        )}
      </button>
    </div>
  );
};

export default HomeNewsCarousel;
