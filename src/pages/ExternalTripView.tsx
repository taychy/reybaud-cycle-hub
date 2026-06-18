import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { tripTokenGet } from "@/lib/tripTokenApi";
import { formatPrice } from "@/lib/currency";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CheckCircle, AlertCircle, Clock, Shield, Bike, Footprints,
  Plane, ShieldCheck, Package, Banknote, Loader2, CalendarDays,
  MapPin, CreditCard, ChevronRight, Bell, XCircle,
} from "lucide-react";
import TripBikeDrawer from "@/components/reservation/TripBikeDrawer";
import TripPedalsDrawer from "@/components/reservation/TripPedalsDrawer";
import TripTransportDrawer from "@/components/reservation/TripTransportDrawer";
import TripDocumentDrawer from "@/components/reservation/TripDocumentDrawer";
import EventAnnouncements from "@/components/reservation/EventAnnouncements";

interface ReservationData {
  id: string;
  reservation_status: string;
  payment_status: string;
  amount_total: number | null;
  amount_paid: number;
  balance_due: number | null;
  moneda: string;
  currency_snapshot: string | null;
  external_participant_id: string | null;
  event_id: string;
  access_token: string;
}

interface EventData {
  id: string;
  title: string;
  date: string;
  end_date: string | null;
  location: string | null;
  currency: string;
  metadata: any;
  image_url: string | null;
  duration_days: number | null;
  duration_nights: number | null;
}

interface ParticipantData {
  id: string;
  nombre: string;
  apellido: string | null;
  email: string;
}

const getStatusInfo = (rs: string, ps: string) => {
  if (rs === "reserva_confirmada" && ps === "pago_validado")
    return { title: "¡Tu lugar está confirmado! 🎉", subtitle: "Todo en orden. Ahora a preparar el viaje.", tone: "success" as const };
  if (rs === "reserva_confirmada" && ps === "parcial")
    return { title: "Tu lugar ya está reservado", subtitle: "Seguí completando tu plan de pago.", tone: "info" as const };
  if (rs === "reserva_confirmada")
    return { title: "Tu lugar ya está reservado", subtitle: "Realizá tu pago para asegurar tu lugar.", tone: "info" as const };
  if (rs === "solicitud_enviada")
    return { title: "Solicitud recibida", subtitle: "El equipo está revisando tu solicitud.", tone: "info" as const };
  if (rs === "cancelada")
    return { title: "Reserva cancelada", subtitle: "", tone: "neutral" as const };
  return { title: "Tu reserva está activa", subtitle: "", tone: "info" as const };
};

const toneStyles = {
  success: { border: "border-emerald-500/40", bg: "bg-emerald-500/5", icon: "text-emerald-400", iconBg: "bg-emerald-500/20" },
  info: { border: "border-primary/30", bg: "bg-primary/5", icon: "text-primary", iconBg: "bg-primary/20" },
  warning: { border: "border-amber-500/40", bg: "bg-amber-500/5", icon: "text-amber-400", iconBg: "bg-amber-500/20" },
  neutral: { border: "border-border", bg: "bg-muted/30", icon: "text-muted-foreground", iconBg: "bg-muted" },
};

const toneIcon = { success: CheckCircle, info: Shield, warning: AlertCircle, neutral: XCircle };

interface ChecklistItem {
  id: string;
  label: string;
  description: string;
  icon: typeof Bike;
  completed: boolean;
  actionType: "bike" | "pedals" | "document" | "none";
  stepKey?: string;
}

const buildChecklist = (meta: any, checklistData: Record<string, any>): ChecklistItem[] => {
  const items: ChecklistItem[] = [
    { id: "bici", label: "Bicicleta y posición", description: "Cargá tu estatura, talle o fitting", icon: Bike, completed: !!checklistData["bici"]?.completed, actionType: "bike" },
    { id: "pedales", label: "Pedales y calas", description: "Contanos qué usás o subí una foto", icon: Footprints, completed: !!checklistData["pedales"]?.completed, actionType: "pedals" },
    { id: "pasaje", label: "Pasaje o transporte", description: "Subí tu reserva de vuelo o transporte", icon: Plane, completed: !!checklistData["pasaje"]?.completed, actionType: "document", stepKey: "pasaje" },
    { id: "seguro", label: "Seguro viajero", description: "Adjuntá tu póliza de seguro", icon: ShieldCheck, completed: !!checklistData["seguro"]?.completed, actionType: "document", stepKey: "seguro" },
  ];

  const enabledSteps = meta?.checklist_steps;
  if (enabledSteps && Array.isArray(enabledSteps)) {
    return items.filter(item => enabledSteps.includes(item.id));
  }
  return items;
};

const ExternalTripView = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reservation, setReservation] = useState<ReservationData | null>(null);
  const [event, setEvent] = useState<EventData | null>(null);
  const [participant, setParticipant] = useState<ParticipantData | null>(null);
  const [checklistData, setChecklistData] = useState<Record<string, any>>({});

  const [showBikeDrawer, setShowBikeDrawer] = useState(false);
  const [showPedalsDrawer, setShowPedalsDrawer] = useState(false);
  const [docDrawer, setDocDrawer] = useState<{ open: boolean; stepKey: string; title: string; description: string; helpText: string; icon: React.ReactNode }>({
    open: false, stepKey: "", title: "", description: "", helpText: "", icon: null,
  });

  const loadData = useCallback(async () => {
    if (!token) { setError("Link inválido. Pedí un nuevo enlace al equipo."); setLoading(false); return; }

    try {
      const resp = await tripTokenGet(token);
      if (!resp.reservation || !resp.event) {
        setError("No encontramos tu reserva. Verificá el enlace o contactá al equipo.");
        setLoading(false);
        return;
      }
      setReservation(resp.reservation as ReservationData);
      setEvent(resp.event as EventData);
      setParticipant((resp.participant as ParticipantData) ?? null);
      const map: Record<string, any> = {};
      (resp.checklist ?? []).forEach((row) => { map[row.step_key] = row; });
      setChecklistData(map);
    } catch (e: any) {
      setError("No encontramos tu reserva. Verificá el enlace o contactá al equipo.");
    }
    setLoading(false);
  }, [token]);

  useEffect(() => { loadData(); }, [loadData]);

  const reloadChecklist = async () => {
    if (!token) return;
    try {
      const resp = await tripTokenGet(token);
      const map: Record<string, any> = {};
      (resp.checklist ?? []).forEach((row) => { map[row.step_key] = row; });
      setChecklistData(map);
    } catch {
      // silent
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !reservation || !event) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="text-center space-y-4 max-w-sm">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
            <AlertCircle className="w-8 h-8 text-destructive" />
          </div>
          <h1 className="text-xl font-bold text-foreground">No pudimos cargar tu reserva</h1>
          <p className="text-sm text-muted-foreground">{error || "Enlace inválido"}</p>
        </div>
      </div>
    );
  }

  const statusInfo = getStatusInfo(reservation.reservation_status, reservation.payment_status);
  const tone = toneStyles[statusInfo.tone];
  const StatusIcon = toneIcon[statusInfo.tone];
  const currency = reservation.currency_snapshot || reservation.moneda || event.currency;
  const total = reservation.amount_total || 0;
  const paid = reservation.amount_paid || 0;
  const paidPercent = total > 0 ? Math.min(Math.round((paid / total) * 100), 100) : 0;
  const checklist = buildChecklist(event.metadata, checklistData);
  const completedCount = checklist.filter(c => c.completed).length;
  const checklistPercent = checklist.length > 0 ? Math.round((completedCount / checklist.length) * 100) : 0;

  const participantId = participant?.id || reservation.external_participant_id || "external";

  const docStepConfig: Record<string, { title: string; description: string; helpText: string; icon: React.ReactNode }> = {
    pasaje: { title: "Pasaje o transporte", description: "Subí tu reserva de vuelo, micro o transporte", helpText: "Subí una imagen o PDF de tu reserva de vuelo o pasaje de micro.", icon: <Plane className="w-5 h-5 text-primary" /> },
    seguro: { title: "Seguro viajero", description: "Adjuntá tu póliza de seguro vigente", helpText: "Subí una imagen o PDF de tu póliza de seguro de viaje.", icon: <ShieldCheck className="w-5 h-5 text-primary" /> },
  };

  const handleChecklistAction = (item: ChecklistItem) => {
    if (item.actionType === "bike") setShowBikeDrawer(true);
    else if (item.actionType === "pedals") setShowPedalsDrawer(true);
    else if (item.actionType === "document" && item.stepKey) {
      const cfg = docStepConfig[item.stepKey] || { title: item.label, description: item.description, helpText: "", icon: null };
      setDocDrawer({ open: true, stepKey: item.stepKey, ...cfg });
    }
  };

  const eventDateFormatted = new Date(event.date + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="relative">
        {event.image_url && (
          <div className="h-40 overflow-hidden">
            <img src={event.image_url} alt={event.title} className="w-full h-full object-cover" />
            <div className="absolute inset-0 h-40 bg-gradient-to-b from-black/20 to-background" />
          </div>
        )}
        <div className={`px-5 ${event.image_url ? "-mt-8 relative z-10" : "pt-8"}`}>
          <div className="space-y-1">
            {participant && (
              <p className="text-sm text-muted-foreground">
                Hola, <span className="font-semibold text-foreground">{participant.nombre}</span>
              </p>
            )}
            <h1 className="text-xl font-bold text-foreground">{event.title}</h1>
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" /> {eventDateFormatted}</span>
              {event.location && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {event.location}</span>}
              {event.duration_days && <span>{event.duration_days} días{event.duration_nights ? ` / ${event.duration_nights} noches` : ""}</span>}
            </div>
          </div>
        </div>
      </div>

      <div className="px-5 py-6 space-y-5 max-w-lg mx-auto">

        {/* Status banner */}
        <div className={`rounded-xl border-2 p-4 ${tone.border} ${tone.bg}`}>
          <div className="flex items-start gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${tone.iconBg}`}>
              <StatusIcon className={`w-5 h-5 ${tone.icon}`} />
            </div>
            <div>
              <p className={`text-base font-bold leading-snug ${tone.icon}`}>{statusInfo.title}</p>
              {statusInfo.subtitle && <p className="text-sm text-muted-foreground mt-0.5">{statusInfo.subtitle}</p>}
            </div>
          </div>
        </div>

        {/* Financial summary */}
        {total > 0 && (
          <div className="rounded-xl border border-border p-4 space-y-3">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-primary" />
              <h3 className="font-semibold text-sm uppercase tracking-wide">Resumen de pago</h3>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">{paidPercent}% abonado</span>
                <span className="text-muted-foreground font-medium">{formatPrice(paid, currency)} / {formatPrice(total, currency)}</span>
              </div>
              <Progress value={paidPercent} className="h-2.5" />
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-muted/40 rounded-lg p-2.5">
                <p className="text-[10px] text-muted-foreground uppercase mb-0.5">Total</p>
                <p className="text-sm font-bold">{formatPrice(total, currency)}</p>
              </div>
              <div className="bg-emerald-500/10 rounded-lg p-2.5">
                <p className="text-[10px] text-emerald-400 uppercase mb-0.5">Abonado</p>
                <p className="text-sm font-bold text-emerald-400">{formatPrice(paid, currency)}</p>
              </div>
              <div className={`rounded-lg p-2.5 ${(reservation.balance_due ?? 0) > 0 ? "bg-amber-500/10" : "bg-emerald-500/10"}`}>
                <p className={`text-[10px] uppercase mb-0.5 ${(reservation.balance_due ?? 0) > 0 ? "text-amber-400" : "text-emerald-400"}`}>Saldo</p>
                <p className={`text-sm font-bold ${(reservation.balance_due ?? 0) > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                  {formatPrice(reservation.balance_due ?? 0, currency)}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Checklist */}
        {checklist.length > 0 && !["cancelada", "rechazada"].includes(reservation.reservation_status) && (
          <div className="rounded-xl border border-border p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-sm uppercase tracking-wide">Preparación del viaje</h3>
              </div>
              <Badge variant="outline" className="text-[10px]">{completedCount}/{checklist.length}</Badge>
            </div>
            <Progress value={checklistPercent} className="h-2" />
            <div className="space-y-2">
              {checklist.map((item) => {
                const ItemIcon = item.icon;
                const isClickable = item.actionType !== "none";
                return (
                  <button
                    key={item.id}
                    onClick={() => isClickable && handleChecklistAction(item)}
                    disabled={!isClickable}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                      item.completed
                        ? "bg-emerald-500/5 border-emerald-500/20"
                        : isClickable
                          ? "bg-background border-border hover:border-primary/40 hover:bg-primary/5 active:scale-[0.98]"
                          : "bg-muted/30 border-border/50 opacity-60"
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                      item.completed ? "bg-emerald-500/20" : "bg-muted"
                    }`}>
                      {item.completed
                        ? <CheckCircle className="w-4 h-4 text-emerald-400" />
                        : <ItemIcon className="w-4 h-4 text-muted-foreground" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${item.completed ? "text-emerald-400" : "text-foreground"}`}>{item.label}</p>
                      <p className="text-xs text-muted-foreground">{item.description}</p>
                    </div>
                    {isClickable && !item.completed && <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Announcements */}
        <EventAnnouncements eventId={event.id} />

        {/* Footer */}
        <div className="text-center pt-4 pb-8">
          <p className="text-[11px] text-muted-foreground">Ciclismo Reybaud</p>
        </div>
      </div>

      {/* Drawers */}
      <TripBikeDrawer
        open={showBikeDrawer}
        onOpenChange={setShowBikeDrawer}
        reservationId={reservation.id}
        alumnoId={participantId}
        token={token ?? undefined}
        onSaved={reloadChecklist}
      />
      <TripPedalsDrawer
        open={showPedalsDrawer}
        onOpenChange={setShowPedalsDrawer}
        reservationId={reservation.id}
        alumnoId={participantId}
        token={token ?? undefined}
        onSaved={reloadChecklist}
      />
      <TripDocumentDrawer
        open={docDrawer.open}
        onOpenChange={(v) => setDocDrawer(prev => ({ ...prev, open: v }))}
        reservationId={reservation.id}
        alumnoId={participantId}
        stepKey={docDrawer.stepKey}
        title={docDrawer.title}
        description={docDrawer.description}
        helpText={docDrawer.helpText}
        icon={docDrawer.icon}
        token={token ?? undefined}
        onSaved={reloadChecklist}
      />
    </div>
  );
};

export default ExternalTripView;
