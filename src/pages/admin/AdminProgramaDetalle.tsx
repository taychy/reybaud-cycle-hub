import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Users, Calendar, DollarSign, AlertCircle, MessageCircle, ExternalLink, Workflow, Play, Loader2, Edit3 } from "lucide-react";
import { formatPrice } from "@/lib/currency";
import { toast } from "@/hooks/use-toast";
import { startProcessInstance } from "@/hooks/useProcesses";

const sb: any = supabase;

interface PlanRow {
  id: string;
  nombre: string;
  descripcion: string | null;
  descripcion_corta: string | null;
  precio: number;
  moneda: string;
  activo: boolean;
  landing_public: boolean | null;
  cohort_slug: string | null;
  max_inscripciones: number | null;
  inscripciones_actuales: number | null;
  fecha_inicio_programa: string | null;
  fecha_fin_programa: string | null;
  fecha_cierre_inscripcion: string | null;
  cuotas_cantidad: number | null;
  cuota_valor: number | null;
}

interface Inscripto {
  id: string;
  alumno_id: string;
  estado: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  precio_final: number | null;
  metodo_pago: string | null;
  origen_registro: string | null;
  notas: string | null;
  created_at: string;
  chequeado_admin: boolean | null;
  mp_status: string | null;
  alumno?: {
    nombre: string | null;
    apellido: string | null;
    email: string | null;
    telefono: string | null;
  } | null;
}

const fmtDate = (d: string | null) => {
  if (!d) return "—";
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" });
};

const fmtDateTime = (s: string | null) => {
  if (!s) return "—";
  return new Date(s).toLocaleString("es-AR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
};

const daysUntil = (d: string | null): number | null => {
  if (!d) return null;
  const [y, m, day] = d.split("-").map(Number);
  const target = new Date(y, m - 1, day).getTime();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((target - today) / 86_400_000);
};

const estadoBadge = (estado: string) => {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
    activa: { label: "Activa", variant: "default" },
    pendiente_pago: { label: "Pendiente pago", variant: "outline" },
    pendiente_verificacion: { label: "Verificar", variant: "secondary" },
    vencida: { label: "Vencida", variant: "destructive" },
    finalizada: { label: "Finalizada", variant: "outline" },
    cancelada: { label: "Cancelada", variant: "outline" },
    pausada: { label: "Pausada", variant: "outline" },
  };
  const info = map[estado] || { label: estado, variant: "outline" as const };
  return <Badge variant={info.variant}>{info.label}</Badge>;
};

const AdminProgramaDetalle = () => {
  const { cohortId } = useParams<{ cohortId: string }>();
  const navigate = useNavigate();
  const [plan, setPlan] = useState<PlanRow | null>(null);
  const [inscriptos, setInscriptos] = useState<Inscripto[]>([]);
  const [emails, setEmails] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [playbook, setPlaybook] = useState<{ id: string; nombre: string; stages: number } | null>(null);
  const [activeInstanceId, setActiveInstanceId] = useState<string | null>(null);
  const [startingFlujo, setStartingFlujo] = useState(false);

  useEffect(() => {
    if (!cohortId) return;
    (async () => {
      setLoading(true);
      const [{ data: p }, { data: subs }] = await Promise.all([
        sb.from("planes").select("*").eq("id", cohortId).maybeSingle(),
        sb
          .from("suscripciones")
          .select("id, alumno_id, estado, fecha_inicio, fecha_fin, precio_final, metodo_pago, origen_registro, notas, created_at, chequeado_admin, mp_status")
          .eq("plan_id", cohortId)
          .order("created_at", { ascending: false }),
      ]);
      setPlan(p as PlanRow);
      const list = (subs || []) as Inscripto[];
      // Load alumno data in one shot
      const alumnoIds = Array.from(new Set(list.map((s) => s.alumno_id).filter(Boolean)));
      if (alumnoIds.length > 0) {
        const { data: alumnos } = await sb
          .from("alumnos")
          .select("id, nombre, apellido, email, telefono")
          .in("id", alumnoIds);
        const byId = new Map((alumnos || []).map((a: any) => [a.id, a]));
        list.forEach((s) => {
          s.alumno = (byId.get(s.alumno_id) as any) || null;
        });
      }
      setInscriptos(list);

      // Load emails linked to these inscriptos by recipient email (best-effort)
      const emailsList = Array.from(new Set(list.map((s) => s.alumno?.email).filter(Boolean))) as string[];
      if (emailsList.length > 0) {
        const { data: eLog } = await sb
          .from("email_send_log")
          .select("id, recipient_email, template_name, status, created_at, metadata")
          .in("recipient_email", emailsList)
          .order("created_at", { ascending: false })
          .limit(100);
        setEmails(eLog || []);
      }

      // Load playbook template + active instance for this cohort
      const { data: tpl } = await sb
        .from("process_templates")
        .select("id, nombre")
        .eq("plan_id", cohortId)
        .maybeSingle();
      if (tpl) {
        const { count } = await sb
          .from("process_template_stages")
          .select("id", { count: "exact", head: true })
          .eq("template_id", tpl.id);
        setPlaybook({ id: tpl.id, nombre: tpl.nombre, stages: count || 0 });
        const { data: inst } = await sb
          .from("process_instances")
          .select("id")
          .eq("plan_id", cohortId)
          .eq("estado", "en_curso")
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        setActiveInstanceId(inst?.id || null);
      } else {
        setPlaybook(null);
        setActiveInstanceId(null);
      }

      setLoading(false);
    })();
  }, [cohortId]);

  const handleFlujo = async () => {
    if (!cohortId || !playbook) return;
    if (activeInstanceId) {
      navigate(`/admin/programas/${cohortId}/flujo/${activeInstanceId}`);
      return;
    }
    setStartingFlujo(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sin sesión");
      const id = await startProcessInstance({
        template_id: playbook.id,
        iniciado_por: user.id,
        destinatario_reporte_email: null,
        plan_id: cohortId,
      });
      navigate(`/admin/programas/${cohortId}/flujo/${id}`);
    } catch (e: any) {
      toast({ title: "No se pudo iniciar el flujo", description: e.message, variant: "destructive" });
    } finally {
      setStartingFlujo(false);
    }
  };


  const kpis = useMemo(() => {
    const total = inscriptos.length;
    const activos = inscriptos.filter((i) => i.estado === "activa").length;
    const pendVer = inscriptos.filter((i) => i.estado === "pendiente_verificacion").length;
    const pendPago = inscriptos.filter((i) => i.estado === "pendiente_pago").length;
    const recaudado = inscriptos
      .filter((i) => i.estado === "activa" || i.estado === "finalizada")
      .reduce((s, i) => s + (Number(i.precio_final) || 0), 0);
    return { total, activos, pendVer, pendPago, recaudado };
  }, [inscriptos]);

  const filtered = inscriptos.filter((i) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (i.alumno?.nombre || "").toLowerCase().includes(q) ||
      (i.alumno?.apellido || "").toLowerCase().includes(q) ||
      (i.alumno?.email || "").toLowerCase().includes(q) ||
      (i.alumno?.telefono || "").includes(q)
    );
  });

  if (loading) return <div className="text-center py-12 text-muted-foreground">Cargando…</div>;
  if (!plan)
    return (
      <div className="space-y-4">
        <Link to="/admin/programas"><Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-1" /> Volver</Button></Link>
        <Card><CardContent className="p-12 text-center text-muted-foreground">Cohorte no encontrada.</CardContent></Card>
      </div>
    );

  const cap = plan.max_inscripciones || 0;
  const curr = plan.inscripciones_actuales || 0;
  const dToStart = daysUntil(plan.fecha_inicio_programa);
  const dToClose = daysUntil(plan.fecha_cierre_inscripcion);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/admin/programas">
          <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-1" /> Programas</Button>
        </Link>
      </div>

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-heading font-bold uppercase tracking-wider">{plan.nombre}</h1>
          {plan.descripcion_corta && (
            <p className="text-sm text-muted-foreground mt-1">{plan.descripcion_corta}</p>
          )}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {plan.cohort_slug && <Badge variant="outline">{plan.cohort_slug}</Badge>}
            {plan.landing_public && (
              <a
                href={`/formacion-inicial?cohort=${plan.cohort_slug || plan.id}`}
                target="_blank"
                rel="noreferrer"
              >
                <Badge variant="outline" className="cursor-pointer hover:bg-accent">
                  <ExternalLink className="w-3 h-3 mr-1" /> Landing pública
                </Badge>
              </a>
            )}
            {!plan.activo && <Badge variant="outline">Inactiva</Badge>}
          </div>
        </div>
        <div className="flex gap-2">
          {playbook ? (
            <Button
              variant={activeInstanceId ? "default" : "outline"}
              size="sm"
              onClick={handleFlujo}
              disabled={startingFlujo}
            >
              {startingFlujo ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : activeInstanceId ? (
                <Play className="w-4 h-4 mr-1" />
              ) : (
                <Workflow className="w-4 h-4 mr-1" />
              )}
              {activeInstanceId ? "Continuar flujo" : "Iniciar flujo"}
            </Button>
          ) : (
            <Link to={`/admin/planes/${cohortId}/playbook`}>
              <Button variant="outline" size="sm">
                <Workflow className="w-4 h-4 mr-1" /> Configurar playbook
              </Button>
            </Link>
          )}
          <Link to={`/admin/planes/${cohortId}/playbook`}>
            <Button size="sm" variant="secondary">
              <Edit3 className="w-4 h-4 mr-1" /> Editar playbook
            </Button>
          </Link>
        </div>
      </div>


      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard icon={Users} label="Inscriptos" value={`${curr}${cap ? ` / ${cap}` : ""}`} accent="primary" />
        <KpiCard icon={Users} label="Activos" value={kpis.activos} />
        <KpiCard icon={AlertCircle} label="A verificar" value={kpis.pendVer} accent={kpis.pendVer > 0 ? "warn" : undefined} />
        <KpiCard icon={AlertCircle} label="Pendientes" value={kpis.pendPago} />
        <KpiCard icon={DollarSign} label="Recaudado" value={formatPrice(kpis.recaudado, plan.moneda)} />
      </div>

      {/* Dates strip */}
      <Card>
        <CardContent className="p-4 flex flex-wrap gap-6 text-sm">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">Inicio:</span>
            <span className="font-medium">{fmtDate(plan.fecha_inicio_programa)}</span>
            {dToStart !== null && dToStart > 0 && (
              <Badge variant="outline" className="text-[10px]">en {dToStart}d</Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">Fin:</span>
            <span className="font-medium">{fmtDate(plan.fecha_fin_programa)}</span>
          </div>
          {plan.fecha_cierre_inscripcion && (
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">Cierre inscripción:</span>
              <span className={`font-medium ${dToClose !== null && dToClose < 7 ? "text-orange-500" : ""}`}>
                {fmtDate(plan.fecha_cierre_inscripcion)}
              </span>
            </div>
          )}
          <div className="flex items-center gap-2 ml-auto">
            <DollarSign className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">Precio:</span>
            <span className="font-heading font-bold">{formatPrice(plan.precio, plan.moneda)}</span>
            {plan.cuotas_cantidad && plan.cuotas_cantidad > 1 && plan.cuota_valor && (
              <span className="text-xs text-muted-foreground">
                ({plan.cuotas_cantidad} × {formatPrice(plan.cuota_valor, plan.moneda)})
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="inscriptos">
        <TabsList>
          <TabsTrigger value="inscriptos">Inscriptos ({inscriptos.length})</TabsTrigger>
          <TabsTrigger value="playbook">Playbook</TabsTrigger>
          <TabsTrigger value="comunicaciones">Comunicaciones ({emails.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="inscriptos" className="space-y-3">
          <Input
            placeholder="Buscar por nombre, email o teléfono…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-md"
          />
          <Card>
            <CardContent className="p-0">
              {filtered.length === 0 ? (
                <div className="p-12 text-center text-muted-foreground text-sm">
                  {inscriptos.length === 0 ? "Todavía no hay inscriptos." : "Sin resultados."}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Alumno</TableHead>
                        <TableHead>Contacto</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead>Método</TableHead>
                        <TableHead>Precio</TableHead>
                        <TableHead>Inscripto</TableHead>
                        <TableHead className="text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((i) => {
                        const nombre = `${i.alumno?.nombre || ""} ${i.alumno?.apellido || ""}`.trim() || "—";
                        const tel = (i.alumno?.telefono || "").replace(/\D/g, "");
                        const waLink = tel ? `https://wa.me/${tel.startsWith("54") ? tel : `54${tel}`}` : null;
                        return (
                          <TableRow key={i.id}>
                            <TableCell className="font-medium">{nombre}</TableCell>
                            <TableCell className="text-xs">
                              <div>{i.alumno?.email || "—"}</div>
                              <div className="text-muted-foreground">{i.alumno?.telefono || ""}</div>
                            </TableCell>
                            <TableCell>{estadoBadge(i.estado)}</TableCell>
                            <TableCell className="text-xs">
                              <div>{i.metodo_pago || "—"}</div>
                              {i.mp_status && (
                                <div className="text-muted-foreground">{i.mp_status}</div>
                              )}
                            </TableCell>
                            <TableCell className="text-xs font-medium">
                              {i.precio_final != null ? formatPrice(Number(i.precio_final), plan.moneda) : "—"}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">{fmtDateTime(i.created_at)}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex gap-1 justify-end">
                                {waLink && (
                                  <a href={waLink} target="_blank" rel="noreferrer">
                                    <Button size="icon" variant="ghost" className="h-7 w-7">
                                      <MessageCircle className="w-3.5 h-3.5" />
                                    </Button>
                                  </a>
                                )}
                                <Link to={`/admin/alumnos?q=${encodeURIComponent(i.alumno?.email || nombre)}`}>
                                  <Button size="sm" variant="ghost" className="h-7 text-xs">Ver</Button>
                                </Link>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="playbook">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Workflow className="w-4 h-4" /> Playbook del programa
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>
                El <b>playbook</b> es la receta escrita del programa: etapas ordenadas (publicar cohorte, cerrar cupo,
                bienvenida, primera clase, check-in intermedio, graduación, oferta de continuidad, seguimiento post-90d),
                cada una con responsable, tiempo estimado y salida verificable.
              </p>
              <p>
                Se habilita en el <b>Paso 2</b> del rediseño: se edita desde la plantilla del plan y se ejecuta con el
                botón <b>Flujo</b> arriba a la derecha. Cada cohorte tendrá su propia instancia del playbook.
              </p>
              <p className="pt-2">
                <Link to="/admin/procesos/plantillas" className="text-primary underline">
                  Ver plantillas de procesos existentes →
                </Link>
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="comunicaciones">
          <Card>
            <CardContent className="p-0">
              {emails.length === 0 ? (
                <div className="p-12 text-center text-muted-foreground text-sm">
                  Sin emails registrados vinculados a esta cohorte.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Destinatario</TableHead>
                      <TableHead>Plantilla</TableHead>
                      <TableHead>Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {emails.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="text-xs">{fmtDateTime(e.created_at)}</TableCell>
                        <TableCell className="text-xs">{e.recipient_email}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{e.template_name || "—"}</TableCell>
                        <TableCell>
                          <Badge variant={e.status === "sent" ? "default" : "outline"} className="text-[10px]">
                            {e.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

const KpiCard = ({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: any;
  label: string;
  value: string | number;
  accent?: "primary" | "warn";
}) => (
  <Card>
    <CardContent className="p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </div>
      <div
        className={`text-2xl font-heading font-bold mt-1 ${
          accent === "primary" ? "text-primary" : accent === "warn" ? "text-orange-500" : ""
        }`}
      >
        {value}
      </div>
    </CardContent>
  </Card>
);

export default AdminProgramaDetalle;
