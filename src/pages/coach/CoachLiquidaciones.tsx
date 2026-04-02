import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, DollarSign, Clock, CheckCircle, TrendingUp, Plus } from "lucide-react";
import logo from "@/assets/logo.png";

const ESTADO_OP_LABELS: Record<string, string> = {
  programada: "Programada",
  reservada: "Reservada",
  realizada: "Realizada",
  suspendida_por_lluvia: "Susp. lluvia",
  suspendida_por_otro_motivo: "Susp. otro",
  cancelada_por_alumno: "Canc. alumno",
  cancelada_por_admin: "Canc. admin",
  ausente_alumno: "Ausente",
  reprogramada: "Reprogramada",
};

const ESTADO_EC_LABELS: Record<string, string> = {
  liquidable: "Liquidable",
  no_liquidable: "No liquidable",
  pendiente_revision: "Pendiente",
  liquidada: "Liquidada",
  pagada: "Pagada",
};

const ESTADO_EC_COLORS: Record<string, string> = {
  liquidable: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  no_liquidable: "bg-red-500/10 text-red-400 border-red-500/20",
  pendiente_revision: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  liquidada: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  pagada: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
};

const TIPO_LABELS: Record<string, string> = {
  grupal_1h30: "Grupal 1h30",
  grupal_2h: "Grupal 2h",
  fondo_salida: "Fondo/Salida",
  tecnica: "Técnica",
  evento_escuela: "Evento Escuela",
  evaluatoria: "Evaluatoria",
  personalizada: "Personalizada",
  ajuste: "Ajuste manual",
};

const FILTROS = ["todas", "grupales", "personalizadas", "evaluatorias", "ajustes"] as const;

type Movimiento = {
  id: string;
  fecha: string;
  tipo_actividad: string;
  grupo: string | null;
  evento: string | null;
  nombre_externo: string | null;
  valor_base: number;
  viaticos: number;
  entrada: number;
  extras: number;
  total: number;
  estado_operativo: string;
  estado_economico: string;
  observaciones: string | null;
  origen: string;
  alumno_id: string | null;
};

type LiquidacionMensual = {
  id: string;
  mes: string;
  total_estimado: number;
  total_confirmado: number;
  total_pagado: number;
  estado: string;
  fecha_pago: string | null;
};

const CoachLiquidaciones = () => {
  const navigate = useNavigate();
  const [coachId, setCoachId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [historico, setHistorico] = useState<LiquidacionMensual[]>([]);
  const [filtro, setFiltro] = useState<string>("todas");

  const now = new Date();
  const mesActual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/admin/login"); return; }

      const { data: coach } = await supabase
        .from("coaches")
        .select("id")
        .eq("user_id", session.user.id)
        .single();
      if (!coach) { navigate("/coach"); return; }

      setCoachId(coach.id);

      // Fetch current month movements
      const startDate = `${mesActual}-01`;
      const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];

      const { data: movs } = await supabase
        .from("movimientos_liquidacion")
        .select("*")
        .eq("coach_id", coach.id)
        .gte("fecha", startDate)
        .lte("fecha", endDate)
        .order("fecha", { ascending: true });

      setMovimientos((movs as any[]) || []);

      // Fetch historical liquidaciones
      const { data: hist } = await supabase
        .from("liquidaciones_mensuales")
        .select("*")
        .eq("coach_id", coach.id)
        .neq("mes", mesActual)
        .order("mes", { ascending: false });

      setHistorico((hist as any[]) || []);
      setLoading(false);
    };
    init();
  }, [navigate]);

  const filteredMovimientos = movimientos.filter((m) => {
    if (filtro === "todas") return true;
    if (filtro === "grupales") return m.tipo_actividad.startsWith("grupal") || m.tipo_actividad === "fondo_salida" || m.tipo_actividad === "tecnica" || m.tipo_actividad === "evento_escuela";
    if (filtro === "personalizadas") return m.tipo_actividad === "personalizada";
    if (filtro === "evaluatorias") return m.tipo_actividad === "evaluatoria";
    if (filtro === "ajustes") return m.origen === "ajuste_manual";
    return true;
  });

  const confirmado = movimientos.filter(m => m.estado_economico === "liquidable" || m.estado_economico === "liquidada").reduce((s, m) => s + Number(m.total), 0);
  const estimado = movimientos.filter(m => m.estado_operativo === "programada" || m.estado_operativo === "reservada").reduce((s, m) => s + Number(m.total), 0);
  const pendiente = movimientos.filter(m => m.estado_economico === "pendiente_revision").reduce((s, m) => s + Number(m.total), 0);
  const ultimoPago = historico.find(h => h.estado === "pagada");

  const formatDate = (d: string) => {
    const date = new Date(d + "T12:00:00");
    return date.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
  };

  const formatMes = (m: string) => {
    const [y, mo] = m.split("-");
    const date = new Date(Number(y), Number(mo) - 1);
    return date.toLocaleDateString("es-AR", { month: "long", year: "numeric" });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Cargando...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/coach")}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <img src={logo} alt="Ciclismo Reybaud" className="w-8 h-8" />
            <h1 className="font-heading font-bold text-foreground text-sm uppercase tracking-wider">
              Liquidaciones
            </h1>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Month label */}
        <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
          {formatMes(mesActual)}
        </p>

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-3">
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                <span className="text-xs text-muted-foreground">Confirmado</span>
              </div>
              <p className="text-xl font-heading font-bold text-foreground">
                ${confirmado.toLocaleString("es-AR")}
              </p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-blue-400" />
                <span className="text-xs text-muted-foreground">Estimado</span>
              </div>
              <p className="text-xl font-heading font-bold text-foreground">
                ${estimado.toLocaleString("es-AR")}
              </p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-4 h-4 text-amber-400" />
                <span className="text-xs text-muted-foreground">Pendiente</span>
              </div>
              <p className="text-xl font-heading font-bold text-foreground">
                ${pendiente.toLocaleString("es-AR")}
              </p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="w-4 h-4 text-primary" />
                <span className="text-xs text-muted-foreground">Último pago</span>
              </div>
              <p className="text-xl font-heading font-bold text-foreground">
                {ultimoPago ? `$${Number(ultimoPago.total_pagado).toLocaleString("es-AR")}` : "–"}
              </p>
              {ultimoPago?.fecha_pago && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {new Date(ultimoPago.fecha_pago).toLocaleDateString("es-AR")}
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {FILTROS.map((f) => (
            <Button
              key={f}
              variant={filtro === f ? "default" : "outline"}
              size="sm"
              className="text-xs capitalize shrink-0"
              onClick={() => setFiltro(f)}
            >
              {f}
            </Button>
          ))}
        </div>

        {/* Movements list */}
        <div className="space-y-2">
          {filteredMovimientos.length === 0 ? (
            <Card className="bg-card border-border">
              <CardContent className="p-6 text-center">
                <p className="text-muted-foreground text-sm">No hay movimientos para este filtro.</p>
              </CardContent>
            </Card>
          ) : (
            filteredMovimientos.map((m) => (
              <Card key={m.id} className="bg-card border-border">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground font-mono">{formatDate(m.fecha)}</span>
                        <Badge variant="secondary" className="text-xs">
                          {TIPO_LABELS[m.tipo_actividad] || m.tipo_actividad}
                        </Badge>
                      </div>
                      <p className="text-sm text-foreground truncate">
                        {m.grupo || m.nombre_externo || m.evento || "–"}
                      </p>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">
                          {ESTADO_OP_LABELS[m.estado_operativo] || m.estado_operativo}
                        </Badge>
                        <Badge className={`text-[10px] border ${ESTADO_EC_COLORS[m.estado_economico] || "bg-muted text-muted-foreground"}`}>
                          {ESTADO_EC_LABELS[m.estado_economico] || m.estado_economico}
                        </Badge>
                      </div>
                      {m.observaciones && (
                        <p className="text-xs text-muted-foreground italic">{m.observaciones}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-heading font-bold text-foreground">
                        ${Number(m.total).toLocaleString("es-AR")}
                      </p>
                      {(Number(m.viaticos) > 0 || Number(m.extras) > 0) && (
                        <p className="text-[10px] text-muted-foreground">
                          {Number(m.viaticos) > 0 && `Viát: $${Number(m.viaticos).toLocaleString("es-AR")}`}
                          {Number(m.extras) > 0 && ` Extra: $${Number(m.extras).toLocaleString("es-AR")}`}
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Historical */}
        {historico.length > 0 && (
          <div className="space-y-3 pt-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
              Histórico
            </p>
            {historico.map((h) => (
              <Card key={h.id} className="bg-card border-border">
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground capitalize">{formatMes(h.mes)}</p>
                    <Badge variant="outline" className="text-[10px] mt-1 capitalize">{h.estado}</Badge>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-heading font-bold text-foreground">
                      ${Number(h.total_confirmado).toLocaleString("es-AR")}
                    </p>
                    {h.fecha_pago && (
                      <p className="text-xs text-muted-foreground">
                        Pagado {new Date(h.fecha_pago).toLocaleDateString("es-AR")}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default CoachLiquidaciones;
