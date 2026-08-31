import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, MapPin, User, CalendarClock } from "lucide-react";
import { DisponibilidadEditor } from "@/components/admin/DisponibilidadEditor";
import { DisponibilidadAjustadaManager } from "@/components/admin/DisponibilidadAjustadaManager";
import { labelFecha, toLocalIso } from "@/lib/coachAgenda";

const CoachAgenda = () => {
  const navigate = useNavigate();
  const [coach, setCoach] = useState<any>(null);
  const [servicios, setServicios] = useState<any[]>([]);
  const [sedes, setSedes] = useState<any[]>([]);
  const [disponibilidades, setDisponibilidades] = useState<any[]>([]);
  const [turnos, setTurnos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setLoading(false); return; }
    const { data: c } = await supabase
      .from("coaches").select("id, nombre").eq("user_id", session.user.id).maybeSingle();
    if (!c) { setLoading(false); return; }
    setCoach(c);

    const [servRes, sedesRes, dispRes, turnosRes] = await Promise.all([
      supabase.from("servicios_turnera").select("*").eq("activo", true),
      supabase.from("sedes").select("*"),
      supabase.from("disponibilidad_coaches").select("*").eq("coach_id", (c as any).id),
      supabase
        .from("reservas_turnera")
        .select("id, fecha, hora_inicio, hora_fin, nombre, apellido, celular, estado_operativo, pago_estado, servicios_turnera:servicio_id(nombre), sedes:sede_id(nombre)")
        .eq("coach_id", (c as any).id)
        .gte("fecha", toLocalIso(new Date()))
        .not("estado_operativo", "in", "(cancelada,cancelada_por_admin)")
        .order("fecha").order("hora_inicio").limit(30),
    ]);
    setServicios((servRes.data as any[]) || []);
    setSedes((sedesRes.data as any[]) || []);
    setDisponibilidades((dispRes.data as any[]) || []);
    setTurnos((turnosRes.data as any[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-4 py-3 flex items-center gap-3 sticky top-0 bg-card/80 backdrop-blur-sm z-10">
        <Button variant="ghost" size="icon" onClick={() => navigate("/coach")}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-base font-semibold text-foreground">Mi agenda y horarios</h1>
          <p className="text-xs text-muted-foreground">Tus turnos y la disponibilidad que ven los alumnos</p>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4">
        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-10 animate-pulse">Cargando…</p>
        ) : !coach ? (
          <p className="text-sm text-muted-foreground text-center py-10">No encontramos tu ficha de coach.</p>
        ) : (
          <Tabs defaultValue="turnos">
            <TabsList className="w-full grid grid-cols-3">
              <TabsTrigger value="turnos">Turnos</TabsTrigger>
              <TabsTrigger value="horarios">Horarios</TabsTrigger>
              <TabsTrigger value="ajustes">Excepciones</TabsTrigger>
            </TabsList>

            <TabsContent value="turnos" className="mt-4 space-y-2">
              {turnos.length === 0 ? (
                <Card className="border-border">
                  <CardContent className="py-10 text-center space-y-2">
                    <CalendarClock className="w-7 h-7 mx-auto text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">No tenés turnos próximos.</p>
                  </CardContent>
                </Card>
              ) : (
                turnos.map((t) => (
                  <Card key={t.id} className="border-border">
                    <CardContent className="p-3 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-heading font-semibold capitalize">
                          {labelFecha(t.fecha)} · {t.hora_inicio?.slice(0, 5)}–{t.hora_fin?.slice(0, 5)}
                        </span>
                        {t.estado_operativo === "realizada" && (
                          <Badge variant="outline" className="text-[10px]">Realizada</Badge>
                        )}
                        {t.pago_estado === "aprobado" && (
                          <Badge variant="outline" className="text-[10px]">Pagado</Badge>
                        )}
                      </div>
                      <p className="text-[13px] text-foreground">{t.servicios_turnera?.nombre || "Turno"}</p>
                      <p className="text-[12px] text-muted-foreground flex items-center gap-1">
                        <User className="w-3 h-3" /> {`${t.nombre} ${t.apellido || ""}`.trim()}
                        {t.celular && <span className="ml-2 font-mono">{t.celular}</span>}
                      </p>
                      {t.sedes?.nombre && (
                        <p className="text-[12px] text-muted-foreground flex items-center gap-1">
                          <MapPin className="w-3 h-3" /> {t.sedes.nombre}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>

            <TabsContent value="horarios" className="mt-4">
              <DisponibilidadEditor
                coaches={[coach]}
                servicios={servicios}
                sedes={sedes}
                disponibilidades={disponibilidades}
                reload={loadAll}
                lockedCoachId={coach.id}
              />
            </TabsContent>

            <TabsContent value="ajustes" className="mt-4">
              <DisponibilidadAjustadaManager coaches={[coach]} lockedCoachId={coach.id} />
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
};

export default CoachAgenda;
