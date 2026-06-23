import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, Clock, MapPin, DollarSign, CheckCircle, CalendarIcon } from "lucide-react";
import logo from "@/assets/logo.png";

type Servicio = {
  id: string; slug: string; nombre: string; descripcion: string | null;
  duracion_minutos: number; precio: number | null; moneda: string;
  modalidad: string; politica_cancelacion: string | null;
};

type Disponibilidad = {
  id: string; coach_id: string; dia_semana: number;
  hora_inicio: string; hora_fin: string; sede_id: string | null;
};

type Slot = { time: string; coach_id: string; disponibilidad_id: string };

const BookingFlow = () => {
  const { slug } = useParams<{ slug: string }>();
  const [servicio, setServicio] = useState<Servicio | null>(null);
  const [disponibilidades, setDisponibilidades] = useState<Disponibilidad[]>([]);
  const [reservasExistentes, setReservasExistentes] = useState<any[]>([]);
  const [step, setStep] = useState(1);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    nombre: "", apellido: "", email: "", celular: "", documento: "",
    fecha_nacimiento: "", nota: "", acepto_politica: false,
  });

  useEffect(() => {
    const load = async () => {
      if (!slug) return;
      const { data: serv } = await supabase
        .from("servicios_turnera")
        .select("*")
        .eq("slug", slug)
        .eq("activo", true)
        .single();
      if (!serv) { setLoading(false); return; }
      setServicio(serv as any);

      const { data: disps } = await supabase
        .from("disponibilidad_coaches")
        .select("*")
        .eq("servicio_id", serv.id)
        .eq("activo", true);
      setDisponibilidades((disps as any[]) || []);

      // Load existing reservations for the next 60 days
      const today = new Date().toISOString().split("T")[0];
      const future = new Date();
      future.setDate(future.getDate() + 60);
      const { data: res } = await supabase
        .from("reservas_turnera")
        .select("fecha, hora_inicio")
        .eq("servicio_id", serv.id)
        .gte("fecha", today)
        .lte("fecha", future.toISOString().split("T")[0])
        .not("estado_operativo", "in", '("cancelada_por_alumno","cancelada_por_admin")');
      setReservasExistentes((res as any[]) || []);
      setLoading(false);
    };
    load();
  }, [slug]);

  const getAvailableSlots = (date: Date): Slot[] => {
    if (!servicio) return [];
    const dayOfWeek = date.getDay();
    const dateStr = date.toISOString().split("T")[0];
    const dayDisps = disponibilidades.filter(d => d.dia_semana === dayOfWeek);
    const slots: Slot[] = [];
    const duration = servicio.duracion_minutos;

    for (const disp of dayDisps) {
      const [startH, startM] = disp.hora_inicio.split(":").map(Number);
      const [endH, endM] = disp.hora_fin.split(":").map(Number);
      let current = startH * 60 + startM;
      const end = endH * 60 + endM;

      while (current + duration <= end) {
        const h = String(Math.floor(current / 60)).padStart(2, "0");
        const m = String(current % 60).padStart(2, "0");
        const timeStr = `${h}:${m}:00`;
        const isBooked = reservasExistentes.some(r => r.fecha === dateStr && r.hora_inicio === timeStr);
        if (!isBooked) {
          slots.push({ time: `${h}:${m}`, coach_id: disp.coach_id, disponibilidad_id: disp.id });
        }
        current += duration;
      }
    }
    return slots;
  };

  const availableDays = (date: Date) => {
    if (date < new Date(new Date().setHours(0, 0, 0, 0))) return true;
    const dayOfWeek = date.getDay();
    return !disponibilidades.some(d => d.dia_semana === dayOfWeek);
  };

  const slots = selectedDate ? getAvailableSlots(selectedDate) : [];

  const handleSubmit = async () => {
    if (!servicio || !selectedDate || !selectedSlot || !form.nombre || !form.apellido || !form.email) {
      toast({ title: "Completá los campos obligatorios", variant: "destructive" });
      return;
    }
    if (servicio.politica_cancelacion && !form.acepto_politica) {
      toast({ title: "Debés aceptar la política de cancelación", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    const dateStr = selectedDate.toISOString().split("T")[0];
    const duration = servicio.duracion_minutos;
    const [h, m] = selectedSlot.time.split(":").map(Number);
    const endMin = h * 60 + m + duration;
    const endTime = `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;

    // Try to find existing alumno
    let alumnoId: string | null = null;
    if (form.documento) {
      const { data: byDoc } = await supabase.from("alumnos").select("id").eq("documento", form.documento).limit(1);
      if (byDoc && byDoc.length > 0) alumnoId = byDoc[0].id;
    }
    if (!alumnoId) {
      const { data: byEmail } = await supabase.from("alumnos").select("id").eq("email", form.email).limit(1);
      if (byEmail && byEmail.length > 0) alumnoId = byEmail[0].id;
    }

    const { error } = await supabase.from("reservas_turnera").insert({
      servicio_id: servicio.id,
      coach_id: selectedSlot.coach_id,
      alumno_id: alumnoId,
      fecha: dateStr,
      hora_inicio: `${selectedSlot.time}:00`,
      hora_fin: `${endTime}:00`,
      nombre: form.nombre,
      apellido: form.apellido,
      email: form.email,
      celular: form.celular || null,
      documento: form.documento || null,
      fecha_nacimiento: form.fecha_nacimiento || null,
      nota: form.nota || null,
      acepto_politica: form.acepto_politica,
      precio_snapshot: servicio.precio,
      moneda_snapshot: servicio.moneda,
      origen_link: window.location.href,
    } as any);

    if (error) {
      toast({ title: "Error al reservar", description: error.message, variant: "destructive" });
      setSubmitting(false);
      return;
    }

    // Also create a liquidacion movement for the coach
    await supabase.from("movimientos_liquidacion").insert({
      coach_id: selectedSlot.coach_id,
      fecha: dateStr,
      tipo_actividad: servicio.tipo_actividad || "personalizada",
      origen: "turnera_externa",
      nombre_externo: `${form.nombre} ${form.apellido}`,
      alumno_id: alumnoId,
      valor_base: servicio.precio || 0,
      total: servicio.precio || 0,
      estado_operativo: "reservada",
      estado_economico: "pendiente_revision",
    } as any);

    setStep(5);
    setSubmitting(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Cargando...</p>
      </div>
    );
  }

  if (!servicio) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <img src={logo} alt="Ciclismo Reybaud" className="w-12 h-12 mx-auto" />
          <p className="text-muted-foreground">Servicio no encontrado.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-3">
          {step > 1 && step < 5 && (
            <Button variant="ghost" size="icon" onClick={() => setStep(step - 1)}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
          )}
          <img src={logo} alt="Ciclismo Reybaud" className="w-8 h-8" />
          <h1 className="font-heading font-bold text-foreground text-sm uppercase tracking-wider">
            Reservar turno
          </h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Step indicators */}
        {step < 5 && (
          <div className="flex gap-1">
            {[1, 2, 3, 4].map(s => (
              <div key={s} className={`h-1 flex-1 rounded-full ${s <= step ? "bg-primary" : "bg-muted"}`} />
            ))}
          </div>
        )}

        {/* Step 1: Service info */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-heading font-bold text-foreground">{servicio.nombre}</h2>
              {servicio.descripcion && <p className="text-sm text-muted-foreground mt-1">{servicio.descripcion}</p>}
            </div>
            <div className="flex flex-wrap gap-3">
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Clock className="w-4 h-4" /> {servicio.duracion_minutos} min
              </div>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <MapPin className="w-4 h-4" /> {servicio.modalidad}
              </div>
              {servicio.precio && (
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <DollarSign className="w-4 h-4" /> ${Number(servicio.precio).toLocaleString("es-AR")} {servicio.moneda}
                </div>
              )}
            </div>
            {servicio.politica_cancelacion && (
              <Card className="bg-muted/30 border-border">
                <CardContent className="p-3">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Política de cancelación</p>
                  <p className="text-xs text-muted-foreground">{servicio.politica_cancelacion}</p>
                </CardContent>
              </Card>
            )}
            <Button className="w-full" onClick={() => setStep(2)}>Elegir fecha y horario</Button>
          </div>
        )}

        {/* Step 2: Date & time */}
        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-lg font-heading font-semibold text-foreground">Elegí fecha y horario</h2>
            <Card className="bg-card border-border">
              <CardContent className="p-3 flex justify-center">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(d) => { setSelectedDate(d); setSelectedSlot(null); }}
                  disabled={availableDays}
                />
              </CardContent>
            </Card>
            {selectedDate && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Horarios disponibles – {selectedDate.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}
                </p>
                {slots.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">No hay horarios disponibles para este día.</p>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {slots.map((s) => (
                      <Button
                        key={s.time}
                        variant={selectedSlot?.time === s.time ? "default" : "outline"}
                        size="sm"
                        className="text-sm font-mono"
                        onClick={() => setSelectedSlot(s)}
                      >
                        {s.time}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <Button className="w-full" disabled={!selectedSlot} onClick={() => setStep(3)}>
              Continuar
            </Button>
          </div>
        )}

        {/* Step 3: Form */}
        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-lg font-heading font-semibold text-foreground">Tus datos</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Input placeholder="Nombre *" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} />
                <Input placeholder="Apellido *" value={form.apellido} onChange={e => setForm({ ...form, apellido: e.target.value })} />
              </div>
              <Input type="email" placeholder="Email *" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
              <Input placeholder="Celular" value={form.celular} onChange={e => setForm({ ...form, celular: e.target.value })} />
              <div className="grid grid-cols-2 gap-3">
                <Input placeholder="DNI / CUIT" value={form.documento} onChange={e => setForm({ ...form, documento: e.target.value })} />
                <Input type="date" placeholder="Fecha nacimiento" value={form.fecha_nacimiento} onChange={e => setForm({ ...form, fecha_nacimiento: e.target.value })} />
              </div>
              <Textarea placeholder="Nota (opcional)" value={form.nota} onChange={e => setForm({ ...form, nota: e.target.value })} />
              {servicio.politica_cancelacion && (
                <div className="flex items-start gap-2">
                  <Checkbox
                    checked={form.acepto_politica}
                    onCheckedChange={(c) => setForm({ ...form, acepto_politica: c === true })}
                    className="mt-0.5"
                  />
                  <label className="text-xs text-muted-foreground">
                    Acepto la política de cancelación
                  </label>
                </div>
              )}
            </div>
            <Button className="w-full" onClick={() => setStep(4)} disabled={!form.nombre || !form.apellido || !form.email}>
              Revisar reserva
            </Button>
          </div>
        )}

        {/* Step 4: Confirmation */}
        {step === 4 && selectedDate && selectedSlot && (
          <div className="space-y-4">
            <h2 className="text-lg font-heading font-semibold text-foreground">Confirmar reserva</h2>
            <Card className="bg-card border-border">
              <CardContent className="p-4 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Servicio</span>
                  <span className="font-medium text-foreground">{servicio.nombre}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Fecha</span>
                  <span className="font-medium text-foreground">
                    {selectedDate.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Horario</span>
                  <span className="font-medium text-foreground font-mono">{selectedSlot.time}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Duración</span>
                  <span className="font-medium text-foreground">{servicio.duracion_minutos} min</span>
                </div>
                {servicio.precio && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Precio</span>
                    <span className="font-medium text-foreground">${Number(servicio.precio).toLocaleString("es-AR")} {servicio.moneda}</span>
                  </div>
                )}
                <div className="border-t border-border pt-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Nombre</span>
                    <span className="font-medium text-foreground">{form.nombre} {form.apellido}</span>
                  </div>
                  <div className="flex justify-between text-sm mt-1">
                    <span className="text-muted-foreground">Email</span>
                    <span className="font-medium text-foreground">{form.email}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Button className="w-full" onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Reservando..." : "Confirmar reserva"}
            </Button>
          </div>
        )}

        {/* Step 5: Success */}
        {step === 5 && (
          <div className="text-center space-y-4 py-8">
            <CheckCircle className="w-16 h-16 text-emerald-400 mx-auto" />
            <h2 className="text-xl font-heading font-bold text-foreground">¡Reserva confirmada!</h2>
            <p className="text-sm text-muted-foreground">
              Tu turno para <strong>{servicio.nombre}</strong> fue reservado exitosamente.
            </p>
            {selectedDate && selectedSlot && (
              <Card className="bg-card border-border inline-block">
                <CardContent className="p-4 text-left space-y-1">
                  <p className="text-sm text-foreground font-medium">
                    {selectedDate.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}
                  </p>
                  <p className="text-sm text-muted-foreground font-mono">{selectedSlot.time} hs</p>
                </CardContent>
              </Card>
            )}
            <p className="text-xs text-muted-foreground">
              Guardá esta confirmación. Si necesitás cambiar o cancelar el turno, escribinos.
            </p>
          </div>
        )}
      </main>
    </div>
  );
};

export default BookingFlow;
