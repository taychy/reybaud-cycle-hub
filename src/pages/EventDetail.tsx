import { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft, CalendarDays, Clock, Ruler, Send, Gauge, Heart,
  MapPin, Users, CheckCircle, Mountain, Moon, Sun, Shield,
  ExternalLink, MessageCircle, FileText, CreditCard, AlertCircle, Loader2, Banknote,
} from "lucide-react";
import EventRankings from "@/components/EventRankings";
import BottomNav from "@/components/BottomNav";
import { formatPrice } from "@/lib/currency";
import { getEventPriceDisplay } from "@/lib/eventPricing";
import { useAlumnoSession } from "@/hooks/useAlumnoSession";
import { useStudentDiscounts } from "@/hooks/useStudentDiscounts";
import { useEventFavorites } from "@/hooks/useEventFavorites";
import ReservationDrawer from "@/components/reservation/ReservationDrawer";
import ReservationStatusCard from "@/components/reservation/ReservationStatusCard";
// CancelReservationDrawer is now handled inside ReservationStatusCard
import EventAnnouncementsSection from "@/components/reservation/EventAnnouncements";
import type { Tables } from "@/integrations/supabase/types";
import { logEventResultSubmission } from "@/lib/logEventResultSubmission";

type Alumno = Tables<"alumnos">;

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
  is_active: boolean;
  visible_to_students: boolean;
  price: number | null;
  currency: string;
  location: string | null;
  max_capacity: number | null;
  spots_taken: number;
  duration_days: number | null;
  duration_nights: number | null;
  level: string | null;
  image_url: string | null;
  metadata: any;
}

interface Reservation {
  id: string;
  estado: string;
  reservation_status: string;
  payment_status: string;
  metodo_pago: string;
  monto: number | null;
  moneda: string;
  notas: string | null;
  admin_notes: string | null;
  participant_notes: string | null;
  amount_total: number | null;
  amount_paid: number;
  balance_due: number | null;
  price_snapshot: number | null;
  currency_snapshot: string | null;
  next_due_date: string | null;
  confirmed_at: string | null;
  checkin_at: string | null;
  event_participant_id: string | null;
  created_at: string;
  updated_at: string;
}

const typeLabels: Record<string, string> = {
  record_hora: "Record de la Hora",
  camp: "Camp",
  carrera: "Carrera",
  otro: "Evento",
  viaje: "Viaje",
};

const typeBadgeColors: Record<string, string> = {
  camp: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  viaje: "bg-violet-500/20 text-violet-400 border-violet-500/30",
  carrera: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  record_hora: "bg-sky-500/20 text-sky-400 border-sky-500/30",
  otro: "bg-muted text-muted-foreground border-border",
};

const placeholderImages: Record<string, string> = {
  camp: "https://images.unsplash.com/photo-1534787238916-9ba6764efd4f?w=800&q=80",
  viaje: "https://images.unsplash.com/photo-1534787238916-9ba6764efd4f?w=800&q=80",
  carrera: "https://images.unsplash.com/photo-1517649763962-0c623066013b?w=800&q=80",
  record_hora: "https://images.unsplash.com/photo-1517649763962-0c623066013b?w=800&q=80",
  otro: "https://images.unsplash.com/photo-1541625602330-2277a4c46182?w=800&q=80",
};

const EventDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { alumno } = useAlumnoSession();
  const { isFavorite, toggleFavorite } = useEventFavorites(alumno?.id || null);
  const { applyDiscount } = useStudentDiscounts(alumno?.id || null);

  // Smart back: respect history when available, fallback to events list.
  const handleBack = () => {
    // If user navigated within the app (history > 1 entry), go back so the
    // events tab/filter (Mis eventos, Favoritos, etc.) is preserved.
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate(alumno ? "/alumno/eventos" : "/eventos");
    }
  };

  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [showReservationDrawer, setShowReservationDrawer] = useState(false);
  

  // Result state
  const [existingResult, setExistingResult] = useState<{ id: string; distance_km: number | null; avg_speed_kmh: number | null; notes: string | null } | null>(null);
  const [showResultForm, setShowResultForm] = useState(false);
  const [resultDistance, setResultDistance] = useState("");
  const [resultSpeed, setResultSpeed] = useState("");
  const [resultNotes, setResultNotes] = useState("");
  const [submittingResult, setSubmittingResult] = useState(false);
  const [participantResult, setParticipantResult] = useState<{ id: string; time_value: number | null; participant_comment: string | null; status?: string | null; checked_in_at?: string | null; results_updated_at?: string | null } | null>(null);
  const [checkingIn, setCheckingIn] = useState(false);

  useEffect(() => {
    if (!id) return;
    supabase
      .from("events")
      .select("*")
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setEvent(data as unknown as Event);
        setLoading(false);
      });
  }, [id]);

  const loadReservation = useCallback(async () => {
    if (!id || !alumno) return;
    const { data } = await supabase
      .from("event_reservations")
      .select("*")
      .eq("event_id", id)
      .eq("alumno_id", alumno.id)
      .maybeSingle();
    if (data) setReservation(data as unknown as Reservation);
  }, [id, alumno]);

  useEffect(() => {
    if (!id || !alumno) return;
    loadReservation();
    loadResult(id, alumno.id);
  }, [id, alumno, loadReservation]);

  // Load participant result via secure edge function (by reservation when logged in)
  // Defensive: only set if participant.event_id matches the current event id, to prevent
  // ever showing a result that belongs to another Record event.
  const loadParticipantByReservation = useCallback(async (reservationId: string, currentEventId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("get-event-participant-by-token", {
        body: { action: "get_by_reservation", reservation_id: reservationId },
      });
      if (error) return;
      const p = data?.participant;
      if (p && p.event_id && p.event_id === currentEventId) {
        setParticipantResult(p);
      } else {
        setParticipantResult(null);
      }
    } catch { /* noop */ }
  }, []);

  useEffect(() => {
    if (!event || !alumno) return;
    if (event.type !== "record_hora") return;
    if (!reservation?.id) return;
    loadParticipantByReservation(reservation.id, event.id);
  }, [event, alumno, reservation?.id, loadParticipantByReservation]);

  const loadResult = async (eventId: string, alumnoId: string) => {
    const { data } = await supabase
      .from("event_results")
      .select("id, distance_km, avg_speed_kmh, notes")
      .eq("event_id", eventId)
      .eq("alumno_id", alumnoId)
      .maybeSingle();
    if (data) {
      setExistingResult(data as any);
      setResultDistance(data.distance_km?.toString() || "");
      setResultSpeed((data as any).avg_speed_kmh?.toString() || "");
      setResultNotes((data as any).notes || "");
    }
  };

  const handleCheckIn = async () => {
    if (!reservation?.id || checkingIn) return;
    setCheckingIn(true);
    try {
      const { data, error } = await supabase.functions.invoke("event-school-checkin", {
        body: { reservation_id: reservation.id },
      });
      if (error || !data?.ok) {
        toast({
          title: "No pudimos registrar tu check-in",
          description: data?.error || error?.message || "Intentá nuevamente.",
          variant: "destructive",
        });
        return;
      }
      toast({ title: "Check-in registrado ✓", description: "Ahora podés cargar tu resultado." });
      await loadReservation();
      await loadParticipantByReservation(reservation.id, event!.id);
    } finally {
      setCheckingIn(false);
    }
  };

  const handleSubmitRecordResult = async () => {
    if (!reservation?.id || !alumno) return;
    const km = parseFloat(resultDistance);
    if (!Number.isFinite(km) || km <= 0) {
      toast({ title: "Ingresá una distancia válida (km)", variant: "destructive" });
      return;
    }
    setSubmittingResult(true);
    try {
      const { data, error } = await supabase.functions.invoke("get-event-participant-by-token", {
        body: {
          action: "submit_distance_authenticated",
          reservation_id: reservation.id,
          distance_km: km,
          comment: resultNotes.trim() || null,
        },
      });
      if (error || !data?.ok) {
        toast({
          title: "No pudimos guardar tu resultado",
          description: data?.error || error?.message || "Intentá nuevamente.",
          variant: "destructive",
        });
        return;
      }
      toast({ title: "Resultado cargado correctamente ✓" });
      setShowResultForm(false);
      await loadParticipantByReservation(reservation.id, event!.id);
      logEventResultSubmission({
        eventId: event!.id,
        eventTitle: event?.title,
        alumnoId: alumno.id,
        alumnoEmail: alumno.email,
        source: "event_detail",
        distanceKm: km,
        comment: resultNotes.trim() || null,
        isEdit: !!data?.was_edit,
      });
    } finally {
      setSubmittingResult(false);
    }
  };

  const handleSubmitResult = async () => {
    if (!id || !alumno) return;
    setSubmittingResult(true);
    const payload = {
      distance_km: resultDistance ? parseFloat(resultDistance) : null,
      avg_speed_kmh: resultSpeed ? parseFloat(resultSpeed) : null,
      notes: resultNotes.trim() || null,
      updated_at: new Date().toISOString(),
    };
    let error;
    if (existingResult) {
      ({ error } = await supabase.from("event_results").update(payload as any).eq("id", existingResult.id));
    } else {
      ({ error } = await supabase.from("event_results").insert({ ...payload, event_id: id, alumno_id: alumno.id } as any));
    }
    setSubmittingResult(false);
    if (error) {
      toast({ title: "Error", description: "No se pudo guardar el resultado.", variant: "destructive" });
    } else {
      toast({ title: "Resultado cargado correctamente." });
      setShowResultForm(false);
      await loadResult(id, alumno.id);
      // Audit log: registra cada submit/edición
      logEventResultSubmission({
        eventId: id,
        eventTitle: event?.title,
        alumnoId: alumno.id,
        alumnoEmail: alumno.email,
        source: "event_detail",
        distanceKm: payload.distance_km,
        comment: payload.notes,
        isEdit: !!existingResult,
      });
    }
  };

  const handleReservationCreated = (resData: any) => {
    setReservation(resData as unknown as Reservation);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Cargando...</div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
        <p className="text-muted-foreground">Evento no encontrado.</p>
        <Button variant="outline" onClick={handleBack}>Volver</Button>
      </div>
    );
  }

  const d = new Date(event.date + "T12:00:00");
  const dateFormatted = d.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const priceDisplay = getEventPriceDisplay(event);
  const isPaid = priceDisplay.mode === "con_valor" && priceDisplay.price != null;
  const heroImage = event.image_url || placeholderImages[event.type] || placeholderImages.otro;
  const spotsLeft = event.max_capacity != null ? event.max_capacity - event.spots_taken : null;
  const eventPast = new Date(event.date + "T23:59:59") < new Date();
  // checkinOpensAt: si el evento define metadata.checkin_opens_at (timestamp ISO),
  // usamos ese momento para habilitar el check-in (permite abrir antes del día oficial).
  // Default: día del evento 00:00 hora local (split '-' para evitar drift de timezone).
  const [evY, evM, evD] = event.date.split("-").map(Number);
  const eventStartLocal = new Date(evY, (evM || 1) - 1, evD || 1, 0, 0, 0);
  const checkinOpensAt: Date = event.metadata?.checkin_opens_at
    ? new Date(event.metadata.checkin_opens_at)
    : eventStartLocal;
  const now = new Date();
  const eventStarted = now >= checkinOpensAt;
  const checkinOpensInFuture = !eventStarted && event.metadata?.checkin_opens_at;
  const checkinOpensLabel = checkinOpensInFuture
    ? checkinOpensAt.toLocaleString("es-AR", {
        weekday: "short",
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;
  const hasReservation = !!reservation;
  const isActiveReservation = hasReservation && !["cancelada", "rechazada"].includes(reservation!.reservation_status);

  // Event nature from metadata
  const eventNature: string = event.metadata?.event_nature || "propio_con_reserva";
  const isReservable = eventNature === "propio_con_reserva";
  const isInscriptionOnly = eventNature === "propio_solo_inscripcion";
  const isInformativeOnly = eventNature === "propio_informativo" || eventNature === "externo_informativo";
  const isExternal = eventNature === "externo_informativo";
  const allowsParticipation = isReservable || isInscriptionOnly;
  const isTripLike = event.type === "camp" || event.type === "viaje";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Hero Image */}
      <div className="relative">
        <div className="w-full h-[280px] md:h-[420px] overflow-hidden">
          <img src={heroImage} alt={event.title} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
        </div>
        <button
          onClick={handleBack}
          className="absolute top-4 left-4 w-9 h-9 rounded-full bg-background/80 backdrop-blur-sm flex items-center justify-center text-foreground hover:bg-background transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <button
          onClick={() => toggleFavorite(event.id)}
          className="absolute top-4 right-4 w-9 h-9 rounded-full bg-background/80 backdrop-blur-sm flex items-center justify-center hover:bg-background transition-colors"
        >
          <Heart className={`w-5 h-5 transition-colors ${isFavorite(event.id) ? "fill-red-500 text-red-500" : "text-foreground/70"}`} />
        </button>
        <div className="absolute bottom-4 left-4 flex items-center gap-2">
          <span className={`text-[10px] font-heading uppercase tracking-wider px-2.5 py-1 rounded-full border ${typeBadgeColors[event.type] || typeBadgeColors.otro}`}>
            {typeLabels[event.type] || event.type}
          </span>
        </div>
      </div>

      <main className="flex-1 px-4 pb-24 -mt-2">
        <div className="w-full max-w-md md:max-w-2xl mx-auto space-y-4 animate-fade-in">

          {/* Title & Date */}
          <div className="space-y-3">
            <h1 className="text-2xl font-heading font-bold text-foreground leading-tight">{event.title}</h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <CalendarDays className="w-4 h-4 text-primary" />
                <span className="capitalize">{dateFormatted}</span>
              </span>
              {event.start_time && (
                <span className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-primary" />
                  {event.start_time.slice(0, 5)} hs
                </span>
              )}
            </div>
            {event.location && (
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <MapPin className="w-4 h-4 text-primary" />
                <span>{event.location}</span>
              </div>
            )}
            {/* Quick event details inline when reserved (trips only) */}
            {isActiveReservation && isTripLike && (
              <div className="flex flex-wrap gap-2 pt-1">
                {event.duration_days && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-muted/60 text-xs text-muted-foreground">
                    <Sun className="w-3.5 h-3.5" /> {event.duration_days} día{event.duration_days > 1 ? "s" : ""}
                  </span>
                )}
                {event.duration_nights != null && event.duration_nights > 0 && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-muted/60 text-xs text-muted-foreground">
                    <Moon className="w-3.5 h-3.5" /> {event.duration_nights} noche{event.duration_nights > 1 ? "s" : ""}
                  </span>
                )}
                {event.level && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-muted/60 text-xs text-muted-foreground">
                    <Mountain className="w-3.5 h-3.5" /> {event.level}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* ═══════════════════════════════════════════════════════════ */}
          {/* PRIORITY: Active reservation → show status card FIRST      */}
          {/* ═══════════════════════════════════════════════════════════ */}
          {alumno && isActiveReservation && reservation && (
            <ReservationStatusCard
              reservation={reservation}
              alumnoId={alumno.id}
              eventCurrency={event.currency}
              eventDate={event.date}
              eventTitle={event.title}
              eventType={event.type}
              eventMetadata={event.metadata}
              reglamentoUrl={event.metadata?.reglamento}
              whatsappUrl={event.metadata?.whatsapp_url}
              alumnoNombre={alumno?.nombre}
              onPaymentReported={loadReservation}
            />
          )}

          {/* Event Announcements — show after status when reserved */}
          {id && isActiveReservation && !["carrera"].includes(event.type) && (
            <EventAnnouncementsSection eventId={id} />
          )}

          {/* ═══════════════════════════════════════════════════════════ */}
          {/* Price & Quick Details — only when NOT reserved             */}
          {/* ═══════════════════════════════════════════════════════════ */}
          {!isActiveReservation && (isPaid || priceDisplay.mode === "gratuito" || event.max_capacity || event.duration_days) && (
            <div className="glass-card rounded-xl p-5 space-y-4">
              {isPaid && (() => {
                const disc = applyDiscount(priceDisplay.price!, "eventos");
                return (
                <div className="flex items-baseline justify-between">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-heading">Precio por persona</p>
                    {disc.discount ? (
                      <>
                        <p className="text-sm text-muted-foreground line-through">{formatPrice(disc.original, priceDisplay.currency)}</p>
                        <p className="text-2xl font-heading font-bold text-primary leading-tight">
                          {formatPrice(disc.final, priceDisplay.currency)}
                        </p>
                        <p className="text-xs text-emerald-400">{disc.discount.nombre} (-{disc.discount.valor}%)</p>
                      </>
                    ) : (
                      <p className="text-2xl font-heading font-bold text-primary leading-tight">
                        {formatPrice(priceDisplay.price!, priceDisplay.currency)}
                      </p>
                    )}
                  </div>
                  {spotsLeft != null && (
                    <div className={`text-right ${spotsLeft <= 5 ? "text-destructive" : "text-muted-foreground"}`}>
                      <p className="text-lg font-heading font-bold">{spotsLeft > 0 ? spotsLeft : 0}</p>
                      <p className="text-[10px] uppercase tracking-wider">cupos</p>
                    </div>
                  )}
                </div>
                );
              })()}
              {priceDisplay.mode === "gratuito" && (
                <div className="flex items-baseline justify-between">
                  <p className="text-sm font-heading font-semibold text-emerald-400">Evento gratuito</p>
                  {spotsLeft != null && (
                    <div className={`text-right ${spotsLeft <= 5 ? "text-destructive" : "text-muted-foreground"}`}>
                      <p className="text-lg font-heading font-bold">{spotsLeft > 0 ? spotsLeft : 0}</p>
                      <p className="text-[10px] uppercase tracking-wider">cupos</p>
                    </div>
                  )}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {event.duration_days && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-muted/60 text-xs text-muted-foreground">
                    <Sun className="w-3.5 h-3.5" /> {event.duration_days} día{event.duration_days > 1 ? "s" : ""}
                  </span>
                )}
                {event.duration_nights != null && event.duration_nights > 0 && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-muted/60 text-xs text-muted-foreground">
                    <Moon className="w-3.5 h-3.5" /> {event.duration_nights} noche{event.duration_nights > 1 ? "s" : ""}
                  </span>
                )}
                {event.level && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-muted/60 text-xs text-muted-foreground">
                    <Mountain className="w-3.5 h-3.5" /> {event.level}
                  </span>
                )}
                {!isPaid && priceDisplay.mode !== "gratuito" && spotsLeft != null && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-muted/60 text-xs text-muted-foreground">
                    <Users className="w-3.5 h-3.5" /> {spotsLeft > 0 ? `${spotsLeft} cupos` : "Sin cupos"}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* ═══ NO RESERVATION CTAs ═══ */}
          {alumno && allowsParticipation && !hasReservation && !eventPast && spotsLeft !== 0 && (
            <div className="glass-card rounded-xl p-5 space-y-4 animate-fade-in">
              <div className="text-center space-y-2">
                <h3 className="font-heading font-semibold text-foreground">
                  {isInscriptionOnly ? "¿Querés inscribirte?" : "¿Querés reservar tu lugar?"}
                </h3>
              </div>
              <Button variant="gold" className="w-full h-12 text-sm" onClick={() => setShowReservationDrawer(true)}>
                {isInscriptionOnly ? (
                  <><CheckCircle className="w-4 h-4 mr-2" /> Inscribirme</>
                ) : (
                  <><CreditCard className="w-4 h-4 mr-2" /> Reservar</>
                )}
              </Button>
            </div>
          )}

          {alumno && allowsParticipation && !hasReservation && !eventPast && spotsLeft === 0 && (
            <div className="glass-card rounded-xl p-5 text-center space-y-2 animate-fade-in">
              <Users className="w-8 h-8 text-muted-foreground mx-auto" />
              <p className="text-sm text-muted-foreground">No hay cupos disponibles en este momento.</p>
            </div>
          )}

          {!alumno && allowsParticipation && !eventPast && (
            <div className="glass-card rounded-xl p-5 space-y-3 animate-fade-in text-center">
              <p className="text-sm text-muted-foreground">
                {isInscriptionOnly ? "Iniciá sesión para inscribirte." : "Iniciá sesión para reservar tu lugar."}
              </p>
              <Button variant="gold" onClick={() => navigate(`/?returnTo=${encodeURIComponent(window.location.pathname)}`)}>Iniciar sesión</Button>
            </div>
          )}

          {/* Cancelled/rejected → re-reserve */}
          {alumno && allowsParticipation && hasReservation && !isActiveReservation && !eventPast && spotsLeft !== 0 && (
            <div className="glass-card rounded-xl p-5 space-y-3 animate-fade-in">
              <p className="text-sm text-muted-foreground text-center">
                Tu {isInscriptionOnly ? "inscripción" : "reserva"} anterior fue {reservation!.reservation_status === "cancelada" ? "cancelada" : "rechazada"}.
                Podés iniciar una nueva si lo deseás.
              </p>
              <Button variant="gold" className="w-full" onClick={() => setShowReservationDrawer(true)}>
                {isInscriptionOnly ? (
                  <><CheckCircle className="w-4 h-4 mr-2" /> Nueva inscripción</>
                ) : (
                  <><CreditCard className="w-4 h-4 mr-2" /> Nueva reserva</>
                )}
              </Button>
            </div>
          )}

          {/* Informative events */}
          {isInformativeOnly && !eventPast && (
            <div className="glass-card rounded-xl p-5 text-center space-y-3 animate-fade-in">
              <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto" />
              <p className="text-sm text-muted-foreground">
                {isExternal
                  ? "Este evento es organizado por un tercero. Te lo compartimos porque puede ser de tu interés."
                  : "Este evento es solo informativo. No requiere inscripción."}
              </p>
              {event.metadata?.web_url && (
                <a href={event.metadata.web_url} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" className="mt-2">
                    <ExternalLink className="w-4 h-4 mr-2" /> Ver sitio del organizador
                  </Button>
                </a>
              )}
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════ */}
          {/* SECONDARY CONTENT: Description, Itinerary, etc.           */}
          {/* ═══════════════════════════════════════════════════════════ */}

          {/* Description */}
          {(event.description || event.short_description) && (
            <div className="glass-card rounded-xl p-5 space-y-2">
              <h3 className="font-heading font-semibold text-sm text-foreground uppercase tracking-wide">
                {isActiveReservation && isTripLike ? "Sobre el viaje" : "Descripción"}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                {event.description || event.short_description}
              </p>
            </div>
          )}

          {/* Itinerary */}
          {event.metadata?.itinerario && Array.isArray(event.metadata.itinerario) && event.metadata.itinerario.length > 0 && (
            <div className="glass-card rounded-xl p-5 space-y-3">
              <h3 className="font-heading font-semibold text-sm text-foreground uppercase tracking-wide">Itinerario</h3>
              <div className="space-y-2">
                {event.metadata.itinerario.map((item: any, i: number) => (
                  <div key={i} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="w-2 h-2 rounded-full bg-primary mt-1.5" />
                      {i < event.metadata.itinerario.length - 1 && <div className="w-px flex-1 bg-border" />}
                    </div>
                    <div className="pb-3">
                      {item.dia && <p className="text-xs font-heading font-semibold text-primary">{item.dia}</p>}
                      <p className="text-sm text-muted-foreground">{item.descripcion || item}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* What's included */}
          {event.metadata?.incluye && Array.isArray(event.metadata.incluye) && event.metadata.incluye.length > 0 && (
            <div className="glass-card rounded-xl p-5 space-y-3">
              <h3 className="font-heading font-semibold text-sm text-foreground uppercase tracking-wide">¿Qué incluye?</h3>
              <ul className="space-y-1.5">
                {event.metadata.incluye.map((item: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <CheckCircle className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" /> {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* More info links */}
          {(event.metadata?.reglamento || event.metadata?.web_url || event.metadata?.whatsapp_url) && !isActiveReservation && (
            <div className="glass-card rounded-xl p-5 space-y-3">
              <h3 className="font-heading font-semibold text-sm text-foreground uppercase tracking-wide">Más información</h3>
              <div className="flex flex-wrap gap-2">
                {event.metadata.reglamento && (
                  <a href={event.metadata.reglamento} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted/60 text-xs text-muted-foreground hover:text-foreground transition-colors">
                    <FileText className="w-3.5 h-3.5" /> Reglamento
                  </a>
                )}
                {event.metadata.web_url && (
                  <a href={event.metadata.web_url} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted/60 text-xs text-muted-foreground hover:text-foreground transition-colors">
                    <ExternalLink className="w-3.5 h-3.5" /> Ver web
                  </a>
                )}
                {event.metadata.whatsapp_url && (
                  <a href={event.metadata.whatsapp_url} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/15 text-xs text-emerald-400 hover:text-emerald-300 transition-colors">
                    <MessageCircle className="w-3.5 h-3.5" /> Chatear por WhatsApp
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Event Announcements — when NOT reserved (already shown above for reserved) */}
          {id && !isActiveReservation && !["carrera"].includes(event.type) && (
            <EventAnnouncementsSection eventId={id} />
          )}

          {/* Student result section — record_hora allows anytime; others only after event */}
          {alumno && event.type !== "camp" && event.type !== "viaje" && (eventPast || event.type === "record_hora") && (
            <>
              {event.type === "record_hora" ? (
                // ─── RECORD DE LA HORA: flujo del alumno logueado (Etapa 2B) ───
                !isActiveReservation ? null : !eventStarted ? (
                  // El evento todavía no ocurrió → no permitir check-in ni cargar resultado
                  <div className="glass-card rounded-xl p-5 space-y-2 border border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-5 h-5 text-primary" />
                      <h2 className="font-heading text-base font-semibold uppercase tracking-wide">Inscripción confirmada</h2>
                    </div>
                    {checkinOpensLabel ? (
                      <>
                        <p className="text-sm text-foreground/90">
                          El check-in abre el <span className="font-semibold text-primary">{checkinOpensLabel} hs</span>.
                        </p>
                        <p className="text-xs text-muted-foreground/80">
                          A esa hora vas a ver el botón <span className="font-semibold text-foreground/90">"Estoy presente"</span> para confirmar tu asistencia y luego cargar tu resultado.
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm text-muted-foreground">Te esperamos el día del evento.</p>
                        <p className="text-xs text-muted-foreground/80">
                          La carga de resultado estará disponible el día del evento.
                        </p>
                      </>
                    )}
                  </div>
                ) : !reservation?.checkin_at ? (
                  // Tiene reserva activa pero todavía no hizo check-in
                  <div className="glass-card rounded-xl p-5 space-y-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-5 h-5 text-primary" />
                      <h2 className="font-heading text-base font-semibold uppercase tracking-wide">Estás inscripto</h2>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      El día del evento, tocá <span className="font-semibold text-foreground">"Estoy presente"</span> para confirmar tu asistencia. Después vas a poder cargar tu distancia.
                    </p>
                    <Button
                      variant="gold"
                      className="w-full h-12"
                      onClick={handleCheckIn}
                      disabled={checkingIn}
                    >
                      {checkingIn ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Registrando…</>
                      ) : (
                        <><CheckCircle className="w-4 h-4 mr-2" /> Estoy presente</>
                      )}
                    </Button>
                  </div>
                ) : participantResult?.time_value !== null && participantResult?.time_value !== undefined && !showResultForm ? (
                  // Ya cargó resultado — mostrarlo con opción de editar
                  <div className="glass-card rounded-xl p-5 space-y-3">
                    <div className="flex items-center gap-2">
                      <Gauge className="w-5 h-5 text-primary" />
                      <h2 className="font-heading text-base font-semibold uppercase tracking-wide">Mi resultado</h2>
                    </div>
                    <p className="text-lg font-semibold text-primary">{Number(participantResult.time_value).toFixed(2)} km</p>
                    {participantResult.participant_comment && (
                      <p className="text-sm text-muted-foreground">{participantResult.participant_comment}</p>
                    )}
                    {participantResult.results_updated_at && (
                      <p className="text-xs text-muted-foreground">
                        Última actualización: {new Date(participantResult.results_updated_at).toLocaleString("es-AR")}
                      </p>
                    )}
                    <Button
                      variant="gold-outline"
                      className="w-full"
                      onClick={() => {
                        setResultDistance(String(participantResult.time_value ?? ""));
                        setResultNotes(participantResult.participant_comment || "");
                        setShowResultForm(true);
                      }}
                    >
                      <Ruler className="w-4 h-4 mr-2" /> Editar mi resultado
                    </Button>
                  </div>
                ) : showResultForm ? (
                  // Form inline para cargar/editar
                  <div className="glass-card rounded-xl p-5 space-y-4">
                    <div className="flex items-center gap-2">
                      <Send className="w-5 h-5 text-primary" />
                      <h2 className="font-heading text-base font-semibold uppercase tracking-wide">
                        {participantResult?.time_value != null ? "Editar resultado" : "Cargar resultado"}
                      </h2>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground mb-2 block">Distancia (km)</Label>
                      <Input
                        type="number" step="0.01" min="0" placeholder="Ej: 38.42"
                        value={resultDistance}
                        onChange={(e) => setResultDistance(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground mb-2 block">Comentario (opcional)</Label>
                      <Textarea
                        placeholder="¿Cómo te fue? ¿Algún detalle a contar?"
                        value={resultNotes}
                        onChange={(e) => setResultNotes(e.target.value)}
                        rows={2}
                        maxLength={1000}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="gold"
                        className="flex-1"
                        onClick={handleSubmitRecordResult}
                        disabled={submittingResult}
                      >
                        {submittingResult ? (
                          <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Enviando…</>
                        ) : (
                          "Enviar resultado"
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setShowResultForm(false);
                          if (participantResult?.time_value != null) {
                            setResultDistance(String(participantResult.time_value));
                            setResultNotes(participantResult.participant_comment || "");
                          } else {
                            setResultDistance("");
                            setResultNotes("");
                          }
                        }}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  // Hizo check-in pero todavía no cargó resultado
                  <div className="glass-card rounded-xl p-5 space-y-3">
                    <div className="flex items-center gap-2">
                      <Ruler className="w-5 h-5 text-primary" />
                      <h2 className="font-heading text-base font-semibold uppercase tracking-wide">Cargar mi resultado</h2>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Hiciste check-in. Cuando termines, cargá tu distancia para sumarte al ranking.
                    </p>
                    <Button
                      variant="gold"
                      className="w-full h-12"
                      onClick={() => {
                        setResultDistance("");
                        setResultNotes("");
                        setShowResultForm(true);
                      }}
                    >
                      <Ruler className="w-4 h-4 mr-2" /> Cargar mi resultado
                    </Button>
                  </div>
                )
              ) : existingResult && !showResultForm ? (
                <div className="glass-card rounded-xl p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <Ruler className="w-5 h-5 text-primary" />
                    <h2 className="font-heading text-base font-semibold uppercase tracking-wide">Mi resultado</h2>
                  </div>
                  {existingResult.avg_speed_kmh !== null && (
                    <p className="text-lg font-semibold text-primary">{existingResult.avg_speed_kmh.toFixed(1)} km/h</p>
                  )}
                  {existingResult.distance_km !== null && (
                    <p className="text-sm text-muted-foreground">Distancia: {existingResult.distance_km.toFixed(1)} km</p>
                  )}
                  <Button variant="gold-outline" className="w-full" onClick={() => setShowResultForm(true)}>
                    Editar resultado
                  </Button>
                </div>
              ) : showResultForm ? (
                <div className="glass-card rounded-xl p-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <Send className="w-5 h-5 text-primary" />
                    <h2 className="font-heading text-base font-semibold uppercase tracking-wide">
                      {existingResult ? "Editar resultado" : "Cargar resultado"}
                    </h2>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-2 block">Velocidad promedio (km/h)</Label>
                    <Input type="number" step="0.1" min="0" placeholder="Ej: 38.5" value={resultSpeed} onChange={(e) => setResultSpeed(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-2 block">Distancia (km)</Label>
                    <Input type="number" step="0.1" min="0" placeholder="Ej: 32.5" value={resultDistance} onChange={(e) => setResultDistance(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-2 block">Observaciones</Label>
                    <Textarea placeholder="Alguna observación..." value={resultNotes} onChange={(e) => setResultNotes(e.target.value)} rows={2} />
                  </div>
                  <div className="flex gap-2">
                    <Button variant="gold" className="flex-1" onClick={handleSubmitResult} disabled={submittingResult}>
                      {submittingResult ? "Enviando..." : "Enviar resultado"}
                    </Button>
                    <Button variant="outline" onClick={() => {
                      setShowResultForm(false);
                      if (existingResult) {
                        setResultDistance(existingResult.distance_km?.toString() || "");
                        setResultSpeed(existingResult.avg_speed_kmh?.toString() || "");
                        setResultNotes(existingResult.notes || "");
                      }
                    }}>Cancelar</Button>
                  </div>
                </div>
              ) : (
                <Button variant="gold" className="w-full h-12" onClick={() => setShowResultForm(true)}>
                  <Ruler className="w-4 h-4 mr-2" /> Cargar mi resultado
                </Button>
              )}
            </>
          )}

          {/* Rankings */}
          {id && <EventRankings eventId={id} eventType={event.type} eventDate={event.date} />}
        </div>
      </main>

      <BottomNav activeTab="eventos" />

      {/* Reservation Drawer */}
      {alumno && event && allowsParticipation && (
        <ReservationDrawer
          open={showReservationDrawer}
          onOpenChange={setShowReservationDrawer}
          event={event}
          alumno={alumno}
          onReserved={handleReservationCreated}
          eventNature={eventNature}
        />
      )}

    </div>
  );
};

export default EventDetail;
