import { useState, useEffect } from "react";
import { formatPrice } from "@/lib/currency";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Pencil, Copy, Archive, Package, GraduationCap, Filter, Check, X, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Plan {
  id: string;
  nombre: string;
  descripcion: string | null;
  descripcion_corta: string | null;
  precio: number;
  moneda: string;
  frecuencia: string;
  clases_por_semana: number | null;
  acceso_entrenamientos: boolean;
  acceso_eventos: boolean;
  acceso_beneficios: boolean;
  acceso_whatsapp: boolean;
  renovacion_auto_permitida: boolean;
  visibilidad: string;
  activo: boolean;
  updated_at: string;
  tipo: string;
  precio_promocional: number | null;
  cuotas_cantidad: number | null;
  cuota_valor: number | null;
  whatsapp_url: string | null;
  max_inscripciones: number | null;
  imagen_url: string | null;
  inscripciones_actuales: number;
  features: PlanFeature[] | null;
  tipo_consumo?: string | null;
  clases_incluidas?: number | null;
  vigencia_dias?: number | null;
}

interface PlanFeature {
  text: string;
  included: boolean;
}

interface Sede {
  id: string;
  nombre: string;
}

const frecuenciaOptions = [
  { value: "mensual", label: "Mensual" },
  { value: "trimestral", label: "Trimestral" },
  { value: "anual", label: "Anual" },
  { value: "mensual_libre", label: "Mensual libre" },
  { value: "2x_semana", label: "2x semana" },
  { value: "1x_semana", label: "1x semana" },
  { value: "personalizada", label: "Personalizada" },
];

const visibilidadOptions = [
  { value: "visible", label: "Visible" },
  { value: "oculto", label: "Oculto" },
  { value: "archivado", label: "Archivado" },
];

const tipoOptions = [
  { value: "suscripcion", label: "Suscripción", icon: Package },
  { value: "programa", label: "Programa / Servicio", icon: GraduationCap },
];

const emptyForm = {
  nombre: "",
  descripcion: "",
  descripcion_corta: "",
  precio: "",
  moneda: "ARS",
  frecuencia: "mensual",
  clases_por_semana: "",
  acceso_entrenamientos: true,
  acceso_eventos: false,
  acceso_beneficios: false,
  acceso_whatsapp: false,
  renovacion_auto_permitida: true,
  visibilidad: "visible",
  activo: true,
  sedes: [] as string[],
  tipo: "suscripcion",
  precio_promocional: "",
  cuotas_cantidad: "",
  cuota_valor: "",
  whatsapp_url: "",
  max_inscripciones: "",
  imagen_url: "",
  features: [] as PlanFeature[],
  tipo_consumo: "mensual",
  clases_incluidas: "",
  vigencia_dias: "",
};

type FilterType = "todos" | "suscripcion" | "programa";

const ManagePlanes = () => {
  const [planes, setPlanes] = useState<Plan[]>([]);
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [planesSedes, setPlanesSedes] = useState<Record<string, string[]>>({});
  const [alumnoCount, setAlumnoCount] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [filterType, setFilterType] = useState<FilterType>("todos");

  const fetchAll = async () => {
    const [planesRes, sedesRes, psRes, subsRes] = await Promise.all([
      supabase.from("planes").select("*").order("precio", { ascending: false }),
      supabase.from("sedes").select("id, nombre").eq("activa", true),
      supabase.from("planes_sedes").select("*"),
      supabase.from("suscripciones").select("plan_id").eq("estado", "activa"),
    ]);

    setPlanes((planesRes.data as any[]) || []);
    setSedes((sedesRes.data as any[]) || []);

    const psMap: Record<string, string[]> = {};
    ((psRes.data as any[]) || []).forEach((ps: any) => {
      if (!psMap[ps.plan_id]) psMap[ps.plan_id] = [];
      psMap[ps.plan_id].push(ps.sede_id);
    });
    setPlanesSedes(psMap);

    const countMap: Record<string, number> = {};
    ((subsRes.data as any[]) || []).forEach((s: any) => {
      countMap[s.plan_id] = (countMap[s.plan_id] || 0) + 1;
    });
    setAlumnoCount(countMap);

    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const filteredPlanes = filterType === "todos" 
    ? planes 
    : planes.filter(p => (p.tipo || "suscripcion") === filterType);

  const openCreate = (tipo: string = "suscripcion") => {
    setEditingPlan(null);
    setForm({ ...emptyForm, tipo });
    setDialogOpen(true);
  };

  const openEdit = (plan: Plan) => {
    setEditingPlan(plan);
    setForm({
      nombre: plan.nombre,
      descripcion: plan.descripcion || "",
      descripcion_corta: plan.descripcion_corta || "",
      precio: String(plan.precio),
      moneda: plan.moneda || "ARS",
      frecuencia: plan.frecuencia,
      clases_por_semana: plan.clases_por_semana ? String(plan.clases_por_semana) : "",
      acceso_entrenamientos: plan.acceso_entrenamientos,
      acceso_eventos: plan.acceso_eventos,
      acceso_beneficios: plan.acceso_beneficios,
      acceso_whatsapp: (plan as any).acceso_whatsapp ?? false,
      renovacion_auto_permitida: plan.renovacion_auto_permitida,
      visibilidad: plan.visibilidad || "visible",
      activo: plan.activo,
      sedes: planesSedes[plan.id] || [],
      tipo: plan.tipo || "suscripcion",
      precio_promocional: plan.precio_promocional ? String(plan.precio_promocional) : "",
      cuotas_cantidad: plan.cuotas_cantidad ? String(plan.cuotas_cantidad) : "",
      cuota_valor: plan.cuota_valor ? String(plan.cuota_valor) : "",
      whatsapp_url: plan.whatsapp_url || "",
      max_inscripciones: plan.max_inscripciones ? String(plan.max_inscripciones) : "",
      imagen_url: plan.imagen_url || "",
      features: Array.isArray(plan.features) ? plan.features : [],
      tipo_consumo: plan.tipo_consumo || "mensual",
      clases_incluidas: plan.clases_incluidas ? String(plan.clases_incluidas) : "",
      vigencia_dias: plan.vigencia_dias ? String(plan.vigencia_dias) : "",
    });
    setDialogOpen(true);
  };

  const duplicatePlan = (plan: Plan) => {
    setEditingPlan(null);
    setForm({
      nombre: `${plan.nombre} (copia)`,
      descripcion: plan.descripcion || "",
      descripcion_corta: plan.descripcion_corta || "",
      precio: String(plan.precio),
      moneda: plan.moneda || "ARS",
      frecuencia: plan.frecuencia,
      clases_por_semana: plan.clases_por_semana ? String(plan.clases_por_semana) : "",
      acceso_entrenamientos: plan.acceso_entrenamientos,
      acceso_eventos: plan.acceso_eventos,
      acceso_beneficios: plan.acceso_beneficios,
      acceso_whatsapp: (plan as any).acceso_whatsapp ?? false,
      renovacion_auto_permitida: plan.renovacion_auto_permitida,
      visibilidad: "oculto",
      activo: false,
      sedes: planesSedes[plan.id] || [],
      tipo: plan.tipo || "suscripcion",
      precio_promocional: plan.precio_promocional ? String(plan.precio_promocional) : "",
      cuotas_cantidad: plan.cuotas_cantidad ? String(plan.cuotas_cantidad) : "",
      cuota_valor: plan.cuota_valor ? String(plan.cuota_valor) : "",
      whatsapp_url: plan.whatsapp_url || "",
      max_inscripciones: plan.max_inscripciones ? String(plan.max_inscripciones) : "",
      imagen_url: plan.imagen_url || "",
      features: Array.isArray(plan.features) ? plan.features : [],
      tipo_consumo: plan.tipo_consumo || "mensual",
      clases_incluidas: plan.clases_incluidas ? String(plan.clases_incluidas) : "",
      vigencia_dias: plan.vigencia_dias ? String(plan.vigencia_dias) : "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.nombre.trim()) {
      toast({ title: "El nombre es obligatorio", variant: "destructive" });
      return;
    }
    if (!form.precio || isNaN(Number(form.precio)) || Number(form.precio) < 0) {
      toast({ title: "El precio debe ser un número válido", variant: "destructive" });
      return;
    }

    const isPrograma = form.tipo === "programa";

    const payload: any = {
      nombre: form.nombre.trim(),
      descripcion: form.descripcion.trim() || null,
      descripcion_corta: form.descripcion_corta.trim() || null,
      precio: Number(form.precio),
      moneda: form.moneda,
      frecuencia: isPrograma ? "unico" : form.frecuencia,
      clases_por_semana: form.clases_por_semana ? Number(form.clases_por_semana) : null,
      acceso_entrenamientos: form.acceso_entrenamientos,
      acceso_eventos: form.acceso_eventos,
      acceso_beneficios: form.acceso_beneficios,
      acceso_whatsapp: form.acceso_whatsapp,
      renovacion_auto_permitida: isPrograma ? false : form.renovacion_auto_permitida,
      visibilidad: form.visibilidad,
      activo: form.activo,
      tipo: form.tipo,
      precio_promocional: form.precio_promocional ? Number(form.precio_promocional) : null,
      cuotas_cantidad: form.cuotas_cantidad ? Number(form.cuotas_cantidad) : null,
      cuota_valor: form.cuota_valor ? Number(form.cuota_valor) : null,
      whatsapp_url: form.whatsapp_url.trim() || null,
      max_inscripciones: form.max_inscripciones ? Number(form.max_inscripciones) : null,
      imagen_url: form.imagen_url.trim() || null,
      features: (form.features || []).filter((f) => f.text.trim() !== ""),
    };

    let planId: string;

    if (editingPlan) {
      if (Number(form.precio) !== editingPlan.precio) {
        const { data: { session } } = await supabase.auth.getSession();
        await supabase.from("precio_historial").insert({
          plan_id: editingPlan.id,
          precio_anterior: editingPlan.precio,
          precio_nuevo: Number(form.precio),
          modificado_por: session?.user?.id || null,
          aplicar_a: "nuevos",
        } as any);
      }

      const { error } = await supabase.from("planes").update(payload).eq("id", editingPlan.id);
      if (error) { toast({ title: "Error al actualizar", variant: "destructive" }); return; }
      planId = editingPlan.id;
      toast({ title: isPrograma ? "Programa actualizado" : "Plan actualizado" });
    } else {
      const { data, error } = await supabase.from("planes").insert(payload).select("id").single();
      if (error || !data) { toast({ title: "Error al crear", variant: "destructive" }); return; }
      planId = (data as any).id;
      toast({ title: isPrograma ? "Programa creado" : "Plan creado" });
    }

    // Sync sedes
    await supabase.from("planes_sedes").delete().eq("plan_id", planId);
    if (form.sedes.length > 0) {
      await supabase.from("planes_sedes").insert(
        form.sedes.map((sedeId) => ({ plan_id: planId, sede_id: sedeId })) as any
      );
    }

    setDialogOpen(false);
    fetchAll();
  };

  const archivePlan = async (plan: Plan) => {
    await supabase.from("planes").update({ visibilidad: "archivado", activo: false } as any).eq("id", plan.id);
    toast({ title: "Archivado correctamente" });
    fetchAll();
  };

  const toggleActive = async (plan: Plan) => {
    await supabase.from("planes").update({ activo: !plan.activo } as any).eq("id", plan.id);
    fetchAll();
  };

  // formatPrice imported from @/lib/currency

  const getVisibilidadBadge = (v: string) => {
    switch (v) {
      case "visible": return <Badge>Visible</Badge>;
      case "oculto": return <Badge variant="secondary">Oculto</Badge>;
      case "archivado": return <Badge variant="outline">Archivado</Badge>;
      default: return <Badge variant="secondary">{v}</Badge>;
    }
  };

  const getTipoBadge = (tipo: string) => {
    if (tipo === "programa") return <Badge variant="outline" className="border-primary/50 text-primary text-xs"><GraduationCap className="w-3 h-3 mr-1" />Programa</Badge>;
    return <Badge variant="secondary" className="text-xs"><Package className="w-3 h-3 mr-1" />Suscripción</Badge>;
  };

  const toggleSede = (sedeId: string) => {
    setForm((prev) => ({
      ...prev,
      sedes: prev.sedes.includes(sedeId)
        ? prev.sedes.filter((s) => s !== sedeId)
        : [...prev.sedes, sedeId],
    }));
  };

  const isPrograma = form.tipo === "programa";

  const addFeature = (included: boolean) => {
    setForm((prev) => ({ ...prev, features: [...(prev.features || []), { text: "", included }] }));
  };
  const updateFeature = (idx: number, patch: Partial<PlanFeature>) => {
    setForm((prev) => ({
      ...prev,
      features: prev.features.map((f, i) => (i === idx ? { ...f, ...patch } : f)),
    }));
  };
  const removeFeature = (idx: number) => {
    setForm((prev) => ({ ...prev, features: prev.features.filter((_, i) => i !== idx) }));
  };
  const moveFeature = (idx: number, dir: -1 | 1) => {
    setForm((prev) => {
      const arr = [...prev.features];
      const j = idx + dir;
      if (j < 0 || j >= arr.length) return prev;
      [arr[idx], arr[j]] = [arr[j], arr[idx]];
      return { ...prev, features: arr };
    });
  };


  if (loading) return <div className="animate-pulse text-muted-foreground p-8">Cargando planes...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold uppercase tracking-wider">Planes y Servicios</h1>
          <p className="text-sm text-muted-foreground">Gestión de planes de suscripción y programas</p>
        </div>
        <div className="flex gap-2">
          <Button variant="gold-outline" onClick={() => openCreate("programa")}>
            <GraduationCap className="w-4 h-4" /> Nuevo programa
          </Button>
          <Button variant="gold" onClick={() => openCreate("suscripcion")}>
            <Plus className="w-4 h-4" /> Nuevo plan
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {(["todos", "suscripcion", "programa"] as FilterType[]).map((f) => (
          <Button
            key={f}
            variant={filterType === f ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterType(f)}
          >
            {f === "todos" ? <><Filter className="w-3 h-3" /> Todos</> : f === "suscripcion" ? <><Package className="w-3 h-3" /> Suscripciones</> : <><GraduationCap className="w-3 h-3" /> Programas</>}
          </Button>
        ))}
      </div>

      {/* Desktop table */}
      <Card className="hidden md:block">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Precio</TableHead>
                <TableHead>Periodicidad</TableHead>
                <TableHead>Sedes</TableHead>
                <TableHead>Inscriptos</TableHead>
                <TableHead>Visibilidad</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPlanes.map((plan) => {
                const tipo = plan.tipo || "suscripcion";
                return (
                  <TableRow key={plan.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {tipo === "programa" ? <GraduationCap className="w-4 h-4 text-primary" /> : <Package className="w-4 h-4 text-primary" />}
                        <div>
                          <span className="font-medium">{plan.nombre}</span>
                          {plan.precio_promocional && (
                            <p className="text-xs text-green-600">Promo: {formatPrice(plan.precio_promocional, plan.moneda)}</p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{getTipoBadge(tipo)}</TableCell>
                    <TableCell className="font-mono">{formatPrice(plan.precio, plan.moneda)}</TableCell>
                    <TableCell className="text-sm">
                      {tipo === "programa" ? "Pago único" : frecuenciaOptions.find((f) => f.value === plan.frecuencia)?.label || plan.frecuencia}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {(planesSedes[plan.id] || []).map((sid) => sedes.find((s) => s.id === sid)?.nombre).filter(Boolean).join(", ") || "Todas"}
                    </TableCell>
                    <TableCell>
                      {alumnoCount[plan.id] || 0}{tipo === "programa" && plan.max_inscripciones ? `/${plan.max_inscripciones}` : ""}
                    </TableCell>
                    <TableCell>{getVisibilidadBadge(plan.visibilidad || "visible")}</TableCell>
                    <TableCell>
                      <Badge variant={plan.activo ? "default" : "secondary"}>
                        {plan.activo ? "Activo" : "Inactivo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(plan)} title="Editar">
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => duplicatePlan(plan)} title="Duplicar">
                          <Copy className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => archivePlan(plan)} title="Archivar">
                          <Archive className="w-4 h-4" />
                        </Button>
                        <Switch checked={plan.activo} onCheckedChange={() => toggleActive(plan)} />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filteredPlanes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                    No hay {filterType === "programa" ? "programas" : filterType === "suscripcion" ? "planes" : "registros"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {filteredPlanes.map((plan) => {
          const tipo = plan.tipo || "suscripcion";
          return (
            <Card key={plan.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      {getTipoBadge(tipo)}
                    </div>
                    <h3 className="font-medium">{plan.nombre}</h3>
                    <p className="text-lg font-mono font-bold text-primary">{formatPrice(plan.precio, plan.moneda)}</p>
                    {plan.precio_promocional && (
                      <p className="text-sm text-green-600">Promo: {formatPrice(plan.precio_promocional, plan.moneda)}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {tipo === "programa" ? "Pago único" : frecuenciaOptions.find((f) => f.value === plan.frecuencia)?.label || plan.frecuencia}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {getVisibilidadBadge(plan.visibilidad || "visible")}
                    <Badge variant={plan.activo ? "default" : "secondary"} className="text-xs">
                      {plan.activo ? "Activo" : "Inactivo"}
                    </Badge>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>
                    {alumnoCount[plan.id] || 0}{tipo === "programa" && plan.max_inscripciones ? `/${plan.max_inscripciones}` : ""} {tipo === "programa" ? "inscriptos" : "alumnos"}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => openEdit(plan)}>
                    <Pencil className="w-3 h-3" /> Editar
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => duplicatePlan(plan)}>
                    <Copy className="w-3 h-3" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => archivePlan(plan)}>
                    <Archive className="w-3 h-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingPlan 
                ? (isPrograma ? "Editar programa" : "Editar plan") 
                : (isPrograma ? "Nuevo programa / servicio" : "Nuevo plan de suscripción")
              }
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Tipo selector */}
            {!editingPlan && (
              <div className="grid grid-cols-2 gap-2">
                {tipoOptions.map((t) => {
                  const Icon = t.icon;
                  return (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setForm({ ...form, tipo: t.value })}
                      className={`flex items-center gap-2 p-3 rounded-lg border text-sm font-medium transition-all ${
                        form.tipo === t.value 
                          ? "border-primary bg-primary/10 text-primary" 
                          : "border-border hover:border-muted-foreground text-muted-foreground"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {t.label}
                    </button>
                  );
                })}
              </div>
            )}

            <div>
              <label className="text-sm font-medium">Nombre *</label>
              <Input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder={isPrograma ? "Ej: Programa de Iniciación" : "Ej: Pase Libre"} />
            </div>
            <div>
              <label className="text-sm font-medium">Descripción corta</label>
              <Input value={form.descripcion_corta} onChange={(e) => setForm({ ...form, descripcion_corta: e.target.value })} placeholder="Breve descripción" />
            </div>
            <div>
              <label className="text-sm font-medium">Descripción completa</label>
              <Textarea value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} placeholder={isPrograma ? "Detalle del programa, qué incluye, duración, etc." : "Detalles del plan"} rows={3} />
            </div>

            {/* Features (incluye / no incluye) */}
            <div className="space-y-2 border-t border-border pt-4">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">✓ Características del plan</label>
                <div className="flex gap-1">
                  <Button type="button" variant="outline" size="sm" onClick={() => addFeature(true)}>
                    <Check className="w-3 h-3 text-emerald-500" /> Incluye
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => addFeature(false)}>
                    <X className="w-3 h-3 text-destructive" /> No incluye
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Lista que se muestra en la card del plan al seleccionarlo. Ej: "Acceso a entrenamientos", "Acceso al WhatsApp", etc.</p>
              {form.features.length === 0 && (
                <p className="text-xs text-muted-foreground italic">Sin características cargadas.</p>
              )}
              {form.features.map((f, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => updateFeature(idx, { included: !f.included })}
                    className={`w-7 h-7 shrink-0 rounded-md border flex items-center justify-center ${f.included ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500" : "border-destructive/40 bg-destructive/10 text-destructive"}`}
                    title={f.included ? "Incluye (click para cambiar)" : "No incluye (click para cambiar)"}
                  >
                    {f.included ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                  </button>
                  <Input
                    value={f.text}
                    onChange={(e) => updateFeature(idx, { text: e.target.value })}
                    placeholder="Ej: Acceso a entrenamientos"
                    className="flex-1"
                  />
                  <Button type="button" variant="ghost" size="icon" onClick={() => moveFeature(idx, -1)} disabled={idx === 0}>
                    <ArrowUp className="w-3 h-3" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" onClick={() => moveFeature(idx, 1)} disabled={idx === form.features.length - 1}>
                    <ArrowDown className="w-3 h-3" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeFeature(idx)}>
                    <Trash2 className="w-3 h-3 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>



            {/* Imagen URL (programa) */}
            {isPrograma && (
              <div>
                <label className="text-sm font-medium">URL de imagen</label>
                <Input value={form.imagen_url} onChange={(e) => setForm({ ...form, imagen_url: e.target.value })} placeholder="https://..." />
              </div>
            )}

            {/* Pricing */}
            <div className="space-y-3 border-t border-border pt-4">
              <label className="text-sm font-medium">💰 Precio</label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">{isPrograma ? "Valor oficial *" : "Precio *"}</label>
                  <Input type="number" value={form.precio} onChange={(e) => setForm({ ...form, precio: e.target.value })} placeholder="0" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Moneda</label>
                  <Select value={form.moneda} onValueChange={(v) => setForm({ ...form, moneda: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ARS">$ ARS</SelectItem>
                      <SelectItem value="USD">US$ USD</SelectItem>
                      <SelectItem value="EUR">€ EUR</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {isPrograma && (
                <>
                  <div>
                    <label className="text-xs text-muted-foreground">Precio promocional (opcional)</label>
                    <Input type="number" value={form.precio_promocional} onChange={(e) => setForm({ ...form, precio_promocional: e.target.value })} placeholder="Ej: 139000" />
                    <p className="text-xs text-muted-foreground mt-1">Se muestra como precio de inscripción con descuento</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground">Cantidad de cuotas</label>
                      <Input type="number" value={form.cuotas_cantidad} onChange={(e) => setForm({ ...form, cuotas_cantidad: e.target.value })} placeholder="Ej: 2" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Valor por cuota</label>
                      <Input type="number" value={form.cuota_valor} onChange={(e) => setForm({ ...form, cuota_valor: e.target.value })} placeholder="Ej: 75000" />
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Subscription-specific fields */}
            {!isPrograma && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Periodicidad *</label>
                  <Select value={form.frecuencia} onValueChange={(v) => setForm({ ...form, frecuencia: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {frecuenciaOptions.map((f) => (
                        <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">Clases por semana</label>
                  <Input type="number" value={form.clases_por_semana} onChange={(e) => setForm({ ...form, clases_por_semana: e.target.value })} placeholder="—" />
                </div>
              </div>
            )}

            {/* Program-specific fields */}
            {isPrograma && (
              <div className="space-y-3 border-t border-border pt-4">
                <label className="text-sm font-medium">📋 Inscripción</label>
                <div>
                  <label className="text-xs text-muted-foreground">Cupos máximos (dejar vacío = ilimitado)</label>
                  <Input type="number" value={form.max_inscripciones} onChange={(e) => setForm({ ...form, max_inscripciones: e.target.value })} placeholder="Ej: 30" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Link de WhatsApp para consultas</label>
                  <Input value={form.whatsapp_url} onChange={(e) => setForm({ ...form, whatsapp_url: e.target.value })} placeholder="https://wa.me/54..." />
                </div>
              </div>
            )}

            <div className="space-y-3 border-t border-border pt-4">
              <label className="text-sm font-medium">Acceso incluido</label>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Checkbox checked={form.acceso_entrenamientos} onCheckedChange={(c) => setForm({ ...form, acceso_entrenamientos: !!c })} />
                  <span className="text-sm">Entrenamientos</span>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox checked={form.acceso_eventos} onCheckedChange={(c) => setForm({ ...form, acceso_eventos: !!c })} />
                  <span className="text-sm">Eventos</span>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox checked={form.acceso_beneficios} onCheckedChange={(c) => setForm({ ...form, acceso_beneficios: !!c })} />
                  <span className="text-sm">Beneficios extra</span>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox checked={form.acceso_whatsapp} onCheckedChange={(c) => setForm({ ...form, acceso_whatsapp: !!c })} />
                  <span className="text-sm">Grupos de WhatsApp</span>
                </div>
              </div>
            </div>

            {sedes.length > 0 && (
              <div className="space-y-3 border-t border-border pt-4">
                <label className="text-sm font-medium">Sedes incluidas</label>
                <p className="text-xs text-muted-foreground">Si no seleccionás ninguna, aplica a todas</p>
                <div className="space-y-2">
                  {sedes.map((sede) => (
                    <div key={sede.id} className="flex items-center gap-2">
                      <Checkbox checked={form.sedes.includes(sede.id)} onCheckedChange={() => toggleSede(sede.id)} />
                      <span className="text-sm">{sede.nombre}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-3 border-t border-border pt-4">
              {!isPrograma && (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Renovación automática permitida</span>
                  <Switch checked={form.renovacion_auto_permitida} onCheckedChange={(c) => setForm({ ...form, renovacion_auto_permitida: c })} />
                </div>
              )}
              <div>
                <label className="text-sm font-medium">Visibilidad</label>
                <Select value={form.visibilidad} onValueChange={(v) => setForm({ ...form, visibilidad: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {visibilidadOptions.map((v) => (
                      <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Activo</span>
                <Switch checked={form.activo} onCheckedChange={(c) => setForm({ ...form, activo: c })} />
              </div>
            </div>

            <Button variant="gold" className="w-full" onClick={handleSave}>
              {editingPlan 
                ? "Guardar cambios" 
                : (isPrograma ? "Crear programa" : "Crear plan")
              }
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ManagePlanes;
