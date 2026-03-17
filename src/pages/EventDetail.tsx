import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, CalendarDays, Clock, Pencil, Trash2, Ruler, Send, Gauge } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
import logo from "@/assets/logo.png";
import EventRankings from "@/components/EventRankings";
import BottomNav from "@/components/BottomNav";
import type { Tables } from "@/integrations/supabase/types";

type Alumno = Tables<"alumnos">;

interface Event {
  id: string;
  title: string;
  description: string | null;
  date: string;
  start_time: string | null;
  end_time: string | null;
  type: string;
  is_active: boolean;
  visible_to_students: boolean;
}

const typeLabels: Record<string, string> = {
  record_hora: "Record de la Hora",
  camp: "Camp",
  carrera: "Carrera",
  otro: "Evento",
  viaje: "Viaje",
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

  // Student result state
  const [alumno, setAlumno] = useState<Alumno | null>(null);
  const [existingResult, setExistingResult] = useState<{ id: string; distance_km: number | null; avg_speed_kmh: number | null; notes: string | null } | null>(null);
  const [showResultForm, setShowResultForm] = useState(false);
  const [resultDistance, setResultDistance] = useState("");
  const [resultSpeed, setResultSpeed] = useState("");
  const [resultNotes, setResultNotes] = useState("");
  const [submittingResult, setSubmittingResult] = useState(false);

  // For record_hora: check event_participants by email
  const [participantResult, setParticipantResult] = useState<{ id: string; time_value: number | null; participant_comment: string | null } | null>(null);

  useEffect(() => {
    if (!id) return;

    // Load event
    supabase
      .from("events")
      .select("*")
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          const e = data as Event;
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

    // Check admin role
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        supabase.rpc("has_role", { _user_id: user.id, _role: "admin" }).then(({ data }) => {
          if (data) setIsAdmin(true);
        });
      }
    });

    // Check if student is logged in via Supabase Auth
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
    if (data) {
      setParticipantResult(data as any);
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
      ({ error } = await supabase
        .from("event_results")
        .update(payload as any)
        .eq("id", existingResult.id));
    } else {
      ({ error } = await supabase
        .from("event_results")
        .insert({ ...payload, event_id: id, alumno_id: alumno.id } as any));
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

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="flex items-center gap-3 px-5 pt-5 pb-2">
        <button onClick={() => navigate("/eventos")} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <img src={logo} alt="Ciclismo Reybaud" className="w-8 h-8" />
      </header>

      <main className="flex-1 px-4 pb-24">
        <div className="w-full max-w-md mx-auto space-y-5 animate-fade-in pt-2">
          {editing ? (
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
            <div className="glass-card rounded-xl p-5 space-y-4">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <span className="inline-block text-[10px] font-heading uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/15 text-primary">
                    {typeLabels[event.type] || event.type}
                  </span>
                  <h1 className="text-xl font-heading font-bold text-foreground">{event.title}</h1>
                </div>
              </div>

              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CalendarDays className="w-4 h-4" />
                <span className="capitalize">{dateFormatted}</span>
              </div>

              {event.start_time && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="w-4 h-4" />
                  <span>{event.start_time.slice(0, 5)} hs</span>
                </div>
              )}

              {event.description && (
                <p className="text-sm text-muted-foreground leading-relaxed">{event.description}</p>
              )}

              {isAdmin && (
                <div className="flex gap-2 pt-2 border-t border-border">
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
                        <AlertDialogDescription>
                          Se eliminará "{event.title}" de forma permanente.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                          Eliminar
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}
            </div>
          )}

          {/* Student result section - below event card */}
          {alumno && !editing && (
            <>
              {/* For record_hora: show participant result from event_participants */}
              {event.type === "record_hora" && participantResult ? (
                <div className="glass-card rounded-xl p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <Gauge className="w-5 h-5 text-primary" />
                    <h2 className="font-heading text-base font-semibold uppercase tracking-wide">Mi resultado</h2>
                  </div>
                  {participantResult.time_value !== null && (
                    <p className="text-lg font-semibold text-primary">
                      {participantResult.time_value.toFixed(1)} km
                    </p>
                  )}
                  {participantResult.participant_comment && (
                    <p className="text-sm text-muted-foreground">
                      {participantResult.participant_comment}
                    </p>
                  )}
                </div>
              ) : event.type === "record_hora" && !participantResult ? (
                /* record_hora but no participant entry yet - show nothing or a message */
                null
              ) : existingResult && !showResultForm ? (
                <div className="glass-card rounded-xl p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <Ruler className="w-5 h-5 text-primary" />
                    <h2 className="font-heading text-base font-semibold uppercase tracking-wide">Mi resultado</h2>
                  </div>
                  {existingResult.avg_speed_kmh !== null && (
                    <p className="text-lg font-semibold text-primary">
                      {existingResult.avg_speed_kmh.toFixed(1)} km/h
                    </p>
                  )}
                  {existingResult.distance_km !== null && (
                    <p className="text-sm text-muted-foreground">
                      Distancia: {existingResult.distance_km.toFixed(1)} km
                    </p>
                  )}
                  <Button
                    variant="gold-outline"
                    className="w-full"
                    onClick={() => setShowResultForm(true)}
                  >
                    <Pencil className="w-4 h-4 mr-2" />
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
                    <Label className="text-xs text-muted-foreground mb-2 block">Velocidad promedio (km/h) — opcional</Label>
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      placeholder="Ej: 38.5"
                      value={resultSpeed}
                      onChange={(e) => setResultSpeed(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-2 block">Distancia (km) — opcional</Label>
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      placeholder="Ej: 32.5"
                      value={resultDistance}
                      onChange={(e) => setResultDistance(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-2 block">Observaciones — opcional</Label>
                    <Textarea
                      placeholder="Alguna observación sobre tu resultado..."
                      value={resultNotes}
                      onChange={(e) => setResultNotes(e.target.value)}
                      rows={2}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="gold"
                      className="flex-1"
                      onClick={handleSubmitResult}
                      disabled={submittingResult}
                    >
                      {submittingResult ? "Enviando..." : "Enviar resultado"}
                    </Button>
                    <Button variant="outline" onClick={() => {
                      setShowResultForm(false);
                      if (existingResult) {
                        setResultDistance(existingResult.distance_km?.toString() || "");
                        setResultSpeed(existingResult.avg_speed_kmh?.toString() || "");
                        setResultNotes(existingResult.notes || "");
                      }
                    }}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="gold"
                  className="w-full h-12"
                  onClick={() => setShowResultForm(true)}
                >
                  <Ruler className="w-4 h-4 mr-2" />
                  Cargar mi resultado
                </Button>
              )}
            </>
          )}
          {/* Rankings section */}
          {!editing && id && (
            <EventRankings eventId={id} eventType={event.type} />
          )}
        </div>
      </main>
      <BottomNav />
    </div>
  );
};

export default EventDetail;
