import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Grid3X3, List, Plus, Eye, EyeOff, Trash2, Copy, LayoutTemplate, Search } from "lucide-react";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";
import SummaryCards from "./SummaryCards";
import MatrixView from "./MatrixView";
import ListView from "./ListView";
import TrainingFormDialog from "./TrainingFormDialog";
import TrainingCellDrawer from "./TrainingCellDrawer";
import TemplateManager from "./TemplateManager";
import DuplicatesDrawer from "./DuplicatesDrawer";

type Entrenamiento = Tables<"entrenamientos">;

const GRUPOS_FILTER = ["Todos", "G1", "G2", "G3", "G4", "Principiante"];
const TIPOS_FILTER = ["Todos", "ruta", "rodillo", "gimnasio", "tecnica"];

interface MonthDetailProps {
  month: string;
  onBack: () => void;
}

const MonthDetail = ({ month, onBack }: MonthDetailProps) => {
  const [entrenamientos, setEntrenamientos] = useState<Entrenamiento[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterGrupo, setFilterGrupo] = useState("Todos");
  const [filterTipo, setFilterTipo] = useState("Todos");
  const [filterVisibilidad, setFilterVisibilidad] = useState("todos");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [formOpen, setFormOpen] = useState(false);
  const [editingTraining, setEditingTraining] = useState<Entrenamiento | null>(null);
  const [drawerTraining, setDrawerTraining] = useState<Entrenamiento | null>(null);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [duplicatesOpen, setDuplicatesOpen] = useState(false);

  const fetchData = useCallback(async () => {
    const [y, m] = month.split("-").map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const from = `${month}-01`;
    const to = `${month}-${String(lastDay).padStart(2, "0")}`;
    console.log("MonthDetail fetching:", from, "to", to);
    const { data, error } = await supabase
      .from("entrenamientos")
      .select("*")
      .gte("fecha", from)
      .lte("fecha", to)
      .order("fecha")
      .order("grupo");
    if (error) console.error("MonthDetail fetch error:", error);
    console.log("MonthDetail result:", data?.length ?? 0, "items");
    setEntrenamientos(data || []);
    setLoading(false);
  }, [month]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = useMemo(() => {
    return entrenamientos.filter(e => {
      if (filterGrupo !== "Todos" && e.grupo !== filterGrupo) return false;
      if (filterTipo !== "Todos" && e.tipo !== filterTipo) return false;
      if (filterVisibilidad === "visibles" && !e.visible) return false;
      if (filterVisibilidad === "ocultos" && e.visible) return false;
      if (search && !e.titulo.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [entrenamientos, filterGrupo, filterTipo, filterVisibilidad, search]);

  const formatMonthName = (m: string) => {
    const [year, mo] = m.split("-").map(Number);
    return new Date(year, mo - 1).toLocaleDateString("es-AR", { month: "long", year: "numeric" });
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map(e => e.id)));
  };

  const bulkToggleVisibility = async (visible: boolean) => {
    const ids = Array.from(selectedIds);
    for (let i = 0; i < ids.length; i += 50) {
      await supabase.from("entrenamientos").update({ visible }).in("id", ids.slice(i, i + 50));
    }
    toast.success(`${ids.length} entrenamientos ${visible ? "visibles" : "ocultos"}`);
    setSelectedIds(new Set());
    fetchData();
  };

  const bulkDelete = async () => {
    if (!confirm(`¿Eliminar ${selectedIds.size} entrenamientos?`)) return;
    const ids = Array.from(selectedIds);
    for (let i = 0; i < ids.length; i += 50) {
      await supabase.from("entrenamientos").delete().in("id", ids.slice(i, i + 50));
    }
    toast.success(`${ids.length} entrenamientos eliminados`);
    setSelectedIds(new Set());
    fetchData();
  };

  const bulkDuplicate = async () => {
    const ids = Array.from(selectedIds);
    const toDuplicate = entrenamientos.filter(e => ids.includes(e.id));
    const copies = toDuplicate.map(e => ({
      titulo: e.titulo,
      descripcion: e.descripcion,
      fecha: e.fecha,
      grupo: e.grupo as any,
      tipo: e.tipo as any,
      link_archivo: e.link_archivo,
      visible: false,
      resistencia: e.resistencia,
      tecnica: e.tecnica,
      intensidad: e.intensidad,
    }));
    for (let i = 0; i < copies.length; i += 50) {
      await supabase.from("entrenamientos").insert(copies.slice(i, i + 50));
    }
    toast.success(`${copies.length} entrenamientos duplicados`);
    setSelectedIds(new Set());
    fetchData();
  };

  const handleEdit = (ent: Entrenamiento) => {
    setEditingTraining(ent);
    setFormOpen(true);
    setDrawerTraining(null);
  };

  const handleCreate = () => {
    setEditingTraining(null);
    setFormOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar este entrenamiento?")) return;
    await supabase.from("entrenamientos").delete().eq("id", id);
    toast.success("Eliminado");
    setDrawerTraining(null);
    fetchData();
  };

  const handleToggleVisibility = async (ent: Entrenamiento) => {
    await supabase.from("entrenamientos").update({ visible: !ent.visible }).eq("id", ent.id);
    toast.success(ent.visible ? "Ocultado" : "Visible");
    setDrawerTraining(null);
    fetchData();
  };

  if (loading) {
    return <div className="text-center py-12 text-muted-foreground">Cargando...</div>;
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h3 className="text-xl font-heading font-bold text-foreground capitalize">
            {formatMonthName(month)}
          </h3>
          <p className="text-xs text-muted-foreground">{entrenamientos.length} entrenamientos</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setDuplicatesOpen(true)}>
          <Search className="w-4 h-4 mr-1.5" />
          Duplicados
        </Button>
        <Button variant="outline" size="sm" onClick={() => setTemplateOpen(true)}>
          <LayoutTemplate className="w-4 h-4 mr-1.5" />
          Plantillas
        </Button>
        <Button variant="gold" size="sm" onClick={handleCreate}>
          <Plus className="w-4 h-4 mr-1.5" />
          Nuevo
        </Button>
      </div>

      {/* Summary */}
      <SummaryCards entrenamientos={entrenamientos} />

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <Select value={filterGrupo} onValueChange={setFilterGrupo}>
          <SelectTrigger className="w-28 bg-secondary border-border h-9 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {GRUPOS_FILTER.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterTipo} onValueChange={setFilterTipo}>
          <SelectTrigger className="w-28 bg-secondary border-border h-9 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIPOS_FILTER.map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterVisibilidad} onValueChange={setFilterVisibilidad}>
          <SelectTrigger className="w-28 bg-secondary border-border h-9 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="visibles">Visibles</SelectItem>
            <SelectItem value="ocultos">Ocultos</SelectItem>
          </SelectContent>
        </Select>
        <Input
          placeholder="Buscar título..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-40 bg-secondary border-border h-9 text-xs"
        />
      </div>

      {/* Bulk actions */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/10 border border-primary/20 flex-wrap">
          <span className="text-sm font-medium text-foreground">{selectedIds.size} seleccionados</span>
          <div className="flex-1" />
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => bulkToggleVisibility(true)}>
            <Eye className="w-3 h-3 mr-1" /> Mostrar
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => bulkToggleVisibility(false)}>
            <EyeOff className="w-3 h-3 mr-1" /> Ocultar
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={bulkDuplicate}>
            <Copy className="w-3 h-3 mr-1" /> Duplicar
          </Button>
          <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={bulkDelete}>
            <Trash2 className="w-3 h-3 mr-1" /> Eliminar
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelectedIds(new Set())}>
            Cancelar
          </Button>
        </div>
      )}

      {/* Views */}
      <Tabs defaultValue="matriz" className="w-full">
        <div className="flex items-center justify-between">
          <TabsList className="bg-secondary h-9">
            <TabsTrigger value="matriz" className="gap-1 text-xs h-7">
              <Grid3X3 className="w-3.5 h-3.5" /> Matriz
            </TabsTrigger>
            <TabsTrigger value="lista" className="gap-1 text-xs h-7">
              <List className="w-3.5 h-3.5" /> Lista
            </TabsTrigger>
          </TabsList>
          {filtered.length > 0 && (
            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={selectAll}>
              {selectedIds.size === filtered.length ? "Deseleccionar" : "Seleccionar todo"}
            </Button>
          )}
        </div>

        <TabsContent value="matriz" className="mt-3">
          <MatrixView
            entrenamientos={filtered}
            allEntrenamientos={entrenamientos}
            month={month}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onCellClick={setDrawerTraining}
          />
        </TabsContent>

        <TabsContent value="lista" className="mt-3">
          <ListView
            entrenamientos={filtered}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onToggleVisibility={handleToggleVisibility}
          />
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <TrainingFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        training={editingTraining}
        defaultMonth={month}
        onSaved={() => { setFormOpen(false); setEditingTraining(null); fetchData(); }}
      />

      <TrainingCellDrawer
        training={drawerTraining}
        onClose={() => setDrawerTraining(null)}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onToggleVisibility={handleToggleVisibility}
      />

      <TemplateManager
        open={templateOpen}
        onOpenChange={setTemplateOpen}
        month={month}
        entrenamientos={entrenamientos}
        onApplied={fetchData}
      />

      <DuplicatesDrawer
        open={duplicatesOpen}
        onOpenChange={setDuplicatesOpen}
        entrenamientos={entrenamientos}
        onDeleted={() => { setDuplicatesOpen(false); fetchData(); }}
      />
    </div>
  );
};

export default MonthDetail;
