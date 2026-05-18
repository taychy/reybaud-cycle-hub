import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Pencil, Trash2, Percent, Users, Copy, Tag, Search } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Descuento {
  id: string;
  nombre: string;
  tipo: string;
  categoria: string;
  valor: number;
  codigo: string | null;
  max_usos: number | null;
  usos_actuales: number;
  activo: boolean;
  aplica_a: string;
  vigencia_desde: string | null;
  vigencia_hasta: string | null;
  created_at: string;
}

interface DescuentoAlumno {
  id: string;
  descuento_id: string;
  alumno_id: string;
  activo: boolean;
  nota: string | null;
  created_at: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;
}

// Parse fecha literal (YYYY-MM-DD) sin timezone drift
const parseFechaLocal = (s: string | null) => {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};
const formatFecha = (s: string | null) => {
  const d = parseFechaLocal(s);
  if (!d) return "—";
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" });
};
const isVigente = (fi: string | null, ff: string | null, activo: boolean) => {
  if (!activo) return false;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const fini = parseFechaLocal(fi);
  const ffin = parseFechaLocal(ff);
  if (fini && fini > today) return false;
  if (ffin && ffin < today) return false;
  return true;
};

const categorias = [
  { value: "familiar", label: "Familiar" },
  { value: "segunda_actividad", label: "Segunda actividad" },
  { value: "referido", label: "Código referido" },
  { value: "beca", label: "Beca" },
  { value: "general", label: "General" },
];

const aplicaOpciones = [
  { value: "todo", label: "Todo" },
  { value: "planes", label: "Solo planes" },
  { value: "eventos", label: "Solo eventos" },
  { value: "tienda", label: "Solo tienda" },
];

const categoriaBadge: Record<string, { label: string; className: string }> = {
  familiar: { label: "Familiar", className: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  segunda_actividad: { label: "2ª actividad", className: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
  referido: { label: "Referido", className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  beca: { label: "Beca", className: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  general: { label: "General", className: "bg-muted text-muted-foreground border-border" },
};

interface AlumnoConDescuento {
  asignacion_id: string;
  alumno_id: string;
  alumno_nombre: string;
  alumno_apellido: string;
  alumno_email: string;
  descuento_nombre: string;
  descuento_categoria: string;
  descuento_valor: number;
  descuento_tipo: string;
  descuento_aplica_a: string;
  activo: boolean;
  created_at: string;
  nota: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
}

const ManageDescuentos = () => {
  const [descuentos, setDescuentos] = useState<Descuento[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Descuento | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [selectedDescuento, setSelectedDescuento] = useState<Descuento | null>(null);
  const [alumnos, setAlumnos] = useState<any[]>([]);
  const [asignados, setAsignados] = useState<DescuentoAlumno[]>([]);
  const [searchAlumno, setSearchAlumno] = useState("");

  // Overview tab state
  const [alumnosConDescuento, setAlumnosConDescuento] = useState<AlumnoConDescuento[]>([]);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewSearch, setOverviewSearch] = useState("");
  const [overviewCatFilter, setOverviewCatFilter] = useState("todos");

  // Form state
  const [form, setForm] = useState({
    nombre: "",
    tipo: "porcentaje",
    categoria: "general",
    valor: 0,
    codigo: "",
    max_usos: "",
    aplica_a: "todo",
    vigencia_desde: "",
    vigencia_hasta: "",
    activo: true,
  });

  const loadDescuentos = async () => {
    const { data } = await supabase
      .from("descuentos" as any)
      .select("*")
      .order("created_at", { ascending: false });
    setDescuentos((data as any) || []);
    setLoading(false);
  };

  useEffect(() => { loadDescuentos(); loadOverview(); }, []);

  const loadOverview = async () => {
    setOverviewLoading(true);
    const { data } = await supabase
      .from("descuentos_alumno" as any)
      .select("id, alumno_id, activo, nota, created_at, fecha_inicio, fecha_fin, alumnos!inner(nombre, apellido, email), descuentos!inner(nombre, categoria, valor, tipo, aplica_a)")
      .order("created_at", { ascending: false });

    if (data) {
      setAlumnosConDescuento((data as any[]).map((d: any) => ({
        asignacion_id: d.id,
        alumno_id: d.alumno_id,
        alumno_nombre: d.alumnos?.nombre || "",
        alumno_apellido: d.alumnos?.apellido || "",
        alumno_email: d.alumnos?.email || "",
        descuento_nombre: d.descuentos?.nombre || "",
        descuento_categoria: d.descuentos?.categoria || "",
        descuento_valor: d.descuentos?.valor || 0,
        descuento_tipo: d.descuentos?.tipo || "porcentaje",
        descuento_aplica_a: d.descuentos?.aplica_a || "todo",
        activo: isVigente(d.fecha_inicio, d.fecha_fin, d.activo),
        created_at: d.created_at,
        nota: d.nota,
        fecha_inicio: d.fecha_inicio,
        fecha_fin: d.fecha_fin,
      })));
    }
    setOverviewLoading(false);
  };

  const filteredOverview = alumnosConDescuento.filter(a => {
    const q = overviewSearch.toLowerCase();
    const matchSearch = !q || `${a.alumno_nombre} ${a.alumno_apellido} ${a.alumno_email} ${a.descuento_nombre}`.toLowerCase().includes(q);
    const matchCat = overviewCatFilter === "todos" || a.descuento_categoria === overviewCatFilter;
    return matchSearch && matchCat;
  });

  const resetForm = () => {
    setForm({ nombre: "", tipo: "porcentaje", categoria: "general", valor: 0, codigo: "", max_usos: "", aplica_a: "todo", vigencia_desde: "", vigencia_hasta: "", activo: true });
    setEditing(null);
  };

  const openCreate = () => { resetForm(); setDialogOpen(true); };

  const openEdit = (d: Descuento) => {
    setEditing(d);
    setForm({
      nombre: d.nombre,
      tipo: d.tipo || "porcentaje",
      categoria: d.categoria,
      valor: d.valor,
      codigo: d.codigo || "",
      max_usos: d.max_usos?.toString() || "",
      aplica_a: d.aplica_a,
      vigencia_desde: d.vigencia_desde || "",
      vigencia_hasta: d.vigencia_hasta || "",
      activo: d.activo,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.nombre || form.valor <= 0) {
      toast({ title: "Completá nombre y valor", variant: "destructive" });
      return;
    }

    const payload: any = {
      nombre: form.nombre,
      tipo: form.tipo,
      categoria: form.categoria,
      valor: form.valor,
      codigo: form.codigo.trim() || null,
      max_usos: form.max_usos ? parseInt(form.max_usos) : null,
      aplica_a: form.aplica_a,
      vigencia_desde: form.vigencia_desde || null,
      vigencia_hasta: form.vigencia_hasta || null,
      activo: form.activo,
    };

    if (editing) {
      const { error } = await supabase
        .from("descuentos" as any)
        .update(payload)
        .eq("id", editing.id);
      if (error) {
        toast({ title: "Error al actualizar", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "Descuento actualizado" });
    } else {
      const { error } = await supabase
        .from("descuentos" as any)
        .insert(payload);
      if (error) {
        if (error.code === "23505") toast({ title: "Ese código ya existe", variant: "destructive" });
        else toast({ title: "Error al crear", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "Descuento creado" });
    }

    setDialogOpen(false);
    resetForm();
    loadDescuentos();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar este descuento?")) return;
    await supabase.from("descuentos" as any).delete().eq("id", id);
    toast({ title: "Descuento eliminado" });
    loadDescuentos();
  };

  const toggleActivo = async (d: Descuento) => {
    await supabase.from("descuentos" as any).update({ activo: !d.activo } as any).eq("id", d.id);
    loadDescuentos();
  };

  // --- Assign to students ---
  const openAssign = async (d: Descuento) => {
    setSelectedDescuento(d);
    setSearchAlumno("");
    
    const [alumnosRes, asignadosRes] = await Promise.all([
      supabase.from("alumnos").select("id, nombre, apellido, email").eq("estado", "activo").order("nombre"),
      supabase.from("descuentos_alumno" as any).select("*").eq("descuento_id", d.id),
    ]);
    
    setAlumnos(alumnosRes.data || []);
    setAsignados((asignadosRes.data as any) || []);
    setAssignOpen(true);
  };

  

  const reloadAsignados = async (descuentoId: string) => {
    const { data } = await supabase.from("descuentos_alumno" as any).select("*").eq("descuento_id", descuentoId);
    setAsignados((data as any) || []);
    loadOverview();
  };

  const addAsignacion = async (alumnoId: string, fechaInicio: string, fechaFin: string | null) => {
    if (!selectedDescuento) return;
    const { data: { user } } = await supabase.auth.getUser();
    // Si ya existe (aunque inactivo), reactivar y actualizar fechas
    const existing = asignados.find(a => a.alumno_id === alumnoId);
    if (existing) {
      const { error } = await supabase.from("descuentos_alumno" as any)
        .update({ activo: true, fecha_inicio: fechaInicio, fecha_fin: fechaFin } as any)
        .eq("id", existing.id);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Asignación reactivada" });
    } else {
      const { error } = await supabase.from("descuentos_alumno" as any).insert({
        descuento_id: selectedDescuento.id,
        alumno_id: alumnoId,
        asignado_por: user?.id,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
      } as any);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Alumno asignado" });
    }
    await reloadAsignados(selectedDescuento.id);
  };

  const updateAsignacion = async (id: string, patch: { fecha_inicio?: string; fecha_fin?: string | null; activo?: boolean }) => {
    if (!selectedDescuento) return;
    const { error } = await supabase.from("descuentos_alumno" as any).update(patch as any).eq("id", id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    await reloadAsignados(selectedDescuento.id);
  };

  const removeAsignacion = async (id: string) => {
    if (!selectedDescuento) return;
    // "Quitar" = inactivar y cerrar con fecha hoy (histórico)
    const today = new Date().toISOString().slice(0, 10);
    const { error } = await supabase.from("descuentos_alumno" as any)
      .update({ activo: false, fecha_fin: today } as any).eq("id", id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Asignación cerrada" });
    await reloadAsignados(selectedDescuento.id);
  };

  const filteredAlumnos = alumnos.filter(a => {
    const q = searchAlumno.toLowerCase();
    return !q || `${a.nombre} ${a.apellido || ""} ${a.email}`.toLowerCase().includes(q);
  });

  const activeAssignCount = (dId: string) => asignados.filter(a => a.descuento_id === dId && a.activo).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground">Descuentos</h1>
          <p className="text-sm text-muted-foreground">Gestioná los descuentos y asignalos a alumnos</p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="w-4 h-4" /> Nuevo descuento
        </Button>
      </div>

      <Tabs defaultValue="descuentos" className="w-full">
        <TabsList className="bg-secondary">
          <TabsTrigger value="descuentos" className="gap-1.5"><Tag className="w-4 h-4" />Descuentos</TabsTrigger>
          <TabsTrigger value="alumnos" className="gap-1.5"><Users className="w-4 h-4" />Alumnos con descuento</TabsTrigger>
        </TabsList>

        <TabsContent value="descuentos" className="space-y-5 mt-4">
          {/* Summary cards — alumnos con descuento activo por categoría */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {categorias.map(cat => {
              const count = alumnosConDescuento.filter(a => a.descuento_categoria === cat.value && a.activo).length;
              return (
                <Card key={cat.value} className="bg-card border-border">
                  <CardContent className="p-4 text-center">
                    <p className="text-2xl font-heading font-bold text-foreground">{count}</p>
                    <p className="text-xs text-muted-foreground">{cat.label}</p>
                    <p className="text-[10px] text-muted-foreground/70 mt-0.5">{count === 1 ? "alumno" : "alumnos"}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Table */}
          <Card className="bg-card border-border">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-border">
                    <TableHead className="text-muted-foreground">Nombre</TableHead>
                    <TableHead className="text-muted-foreground">Categoría</TableHead>
                    <TableHead className="text-muted-foreground">Descuento</TableHead>
                    <TableHead className="text-muted-foreground">Código</TableHead>
                    <TableHead className="text-muted-foreground">Aplica a</TableHead>
                    <TableHead className="text-muted-foreground">Estado</TableHead>
                    <TableHead className="text-muted-foreground w-32">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Cargando...</TableCell></TableRow>
                  ) : descuentos.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No hay descuentos creados</TableCell></TableRow>
                  ) : (
                    descuentos.map(d => {
                      const cat = categoriaBadge[d.categoria] || categoriaBadge.general;
                      return (
                        <TableRow key={d.id} className="border-border">
                          <TableCell className="font-medium text-foreground">{d.nombre}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={cat.className}>{cat.label}</Badge>
                          </TableCell>
                          <TableCell>
                            <span className="text-primary font-semibold">
                              {d.tipo === "fijo" ? `$${d.valor}` : `${d.valor}%`}
                            </span>
                          </TableCell>
                          <TableCell>
                            {d.codigo ? (
                              <Badge variant="outline" className="bg-muted text-foreground font-mono text-xs">
                                {d.codigo}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground capitalize">{d.aplica_a}</TableCell>
                          <TableCell>
                            <Switch checked={d.activo} onCheckedChange={() => toggleActivo(d)} />
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" onClick={() => openAssign(d)} title="Asignar alumnos">
                                <Users className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => openEdit(d)}>
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => handleDelete(d.id)} className="text-destructive">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="alumnos" className="space-y-5 mt-4">
          {/* Filter bar */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Buscar alumno o descuento..." value={overviewSearch} onChange={e => setOverviewSearch(e.target.value)} className="pl-9 bg-secondary border-border" />
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {[{ value: "todos", label: "Todos" }, ...categorias].map(c => (
                <Button key={c.value} variant={overviewCatFilter === c.value ? "default" : "outline"} size="sm" className="text-xs h-7" onClick={() => setOverviewCatFilter(c.value)}>
                  {c.label}
                </Button>
              ))}
            </div>
          </div>

          <Card className="bg-card border-border">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-border">
                    <TableHead className="text-muted-foreground">Alumno</TableHead>
                    <TableHead className="text-muted-foreground">Descuento</TableHead>
                    <TableHead className="text-muted-foreground">Categoría</TableHead>
                    <TableHead className="text-muted-foreground">Valor</TableHead>
                    <TableHead className="text-muted-foreground">Aplica a</TableHead>
                    <TableHead className="text-muted-foreground">Desde</TableHead>
                    <TableHead className="text-muted-foreground">Hasta</TableHead>
                    <TableHead className="text-muted-foreground">Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overviewLoading ? (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Cargando...</TableCell></TableRow>
                  ) : filteredOverview.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No hay alumnos con descuentos</TableCell></TableRow>
                  ) : (
                    filteredOverview.map((a, idx) => {
                      const cat = categoriaBadge[a.descuento_categoria] || categoriaBadge.general;
                      const vencido = a.fecha_fin && parseFechaLocal(a.fecha_fin)! < new Date(new Date().setHours(0,0,0,0));
                      return (
                        <TableRow key={`${a.asignacion_id}-${idx}`} className="border-border">
                          <TableCell>
                            <div>
                              <span className="font-medium text-foreground text-sm">{a.alumno_nombre} {a.alumno_apellido}</span>
                              <p className="text-[10px] text-muted-foreground">{a.alumno_email}</p>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-foreground">{a.descuento_nombre}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={cat.className}>{cat.label}</Badge>
                          </TableCell>
                          <TableCell>
                            <span className="text-primary font-semibold text-sm">
                              {a.descuento_tipo === "fijo" ? `$${a.descuento_valor}` : `${a.descuento_valor}%`}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground capitalize">{a.descuento_aplica_a}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatFecha(a.fecha_inicio) !== "—" ? formatFecha(a.fecha_inicio) : new Date(a.created_at).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" })}
                          </TableCell>
                          <TableCell className={`text-xs ${vencido ? "text-amber-400" : "text-muted-foreground"}`}>
                            {formatFecha(a.fecha_fin)}
                          </TableCell>
                          <TableCell>
                            <Badge variant={a.activo ? "default" : "outline"} className={a.activo ? "bg-emerald-600/20 text-emerald-400 border-emerald-500/30 text-[10px]" : "text-muted-foreground text-[10px]"}>
                              {a.activo ? "Activo" : "Inactivo"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground">
            {filteredOverview.filter(a => a.activo).length} descuentos activos de {filteredOverview.length} total
          </p>
        </TabsContent>
      </Tabs>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar descuento" : "Nuevo descuento"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground">Nombre</label>
              <Input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Ej: Descuento familiar" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Categoría</label>
              <Select value={form.categoria} onValueChange={v => setForm(f => ({ ...f, categoria: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {categorias.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Tipo de descuento</label>
              <Select value={form.tipo} onValueChange={v => setForm(f => ({ ...f, tipo: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="porcentaje">Porcentaje (%)</SelectItem>
                  <SelectItem value="fijo">Monto fijo ($)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">
                {form.tipo === "fijo" ? "Monto de descuento ($)" : "Porcentaje de descuento (%)"}
              </label>
              <Input type="number" min={1} max={form.tipo === "porcentaje" ? 100 : undefined} value={form.valor} onChange={e => setForm(f => ({ ...f, valor: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Código (opcional, para referidos)</label>
              <Input value={form.codigo} onChange={e => setForm(f => ({ ...f, codigo: e.target.value.toUpperCase() }))} placeholder="Ej: AMIGO2026" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Máximo de usos (vacío = ilimitado)</label>
              <Input type="number" min={1} value={form.max_usos} onChange={e => setForm(f => ({ ...f, max_usos: e.target.value }))} placeholder="Ilimitado" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Aplica a</label>
              <Select value={form.aplica_a} onValueChange={v => setForm(f => ({ ...f, aplica_a: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {aplicaOpciones.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-muted-foreground">Vigencia desde (opcional)</label>
                <Input type="date" value={form.vigencia_desde} onChange={e => setForm(f => ({ ...f, vigencia_desde: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Vigencia hasta (opcional)</label>
                <Input type="date" value={form.vigencia_hasta} onChange={e => setForm(f => ({ ...f, vigencia_hasta: e.target.value }))} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground -mt-2">Dejá vacío para descuento permanente</p>
            <div className="flex items-center gap-2">
              <Switch checked={form.activo} onCheckedChange={v => setForm(f => ({ ...f, activo: v }))} />
              <span className="text-sm text-muted-foreground">Activo</span>
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button className="flex-1" onClick={handleSave}>{editing ? "Guardar" : "Crear"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Manage students dialog */}
      <ManageAssignDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        selectedDescuento={selectedDescuento}
        alumnos={alumnos}
        asignados={asignados}
        searchAlumno={searchAlumno}
        setSearchAlumno={setSearchAlumno}
        addAsignacion={addAsignacion}
        updateAsignacion={updateAsignacion}
        removeAsignacion={removeAsignacion}
      />
    </div>
  );
};

// ---------- Manage assignments sub-component ----------
interface ManageAssignProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  selectedDescuento: Descuento | null;
  alumnos: any[];
  asignados: DescuentoAlumno[];
  searchAlumno: string;
  setSearchAlumno: (v: string) => void;
  addAsignacion: (alumnoId: string, fechaInicio: string, fechaFin: string | null) => Promise<void>;
  updateAsignacion: (id: string, patch: { fecha_inicio?: string; fecha_fin?: string | null; activo?: boolean }) => Promise<void>;
  removeAsignacion: (id: string) => Promise<void>;
}

const ManageAssignDialog = ({
  open, onOpenChange, selectedDescuento, alumnos, asignados,
  searchAlumno, setSearchAlumno, addAsignacion, updateAsignacion, removeAsignacion
}: ManageAssignProps) => {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [selectedAlumno, setSelectedAlumno] = useState<string | null>(null);
  const [newFechaInicio, setNewFechaInicio] = useState(todayStr);
  const [newFechaFin, setNewFechaFin] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFechaInicio, setEditFechaInicio] = useState("");
  const [editFechaFin, setEditFechaFin] = useState("");

  useEffect(() => {
    if (open) {
      setSelectedAlumno(null);
      setNewFechaInicio(todayStr);
      setNewFechaFin("");
      setEditingId(null);
    }
  }, [open]);

  const activeAsignados = asignados.filter(a => a.activo);
  const assignedAlumnoIds = new Set(asignados.filter(a => a.activo).map(a => a.alumno_id));
  const alumnosDisponibles = alumnos.filter(a => {
    if (assignedAlumnoIds.has(a.id)) return false;
    const q = searchAlumno.toLowerCase();
    return !q || `${a.nombre} ${a.apellido || ""} ${a.email}`.toLowerCase().includes(q);
  });
  const alumnoMap = new Map(alumnos.map(a => [a.id, a]));

  const startEdit = (asig: DescuentoAlumno) => {
    setEditingId(asig.id);
    setEditFechaInicio(asig.fecha_inicio || todayStr);
    setEditFechaFin(asig.fecha_fin || "");
  };

  const saveEdit = async () => {
    if (!editingId) return;
    await updateAsignacion(editingId, {
      fecha_inicio: editFechaInicio,
      fecha_fin: editFechaFin || null,
    });
    setEditingId(null);
  };

  const handleAdd = async () => {
    if (!selectedAlumno) {
      toast({ title: "Seleccioná un alumno", variant: "destructive" });
      return;
    }
    if (!newFechaInicio) {
      toast({ title: "Fecha de inicio obligatoria", variant: "destructive" });
      return;
    }
    await addAsignacion(selectedAlumno, newFechaInicio, newFechaFin || null);
    setSelectedAlumno(null);
    setNewFechaInicio(todayStr);
    setNewFechaFin("");
    setSearchAlumno("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>
            Gestionar alumnos — {selectedDescuento?.nombre}
            <Badge className="ml-2" variant="outline">
              {selectedDescuento?.tipo === "fijo" ? `$${selectedDescuento?.valor}` : `${selectedDescuento?.valor}%`}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 space-y-5 pr-1">
          {/* Asignados */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-foreground">Alumnos asignados</h3>
              <Badge variant="outline" className="text-xs">{activeAsignados.length} activos</Badge>
            </div>
            {asignados.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">Aún no hay alumnos asignados</p>
            ) : (
              <div className="space-y-1.5">
                {asignados.map(asig => {
                  const a = alumnoMap.get(asig.alumno_id);
                  const vigente = isVigente(asig.fecha_inicio, asig.fecha_fin, asig.activo);
                  const isEditing = editingId === asig.id;
                  return (
                    <div key={asig.id} className={`p-2.5 rounded-lg border ${vigente ? "border-primary/20 bg-primary/5" : "border-border bg-muted/30"}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground truncate">
                            {a?.nombre || "Alumno"} {a?.apellido || ""}
                          </p>
                          <p className="text-[10px] text-muted-foreground truncate">{a?.email}</p>
                          {!isEditing && (
                            <p className="text-[11px] text-muted-foreground mt-1">
                              {formatFecha(asig.fecha_inicio)} → {asig.fecha_fin ? formatFecha(asig.fecha_fin) : "sin vencimiento"}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {!isEditing && (
                            <>
                              <Badge variant="outline" className={vigente ? "bg-emerald-600/20 text-emerald-400 border-emerald-500/30 text-[10px]" : "text-muted-foreground text-[10px]"}>
                                {vigente ? "Vigente" : "Inactivo"}
                              </Badge>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(asig)} title="Editar fechas">
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeAsignacion(asig.id)} title="Quitar">
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                      {isEditing && (
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] text-muted-foreground">Desde</label>
                            <Input type="date" value={editFechaInicio} onChange={e => setEditFechaInicio(e.target.value)} className="h-8 text-xs" />
                          </div>
                          <div>
                            <label className="text-[10px] text-muted-foreground">Hasta (opcional)</label>
                            <Input type="date" value={editFechaFin} onChange={e => setEditFechaFin(e.target.value)} className="h-8 text-xs" />
                          </div>
                          <div className="col-span-2 flex gap-2 justify-end">
                            <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>Cancelar</Button>
                            <Button size="sm" onClick={saveEdit}>Guardar</Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Agregar */}
          <section className="border-t border-border pt-4">
            <h3 className="text-sm font-semibold text-foreground mb-2">Agregar alumno</h3>
            <Input
              placeholder="Buscar alumno..."
              value={searchAlumno}
              onChange={e => setSearchAlumno(e.target.value)}
              className="mb-2"
            />
            <div className="max-h-48 overflow-y-auto space-y-1 mb-3 border border-border rounded-lg p-1">
              {alumnosDisponibles.length === 0 ? (
                <p className="text-center text-muted-foreground text-xs py-4">
                  {searchAlumno ? "No se encontraron alumnos" : "Escribí para buscar"}
                </p>
              ) : (
                alumnosDisponibles.slice(0, 20).map(a => (
                  <div
                    key={a.id}
                    onClick={() => setSelectedAlumno(a.id)}
                    className={`p-2 rounded cursor-pointer transition-colors ${
                      selectedAlumno === a.id ? "bg-primary/15 border border-primary/30" : "hover:bg-muted/50"
                    }`}
                  >
                    <p className="text-sm font-medium text-foreground">{a.nombre} {a.apellido || ""}</p>
                    <p className="text-[10px] text-muted-foreground">{a.email}</p>
                  </div>
                ))
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 mb-3">
              <div>
                <label className="text-xs text-muted-foreground">Fecha inicio</label>
                <Input type="date" value={newFechaInicio} onChange={e => setNewFechaInicio(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Fecha fin (opcional)</label>
                <Input type="date" value={newFechaFin} onChange={e => setNewFechaFin(e.target.value)} />
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground mb-3">Dejá la fecha de fin vacía si el descuento no vence</p>

            <Button className="w-full" onClick={handleAdd} disabled={!selectedAlumno}>
              <Plus className="w-4 h-4 mr-1" /> Agregar al descuento
            </Button>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ManageDescuentos;
