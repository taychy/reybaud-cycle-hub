import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTareas, type Tarea, type TareaEstado, type TareaPrioridad, type TareaRol, type TareaScope } from "@/hooks/useTareas";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  CheckCircle2, Clock, AlertCircle, Plus, RefreshCw, Play, Pause, Check,
  Calendar, User, ListTodo, Inbox, Users, Filter, ChevronDown, ChevronRight,
} from "lucide-react";

const PRIORIDAD_COLOR: Record<TareaPrioridad, string> = {
  baja: "bg-muted text-muted-foreground border-border",
  media: "bg-blue-500/15 text-blue-600 border-blue-500/30",
  alta: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  critica: "bg-red-500/15 text-red-600 border-red-500/30",
};

const ESTADO_COLOR: Record<TareaEstado, string> = {
  pendiente: "bg-muted text-muted-foreground border-border",
  en_curso: "bg-blue-500/15 text-blue-600 border-blue-500/30",
  hecha: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  pospuesta: "bg-purple-500/15 text-purple-600 border-purple-500/30",
};

const ROL_LABEL: Record<TareaRol, string> = {
  super_admin: "Super Admin", admin: "Admin", coach: "Coach", deposito: "Depósito",
};

const ORIGEN_LABEL: Record<string, string> = {
  whatsapp_check: "WhatsApp",
  alumno_inactivo_30d: "Inactividad",
  coach_sin_feedback_14d: "Feedback",
  certificado_por_vencer: "Certificado",
  pago_pendiente_validar: "Pago a validar",
  suscripcion_pendiente_15d: "Suscripción pendiente",
  suscripcion_vencida_sin_renovar: "Vencida sin renovar",
  alumno_estado_intermedio_15d: "Revisar estado alumno",
  manual: "Manual",
};

interface Props {
  userId: string | null;
  isSuperAdmin: boolean;
  myRoles: TareaRol[];
}

export const TareasInbox = ({ userId, isSuperAdmin, myRoles }: Props) => {
  const [scope, setScope] = useState<TareaScope>("mi_rol");
  const { tareas, loading, generating, generate, updateTarea, createTarea } = useTareas(scope, userId, isSuperAdmin);
  const [filtroEstado, setFiltroEstado] = useState<string>("activas");
  const [filtroPrioridad, setFiltroPrioridad] = useState<string>("todas");
  const [filtroOrigen, setFiltroOrigen] = useState<string>("todos");
  const [openTarea, setOpenTarea] = useState<Tarea | null>(null);
  const [nueva, setNueva] = useState(false);

  // Filtrar por scope en cliente (las tareas vienen filtradas por RLS)
  const visibles = useMemo(() => {
    let arr = tareas;
    if (scope === "mias") arr = arr.filter(t => t.asignado_user_id === userId);
    else if (scope === "mi_rol") arr = arr.filter(t => myRoles.includes(t.rol_destino) || t.asignado_user_id === userId);
    if (filtroEstado === "activas") arr = arr.filter(t => t.estado !== "hecha");
    else if (filtroEstado !== "todas") arr = arr.filter(t => t.estado === filtroEstado);
    if (filtroPrioridad !== "todas") arr = arr.filter(t => t.prioridad === filtroPrioridad);
    if (filtroOrigen !== "todos") arr = arr.filter(t => t.origen === filtroOrigen);
    // sort: vencidas primero, luego prioridad, luego fecha
    const today = new Date().toISOString().slice(0, 10);
    const prioOrder: Record<TareaPrioridad, number> = { critica: 0, alta: 1, media: 2, baja: 3 };
    return [...arr].sort((a, b) => {
      const aVen = a.fecha_vencimiento && a.fecha_vencimiento < today && a.estado !== "hecha" ? 0 : 1;
      const bVen = b.fecha_vencimiento && b.fecha_vencimiento < today && b.estado !== "hecha" ? 0 : 1;
      if (aVen !== bVen) return aVen - bVen;
      const p = prioOrder[a.prioridad] - prioOrder[b.prioridad];
      if (p !== 0) return p;
      return (a.fecha_vencimiento || "9999").localeCompare(b.fecha_vencimiento || "9999");
    });
  }, [tareas, scope, userId, myRoles, filtroEstado, filtroPrioridad, filtroOrigen]);

  const today = new Date().toISOString().slice(0, 10);
  const stats = useMemo(() => {
    const activas = tareas.filter(t => t.estado !== "hecha");
    return {
      pendientes: activas.filter(t => t.estado === "pendiente").length,
      enCurso: activas.filter(t => t.estado === "en_curso").length,
      vencidas: activas.filter(t => t.fecha_vencimiento && t.fecha_vencimiento < today).length,
      hoy: activas.filter(t => t.fecha_vencimiento === today).length,
    };
  }, [tareas, today]);

  const origenes = useMemo(() => Array.from(new Set(tareas.map(t => t.origen))).sort(), [tareas]);

  const handleGenerate = async () => {
    const { count, error } = await generate();
    if (error) toast.error("Error generando tareas");
    else toast.success(`${count} tareas nuevas generadas`);
  };

  const handleStateChange = async (t: Tarea, nuevoEstado: TareaEstado, nota?: string, pospuestaHasta?: string) => {
    try {
      const patch: Partial<Tarea> = { estado: nuevoEstado };
      if (nuevoEstado === "hecha") {
        patch.cerrada_at = new Date().toISOString();
        patch.cerrada_por = userId;
        patch.nota_cierre = nota || null;
      }
      if (nuevoEstado === "pospuesta") patch.pospuesta_hasta = pospuestaHasta || null;
      await updateTarea(t.id, patch, `cambio_estado:${nuevoEstado}`, nota);
      toast.success("Tarea actualizada");
      setOpenTarea(null);
    } catch (e: any) {
      toast.error(e.message || "Error actualizando");
    }
  };

  const handleAsignarme = async (t: Tarea) => {
    if (!userId) return;
    try {
      await updateTarea(t.id, { asignado_user_id: userId }, "asignacion");
      toast.success("Tarea asignada a vos");
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI icon={ListTodo} label="Pendientes" value={stats.pendientes} color="text-amber-500" />
        <KPI icon={Play} label="En curso" value={stats.enCurso} color="text-blue-500" />
        <KPI icon={AlertCircle} label="Vencidas" value={stats.vencidas} color="text-red-500" />
        <KPI icon={Calendar} label="Vencen hoy" value={stats.hoy} color="text-orange-500" />
      </div>

      {/* Toolbar */}
      <Card className="border-border">
        <CardContent className="p-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2 justify-between">
            <Tabs value={scope} onValueChange={(v) => setScope(v as TareaScope)}>
              <TabsList>
                <TabsTrigger value="mias"><User className="w-3.5 h-3.5 mr-1" /> Mías</TabsTrigger>
                <TabsTrigger value="mi_rol"><Users className="w-3.5 h-3.5 mr-1" /> Mi rol</TabsTrigger>
                {isSuperAdmin && <TabsTrigger value="todas"><Inbox className="w-3.5 h-3.5 mr-1" /> Todas</TabsTrigger>}
              </TabsList>
            </Tabs>
            <div className="flex items-center gap-2 flex-wrap">
              <Button size="sm" variant="outline" onClick={handleGenerate} disabled={generating}>
                <RefreshCw className={`w-3.5 h-3.5 mr-1 ${generating ? "animate-spin" : ""}`} />
                Refrescar automáticas
              </Button>
              <Button size="sm" onClick={() => setNueva(true)}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Nueva tarea
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Filter className="w-3.5 h-3.5 text-muted-foreground" />
            <Select value={filtroEstado} onValueChange={setFiltroEstado}>
              <SelectTrigger className="h-8 w-[130px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="activas">Activas</SelectItem>
                <SelectItem value="pendiente">Pendientes</SelectItem>
                <SelectItem value="en_curso">En curso</SelectItem>
                <SelectItem value="pospuesta">Pospuestas</SelectItem>
                <SelectItem value="hecha">Hechas</SelectItem>
                <SelectItem value="todas">Todas</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filtroPrioridad} onValueChange={setFiltroPrioridad}>
              <SelectTrigger className="h-8 w-[130px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Toda prioridad</SelectItem>
                <SelectItem value="critica">Crítica</SelectItem>
                <SelectItem value="alta">Alta</SelectItem>
                <SelectItem value="media">Media</SelectItem>
                <SelectItem value="baja">Baja</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filtroOrigen} onValueChange={setFiltroOrigen}>
              <SelectTrigger className="h-8 w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todo origen</SelectItem>
                {origenes.map(o => <SelectItem key={o} value={o}>{ORIGEN_LABEL[o] || o}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Lista */}
      {loading ? (
        <div className="text-center py-8 text-muted-foreground text-sm animate-pulse">Cargando tareas...</div>
      ) : visibles.length === 0 ? (
        <Card className="border-border">
          <CardContent className="py-12 text-center">
            <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500 mb-2" />
            <p className="text-sm text-muted-foreground">No hay tareas que cumplan estos filtros</p>
          </CardContent>
        </Card>
      ) : (
        <GroupedTareas
          tareas={visibles}
          userId={userId}
          onOpen={(t) => setOpenTarea(t)}
          onAsignarme={handleAsignarme}
          onStart={(t) => handleStateChange(t, "en_curso")}
          onDone={(t) => handleStateChange(t, "hecha")}
        />
      )}

      {openTarea && (
        <TareaDrawer t={openTarea} userId={userId} onClose={() => setOpenTarea(null)} onChangeState={handleStateChange} onAsignarme={() => handleAsignarme(openTarea)} />
      )}
      {nueva && <NuevaTareaDialog onClose={() => setNueva(false)} onCreate={createTarea} />}
    </div>
  );
};

const GroupedTareas = ({ tareas, userId, onOpen, onAsignarme, onStart, onDone }: any) => {
  // Agrupar por origen + rol_destino. Manuales nunca se agrupan (cada una es única).
  const groups = useMemo(() => {
    const map = new Map<string, { key: string; origen: string; rol: TareaRol; items: Tarea[] }>();
    for (const t of tareas as Tarea[]) {
      const key = t.origen === "manual" ? `manual:${t.id}` : `${t.origen}:${t.rol_destino}`;
      if (!map.has(key)) map.set(key, { key, origen: t.origen, rol: t.rol_destino, items: [] });
      map.get(key)!.items.push(t);
    }
    return Array.from(map.values());
  }, [tareas]);

  return (
    <div className="space-y-5">
      {groups.map(g => (
        g.items.length === 1 ? (
          <TareaCard key={g.key} t={g.items[0]} userId={userId}
            onOpen={() => onOpen(g.items[0])}
            onAsignarme={() => onAsignarme(g.items[0])}
            onStart={() => onStart(g.items[0])}
            onDone={() => onDone(g.items[0])} />
        ) : (
          <TareaGroupSection key={g.key} group={g} userId={userId} onOpen={onOpen} onAsignarme={onAsignarme} onStart={onStart} onDone={onDone} />
        )
      ))}
    </div>
  );
};

const TareaGroupSection = ({ group, userId, onOpen, onAsignarme, onStart, onDone }: any) => {
  const [collapsed, setCollapsed] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const items: Tarea[] = group.items;
  const vencidas = items.filter(t => t.fecha_vencimiento && t.fecha_vencimiento < today && t.estado !== "hecha").length;
  const pendientes = items.filter(t => t.estado === "pendiente").length;
  const enCurso = items.filter(t => t.estado === "en_curso").length;
  const PREVIEW = 5;
  const visibleItems = showAll ? items : items.slice(0, PREVIEW);
  const restantes = items.length - visibleItems.length;

  return (
    <section className="space-y-2">
      {/* Encabezado de sección — divisor, NO una card */}
      <div className="flex items-center gap-2 pb-1.5 border-b border-border">
        <button onClick={() => setCollapsed(!collapsed)} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors">
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          <span className="text-xs font-heading font-bold uppercase tracking-wider">
            {ORIGEN_LABEL[group.origen] || group.origen}
          </span>
        </button>
        <Badge variant="secondary" className="text-[10px] h-5">{items.length}</Badge>
        <Badge variant="outline" className="text-[10px] h-5">{ROL_LABEL[group.rol as TareaRol]}</Badge>
        {vencidas > 0 && <Badge variant="outline" className="text-[10px] h-5 bg-red-500/15 text-red-600 border-red-500/30">{vencidas} vencidas</Badge>}
        {enCurso > 0 && <Badge variant="outline" className="text-[10px] h-5 bg-blue-500/15 text-blue-600 border-blue-500/30">{enCurso} en curso</Badge>}
        {pendientes > 0 && <span className="text-[10px] text-muted-foreground">{pendientes} pendientes</span>}
      </div>
      {!collapsed && (
        <div className="space-y-2">
          {visibleItems.map(t => (
            <TareaCard key={t.id} t={t} userId={userId}
              onOpen={() => onOpen(t)}
              onAsignarme={() => onAsignarme(t)}
              onStart={() => onStart(t)}
              onDone={() => onDone(t)} />
          ))}
          {restantes > 0 && (
            <button onClick={() => setShowAll(true)} className="w-full text-xs text-muted-foreground hover:text-foreground py-2 border border-dashed border-border rounded-md transition-colors">
              Ver {restantes} más de {ORIGEN_LABEL[group.origen] || group.origen}
            </button>
          )}
          {showAll && items.length > PREVIEW && (
            <button onClick={() => setShowAll(false)} className="w-full text-xs text-muted-foreground hover:text-foreground py-1.5">
              Mostrar menos
            </button>
          )}
        </div>
      )}
    </section>
  );
};

const KPI = ({ icon: Icon, label, value, color }: any) => (
  <Card className="border-border">
    <CardContent className="p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-[10px] font-heading font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
      <p className={`text-2xl font-heading font-bold ${value > 0 ? color : "text-muted-foreground"}`}>{value}</p>
    </CardContent>
  </Card>
);

const TareaCard = ({ t, userId, onOpen, onAsignarme, onStart, onDone }: any) => {
  const today = new Date().toISOString().slice(0, 10);
  const vencida = t.fecha_vencimiento && t.fecha_vencimiento < today && t.estado !== "hecha";
  return (
    <Card className={`border-border hover:border-primary/40 transition-colors cursor-pointer ${vencida ? "border-red-500/40" : ""}`} onClick={onOpen}>
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <Badge variant="outline" className={`text-[10px] ${PRIORIDAD_COLOR[t.prioridad as TareaPrioridad]}`}>{t.prioridad}</Badge>
              <Badge variant="outline" className={`text-[10px] ${ESTADO_COLOR[t.estado as TareaEstado]}`}>{t.estado.replace("_", " ")}</Badge>
              <Badge variant="outline" className="text-[10px]">{ROL_LABEL[t.rol_destino as TareaRol]}</Badge>
              <Badge variant="outline" className="text-[10px] bg-muted/30">{ORIGEN_LABEL[t.origen] || t.origen}</Badge>
              {t.fecha_vencimiento && (
                <span className={`text-[10px] flex items-center gap-1 ${vencida ? "text-red-500 font-bold" : "text-muted-foreground"}`}>
                  <Calendar className="w-3 h-3" /> {t.fecha_vencimiento}
                </span>
              )}
            </div>
            <p className="text-sm font-medium text-foreground">{t.titulo}</p>
            {t.descripcion && <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{t.descripcion}</p>}
          </div>
          <div className="flex gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            {!t.asignado_user_id && t.estado !== "hecha" && (
              <Button size="sm" variant="ghost" onClick={onAsignarme} title="Asignarme"><User className="w-3.5 h-3.5" /></Button>
            )}
            {t.estado === "pendiente" && (
              <Button size="sm" variant="ghost" onClick={onStart} title="Empezar"><Play className="w-3.5 h-3.5" /></Button>
            )}
            {t.estado !== "hecha" && (
              <Button size="sm" variant="ghost" onClick={onDone} title="Completar"><Check className="w-3.5 h-3.5 text-emerald-500" /></Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const TareaDrawer = ({ t, userId, onClose, onChangeState, onAsignarme }: any) => {
  const [nota, setNota] = useState("");
  const [pospuestaHasta, setPospuestaHasta] = useState("");
  const [historial, setHistorial] = useState<any[]>([]);

  useEffect(() => {
    supabase.from("tareas_historial" as any).select("*").eq("tarea_id", t.id).order("created_at", { ascending: false })
      .then(({ data }) => setHistorial(data || []));
  }, [t.id]);

  return (
    <Sheet open onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-base">{t.titulo}</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 mt-4">
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline" className={`text-[10px] ${PRIORIDAD_COLOR[t.prioridad as TareaPrioridad]}`}>{t.prioridad}</Badge>
            <Badge variant="outline" className={`text-[10px] ${ESTADO_COLOR[t.estado as TareaEstado]}`}>{t.estado.replace("_", " ")}</Badge>
            <Badge variant="outline" className="text-[10px]">{ROL_LABEL[t.rol_destino as TareaRol]}</Badge>
            <Badge variant="outline" className="text-[10px]">{ORIGEN_LABEL[t.origen] || t.origen}</Badge>
          </div>
          {t.descripcion && <p className="text-sm text-foreground/80 whitespace-pre-wrap">{t.descripcion}</p>}
          <div className="text-xs text-muted-foreground space-y-1">
            {t.fecha_vencimiento && <p>Vence: {t.fecha_vencimiento}</p>}
            {t.entidad_tipo && <p>Vinculado a: {t.entidad_tipo} #{t.entidad_id?.slice(0, 8)}</p>}
            <p>Creada: {new Date(t.created_at).toLocaleString("es-AR")}</p>
            {t.cerrada_at && <p>Cerrada: {new Date(t.cerrada_at).toLocaleString("es-AR")}</p>}
            {t.nota_cierre && <p className="italic">Nota: {t.nota_cierre}</p>}
          </div>

          {t.estado !== "hecha" && (
            <div className="space-y-2 pt-2 border-t border-border">
              <Label className="text-xs">Nota de cierre / observación</Label>
              <Textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={2} placeholder="Opcional" />
              <div className="flex flex-wrap gap-2">
                {!t.asignado_user_id && <Button size="sm" variant="outline" onClick={onAsignarme}>Asignarme</Button>}
                {t.estado === "pendiente" && (
                  <Button size="sm" variant="outline" onClick={() => onChangeState(t, "en_curso", nota)}>
                    <Play className="w-3.5 h-3.5 mr-1" /> Empezar
                  </Button>
                )}
                <Button size="sm" onClick={() => onChangeState(t, "hecha", nota)}>
                  <Check className="w-3.5 h-3.5 mr-1" /> Marcar hecha
                </Button>
              </div>
              <div className="flex items-end gap-2 pt-2">
                <div className="flex-1">
                  <Label className="text-xs">Posponer hasta</Label>
                  <Input type="date" value={pospuestaHasta} onChange={(e) => setPospuestaHasta(e.target.value)} className="h-8" />
                </div>
                <Button size="sm" variant="outline" disabled={!pospuestaHasta} onClick={() => onChangeState(t, "pospuesta", nota, pospuestaHasta)}>
                  <Pause className="w-3.5 h-3.5 mr-1" /> Posponer
                </Button>
              </div>
            </div>
          )}

          {historial.length > 0 && (
            <div className="pt-2 border-t border-border">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Historial</p>
              <div className="space-y-2">
                {historial.map((h: any) => (
                  <div key={h.id} className="text-xs bg-muted/30 rounded p-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{h.accion}</span>
                      <span className="text-muted-foreground">{new Date(h.created_at).toLocaleString("es-AR")}</span>
                    </div>
                    {h.nota && <p className="text-muted-foreground mt-1">{h.nota}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

const NuevaTareaDialog = ({ onClose, onCreate }: any) => {
  const [form, setForm] = useState({
    titulo: "", descripcion: "", rol_destino: "admin" as TareaRol,
    prioridad: "media" as TareaPrioridad, fecha_vencimiento: "",
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.titulo.trim()) return toast.error("Título requerido");
    setSaving(true);
    try {
      await onCreate({
        titulo: form.titulo.trim(),
        descripcion: form.descripcion.trim() || null,
        rol_destino: form.rol_destino,
        prioridad: form.prioridad,
        fecha_vencimiento: form.fecha_vencimiento || null,
      });
      toast.success("Tarea creada");
      onClose();
    } catch (e: any) {
      toast.error(e.message || "Error");
    }
    setSaving(false);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Nueva tarea</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Título *</Label>
            <Input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
          </div>
          <div>
            <Label>Descripción</Label>
            <Textarea value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Rol destino</Label>
              <Select value={form.rol_destino} onValueChange={(v) => setForm({ ...form, rol_destino: v as TareaRol })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="super_admin">Super Admin</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="coach">Coach</SelectItem>
                  <SelectItem value="deposito">Depósito</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Prioridad</Label>
              <Select value={form.prioridad} onValueChange={(v) => setForm({ ...form, prioridad: v as TareaPrioridad })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="baja">Baja</SelectItem>
                  <SelectItem value="media">Media</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="critica">Crítica</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Vencimiento (opcional)</Label>
            <Input type="date" value={form.fecha_vencimiento} onChange={(e) => setForm({ ...form, fecha_vencimiento: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Creando..." : "Crear tarea"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
