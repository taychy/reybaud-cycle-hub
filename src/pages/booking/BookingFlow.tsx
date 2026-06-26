import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { es } from "date-fns/locale";
import { toast } from "@/hooks/use-toast";
import {
  ArrowLeft, Clock, MapPin, DollarSign, CheckCircle,
  CalendarDays, User, AlertTriangle,
} from "lucide-react";
import logo from "@/assets/logo.png";

type Servicio = {
  id: string; slug: string; nombre: string; descripcion: string | null;
  duracion_minutos: number; precio: number | null; moneda: string;
  modalidad: string; politica_cancelacion: string | null; tipo_actividad?: string | null;
  pago_modo?: string | null; pago_monto_sena?: number | null;
};

type Disponibilidad = {
  id: string; coach_id: string; dia_semana: number;
  hora_inicio: string; hora_fin: string; sede_id: string | null;
};

type Coach = { id: string; nombre: string; sede_id: string | null };
type Sede = { id: string; nombre: string; ciudad: string | null };

type Slot = { time: string; coach_id: string; disponibilidad_id: string; sede_id: string | null };

type Modo = "sede" | "fecha" | "coach";

const MESES = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
];

const calcAge = (y: string, m: string, d: string): number | null => {
  if (!y || !m || !d) return null;
  const yy = Number(y), mm = Number(m), dd = Number(d);
  if (!yy || !mm || !dd) return null;
  const today = new Date();
  let age = today.getFullYear() - yy;
  const beforeBday =
    today.getMonth() + 1 < mm ||
    (today.getMonth() + 1 === mm && today.getDate() < dd);
  if (beforeBday) age--;
  return age;
};

const BookingFlow = () => {
  const { slug } = useParams<{ slug: string }>();
  const [servicio, setServicio] = useState<Servicio | null>(null);
  const [disponibilidades, setDisponibilidades] = useState<Disponibilidad[]>([]);
  const [reservasExistentes, setReservasExistentes] = useState<any[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [sedes, setSedes] = useState<Sede[]>([]);

  const [step, setStep] = useState(1);
  const [modo, setModo] = useState<Modo | null>(null);
  const [selectedSede, setSelectedSede] = useState<string | "any" | null>(null);
  const [selectedCoach, setSelectedCoach] = useState<string | "any" | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [alumnoLogged, setAlumnoLogged] = useState<{ id: string; nombre: string; apellido: string; email: string } | null>(null);

  const [form, setForm] = useState({
    nombre: "", apellido: "", email: "", celular: "", documento: "",
    fnac_dia: "", fnac_mes: "", fnac_anio: "",
    nota: "", acepto_politica: false, acepto_tutor: false,
  });


  useEffect(() => {
    const load = async () => {
      if (!slug) return;
      const { data: serv } = await supabase
        .from("servicios_turnera").select("*")
        .eq("slug", slug).eq("activo", true).single();
      if (!serv) { setLoading(false); return; }
      setServicio(serv as any);

      const { data: disps } = await supabase
        .from("disponibilidad_coaches").select("*")
        .eq("servicio_id", serv.id).eq("activo", true);
      const list = (disps as any[]) || [];
      setDisponibilidades(list);

      const coachIds = Array.from(new Set(list.map(d => d.coach_id)));
      const sedeIds = Array.from(new Set(list.map(d => d.sede_id).filter(Boolean)));

      if (coachIds.length) {
        const { data: cs } = await supabase
          .from("coaches").select("id, nombre, sede_id").in("id", coachIds);
        setCoaches((cs as any[]) || []);
      }
      if (sedeIds.length) {
        const { data: ss } = await supabase
          .from("sedes").select("id, nombre, ciudad").in("id", sedeIds as string[]);
        setSedes((ss as any[]) || []);
      }

      const today = new Date().toISOString().split("T")[0];
      const future = new Date(); future.setDate(future.getDate() + 60);
      const { data: res } = await supabase.rpc("get_reservas_turnera_ocupadas", {
        p_servicio_id: serv.id,
        p_desde: today,
        p_hasta: future.toISOString().split("T")[0],
      } as any);
      setReservasExistentes((res as any[]) || []);
      setLoading(false);
    };
    load();
  }, [slug]);

  // Detectar si hay un alumno logueado y precargar sus datos
  useEffect(() => {
    const detectAlumno = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const email = session?.user?.email;
      if (!email) return;
      const { data: alu } = await supabase
        .from("alumnos")
        .select("id, nombre, apellido, email, documento, telefono")
        .eq("email", email)
        .maybeSingle();
      if (!alu) return;
      setAlumnoLogged({
        id: (alu as any).id,
        nombre: (alu as any).nombre || "",
        apellido: (alu as any).apellido || "",
        email: (alu as any).email || email,
      });
      setForm(f => ({
        ...f,
        nombre: (alu as any).nombre || f.nombre,
        apellido: (alu as any).apellido || f.apellido,
        email: (alu as any).email || email,
        celular: (alu as any).telefono || f.celular,
        documento: (alu as any).documento || f.documento,
      }));
    };
    detectAlumno();
  }, []);


  const coachById = useMemo(() => {
    const m = new Map<string, Coach>();
    coaches.forEach(c => m.set(c.id, c));
    return m;
  }, [coaches]);

  const sedeById = useMemo(() => {
    const m = new Map<string, Sede>();
    sedes.forEach(s => m.set(s.id, s));
    return m;
  }, [sedes]);

  // Filtered availability per current selections
  const filteredDisps = useMemo(() => {
    return disponibilidades.filter(d => {
      if (selectedSede && selectedSede !== "any" && d.sede_id !== selectedSede) return false;
      if (selectedCoach && selectedCoach !== "any" && d.coach_id !== selectedCoach) return false;
      return true;
    });
  }, [disponibilidades, selectedSede, selectedCoach]);

  const getAvailableSlots = (date: Date): Slot[] => {
    if (!servicio) return [];
    const dayOfWeek = date.getDay();
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const dayDisps = filteredDisps.filter(d => d.dia_semana === dayOfWeek);
    const duration = servicio.duracion_minutos;
    // Dedupe by coach+time (un coach puede tener varias filas de disponibilidad solapadas)
    const map = new Map<string, Slot>();
    for (const disp of dayDisps) {
      const [sH, sM] = disp.hora_inicio.split(":").map(Number);
      const [eH, eM] = disp.hora_fin.split(":").map(Number);
      let cur = sH * 60 + sM;
      const end = eH * 60 + eM;
      while (cur + duration <= end) {
        const h = String(Math.floor(cur / 60)).padStart(2, "0");
        const m = String(cur % 60).padStart(2, "0");
        const t = `${h}:${m}:00`;
        const isBooked = reservasExistentes.some(
          r => r.fecha === dateStr && r.hora_inicio === t && r.coach_id === disp.coach_id,
        );
        if (!isBooked) {
          const key = `${disp.coach_id}|${h}:${m}`;
          if (!map.has(key)) {
            map.set(key, { time: `${h}:${m}`, coach_id: disp.coach_id, disponibilidad_id: disp.id, sede_id: disp.sede_id });
          } else if (selectedSede && selectedSede !== "any" && disp.sede_id === selectedSede) {
            map.set(key, { time: `${h}:${m}`, coach_id: disp.coach_id, disponibilidad_id: disp.id, sede_id: disp.sede_id });
          }
        }
        cur += duration;
      }
    }
    return Array.from(map.values()).sort((a, b) => a.time.localeCompare(b.time) || a.coach_id.localeCompare(b.coach_id));
  };

  const disabledDay = (date: Date) => {
    if (date < new Date(new Date().setHours(0, 0, 0, 0))) return true;
    const dow = date.getDay();
    return !filteredDisps.some(d => d.dia_semana === dow);
  };

  const slots = selectedDate ? getAvailableSlots(selectedDate) : [];

  const edad = calcAge(form.fnac_anio, form.fnac_mes, form.fnac_dia);
  const esMenor = edad !== null && edad < 18;

  const validForm = () => {
    if (!form.nombre.trim() || !form.apellido.trim() || !form.email.trim()) return "Completá nombre, apellido y email.";
    if (!form.celular.trim()) return "El celular es obligatorio.";
    if (!form.documento.trim() || form.documento.trim().length < 7) return "El DNI es obligatorio (mínimo 7 dígitos).";
    if (!form.fnac_dia || !form.fnac_mes || !form.fnac_anio) return "Completá tu fecha de nacimiento.";
    if (servicio?.politica_cancelacion && !form.acepto_politica) return "Debés aceptar la política de cancelación.";
    if (esMenor && !form.acepto_tutor) return "Como menor de edad, confirmá la autorización del tutor.";
    return null;
  };

  const handleSubmit = async () => {
    if (!servicio || !selectedDate || !selectedSlot) return;
    const err = validForm();
    if (err) { toast({ title: err, variant: "destructive" }); return; }

    setSubmitting(true);
    const dateStr = selectedDate.toISOString().split("T")[0];
    const duration = servicio.duracion_minutos;
    const [h, m] = selectedSlot.time.split(":").map(Number);
    const endMin = h * 60 + m + duration;
    const endTime = `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;

    const fechaNac = `${form.fnac_anio}-${form.fnac_mes.padStart(2, "0")}-${form.fnac_dia.padStart(2, "0")}`;

    let alumnoId: string | null = null;
    if (form.documento) {
      const { data: byDoc } = await supabase.from("alumnos").select("id").eq("documento", form.documento).limit(1);
      if (byDoc && byDoc.length > 0) alumnoId = byDoc[0].id;
    }
    if (!alumnoId) {
      const { data: byEmail } = await supabase.from("alumnos").select("id").eq("email", form.email).limit(1);
      if (byEmail && byEmail.length > 0) alumnoId = byEmail[0].id;
    }

    const notaFinal = [
      form.nota?.trim() || "",
      esMenor ? `[Menor de edad: ${edad} años — autorización de tutor confirmada al reservar]` : "",
    ].filter(Boolean).join("\n");

    const { data: insertedRes, error } = await supabase.from("reservas_turnera").insert({
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
      fecha_nacimiento: fechaNac,
      nota: notaFinal || null,
      acepto_politica: form.acepto_politica,
      precio_snapshot: servicio.precio,
      moneda_snapshot: servicio.moneda,
      origen_link: window.location.href,
    } as any).select("id").single();

    if (error) {
      toast({ title: "Error al reservar", description: error.message, variant: "destructive" });
      setSubmitting(false);
      return;
    }

    const reservationId = insertedRes?.id;
    const requierePagoOnline = servicio.pago_modo && servicio.pago_modo !== "ninguno";

    // Movimiento de liquidación siempre (queda como pendiente_revision)
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

    if (requierePagoOnline && reservationId) {
      // No mandamos email aún: el webhook MP lo dispara recién al aprobar
      try {
        const { data: mp, error: mpErr } = await supabase.functions.invoke("create-turnera-mp-preference", {
          body: { reservation_id: reservationId },
        });
        if (mpErr || !mp?.init_point) {
          throw new Error(mpErr?.message || "No se pudo iniciar el pago");
        }
        window.location.href = mp.init_point;
        return;
      } catch (e: any) {
        toast({
          title: "Reserva creada, pero falló el pago online",
          description: `${e.message || "Intentá nuevamente desde el link de pago."}`,
          variant: "destructive",
        });
        setStep(6);
        setSubmitting(false);
        return;
      }
    }

    // Sin pago online: email de confirmación directo + aviso al coach
    if (reservationId) {
      supabase.functions.invoke("send-turnera-email", {
        body: { reservation_id: reservationId, tipo: "confirmacion" },
      }).catch(() => { /* silent */ });
      supabase.functions.invoke("send-turnera-email", {
        body: { reservation_id: reservationId, tipo: "coach_aviso" },
      }).catch(() => { /* silent */ });
    }

    setStep(6);
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

  // Reset downstream picks when modo changes
  const pickModo = (m: Modo) => {
    setModo(m);
    setSelectedSede(null);
    setSelectedCoach(null);
    setSelectedDate(undefined);
    setSelectedSlot(null);
    setStep(3);
  };

  // Helpers for sub-step rendering
  const sedesDisponibles = sedes.filter(s => disponibilidades.some(d => d.sede_id === s.id));
  const coachesDisponibles = coaches.filter(c => disponibilidades.some(d => d.coach_id === c.id));

  // For modo=coach: only days that selected coach works
  const coachWorkDays = (coachId: string) =>
    new Set(disponibilidades.filter(d => d.coach_id === coachId).map(d => d.dia_semana));

  // Decide what sub-section to render inside step 3 based on modo + selections
  const renderStep3 = () => {
    // Pick first filter
    if (modo === "sede" && !selectedSede) {
      return (
        <SectionPick title="Elegí la sede">
          {sedesDisponibles.map(s => (
            <PickCard key={s.id} label={s.nombre} sub={s.ciudad || undefined}
              onClick={() => setSelectedSede(s.id)} />
          ))}
        </SectionPick>
      );
    }
    if (modo === "coach" && !selectedCoach) {
      return (
        <SectionPick title="Elegí el coach">
          {coachesDisponibles.map(c => (
            <PickCard key={c.id} label={c.nombre}
              sub={c.sede_id ? sedeById.get(c.sede_id)?.nombre : undefined}
              onClick={() => setSelectedCoach(c.id)} />
          ))}
        </SectionPick>
      );
    }

    // Date picker (modo fecha empieza acá, o llega tras elegir sede/coach)
    if (!selectedDate) {
      return (
        <div className="space-y-3">
          <h2 className="text-lg font-heading font-semibold text-foreground">Elegí la fecha</h2>
          <Card className="bg-card border-border">
            <CardContent className="p-3 flex justify-center">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(d) => { setSelectedDate(d); setSelectedSlot(null); }}
                disabled={disabledDay}
                locale={es}
                weekStartsOn={1}
                className="pointer-events-auto"
              />
            </CardContent>
          </Card>
        </div>
      );
    }

    // After date: if modo=fecha and no coach picked, show coach chips (with "cualquiera")
    if (modo === "fecha" && !selectedCoach) {
      const dow = selectedDate.getDay();
      const coachesDelDia = Array.from(new Set(
        disponibilidades.filter(d => d.dia_semana === dow).map(d => d.coach_id)
      )).map(id => coachById.get(id)).filter(Boolean) as Coach[];
      return (
        <SectionPick title={`Coach para ${selectedDate.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}`}>
          <PickCard label="Cualquier coach disponible" sub="Te asignamos el mejor horario" onClick={() => setSelectedCoach("any")} />
          {coachesDelDia.map(c => (
            <PickCard key={c.id} label={c.nombre}
              sub={c.sede_id ? sedeById.get(c.sede_id)?.nombre : undefined}
              onClick={() => setSelectedCoach(c.id)} />
          ))}
        </SectionPick>
      );
    }

    // Slot grid
    return (
      <div className="space-y-3">
        <h2 className="text-lg font-heading font-semibold text-foreground">Elegí el horario</h2>
        <p className="text-sm text-muted-foreground">
          {selectedDate.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}
        </p>
        {slots.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No hay horarios disponibles. Probá otra fecha.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {slots.map((s) => {
              const c = coachById.get(s.coach_id);
              const selected = selectedSlot?.time === s.time && selectedSlot?.coach_id === s.coach_id;
              return (
                <Button
                  key={`${s.coach_id}-${s.time}`}
                  variant={selected ? "default" : "outline"}
                  size="sm"
                  className="text-sm font-mono h-auto py-2 flex flex-col gap-0.5"
                  onClick={() => setSelectedSlot(s)}
                >
                  <span>{s.time}</span>
                  {c && <span className="text-[10px] font-sans opacity-75 truncate w-full">{c.nombre}</span>}
                </Button>
              );
            })}
          </div>
        )}
        <Button className="w-full" disabled={!selectedSlot} onClick={() => setStep(4)}>
          Continuar
        </Button>
      </div>
    );
  };

  const goBack = () => {
    // Smart back: undo last selection
    if (step === 6) return;
    if (step === 5) { setStep(4); return; }
    if (step === 4) { setStep(3); return; }
    if (step === 3) {
      if (selectedSlot) { setSelectedSlot(null); return; }
      if (selectedDate) { setSelectedDate(undefined); return; }
      if (modo === "fecha" && selectedCoach) { setSelectedCoach(null); return; }
      if (modo === "sede" && selectedSede) { setSelectedSede(null); return; }
      if (modo === "coach" && selectedCoach) { setSelectedCoach(null); return; }
      setStep(2); return;
    }
    if (step === 2) { setStep(1); return; }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-3">
          {step > 1 && step < 6 && (
            <Button variant="ghost" size="icon" onClick={goBack}>
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
        {step < 6 && (
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map(s => (
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
            <Button className="w-full" onClick={() => setStep(2)}>Empezar reserva</Button>
          </div>
        )}

        {/* Step 2: Modo */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-heading font-semibold text-foreground">¿Cómo querés elegir tu turno?</h2>
              <p className="text-sm text-muted-foreground mt-1">Empezá por lo que más te importa.</p>
            </div>
            <div className="space-y-2">
              <ModeCard icon={<MapPin className="w-5 h-5" />} label="Por sede"
                desc="Elijo primero la ubicación, después la fecha y el coach."
                onClick={() => pickModo("sede")} disabled={sedesDisponibles.length === 0} />
              <ModeCard icon={<CalendarDays className="w-5 h-5" />} label="Por fecha"
                desc="Elijo el día que me viene bien, después el coach y el horario."
                onClick={() => pickModo("fecha")} />
              <ModeCard icon={<User className="w-5 h-5" />} label="Por coach"
                desc="Elijo el coach con el que quiero entrenar, después la fecha."
                onClick={() => pickModo("coach")} disabled={coachesDisponibles.length === 0} />
            </div>
          </div>
        )}

        {/* Step 3: filtros encadenados */}
        {step === 3 && renderStep3()}

        {/* Step 4: Datos personales */}
        {step === 4 && (
          <div className="space-y-4">
            <h2 className="text-lg font-heading font-semibold text-foreground">Tus datos</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Nombre *</Label>
                  <Input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Apellido *</Label>
                  <Input value={form.apellido} onChange={e => setForm({ ...form, apellido: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Email *</Label>
                <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Celular *</Label>
                  <Input value={form.celular} onChange={e => setForm({ ...form, celular: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">DNI *</Label>
                  <Input value={form.documento} onChange={e => setForm({ ...form, documento: e.target.value })} />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Fecha de nacimiento * <span className="text-muted-foreground font-normal">(para verificar mayoría de edad)</span></Label>
                <div className="grid grid-cols-3 gap-2">
                  <select
                    className="h-10 rounded-md border border-input bg-background px-2 text-sm"
                    value={form.fnac_dia}
                    onChange={e => setForm({ ...form, fnac_dia: e.target.value })}
                  >
                    <option value="">Día</option>
                    {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                      <option key={d} value={String(d)}>{d}</option>
                    ))}
                  </select>
                  <select
                    className="h-10 rounded-md border border-input bg-background px-2 text-sm"
                    value={form.fnac_mes}
                    onChange={e => setForm({ ...form, fnac_mes: e.target.value })}
                  >
                    <option value="">Mes</option>
                    {MESES.map((n, i) => <option key={n} value={String(i + 1)}>{n}</option>)}
                  </select>
                  <select
                    className="h-10 rounded-md border border-input bg-background px-2 text-sm"
                    value={form.fnac_anio}
                    onChange={e => setForm({ ...form, fnac_anio: e.target.value })}
                  >
                    <option value="">Año</option>
                    {Array.from({ length: 90 }, (_, i) => new Date().getFullYear() - 5 - i).map(y => (
                      <option key={y} value={String(y)}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>

              {esMenor && (
                <Card className="border-amber-500/40 bg-amber-500/5">
                  <CardContent className="p-3 flex gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                    <div className="space-y-2 flex-1">
                      <p className="text-sm font-medium text-foreground">Sos menor de edad ({edad} años)</p>
                      <p className="text-xs text-muted-foreground">
                        Necesitás venir acompañado/a por tu padre, madre o tutor legal, o presentar una autorización firmada al llegar.
                      </p>
                      <div className="flex items-start gap-2 pt-1">
                        <Checkbox
                          checked={form.acepto_tutor}
                          onCheckedChange={c => setForm({ ...form, acepto_tutor: c === true })}
                          className="mt-0.5"
                        />
                        <label className="text-xs text-foreground">
                          Confirmo que vendré con un tutor o llevaré la autorización firmada.
                        </label>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="space-y-1">
                <Label className="text-xs">Nota (opcional)</Label>
                <Textarea value={form.nota} onChange={e => setForm({ ...form, nota: e.target.value })} />
              </div>

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
            <Button className="w-full" onClick={() => {
              const err = validForm();
              if (err) { toast({ title: err, variant: "destructive" }); return; }
              setStep(5);
            }}>
              Revisar reserva
            </Button>
          </div>
        )}

        {/* Step 5: Confirmation */}
        {step === 5 && selectedDate && selectedSlot && (
          <div className="space-y-4">
            <h2 className="text-lg font-heading font-semibold text-foreground">Confirmar reserva</h2>
            <Card className="bg-card border-border">
              <CardContent className="p-4 space-y-3">
                <Row label="Servicio" value={servicio.nombre} />
                {selectedSlot.sede_id && (
                  <Row label="Sede" value={sedeById.get(selectedSlot.sede_id)?.nombre || "—"} />
                )}
                <Row label="Coach" value={coachById.get(selectedSlot.coach_id)?.nombre || "—"} />
                <Row label="Fecha" value={selectedDate.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })} />
                <Row label="Horario" value={selectedSlot.time} mono />
                <Row label="Duración" value={`${servicio.duracion_minutos} min`} />
                {servicio.precio && (
                  <Row label="Precio" value={`$${Number(servicio.precio).toLocaleString("es-AR")} ${servicio.moneda}`} />
                )}
                <div className="border-t border-border pt-3 space-y-1">
                  <Row label="Nombre" value={`${form.nombre} ${form.apellido}`} />
                  <Row label="Email" value={form.email} />
                  <Row label="Celular" value={form.celular} />
                  <Row label="DNI" value={form.documento} />
                </div>
              </CardContent>
            </Card>
            <Button className="w-full" onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Reservando..." : "Confirmar reserva"}
            </Button>
          </div>
        )}

        {/* Step 6: Success */}
        {step === 6 && (
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
                  {coachById.get(selectedSlot.coach_id) && (
                    <p className="text-xs text-muted-foreground">Coach: {coachById.get(selectedSlot.coach_id)!.nombre}</p>
                  )}
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

const Row = ({ label, value, mono }: { label: string; value: string; mono?: boolean }) => (
  <div className="flex justify-between text-sm gap-3">
    <span className="text-muted-foreground">{label}</span>
    <span className={`font-medium text-foreground text-right ${mono ? "font-mono" : ""}`}>{value}</span>
  </div>
);

const SectionPick = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="space-y-3">
    <h2 className="text-lg font-heading font-semibold text-foreground">{title}</h2>
    <div className="space-y-2">{children}</div>
  </div>
);

const PickCard = ({ label, sub, onClick }: { label: string; sub?: string; onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className="w-full text-left rounded-lg border border-border bg-card hover:bg-accent hover:border-primary/50 transition px-4 py-3"
  >
    <div className="font-medium text-foreground">{label}</div>
    {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
  </button>
);

const ModeCard = ({ icon, label, desc, onClick, disabled }: {
  icon: React.ReactNode; label: string; desc: string; onClick: () => void; disabled?: boolean;
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className="w-full text-left rounded-lg border border-border bg-card hover:bg-accent hover:border-primary/50 transition px-4 py-3 flex items-start gap-3 disabled:opacity-40 disabled:cursor-not-allowed"
  >
    <div className="text-primary mt-0.5">{icon}</div>
    <div className="flex-1">
      <div className="font-medium text-foreground">{label}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>
    </div>
  </button>
);

export default BookingFlow;
