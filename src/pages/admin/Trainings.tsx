import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Eye, EyeOff, Dumbbell, Plus, Pencil, Trash2, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";
import { ImportPlanContent } from "./ImportPlan";

type Entrenamiento = Tables<"entrenamientos">;
const GRUPOS_FILTER = ["Todos", "G1", "G2", "G3", "G4", "Principiante"] as const;
const GRUPOS = ["G1", "G2", "G3", "G4", "Principiante"] as const;
const TIPOS = ["ruta", "rodillo", "gimnasio", "tecnica"] as const;

const emptyForm = {
  titulo: "",
  descripcion: "",
  fecha: new Date().toISOString().split("T")[0],
  grupo: "G1" as string,
  tipo: "ruta" as string,
  link_archivo: "",
  visible: true,
};

const Trainings = () => {
  const [entrenamientos, setEntrenamientos] = useState<Entrenamiento[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterGrupo, setFilterGrupo] = useState("Todos");
  const [filterMonth, setFilterMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    let query = supabase
      .from("entrenamientos")
      .select("*")
      .gte("fecha", `${filterMonth}-01`)
      .lte("fecha", `${filterMonth}-31`)
      .order("fecha")
      .order("grupo");

    if (filterGrupo !== "Todos") {
      query = query.eq("grupo", filterGrupo as any);
    }

    const { data } = await query;
    setEntrenamientos(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [filterGrupo, filterMonth]);

  const toggleVisible = async (ent: Entrenamiento) => {
    await supabase.from("entrenamientos").update({ visible: !ent.visible }).eq("id", ent.id);
    toast.success(ent.visible ? "Entrenamiento ocultado" : "Entrenamiento visible");
    fetchData();
  };

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm, fecha: `${filterMonth}-01` });
    setDialogOpen(true);
  };

  const openEdit = (ent: Entrenamiento) => {
    setEditingId(ent.id);
    setForm({
      titulo: ent.titulo,
      descripcion: ent.descripcion || "",
      fecha: ent.fecha,
      grupo: ent.grupo,
      tipo: ent.tipo || "ruta",
      link_archivo: ent.link_archivo || "",
      visible: ent.visible,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.titulo.trim() || !form.fecha) {
      toast.error("Título y fecha son obligatorios");
      return;
    }
    setSaving(true);

    const payload = {
      titulo: form.titulo.trim(),
      descripcion: form.descripcion.trim() || null,
      fecha: form.fecha,
      grupo: form.grupo as any,
      tipo: form.tipo as any,
      link_archivo: form.link_archivo.trim() || null,
      visible: form.visible,
    };

    if (editingId) {
      const { error } = await supabase.from("entrenamientos").update(payload).eq("id", editingId);
      if (error) { toast.error("Error al guardar"); } else { toast.success("Entrenamiento actualizado"); }
    } else {
      const { error } = await supabase.from("entrenamientos").insert(payload);
      if (error) { toast.error("Error al crear"); } else { toast.success("Entrenamiento creado"); }
    }

    setSaving(false);
    setDialogOpen(false);
    fetchData();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar este entrenamiento?")) return;
    await supabase.from("entrenamientos").delete().eq("id", id);
    toast.success("Entrenamiento eliminado");
    fetchData();
  };

  const tipoColor: Record<string, string> = {
    ruta: "bg-green-900/30 text-green-400",
    rodillo: "bg-blue-900/30 text-blue-400",
    gimnasio: "bg-orange-900/30 text-orange-400",
    tecnica: "bg-purple-900/30 text-purple-400",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-heading font-bold uppercase tracking-wider text-foreground">
            Entrenamientos
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Gestión de entrenamientos e importación de planes
          </p>
        </div>
      </div>

      <Tabs defaultValue="lista" className="w-full">
        <TabsList className="bg-secondary">
          <TabsTrigger value="lista" className="gap-1.5">
            <Dumbbell className="w-4 h-4" />
            Lista
          </TabsTrigger>
          <TabsTrigger value="importar" className="gap-1.5">
            <FileSpreadsheet className="w-4 h-4" />
            Importar Plan
          </TabsTrigger>
        </TabsList>

        <TabsContent value="lista" className="space-y-5 mt-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {entrenamientos.length} entrenamientos en {filterMonth}
            </p>
            <Button variant="gold" size="sm" onClick={openCreate}>
              <Plus className="w-4 h-4 mr-1" />
              Nuevo
            </Button>
          </div>

      <div className="flex flex-wrap gap-3">
        <input
          type="month"
          value={filterMonth}
          onChange={(e) => setFilterMonth(e.target.value)}
          className="bg-secondary border border-border rounded-md px-3 py-1.5 text-sm text-foreground"
        />
        <Select value={filterGrupo} onValueChange={setFilterGrupo}>
          <SelectTrigger className="w-36 bg-secondary border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {GRUPOS_FILTER.map((g) => (
              <SelectItem key={g} value={g}>{g}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="glass-card rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-muted-foreground">Fecha</TableHead>
              <TableHead className="text-muted-foreground">Grupo</TableHead>
              <TableHead className="text-muted-foreground">Título</TableHead>
              <TableHead className="text-muted-foreground">Tipo</TableHead>
              <TableHead className="text-muted-foreground">Visible</TableHead>
              <TableHead className="text-muted-foreground text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  Cargando...
                </TableCell>
              </TableRow>
            ) : entrenamientos.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  <Dumbbell className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
                  <p className="text-muted-foreground text-sm">No hay entrenamientos para este mes</p>
                </TableCell>
              </TableRow>
            ) : (
              entrenamientos.map((ent) => (
                <TableRow key={ent.id} className="border-border">
                  <TableCell className="text-foreground text-xs font-mono">{ent.fecha}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs font-mono">{ent.grupo}</Badge>
                  </TableCell>
                  <TableCell className="text-foreground text-sm max-w-[200px] truncate">{ent.titulo}</TableCell>
                  <TableCell>
                    {ent.tipo && (
                      <span className={`text-xs px-2 py-0.5 rounded-full ${tipoColor[ent.tipo] || ""}`}>
                        {ent.tipo}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <button onClick={() => toggleVisible(ent)} className="transition-colors hover:text-primary">
                      {ent.visible ? <Eye className="w-4 h-4 text-primary" /> : <EyeOff className="w-4 h-4 text-muted-foreground" />}
                    </button>
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(ent)}>
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(ent.id)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading uppercase tracking-wider">
              {editingId ? "Editar entrenamiento" : "Nuevo entrenamiento"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Fecha</label>
                <Input
                  type="date"
                  value={form.fecha}
                  onChange={(e) => setForm({ ...form, fecha: e.target.value })}
                  className="bg-secondary border-border"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Grupo</label>
                <Select value={form.grupo} onValueChange={(v) => setForm({ ...form, grupo: v })}>
                  <SelectTrigger className="bg-secondary border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GRUPOS.map((g) => (
                      <SelectItem key={g} value={g}>{g}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Título</label>
              <Input
                value={form.titulo}
                onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                placeholder="Ej: RE + FZA RE"
                className="bg-secondary border-border"
              />
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Tipo</label>
              <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS.map((t) => (
                    <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Descripción</label>
              <Textarea
                value={form.descripcion}
                onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                placeholder="Detalle del entrenamiento..."
                rows={5}
                className="bg-secondary border-border"
              />
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Link archivo (opcional)</label>
              <Input
                value={form.link_archivo}
                onChange={(e) => setForm({ ...form, link_archivo: e.target.value })}
                placeholder="https://..."
                className="bg-secondary border-border"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.visible}
                onChange={(e) => setForm({ ...form, visible: e.target.checked })}
                className="rounded border-border"
                id="visible-check"
              />
              <label htmlFor="visible-check" className="text-sm text-foreground">
                Visible para alumnos
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button variant="gold" onClick={handleSave} disabled={saving}>
                {saving ? "Guardando..." : editingId ? "Guardar cambios" : "Crear"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
        </TabsContent>

        <TabsContent value="importar" className="mt-4">
          <ImportPlanContent />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Trainings;
