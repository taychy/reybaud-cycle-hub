import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, MapPin, User, CalendarClock, Users } from "lucide-react";
import { DisponibilidadManager } from "@/components/admin/DisponibilidadEditor";
import { DisponibilidadAjustadaManager } from "@/components/admin/DisponibilidadAjustadaManager";
import AusenciasCoachManager from "@/components/AusenciasCoachManager";
import {
  addDays,
  dentroDeVigencia,
  hhmm,
  labelFechaLarga,
  parseIso,
  toLocalIso,
  type AgendaEvento,
} from "@/lib/agenda";

const DIAS_ADELANTE = 14;

const CoachAgenda = () => {
  const navigate = useNavigate();
  const [coach, setCoach] = useState<any>(null);
  const [servicios, setServicios] = useState<any[]>([]);
  const [sedes, setSedes] = useState<any[]>([]);
  const [disponibilidades, setDisponibilidades] = useState<any[]>([]);
  const [turnos, setTurnos] = useState<any[]>([]);
  const [grupal, setGrupal] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setLoading(false); return; }
    const { data: c } = await supabase
      .from("coaches").select("id, nombre").eq("user_id", session.user.id).maybeSingle();
    if (!c) { setLoading(false); return; }
    setCoach(c);

    const hoy = new Date();
    const hasta = toLocalIso(addDays(hoy, DIAS_ADELANTE));

    const [servRes, sedesRes, dispRes, turnosRes, agRes] = await Promise.all([
      supabase.from("servicios_turnera").select("*").eq("activo", true),
      supabase.from("sedes").select("*"),
      supabase.from("disponibilidad_coaches").select("*").eq("coach_id", (c as any).id),
      supabase
        .from("reservas_turnera")
        .select("id, fecha, hora_inicio, hora_fin, nombre, apellido, celular, estado_operativo, pago_estado, sede_id, servicios_turnera:servicio_id(nombre), sedes:sede_id(nombre)")
        .eq("coach_id", (c as any).id)
        .gte("fecha", toLocalIso(hoy))
        .lte("fecha", hasta)
        .not("estado_operativo", "like", "cancelada%")
        .order("fecha").order("hora_inicio").limit(60),
      supabase.from("agenda_grupal").select("*, sedes:sede_id(nombre)").eq("coach_id", (c as any).id),
    ]);
    setServicios((servRes.data as any[]) || []);
    setSedes((sedesRes.data as any[]) || []);
    setDisponibilidades((dispRes.data as any[]) || []);
    setTurnos((turnosRes.data as any[]) || []);
    setGrupal((agRes.data as any[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  /** Agenda unificada: clases grupales expandidas + turnos, en orden cronológico. */
  const agenda: AgendaEvento[] = useMemo(() => {
    const now = new Date();
    const nowHM = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const hoyIso = toLocalIso(now);
    const out: AgendaEvento[] = [];

    for (let i = 0; i <= DIAS_ADELANTE; i++) {
      const d = addDays(now, i);
      const iso = toLocalIso(d);
      for (const g of grupal) {
        if (g.activo === false || g.dia_semana !== d.getDay()) continue;
        if (!dentroDeVigencia(iso, g.vigente_desde, g.vigente_hasta)) continue;
        if (iso === hoyIso && hhmm(g.hora_fin) <= nowHM) continue;
        out.push({
          id: `g-${g.id}-${iso}`,
          tipo: "grupal",
          fecha: iso,
          hora_inicio: hhmm(g.hora_inicio),
          hora_fin: hhmm(g.hora_fin),
          coach_id: coach?.id ?? null,
          coach_nombre: coach?.nombre ?? null,
          sede_id: g.sede_id,
          sede_nombre: g.sedes?.nombre ?? null,
          titulo: "Clase grupal",
          detalle: g.grupo || null,
        });
      }
    }

    for (const t of turnos) {
      if (t.fecha === hoyIso && hhmm(t.hora_fin) <= nowHM) continue;
      out.push({
        id: `t-${t.id}`,
        tipo: "turno",
        fecha: t.fecha,
        hora_inicio: hhmm(t.hora_inicio),
        hora_fin: hhmm(t.hora_fin),
        coach_id: coach?.id ?? null,
        coach_nombre: coach?.nombre ?? null,
        sede_id: t.sede_id,
        sede_nombre: t.sedes?.nombre ?? null,
        titulo: t.servicios_turnera?.nombre || "Turno",
        detalle: `${t.nombre || ""} ${t.apellido || ""}`.trim() || null,
        estado: t.estado_operativo,
        raw: t,
      });
    }

    return out.sort(
      (a, b) => a.fecha.localeCompare(b.fecha) || a.hora_inicio.localeCompare(b.hora_inicio),
    );
  }, [grupal, turnos, coach]);

  const porFecha = useMemo(() => {
    const map = new Map<string, AgendaEvento[]>();
    for (const e of agenda) {
      if (!map.has(e.fecha)) map.set(e.fecha, []);
      map.get(e.fecha)!.push(e);
    }
    return [...map.entries()];
  }, [agenda]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-4 py-3 flex items-center gap-3 sticky top-0 bg-card/80 backdrop-blur-sm z-10">
        <Button variant="ghost" size="icon" onClick={() => navigate("/coach")}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-base font-semibold text-foreground">Mi agenda</h1>
          <p className="text-xs text-muted-foreground">Clases, turnos y tus horarios disponibles</p>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4">
        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-10 animate-pulse">Cargando…</p>
        ) : !coach ? (
          <p className="text-sm text-muted-foreground text-center py-10">No encontramos tu ficha de coach.</p>
        ) : (
          <Tabs defaultValue="agenda">
            <TabsList className="w-full grid grid-cols-3">
              <TabsTrigger value="agenda">Agenda</TabsTrigger>
              <TabsTrigger value="horarios">Disponibilidad</TabsTrigger>
              <TabsTrigger value="ausencias">Ausencias</TabsTrigger>
            </TabsList>

            <TabsContent value="agenda" className="mt-4 space-y-4">
              {porFecha.length === 0 ? (
                <Card className="border-border">
                  <CardContent className="py-10 text-center space-y-2">
                    <CalendarClock className="w-7 h-7 mx-auto text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">No tenés actividad en los próximos días.</p>
                  </CardContent>
                </Card>
              ) : (
                porFecha.map(([fecha, items]) => (
                  <div key={fecha} className="space-y-2">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-primary capitalize">
                      {labelFechaLarga(fecha)}
                      <span className="ml-2 text-muted-foreground font-normal normal-case">
                        {parseIso(fecha).toLocaleDateString("es-AR", { day: "numeric", month: "short" })}
                      </span>
                    </h2>
                    {items.map((e) => (
                      <Card key={e.id} className="border-border">
                        <CardContent className="p-3 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-heading font-semibold">
                              {e.hora_inicio}–{e.hora_fin}
                            </span>
                            <Badge variant="outline" className="text-[10px]">
                              {e.tipo === "grupal" ? "Clase grupal" : "Turno"}
                            </Badge>
                            {e.tipo === "grupal" && (
                              <Badge variant="secondary" className="text-[10px]">↻ Semanal</Badge>
                            )}
                            {e.estado === "realizada" && (
                              <Badge variant="outline" className="text-[10px]">Realizada</Badge>
                            )}
                            {e.raw?.pago_estado === "aprobado" && (
                              <Badge variant="outline" className="text-[10px]">Pagado</Badge>
                            )}
                          </div>
                          <p className="text-[13px] text-foreground">{e.titulo}</p>
                          {e.detalle && (
                            <p className="text-[12px] text-muted-foreground flex items-center gap-1">
                              {e.tipo === "grupal" ? <Users className="w-3 h-3" /> : <User className="w-3 h-3" />}
                              {e.detalle}
                              {e.raw?.celular && <span className="ml-2 font-mono">{e.raw.celular}</span>}
                            </p>
                          )}
                          {e.sede_nombre && (
                            <p className="text-[12px] text-muted-foreground flex items-center gap-1">
                              <MapPin className="w-3 h-3" /> {e.sede_nombre}
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ))
              )}
            </TabsContent>

            <TabsContent value="horarios" className="mt-4">
              <DisponibilidadManager
                coaches={[coach]}
                servicios={servicios}
                sedes={sedes}
                disponibilidades={disponibilidades}
                reload={loadAll}
                lockedCoachId={coach.id}
              />
            </TabsContent>

            <TabsContent value="ausencias" className="mt-4 space-y-6">
              <AusenciasCoachManager coachId={coach.id} coachNombre={coach.nombre} />
              <DisponibilidadAjustadaManager coaches={[coach]} lockedCoachId={coach.id} />
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
};

export default CoachAgenda;
