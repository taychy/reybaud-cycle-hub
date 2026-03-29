import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, CalendarDays, Clock, Pencil, Trash2, Ruler, Send, Gauge,
  MapPin, Users, CheckCircle, Mountain, Moon, Sun, Shield,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import logo from "@/assets/logo.png";
import EventRankings from "@/components/EventRankings";
import EventCashReservation from "@/components/EventCashReservation";
import BottomNav from "@/components/BottomNav";
import { formatPrice } from "@/lib/currency";
import type { Tables } from "@/integrations/supabase/types";

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
  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ title: "", description: "", date: "", start_time: "" });
  const [saving, setSaving] = useState(false);
  const [hasReservation, setHasReservation] = useState(false);
  const [reservationStatus, setReservationStatus] = useState<string | null>(null);

  const [alumno, setAlumno] = useState<Alumno | null>(null);
  const [existingResult, setExistingResult] = useState<{ id: string; distance_km: number | null; avg_speed_kmh: number | null; notes: string | null } | null>(null);
  const [showResultForm, setShowResultForm] = useState(false);
  const [resultDistance, setResultDistance] = useState("");
  const [resultSpeed, setResultSpeed] = useState("");
  const [resultNotes, setResultNotes] = useState("");
  const [submittingResult, setSubmittingResult] = useState(false);
  const [participantResult, setParticipantResult] = useState<{ id: string; time_value: number | null; participant_comment: string | null } | null>(null);

  useEffect(() => {
    if (!id) return;

    supabase
      .from("events")
      .select("*")
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          const e = data as unknown as Event;
          setEvent(e);
          setEditForm({
            title: e.title,
            description: e.description || "",
            date: e.date,
            start_time: e.start_time || "",
          });
        }
        setLoading(false);
      });

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        supabase.rpc("has_role", { _user_id: user.id, _role: "admin" }).then(({ data }) => {
          if (data) setIsAdmin(true);
        });
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.email) {
        supabase
          .from("alumnos")
          .select("*")
          .eq("email", session.user.email.toLowerCase().trim())
          .maybeSingle()
          .then(({ data: alumnoData }) => {
            if (alumnoData) {
              setAlumno(alumnoData);
              loadResult(id, alumnoData.id);
              loadParticipantResult(alumnoData.email);
              supabase
                .from("event_reservations")
                .select("id, estado")
                .eq("event_id", id)
                .eq("alumno_id", alumnoData.id)
                .maybeSingle()
                .then(({ data: resData }) => {
                  if (resData) {
                    setHasReservation(true);
                    setReservationStatus((resData as any).estado);
                  }
                });
            }
          });
      }
    });
  }, [id]);

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

  const loadParticipantResult = async (email: string) => {
    const { data } = await supabase
      .from("event_participants")
      .select("id, time_value, participant_comment")
      .eq("event_slug", "record-de-la-hora")
      .eq("email", email)
      .maybeSingle();
    if (data) setParticipantResult(data as any);
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
    }
  };

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    const { error } = await supabase
      .from("events")
      .update({
        title: editForm.title,
        description: editForm.description || null,
        date: editForm.date,
        start_time: editForm.start_time || null,
        updated_at: new Date().toISOString(),
      } as any)
      .eq("id", id);
    setSaving(false);
    if (error) {
      toast({ title: "Error", description: "No se pudo guardar.", variant: "destructive" });
    } else {
      toast({ title: "Evento actualizado" });
      setEditing(false);
      setEvent((prev) => prev ? { ...prev, ...editForm, description: editForm.description || null, start_time: editForm.start_time || null } : prev);
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    const { error } = await supabase.from("events").delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: "No se pudo eliminar.", variant: "destructive" });
    } else {
      toast({ title: "Evento eliminado" });
      navigate("/eventos", { replace: true });
    }
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
        <Button variant="outline" onClick={() => navigate("/eventos")}>Volver</Button>
      </div>
    );
  }

  const d = new Date(event.date + "T12:00:00");
  const dateFormatted = d.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const isPaid = event.price != null && event.price > 0;
  const isViajeCamp = ["camp", "viaje"].includes(event.type);
  const heroImage = event.image_url || placeholderImages[event.type] || placeholderImages.otro;
  const spotsLeft = event.max_capacity != null ? event.max_capacity - event.spots_taken : null;
  const eventPast = new Date(event.date + "T23:59:59") < new Date();

  const reservationBadge = reservationStatus === "pago_confirmado"
    ? { label: "Pago confirmado", className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" }
    : reservationStatus === "pendiente_verificacion"
    ? { label: "Pendiente de verificación", className: "bg-amber-500/20 text-amber-400 border-amber-500/30" }
    : null;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Hero Image */}
      <div className="relative">
        <div className="aspect-[16/9] max-h-[280px] overflow-hidden">
          <img
            src={heroImage}
            alt={event.title}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
        </div>
        {/* Floating back button */}
        <button
          onClick={() => navigate("/eventos")}
          className="absolute top-4 left-4 w-9 h-9 rounded-full bg-background/80 backdrop-blur-sm flex items-center justify-center text-foreground hover:bg-background transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        {/* Type badge on hero */}
        <div className="absolute bottom-4 left-4 flex items-center gap-2">
          <span className={`text-[10px] font-heading uppercase tracking-wider px-2.5 py-1 rounded-full border ${typeBadgeColors[event.type] || typeBadgeColors.otro}`}>
            {typeLabels[event.type] || event.type}
          </span>
          {hasReservation && reservationBadge && (
            <span className={`text-[10px] font-heading uppercase tracking-wider px-2.5 py-1 rounded-full border flex items-center gap-1 ${reservationBadge.className}`}>
              <CheckCircle className="w-3 h-3" />
              {reservationBadge.label}
            </span>
          )}
        </div>
      </div>

      <main className="flex-1 px-4 pb-24 -mt-2">
        <div className="w-full max-w-md mx-auto space-y-4 animate-fade-in">

          {/* Admin editing form */}
          {isAdmin && editing ? (
            <div className="glass-card rounded-xl p-5 space-y-4">
              <h2 className="font-heading font-semibold text-foreground">Editar evento</h2>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Nombre</label>
                <Input value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Fecha</label>
                <Input type="date" value={editForm.date} onChange={(e) => setEditForm({ ...editForm, date: e.target.value })} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Hora de inicio</label>
                <Input type="time" value={editForm.start_time} onChange={(e) => setEditForm({ ...editForm, start_time: e.target.value })} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Descripción</label>
                <Textarea value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} rows={3} />
              </div>
              <div className="flex gap-2">
                <Button variant="gold" size="sm" onClick={handleSave} disabled={saving}>
                  {saving ? "Guardando..." : "Guardar"}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>Cancelar</Button>
              </div>
            </div>
          ) : (
            <>
              {/* Title & Date Card */}
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

                {/* Admin actions - only for admins */}
                {isAdmin && (
                  <div className="flex gap-2 pt-1">
                    <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                      <Pencil className="w-4 h-4 mr-1" /> Editar
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                          <Trash2 className="w-4 h-4 mr-1" /> Eliminar
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>¿Eliminar evento?</AlertDialogTitle>
                          <AlertDialogDescription>Se eliminará "{event.title}" de forma permanente.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Eliminar</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}
              </div>

              {/* Price & Details Card */}
              {(isPaid || event.max_capacity || isViajeCamp) && (
                <div className="glass-card rounded-xl p-5 space-y-4">
                  {/* Price prominent */}
                  {isPaid && (
                    <div className="flex items-baseline justify-between">
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-heading">Precio por persona</p>
                        <p className="text-2xl font-heading font-bold text-primary leading-tight">
                          {formatPrice(event.price!, event.currency)}
                        </p>
                      </div>
                      {spotsLeft != null && (
                        <div className={`text-right ${spotsLeft <= 5 ? "text-destructive" : "text-muted-foreground"}`}>
                          <p className="text-lg font-heading font-bold">{spotsLeft > 0 ? spotsLeft : 0}</p>
                          <p className="text-[10px] uppercase tracking-wider">cupos</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Quick info pills */}
                  <div className="flex flex-wrap gap-2">
                    {event.duration_days && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-muted/60 text-xs text-muted-foreground">
                        <Sun className="w-3.5 h-3.5" />
                        {event.duration_days} día{event.duration_days > 1 ? "s" : ""}
                      </span>
                    )}
                    {event.duration_nights != null && event.duration_nights > 0 && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-muted/60 text-xs text-muted-foreground">
                        <Moon className="w-3.5 h-3.5" />
                        {event.duration_nights} noche{event.duration_nights > 1 ? "s" : ""}
                      </span>
                    )}
                    {event.level && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-muted/60 text-xs text-muted-foreground">
                        <Mountain className="w-3.5 h-3.5" />
                        {event.level}
                      </span>
                    )}
                    {!isPaid && spotsLeft != null && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-muted/60 text-xs text-muted-foreground">
                        <Users className="w-3.5 h-3.5" />
                        {spotsLeft > 0 ? `${spotsLeft} cupos` : "Sin cupos"}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Description */}
              {(event.description || event.short_description) && (
                <div className="glass-card rounded-xl p-5 space-y-2">
                  <h3 className="font-heading font-semibold text-sm text-foreground uppercase tracking-wide">Descripción</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                    {event.description || event.short_description}
                  </p>
                </div>
              )}

              {/* Itinerary from metadata */}
              {event.metadata?.itinerario && Array.isArray(event.metadata.itinerario) && event.metadata.itinerario.length > 0 && (
                <div className="glass-card rounded-xl p-5 space-y-3">
                  <h3 className="font-heading font-semibold text-sm text-foreground uppercase tracking-wide">Itinerario</h3>
                  <div className="space-y-2">
                    {event.metadata.itinerario.map((item: any, i: number) => (
                      <div key={i} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div className="w-2 h-2 rounded-full bg-primary mt-1.5" />
                          {i < event.metadata.itinerario.length - 1 && (
                            <div className="w-px flex-1 bg-border" />
                          )}
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

              {/* What's included from metadata */}
              {event.metadata?.incluye && Array.isArray(event.metadata.incluye) && event.metadata.incluye.length > 0 && (
                <div className="glass-card rounded-xl p-5 space-y-3">
                  <h3 className="font-heading font-semibold text-sm text-foreground uppercase tracking-wide">¿Qué incluye?</h3>
                  <ul className="space-y-1.5">
                    {event.metadata.incluye.map((item: string, i: number) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <CheckCircle className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Cash reservation for paid events */}
              {alumno && !hasReservation && isPaid && spotsLeft !== 0 && (
                <EventCashReservation
                  eventId={event.id}
                  eventTitle={event.title}
                  alumnoId={alumno.id}
                  price={event.price}
                  currency={event.currency || "ARS"}
                  onReserved={() => {
                    setHasReservation(true);
                    setReservationStatus("pendiente_verificacion");
                  }}
                />
              )}

              {/* Already reserved indicator */}
              {alumno && hasReservation && (
                <div className="glass-card rounded-xl p-5 text-center space-y-2">
                  <div className="flex items-center justify-center gap-2 text-primary">
                    <CheckCircle className="w-5 h-5" />
                    <span className="font-heading font-semibold text-sm">Reserva registrada</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {reservationStatus === "pago_confirmado"
                      ? "¡Tu pago fue confirmado! Nos vemos ahí 🎉"
                      : "Tu pago está pendiente de verificación por el administrador."}
                  </p>
                </div>
              )}

              {/* Student result section — only show AFTER the event date */}
              {alumno && eventPast && (
                <>
                  {event.type === "record_hora" && participantResult ? (
                    <div className="glass-card rounded-xl p-5 space-y-3">
                      <div className="flex items-center gap-2">
                        <Gauge className="w-5 h-5 text-primary" />
                        <h2 className="font-heading text-base font-semibold uppercase tracking-wide">Mi resultado</h2>
                      </div>
                      {participantResult.time_value !== null && (
                        <p className="text-lg font-semibold text-primary">{participantResult.time_value.toFixed(1)} km</p>
                      )}
                      {participantResult.participant_comment && (
                        <p className="text-sm text-muted-foreground">{participantResult.participant_comment}</p>
                      )}
                    </div>
                  ) : event.type === "record_hora" && !participantResult ? null : existingResult && !showResultForm ? (
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
                        <Pencil className="w-4 h-4 mr-2" /> Editar resultado
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
              {id && <EventRankings eventId={id} eventType={event.type} />}
            </>
          )}
        </div>
      </main>
      <BottomNav activeTab="eventos" />
    </div>
  );
};

export default EventDetail;
