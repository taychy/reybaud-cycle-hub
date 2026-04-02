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
import { Plus, Pencil, Trash2, Percent, Users, Copy, Tag } from "lucide-react";
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
}

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

  useEffect(() => { loadDescuentos(); }, []);

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

  const isAssigned = (alumnoId: string) => asignados.some(a => a.alumno_id === alumnoId && a.activo);

  const toggleAssign = async (alumnoId: string) => {
    if (!selectedDescuento) return;
    const existing = asignados.find(a => a.alumno_id === alumnoId);
    
    if (existing) {
      await supabase.from("descuentos_alumno" as any)
        .update({ activo: !existing.activo } as any)
        .eq("id", existing.id);
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("descuentos_alumno" as any).insert({
        descuento_id: selectedDescuento.id,
        alumno_id: alumnoId,
        asignado_por: user?.id,
      } as any);
    }

    const { data } = await supabase.from("descuentos_alumno" as any).select("*").eq("descuento_id", selectedDescuento.id);
    setAsignados((data as any) || []);
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

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {categorias.filter(c => c.value !== "general").map(cat => {
          const count = descuentos.filter(d => d.categoria === cat.value && d.activo).length;
          return (
            <Card key={cat.value} className="bg-card border-border">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-heading font-bold text-foreground">{count}</p>
                <p className="text-xs text-muted-foreground">{cat.label}</p>
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

      {/* Assign students dialog */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>
              Asignar alumnos — {selectedDescuento?.nombre}
              <Badge className="ml-2" variant="outline">
                {selectedDescuento?.tipo === "fijo" ? `$${selectedDescuento?.valor}` : `${selectedDescuento?.valor}%`}
              </Badge>
            </DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Buscar alumno..."
            value={searchAlumno}
            onChange={e => setSearchAlumno(e.target.value)}
          />
          <div className="overflow-y-auto flex-1 space-y-1 mt-2">
            {filteredAlumnos.map(a => (
              <div
                key={a.id}
                className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                  isAssigned(a.id) ? "bg-primary/10 border border-primary/20" : "hover:bg-muted/50"
                }`}
                onClick={() => toggleAssign(a.id)}
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{a.nombre} {a.apellido || ""}</p>
                  <p className="text-xs text-muted-foreground">{a.email}</p>
                </div>
                {isAssigned(a.id) && (
                  <Badge className="bg-primary/20 text-primary border-primary/30">Asignado</Badge>
                )}
              </div>
            ))}
            {filteredAlumnos.length === 0 && (
              <p className="text-center text-muted-foreground text-sm py-4">No se encontraron alumnos</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ManageDescuentos;
