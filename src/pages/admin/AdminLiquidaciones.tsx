import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { DollarSign, Settings, Plus, Eye, CheckCircle, Clock, FileText } from "lucide-react";

const TIPO_LABELS: Record<string, string> = {
  grupal_1h30: "Grupal 1h30", grupal_2h: "Grupal 2h", fondo_salida: "Fondo/Salida",
  tecnica: "Técnica", evento_escuela: "Evento Escuela", evaluatoria: "Evaluatoria",
  personalizada: "Personalizada", ajuste: "Ajuste",
};

const ESTADO_OP_LABELS: Record<string, string> = {
  programada: "Programada", reservada: "Reservada", realizada: "Realizada",
  suspendida_por_lluvia: "Susp. lluvia", suspendida_por_otro_motivo: "Susp. otro",
  cancelada_por_alumno: "Canc. alumno", cancelada_por_admin: "Canc. admin",
  ausente_alumno: "Ausente", reprogramada: "Reprogramada",
};

const ESTADO_LIQ = ["borrador", "en_revision", "observada", "aprobada", "pagada"] as const;

type Coach = { id: string; nombre: string };
type Movimiento = any;
type LiquidacionMensual = any;
type Honorario = any;
type ReglaLiq = any;

const AdminLiquidaciones = () => {
  const [tab, setTab] = useState("liquidaciones");
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [selectedCoach, setSelectedCoach] = useState<string>("all");
  const [mes, setMes] = useState(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
  });
  const [liquidaciones, setLiquidaciones] = useState<LiquidacionMensual[]>([]);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [honorarios, setHonorarios] = useState<Honorario[]>([]);
  const [reglas, setReglas] = useState<ReglaLiq[]>([]);
  const [loading, setLoading] = useState(true);
  const [showHonForm, setShowHonForm] = useState(false);
  const [editingHon, setEditingHon] = useState<any>(null);
  const [honForm, setHonForm] = useState({ nombre_concepto: "", categoria: "clase", valor: "", coach_id: "" });
  const [showAjusteForm, setShowAjusteForm] = useState(false);
  const [ajusteForm, setAjusteForm] = useState({ coach_id: "", tipo_actividad: "ajuste", valor_base: "", observaciones: "" });

  useEffect(() => { loadData(); }, [mes, selectedCoach]);

  const loadData = async () => {
    setLoading(true);
    const [coachesRes, honRes, reglasRes] = await Promise.all([
      supabase.from("coaches").select("id, nombre").eq("estado", "activo"),
      supabase.from("honorarios").select("*").order("nombre_concepto"),
      supabase.from("reglas_liquidacion").select("*").order("tipo_actividad"),
    ]);
    setCoaches((coachesRes.data as any[]) || []);
    setHonorarios((honRes.data as any[]) || []);
    setReglas((reglasRes.data as any[]) || []);

    const startDate = `${mes}-01`;
    const endDate = new Date(Number(mes.split("-")[0]), Number(mes.split("-")[1]), 0).toISOString().split("T")[0];

    let movQuery = supabase.from("movimientos_liquidacion").select("*").gte("fecha", startDate).lte("fecha", endDate).order("fecha");
    if (selectedCoach !== "all") movQuery = movQuery.eq("coach_id", selectedCoach);
    const { data: movs } = await movQuery;
    setMovimientos((movs as any[]) || []);

    let liqQuery = supabase.from("liquidaciones_mensuales").select("*").eq("mes", mes);
    if (selectedCoach !== "all") liqQuery = liqQuery.eq("coach_id", selectedCoach);
    const { data: liqs } = await liqQuery;
    setLiquidaciones((liqs as any[]) || []);
    setLoading(false);
  };

  const openHonForm = (hon?: any) => {
    if (hon) {
      setEditingHon(hon);
      setHonForm({ nombre_concepto: hon.nombre_concepto, categoria: hon.categoria, valor: String(hon.valor), coach_id: hon.coach_id || "" });
    } else {
      setEditingHon(null);
      setHonForm({ nombre_concepto: "", categoria: "clase", valor: "", coach_id: "" });
    }
    setShowHonForm(true);
  };

  const saveHonorario = async () => {
    if (!honForm.nombre_concepto || !honForm.valor) return;
    const payload: any = {
      nombre_concepto: honForm.nombre_concepto,
      categoria: honForm.categoria,
      valor: Number(honForm.valor),
      coach_id: honForm.coach_id || null,
    };
    if (editingHon) {
      const { error } = await supabase.from("honorarios").update(payload).eq("id", editingHon.id);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Honorario actualizado" });
    } else {
      const { error } = await supabase.from("honorarios").insert(payload);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Honorario creado" });
    }
    setShowHonForm(false);
    setEditingHon(null);
    setHonForm({ nombre_concepto: "", categoria: "clase", valor: "", coach_id: "" });
    loadData();
  };

  const deleteHonorario = async (id: string) => {
    await supabase.from("honorarios").delete().eq("id", id);
    loadData();
  };

  const addAjusteManual = async () => {
    if (!ajusteForm.coach_id || !ajusteForm.valor_base) return;
    const val = Number(ajusteForm.valor_base);
    const { error } = await supabase.from("movimientos_liquidacion").insert({
      coach_id: ajusteForm.coach_id,
      fecha: new Date().toISOString().split("T")[0],
      tipo_actividad: "ajuste",
      origen: "ajuste_manual",
      valor_base: val,
      total: val,
      estado_operativo: "realizada",
      estado_economico: "liquidable",
      observaciones: ajusteForm.observaciones || null,
    } as any);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Ajuste creado" });
    setShowAjusteForm(false);
    setAjusteForm({ coach_id: "", tipo_actividad: "ajuste", valor_base: "", observaciones: "" });
    loadData();
  };

  const updateEstadoLiq = async (liqId: string, nuevoEstado: string) => {
    const updates: any = { estado: nuevoEstado };
    if (nuevoEstado === "pagada") updates.fecha_pago = new Date().toISOString();
    await supabase.from("liquidaciones_mensuales").update(updates).eq("id", liqId);
    toast({ title: `Liquidación marcada como ${nuevoEstado}` });
    loadData();
  };

  const updateMovEstado = async (movId: string, nuevoEstado: string) => {
    const updates: any = { estado_economico: nuevoEstado };
    await supabase.from("movimientos_liquidacion").update(updates).eq("id", movId);
    toast({ title: `Movimiento marcado como ${nuevoEstado}` });
    loadData();
  };


  const coachName = (id: string) => coaches.find(c => c.id === id)?.nombre || "–";

  const formatMes = (m: string) => {
    const [y, mo] = m.split("-");
    return new Date(Number(y), Number(mo) - 1).toLocaleDateString("es-AR", { month: "long", year: "numeric" });
  };

  // Group movements by coach for summary
  const coachSummaries = coaches.map(c => {
    const cm = movimientos.filter(m => m.coach_id === c.id);
    const confirmado = cm.filter(m => m.estado_economico === "liquidable" || m.estado_economico === "liquidada").reduce((s: number, m: any) => s + Number(m.total), 0);
    const estimado = cm.filter(m => m.estado_operativo === "programada" || m.estado_operativo === "reservada").reduce((s: number, m: any) => s + Number(m.total), 0);
    const liq = liquidaciones.find(l => l.coach_id === c.id);
    return { ...c, confirmado, estimado, liq };
  }).filter(c => (c.confirmado + c.estimado) > 0 || c.liq);

  const monthOptions = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground">Liquidaciones</h1>
          <p className="text-sm text-muted-foreground">Gestión de liquidaciones, honorarios y reglas</p>
        </div>
        <div className="flex gap-2">
          <Select value={mes} onValueChange={setMes}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {monthOptions.map(m => (
                <SelectItem key={m} value={m} className="capitalize">{formatMes(m)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedCoach} onValueChange={setSelectedCoach}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Todos los coaches" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los coaches</SelectItem>
              {coaches.map(c => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="liquidaciones">Liquidaciones</TabsTrigger>
          <TabsTrigger value="movimientos">Movimientos</TabsTrigger>
          <TabsTrigger value="honorarios">Honorarios</TabsTrigger>
          <TabsTrigger value="reglas">Reglas</TabsTrigger>
        </TabsList>

        <TabsContent value="liquidaciones" className="space-y-4 mt-4">
          {/* Coach summary cards */}
          {coachSummaries.length === 0 && !loading ? (
            <Card className="bg-card"><CardContent className="p-6 text-center text-muted-foreground">No hay liquidaciones para este mes.</CardContent></Card>
          ) : (
            <div className="space-y-3">
              {coachSummaries.map(c => (
                <Card key={c.id} className="bg-card border-border">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-foreground">{c.nombre}</p>
                        <div className="flex gap-4 mt-1 text-sm text-muted-foreground">
                          <span>Confirmado: <span className="text-emerald-400 font-medium">${c.confirmado.toLocaleString("es-AR")}</span></span>
                          <span>Estimado: <span className="text-blue-400 font-medium">${c.estimado.toLocaleString("es-AR")}</span></span>
                        </div>
                        {c.liq && <Badge variant="outline" className="text-xs mt-1 capitalize">{c.liq.estado}</Badge>}
                      </div>
                      <div className="flex gap-2">
                        {c.liq && c.liq.estado !== "pagada" && (
                          <Select onValueChange={(v) => updateEstadoLiq(c.liq.id, v)}>
                            <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue placeholder="Cambiar estado" /></SelectTrigger>
                            <SelectContent>
                              {ESTADO_LIQ.map(e => <SelectItem key={e} value={e} className="text-xs capitalize">{e.replace("_", " ")}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          <Button variant="outline" size="sm" onClick={() => setShowAjusteForm(true)}>
            <Plus className="w-4 h-4 mr-2" /> Ajuste manual
          </Button>

          {/* Ajuste form dialog */}
          <Dialog open={showAjusteForm} onOpenChange={setShowAjusteForm}>
            <DialogContent>
              <DialogHeader><DialogTitle>Ajuste manual</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <Select value={ajusteForm.coach_id} onValueChange={(v) => setAjusteForm({ ...ajusteForm, coach_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar coach" /></SelectTrigger>
                  <SelectContent>
                    {coaches.map(c => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input type="number" placeholder="Monto" value={ajusteForm.valor_base} onChange={(e) => setAjusteForm({ ...ajusteForm, valor_base: e.target.value })} />
                <Textarea placeholder="Observaciones" value={ajusteForm.observaciones} onChange={(e) => setAjusteForm({ ...ajusteForm, observaciones: e.target.value })} />
                <Button onClick={addAjusteManual} className="w-full">Crear ajuste</Button>
              </div>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="movimientos" className="mt-4">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Coach</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Detalle</TableHead>
                  <TableHead>Origen</TableHead>
                  <TableHead>Estado op.</TableHead>
                  <TableHead>Estado econ.</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movimientos.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">Sin movimientos</TableCell></TableRow>
                ) : (
                  movimientos.map(m => (
                    <TableRow key={m.id}>
                      <TableCell className="text-xs font-mono">{new Date(m.fecha + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })}</TableCell>
                      <TableCell className="text-xs">{coachName(m.coach_id)}</TableCell>
                      <TableCell><Badge variant="secondary" className="text-xs">{TIPO_LABELS[m.tipo_actividad] || m.tipo_actividad}</Badge></TableCell>
                      <TableCell className="text-xs">{m.grupo || m.nombre_externo || m.evento || "–"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] ${m.origen === "carga_coach" ? "border-primary/40 text-primary" : ""}`}>
                          {m.origen === "carga_coach" ? "Coach" : m.origen === "ajuste_manual" ? "Ajuste" : m.origen === "agenda_admin" ? "Agenda" : m.origen}
                        </Badge>
                      </TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{ESTADO_OP_LABELS[m.estado_operativo] || m.estado_operativo}</Badge></TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{m.estado_economico}</Badge></TableCell>
                      <TableCell className="text-right font-mono font-medium">${Number(m.total).toLocaleString("es-AR")}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {m.estado_economico === "pendiente_revision" && (
                            <>
                              <Button variant="ghost" size="sm" className="text-xs h-7 text-emerald-400" onClick={() => updateMovEstado(m.id, "liquidable")}>Confirmar</Button>
                              <Button variant="ghost" size="sm" className="text-xs h-7 text-destructive" onClick={() => updateMovEstado(m.id, "no_liquidable")}>Excluir</Button>
                            </>
                          )}
                          {m.estado_economico === "liquidable" && (
                            <Button variant="ghost" size="sm" className="text-xs h-7 text-primary" onClick={() => updateMovEstado(m.id, "pagada")}>Pagar</Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="honorarios" className="space-y-4 mt-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">Valores por tipo de actividad. Se usan al crear movimientos.</p>
            <Button size="sm" onClick={() => openHonForm()}><Plus className="w-4 h-4 mr-2" /> Nuevo</Button>
          </div>
          <Dialog open={showHonForm} onOpenChange={(open) => { setShowHonForm(open); if (!open) setEditingHon(null); }}>
            <DialogContent>
              <DialogHeader><DialogTitle>{editingHon ? "Editar honorario" : "Nuevo honorario"}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <Input placeholder="Nombre del concepto" value={honForm.nombre_concepto} onChange={(e) => setHonForm({ ...honForm, nombre_concepto: e.target.value })} />
                <Select value={honForm.categoria} onValueChange={(v) => setHonForm({ ...honForm, categoria: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="clase">Clase</SelectItem>
                    <SelectItem value="evento">Evento</SelectItem>
                    <SelectItem value="evaluacion">Evaluación</SelectItem>
                    <SelectItem value="otro">Otro</SelectItem>
                  </SelectContent>
                </Select>
                <Input type="number" placeholder="Valor ($)" value={honForm.valor} onChange={(e) => setHonForm({ ...honForm, valor: e.target.value })} />
                <Select value={honForm.coach_id || "none"} onValueChange={(v) => setHonForm({ ...honForm, coach_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Profesor asignado (opcional)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin profesor fijo</SelectItem>
                    {coaches.map(c => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button onClick={saveHonorario} className="w-full">{editingHon ? "Guardar cambios" : "Crear"}</Button>
              </div>
            </DialogContent>
          </Dialog>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Concepto</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Profesor</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Vigencia</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {honorarios.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No hay honorarios cargados.</TableCell></TableRow>
              ) : (
                honorarios.map((h: any) => (
                  <TableRow key={h.id} className="cursor-pointer hover:bg-muted/30" onClick={() => openHonForm(h)}>
                    <TableCell className="font-medium">{h.nombre_concepto}</TableCell>
                    <TableCell><Badge variant="secondary" className="text-xs capitalize">{h.categoria}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{h.coach_id ? coachName(h.coach_id) : "–"}</TableCell>
                    <TableCell className="text-right font-mono">${Number(h.valor).toLocaleString("es-AR")}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{h.vigencia_desde}</TableCell>
                    <TableCell>
                      <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="sm" className="text-xs" onClick={() => openHonForm(h)}>Editar</Button>
                        <Button variant="ghost" size="sm" className="text-xs text-destructive" onClick={() => deleteHonorario(h.id)}>Eliminar</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="reglas" className="mt-4">
          <p className="text-sm text-muted-foreground mb-4">Reglas que definen si cada tipo de actividad se liquida según su estado operativo.</p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo actividad</TableHead>
                <TableHead>Estado operativo</TableHead>
                <TableHead>¿Liquida?</TableHead>
                <TableHead>% Pago</TableHead>
                <TableHead>Observación</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reglas.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs font-medium">{TIPO_LABELS[r.tipo_actividad] || r.tipo_actividad}</TableCell>
                  <TableCell><Badge variant="outline" className="text-[10px]">{ESTADO_OP_LABELS[r.estado_operativo] || r.estado_operativo}</Badge></TableCell>
                  <TableCell>{r.liquida ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <span className="text-muted-foreground text-xs">No</span>}</TableCell>
                  <TableCell className="text-xs font-mono">{r.porcentaje_pago}%</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.observacion || "–"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminLiquidaciones;
