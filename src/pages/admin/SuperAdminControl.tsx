import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertTriangle, UserX, Clock, MessageSquare, Activity,
  ShieldAlert, Eye, TrendingDown, Users,
} from "lucide-react";
import { WhatsAppCheckAlert } from "@/components/admin/WhatsAppCheckAlert";

interface AlumnoAlert {
  id: string;
  nombre: string;
  apellido: string | null;
  email: string;
  estado: string;
  grupo: string;
  updated_at: string;
  last_login?: string;
  daysSinceActivity: number;
  alertType: "inactive_long" | "inactive_medium" | "no_sessions" | "no_login";
}

interface CoachFeedbackRow {
  id: string;
  comentario: string;
  fecha: string;
  tipo: string | null;
  alumno: { nombre: string; apellido: string | null } | null;
  coach: { nombre: string } | null;
}

interface CoachActivity {
  id: string;
  nombre: string;
  email: string;
  totalFeedback: number;
  lastFeedbackDate: string | null;
  daysSinceLastFeedback: number | null;
}

const SuperAdminControl = () => {
  const [loading, setLoading] = useState(true);
  const [alumnoAlerts, setAlumnoAlerts] = useState<AlumnoAlert[]>([]);
  const [recentFeedback, setRecentFeedback] = useState<CoachFeedbackRow[]>([]);
  const [coachActivity, setCoachActivity] = useState<CoachActivity[]>([]);
  const [stats, setStats] = useState({
    totalAlertas: 0,
    sinSesiones30d: 0,
    sinLogin7d: 0,
    coachesSinFeedback: 0,
    alumnosSinPlan: 0,
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();

      const [alumnosRes, feedbackRes, coachesRes, sesionesRes, subsRes] = await Promise.all([
        supabase.from("alumnos").select("id, nombre, apellido, email, estado, grupo, updated_at, user_id"),
        supabase.from("feedback_coach").select("id, comentario, fecha, tipo, alumno_id, coach_id").order("fecha", { ascending: false }).limit(20),
        supabase.from("coaches").select("id, nombre, email, estado, user_id"),
        supabase.from("registro_sesiones").select("alumno_id, fecha_registro").gte("fecha_registro", thirtyDaysAgo),
        supabase.from("suscripciones").select("alumno_id, estado"),
      ]);

      const alumnos = alumnosRes.data || [];
      const feedbackRaw = feedbackRes.data || [];
      const coaches = coachesRes.data || [];
      const sesiones = sesionesRes.data || [];
      const subs = subsRes.data || [];

      // Get alumno and coach names for feedback
      const alumnoMap = new Map(alumnos.map(a => [a.id, a]));
      const coachMap = new Map(coaches.map(c => [c.id, c]));

      // Recent feedback with names
      const enrichedFeedback: CoachFeedbackRow[] = feedbackRaw.map(f => ({
        id: f.id,
        comentario: f.comentario,
        fecha: f.fecha,
        tipo: f.tipo,
        alumno: alumnoMap.has(f.alumno_id) ? { nombre: alumnoMap.get(f.alumno_id)!.nombre, apellido: alumnoMap.get(f.alumno_id)!.apellido } : null,
        coach: coachMap.has(f.coach_id) ? { nombre: coachMap.get(f.coach_id)!.nombre } : null,
      }));

      // Alumnos with active subscriptions
      const activeSubs = new Set(subs.filter(s => s.estado === "activa").map(s => s.alumno_id));

      // Alumnos who registered sessions in last 30 days
      const alumnosWithSessions = new Set(sesiones.map(s => s.alumno_id));

      // Build alerts
      const alerts: AlumnoAlert[] = [];
      const activeAlumnos = alumnos.filter(a => a.estado === "activo");

      for (const a of activeAlumnos) {
        const daysSinceUpdate = Math.floor((now.getTime() - new Date(a.updated_at).getTime()) / (1000 * 60 * 60 * 24));
        const hasSessions = alumnosWithSessions.has(a.id);

        if (!hasSessions && daysSinceUpdate > 14) {
          alerts.push({
            ...a,
            daysSinceActivity: daysSinceUpdate,
            alertType: daysSinceUpdate > 30 ? "inactive_long" : "inactive_medium",
          });
        } else if (!hasSessions) {
          alerts.push({
            ...a,
            daysSinceActivity: daysSinceUpdate,
            alertType: "no_sessions",
          });
        }
      }

      alerts.sort((a, b) => b.daysSinceActivity - a.daysSinceActivity);

      // Coach activity: feedback given in last 30 days
      const coachFeedbackCount = new Map<string, { count: number; lastDate: string | null }>();
      for (const c of coaches) {
        coachFeedbackCount.set(c.id, { count: 0, lastDate: null });
      }
      // Count all feedback (not just recent)
      const allFeedbackRes = await supabase.from("feedback_coach").select("coach_id, fecha").order("fecha", { ascending: false });
      const allFeedback = allFeedbackRes.data || [];
      for (const f of allFeedback) {
        const entry = coachFeedbackCount.get(f.coach_id);
        if (entry) {
          entry.count++;
          if (!entry.lastDate || f.fecha > entry.lastDate) entry.lastDate = f.fecha;
        }
      }

      const coachActivityData: CoachActivity[] = coaches
        .filter(c => c.estado === "activo")
        .map(c => {
          const entry = coachFeedbackCount.get(c.id) || { count: 0, lastDate: null };
          const daysSince = entry.lastDate
            ? Math.floor((now.getTime() - new Date(entry.lastDate).getTime()) / (1000 * 60 * 60 * 24))
            : null;
          return {
            id: c.id,
            nombre: c.nombre,
            email: c.email,
            totalFeedback: entry.count,
            lastFeedbackDate: entry.lastDate,
            daysSinceLastFeedback: daysSince,
          };
        })
        .sort((a, b) => (b.daysSinceLastFeedback ?? 999) - (a.daysSinceLastFeedback ?? 999));

      // Alumnos sin plan
      const alumnosSinPlan = activeAlumnos.filter(a => !activeSubs.has(a.id)).length;

      setAlumnoAlerts(alerts.slice(0, 30));
      setRecentFeedback(enrichedFeedback);
      setCoachActivity(coachActivityData);
      setStats({
        totalAlertas: alerts.length,
        sinSesiones30d: alerts.filter(a => a.alertType === "inactive_long").length,
        sinLogin7d: alerts.filter(a => a.alertType === "inactive_medium" || a.alertType === "no_sessions").length,
        coachesSinFeedback: coachActivityData.filter(c => c.totalFeedback === 0 || (c.daysSinceLastFeedback !== null && c.daysSinceLastFeedback > 14)).length,
        alumnosSinPlan,
      });
    } catch (err) {
      console.error("Error loading control data:", err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const getAlertBadge = (type: AlumnoAlert["alertType"]) => {
    switch (type) {
      case "inactive_long":
        return <Badge variant="destructive" className="text-[10px]">+30 días sin actividad</Badge>;
      case "inactive_medium":
        return <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30 text-[10px]">+14 días inactivo</Badge>;
      case "no_sessions":
        return <Badge variant="secondary" className="text-[10px]">Sin sesiones este mes</Badge>;
      default:
        return <Badge variant="outline" className="text-[10px]">Sin datos</Badge>;
    }
  };

  if (loading) return <div className="animate-pulse text-muted-foreground text-center py-12">Cargando centro de control...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold uppercase tracking-wider">Centro de Control</h1>
        <p className="text-sm text-muted-foreground">Alertas críticas y estado operativo del negocio</p>
      </div>

      {/* KPI Alerts */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Alertas activas", value: stats.totalAlertas, icon: AlertTriangle, color: "text-destructive" },
          { label: "Inactivos +30d", value: stats.sinSesiones30d, icon: UserX, color: "text-red-500" },
          { label: "Sin sesiones recientes", value: stats.sinLogin7d, icon: Clock, color: "text-orange-400" },
          { label: "Coaches sin feedback", value: stats.coachesSinFeedback, icon: MessageSquare, color: "text-yellow-400" },
          { label: "Alumnos sin plan", value: stats.alumnosSinPlan, icon: ShieldAlert, color: "text-red-400" },
        ].map((kpi) => (
          <Card key={kpi.label} className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
                <span className="text-[10px] font-heading font-bold uppercase tracking-wider text-muted-foreground">{kpi.label}</span>
              </div>
              <p className={`text-2xl font-heading font-bold ${kpi.value > 0 ? kpi.color : "text-green-500"}`}>{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Two columns: Alerts + Coach feedback */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Alumnos en riesgo */}
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-heading font-bold uppercase tracking-wider flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-destructive" />
              Alumnos en riesgo de abandono
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {alumnoAlerts.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-sm">
                🎉 Todos los alumnos activos tienen actividad reciente
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Alumno</TableHead>
                      <TableHead>Grupo</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right">Días inactivo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {alumnoAlerts.slice(0, 15).map((a) => (
                      <TableRow key={a.id}>
                        <TableCell>
                          <div>
                            <p className="text-sm font-medium">{a.nombre} {a.apellido || ""}</p>
                            <p className="text-xs text-muted-foreground">{a.email}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">{a.grupo}</Badge>
                        </TableCell>
                        <TableCell>{getAlertBadge(a.alertType)}</TableCell>
                        <TableCell className="text-right">
                          <span className={`font-heading font-bold ${a.daysSinceActivity > 30 ? "text-destructive" : a.daysSinceActivity > 14 ? "text-orange-400" : "text-muted-foreground"}`}>
                            {a.daysSinceActivity}d
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Feedback reciente de coaches */}
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-heading font-bold uppercase tracking-wider flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-primary" />
              Feedback reciente de coaches
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {recentFeedback.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-sm">
                No hay feedback registrado aún
              </div>
            ) : (
              <div className="divide-y divide-border">
                {recentFeedback.slice(0, 10).map((f) => (
                  <div key={f.id} className="px-4 py-3">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-primary">
                          {f.coach?.nombre || "Coach"}
                        </span>
                        <span className="text-muted-foreground text-[10px]">→</span>
                        <span className="text-xs text-muted-foreground">
                          {f.alumno ? `${f.alumno.nombre} ${f.alumno.apellido || ""}` : "Alumno"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {f.tipo && <Badge variant="outline" className="text-[10px]">{f.tipo}</Badge>}
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(f.fecha + "T12:00:00").toLocaleDateString("es-AR")}
                        </span>
                      </div>
                    </div>
                    <p className="text-sm text-foreground/80 line-clamp-2">{f.comentario}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Coach activity table */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-heading font-bold uppercase tracking-wider flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            Actividad de Coaches
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {coachActivity.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">No hay coaches activos</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Coach</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead className="text-center">Total feedback</TableHead>
                    <TableHead>Último feedback</TableHead>
                    <TableHead className="text-center">Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {coachActivity.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.nombre}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{c.email}</TableCell>
                      <TableCell className="text-center font-heading font-bold">{c.totalFeedback}</TableCell>
                      <TableCell className="text-xs">
                        {c.lastFeedbackDate
                          ? new Date(c.lastFeedbackDate + "T12:00:00").toLocaleDateString("es-AR")
                          : <span className="text-muted-foreground">Nunca</span>}
                      </TableCell>
                      <TableCell className="text-center">
                        {c.totalFeedback === 0 ? (
                          <Badge variant="destructive" className="text-[10px]">Sin actividad</Badge>
                        ) : c.daysSinceLastFeedback !== null && c.daysSinceLastFeedback > 14 ? (
                          <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30 text-[10px]">
                            {c.daysSinceLastFeedback}d sin feedback
                          </Badge>
                        ) : (
                          <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-[10px]">Activo</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SuperAdminControl;
