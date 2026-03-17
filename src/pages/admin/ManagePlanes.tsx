import { useState, useEffect } from "react";
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
import { Plus, Pencil, Copy, Archive, Package } from "lucide-react";
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
  renovacion_auto_permitida: boolean;
  visibilidad: string;
  activo: boolean;
  updated_at: string;
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
  renovacion_auto_permitida: true,
  visibilidad: "visible",
  activo: true,
  sedes: [] as string[],
};

const ManagePlanes = () => {
  const [planes, setPlanes] = useState<Plan[]>([]);
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [planesSedes, setPlanesSedes] = useState<Record<string, string[]>>({});
  const [alumnoCount, setAlumnoCount] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [form, setForm] = useState(emptyForm);

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

  const openCreate = () => {
    setEditingPlan(null);
    setForm(emptyForm);
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
      renovacion_auto_permitida: plan.renovacion_auto_permitida,
      visibilidad: plan.visibilidad || "visible",
      activo: plan.activo,
      sedes: planesSedes[plan.id] || [],
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
      renovacion_auto_permitida: plan.renovacion_auto_permitida,
      visibilidad: "oculto",
      activo: false,
      sedes: planesSedes[plan.id] || [],
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.nombre.trim()) {
      toast({ title: "El nombre es obligatorio", variant: "destructive" });
      return;
    }
    if (!form.precio || isNaN(Number(form.precio)) || Number(form.precio) <= 0) {
      toast({ title: "El precio debe ser un número válido", variant: "destructive" });
      return;
    }

    const payload = {
      nombre: form.nombre.trim(),
      descripcion: form.descripcion.trim() || null,
      descripcion_corta: form.descripcion_corta.trim() || null,
      precio: Number(form.precio),
      moneda: form.moneda,
      frecuencia: form.frecuencia,
      clases_por_semana: form.clases_por_semana ? Number(form.clases_por_semana) : null,
      acceso_entrenamientos: form.acceso_entrenamientos,
      acceso_eventos: form.acceso_eventos,
      acceso_beneficios: form.acceso_beneficios,
      renovacion_auto_permitida: form.renovacion_auto_permitida,
      visibilidad: form.visibilidad,
      activo: form.activo,
    };

    let planId: string;

    if (editingPlan) {
      // Track price change
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

      const { error } = await supabase.from("planes").update(payload as any).eq("id", editingPlan.id);
      if (error) { toast({ title: "Error al actualizar", variant: "destructive" }); return; }
      planId = editingPlan.id;
      toast({ title: "Plan actualizado" });
    } else {
      const { data, error } = await supabase.from("planes").insert(payload as any).select("id").single();
      if (error || !data) { toast({ title: "Error al crear", variant: "destructive" }); return; }
      planId = (data as any).id;
      toast({ title: "Plan creado" });
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
    toast({ title: "Plan archivado" });
    fetchAll();
  };

  const toggleActive = async (plan: Plan) => {
    await supabase.from("planes").update({ activo: !plan.activo } as any).eq("id", plan.id);
    fetchAll();
  };

  const formatPrice = (precio: number, moneda: string = "ARS") =>
    new Intl.NumberFormat("es-AR", { style: "currency", currency: moneda === "USD" ? "USD" : "ARS", minimumFractionDigits: 0 }).format(precio);

  const getVisibilidadBadge = (v: string) => {
    switch (v) {
      case "visible": return <Badge>Visible</Badge>;
      case "oculto": return <Badge variant="secondary">Oculto</Badge>;
      case "archivado": return <Badge variant="outline">Archivado</Badge>;
      default: return <Badge variant="secondary">{v}</Badge>;
    }
  };

  const toggleSede = (sedeId: string) => {
    setForm((prev) => ({
      ...prev,
      sedes: prev.sedes.includes(sedeId)
        ? prev.sedes.filter((s) => s !== sedeId)
        : [...prev.sedes, sedeId],
    }));
  };

  if (loading) return <div className="animate-pulse text-muted-foreground p-8">Cargando planes...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold uppercase tracking-wider">Planes</h1>
          <p className="text-sm text-muted-foreground">Gestión de planes de suscripción</p>
        </div>
        <Button variant="gold" onClick={openCreate}>
          <Plus className="w-4 h-4" /> Nuevo plan
        </Button>
      </div>

      {/* Desktop table */}
      <Card className="hidden md:block">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Plan</TableHead>
                <TableHead>Precio</TableHead>
                <TableHead>Periodicidad</TableHead>
                <TableHead>Sedes</TableHead>
                <TableHead>Alumnos</TableHead>
                <TableHead>Renovación auto</TableHead>
                <TableHead>Visibilidad</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {planes.map((plan) => (
                <TableRow key={plan.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4 text-primary" />
                      <span className="font-medium">{plan.nombre}</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono">{formatPrice(plan.precio, plan.moneda)}</TableCell>
                  <TableCell className="text-sm">{frecuenciaOptions.find((f) => f.value === plan.frecuencia)?.label || plan.frecuencia}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {(planesSedes[plan.id] || []).map((sid) => sedes.find((s) => s.id === sid)?.nombre).filter(Boolean).join(", ") || "Todas"}
                  </TableCell>
                  <TableCell>{alumnoCount[plan.id] || 0}</TableCell>
                  <TableCell>{plan.renovacion_auto_permitida ? "Sí" : "No"}</TableCell>
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
              ))}
              {planes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                    No hay planes registrados
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {planes.map((plan) => (
          <Card key={plan.id}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-medium">{plan.nombre}</h3>
                  <p className="text-lg font-mono font-bold text-primary">{formatPrice(plan.precio)}</p>
                  <p className="text-xs text-muted-foreground">
                    {frecuenciaOptions.find((f) => f.value === plan.frecuencia)?.label || plan.frecuencia}
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
                <span>{alumnoCount[plan.id] || 0} alumnos</span>
                <span>·</span>
                <span>Renov. auto: {plan.renovacion_auto_permitida ? "Sí" : "No"}</span>
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
        ))}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPlan ? "Editar plan" : "Nuevo plan"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Nombre *</label>
              <Input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Ej: Pase Libre" />
            </div>
            <div>
              <label className="text-sm font-medium">Descripción corta</label>
              <Input value={form.descripcion_corta} onChange={(e) => setForm({ ...form, descripcion_corta: e.target.value })} placeholder="Breve descripción" />
            </div>
            <div>
              <label className="text-sm font-medium">Descripción completa</label>
              <Textarea value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} placeholder="Detalles del plan" rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Precio *</label>
                <Input type="number" value={form.precio} onChange={(e) => setForm({ ...form, precio: e.target.value })} placeholder="0" />
              </div>
              <div>
                <label className="text-sm font-medium">Moneda</label>
                <Select value={form.moneda} onValueChange={(v) => setForm({ ...form, moneda: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ARS">ARS</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
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
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Renovación automática permitida</span>
                <Switch checked={form.renovacion_auto_permitida} onCheckedChange={(c) => setForm({ ...form, renovacion_auto_permitida: c })} />
              </div>
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
              {editingPlan ? "Guardar cambios" : "Crear plan"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ManagePlanes;
