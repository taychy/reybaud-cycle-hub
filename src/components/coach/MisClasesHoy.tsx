import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Camera, CheckCircle2, MapPin, User, Phone, CalendarPlus } from "lucide-react";
import ConfirmarClaseDialog from "./ConfirmarClaseDialog";

interface Slot {
  id: string;
  coach_id: string;
  sede_id: string | null;
  honorario_id: string | null;
  hora_inicio: string | null;
  hora_fin: string | null;
  grupo: string | null;
  sede_nombre?: string;
}

interface TurneraSlot {
  id: string;
  hora_inicio: string;
  hora_fin: string;
  servicio_nombre: string;
  alumno: string;
  celular: string | null;
  sede_nombre: string | null;
  pago_estado: string | null;
  fecha: string;
  descripcion: string;
  modalidad: string;
}

const googleCalLink = (s: TurneraSlot) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  const [y, m, d] = s.fecha.split("-").map(Number);
  const [h1, m1] = s.hora_inicio.split(":").map(Number);
  const [h2, m2] = s.hora_fin.split(":").map(Number);
  const start = `${y}${pad(m)}${pad(d)}T${pad(h1 + 3)}${pad(m1)}00Z`;
  const end = `${y}${pad(m)}${pad(d)}T${pad(h2 + 3)}${pad(m2)}00Z`;
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: `${s.servicio_nombre} · ${s.alumno}`,
    dates: `${start}/${end}`,
    details: s.descripcion,
    location: s.sede_nombre || s.modalidad,
  });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
};

export default function MisClasesHoy() {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [turneraSlots, setTurneraSlots] = useState<TurneraSlot[]>([]);
  const [confirmadas, setConfirmadas] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Slot | null>(null);
  const [open, setOpen] = useState(false);

  const today = new Date();
  const dow = today.getDay();
  const fechaStr = today.toISOString().split("T")[0];

  const load = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return setLoading(false);
    const { data: coach } = await supabase.from("coaches").select("id").eq("user_id", session.user.id).maybeSingle();
    if (!coach) return setLoading(false);

    const coachId = (coach as any).id;

    const [agendaRes, hechasRes, turneraRes] = await Promise.all([
      supabase
        .from("agenda_grupal")
        .select("id, coach_id, sede_id, honorario_id, hora_inicio, hora_fin, grupo, activo, dia_semana, sedes:sede_id(nombre)")
        .eq("coach_id", coachId)
        .eq("dia_semana", dow)
        .eq("activo", true)
        .order("hora_inicio"),
      supabase
        .from("clases_dictadas")
        .select("agenda_id")
        .eq("coach_id", coachId)
        .eq("fecha", fechaStr),
      supabase
        .from("reservas_turnera")
        .select("id, hora_inicio, hora_fin, fecha, nombre, apellido, celular, pago_estado, estado_operativo, servicios_turnera:servicio_id(nombre, descripcion, modalidad), sedes:sede_id(nombre)")
        .eq("coach_id", coachId)
        .eq("fecha", fechaStr)
        .neq("estado_operativo", "cancelada")
        .neq("estado_operativo", "cancelada_por_admin")
        .order("hora_inicio"),
    ]);

    const mapped: Slot[] = (agendaRes.data || []).map((a: any) => ({
      id: a.id,
      coach_id: a.coach_id,
      sede_id: a.sede_id,
      honorario_id: a.honorario_id,
      hora_inicio: a.hora_inicio,
      hora_fin: a.hora_fin,
      grupo: a.grupo,
      sede_nombre: a.sedes?.nombre,
    }));
    setSlots(mapped);
    setConfirmadas(new Set((hechasRes.data || []).map((h: any) => h.agenda_id).filter(Boolean)));

    const tMapped: TurneraSlot[] = (turneraRes.data || []).map((r: any) => ({
      id: r.id,
      hora_inicio: r.hora_inicio,
      hora_fin: r.hora_fin,
      fecha: r.fecha,
      servicio_nombre: r.servicios_turnera?.nombre || "Turno externo",
      descripcion: r.servicios_turnera?.descripcion || "",
      modalidad: r.servicios_turnera?.modalidad || "presencial",
      alumno: `${r.nombre} ${r.apellido || ""}`.trim(),
      celular: r.celular,
      sede_nombre: r.sedes?.nombre || null,
      pago_estado: r.pago_estado,
    }));
    setTurneraSlots(tMapped);

    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  if (loading) return null;
  if (slots.length === 0 && turneraSlots.length === 0) return null;

  return (
    <Card className="bg-card border-border">
      <CardContent className="p-5 space-y-3">
        <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
          Mis clases de hoy
        </p>

        {slots.map((s) => {
          const done = confirmadas.has(s.id);
          return (
            <div key={s.id} className="flex items-center justify-between gap-2 p-3 rounded-lg border border-border bg-background/50">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-heading font-semibold text-sm">
                    {s.hora_inicio?.slice(0, 5)}–{s.hora_fin?.slice(0, 5)}
                  </span>
                  {s.grupo && <Badge variant="secondary" className="text-[10px]">{s.grupo}</Badge>}
                </div>
                {s.sede_nombre && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <MapPin className="w-3 h-3" /> {s.sede_nombre}
                  </p>
                )}
              </div>
              {done ? (
                <Badge variant="outline" className="gap-1">
                  <CheckCircle2 className="w-3 h-3 text-green-500" /> Confirmada
                </Badge>
              ) : (
                <Button size="sm" onClick={() => { setSelected(s); setOpen(true); }}>
                  <Camera className="w-4 h-4 mr-1" /> Confirmar
                </Button>
              )}
            </div>
          );
        })}

        {turneraSlots.map((t) => (
          <div key={t.id} className="p-3 rounded-lg border border-primary/40 bg-primary/5 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-heading font-semibold text-sm">
                    {t.hora_inicio.slice(0, 5)}–{t.hora_fin.slice(0, 5)}
                  </span>
                  <Badge className="text-[10px] bg-primary/20 text-primary border-primary/40 hover:bg-primary/30">
                    Turno externo
                  </Badge>
                  {t.pago_estado === "aprobado" && (
                    <Badge variant="outline" className="text-[10px] gap-1">
                      <CheckCircle2 className="w-3 h-3 text-green-500" /> Pagado
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-foreground mt-1">{t.servicio_nombre}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  <User className="w-3 h-3" /> {t.alumno}
                  {t.celular && <><Phone className="w-3 h-3 ml-2" /> {t.celular}</>}
                </p>
                {t.sede_nombre && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <MapPin className="w-3 h-3" /> {t.sede_nombre}
                  </p>
                )}
              </div>
            </div>
            <a
              href={googleCalLink(t)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              <CalendarPlus className="w-3.5 h-3.5" /> Agregar a Google Calendar
            </a>
          </div>
        ))}
      </CardContent>

      <ConfirmarClaseDialog
        open={open}
        onOpenChange={setOpen}
        slot={selected}
        fecha={fechaStr}
        onConfirmed={load}
      />
    </Card>
  );
}
