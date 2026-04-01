import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, Copy, Trash2, ChevronRight, Calendar, Dumbbell, Eye, Users, MoreVertical } from "lucide-react";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

type Entrenamiento = Tables<"entrenamientos">;

interface MonthOverviewProps {
  onSelectMonth: (month: string) => void;
}

interface MonthStats {
  month: string;
  total: number;
  days: number;
  groups: number;
  visible: number;
  hidden: number;
  lastUpdated: string;
}

const MonthOverview = ({ onSelectMonth }: MonthOverviewProps) => {
  const [entrenamientos, setEntrenamientos] = useState<Entrenamiento[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newMonth, setNewMonth] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [duplicateDialog, setDuplicateDialog] = useState<{ source: string } | null>(null);
  const [targetMonth, setTargetMonth] = useState("");

  const fetchAll = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    console.log("MonthOverview session:", sessionData?.session?.user?.email ?? "NO SESSION");
    const { data, error } = await supabase.from("entrenamientos").select("*").order("fecha");
    if (error) console.error("Error fetching entrenamientos:", error);
    console.log("Entrenamientos fetched:", data?.length ?? 0, "items");
    if (data && data.length > 0) {
      const months = new Set(data.map((e: any) => e.fecha?.substring(0, 7)));
      console.log("Months found:", Array.from(months).sort());
    }
    setEntrenamientos(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const monthStats = useMemo<MonthStats[]>(() => {
    const groups = new Map<string, Entrenamiento[]>();
    entrenamientos.forEach(e => {
      const month = e.fecha.substring(0, 7);
      if (!groups.has(month)) groups.set(month, []);
      groups.get(month)!.push(e);
    });
    return Array.from(groups.entries())
      .map(([month, items]) => ({
        month,
        total: items.length,
        days: new Set(items.map(e => e.fecha)).size,
        groups: new Set(items.map(e => e.grupo)).size,
        visible: items.filter(e => e.visible).length,
        hidden: items.filter(e => !e.visible).length,
        lastUpdated: items.reduce((max, e) => e.updated_at > max ? e.updated_at : max, items[0].updated_at),
      }))
      .sort((a, b) => b.month.localeCompare(a.month));
  }, [entrenamientos]);

  const formatMonthName = (month: string) => {
    const [year, m] = month.split("-").map(Number);
    return new Date(year, m - 1).toLocaleDateString("es-AR", { month: "long", year: "numeric" });
  };

  const handleCreate = () => {
    setCreateDialogOpen(false);
    onSelectMonth(newMonth);
  };

  const handleDuplicate = async () => {
    if (!duplicateDialog || !targetMonth) return;
    const sourceData = entrenamientos.filter(e => e.fecha.startsWith(duplicateDialog.source));
    if (!sourceData.length) { toast.error("No hay entrenamientos para duplicar"); return; }

    const [tgtYear, tgtMonthNum] = targetMonth.split("-").map(Number);
    const targetDaysInMonth = new Date(tgtYear, tgtMonthNum, 0).getDate();

    const newEntries = sourceData.map(e => {
      const day = parseInt(e.fecha.split("-")[2]);
      const clampedDay = Math.min(day, targetDaysInMonth);
      return {
        titulo: e.titulo,
        descripcion: e.descripcion,
        fecha: `${targetMonth}-${String(clampedDay).padStart(2, "0")}`,
        grupo: e.grupo as any,
        tipo: e.tipo as any,
        link_archivo: e.link_archivo,
        visible: false,
        resistencia: e.resistencia,
        tecnica: e.tecnica,
        intensidad: e.intensidad,
      };
    });

    for (let i = 0; i < newEntries.length; i += 50) {
      const { error } = await supabase.from("entrenamientos").insert(newEntries.slice(i, i + 50));
      if (error) { toast.error("Error al duplicar"); return; }
    }
    toast.success(`${newEntries.length} entrenamientos duplicados a ${formatMonthName(targetMonth)}`);
    setDuplicateDialog(null);
    setTargetMonth("");
    fetchAll();
  };

  const handleDeleteMonth = async (month: string) => {
    if (!confirm(`¿Eliminar todos los entrenamientos de ${formatMonthName(month)}? Esta acción no se puede deshacer.`)) return;
    const { error } = await supabase.from("entrenamientos").delete().gte("fecha", `${month}-01`).lte("fecha", `${month}-31`);
    if (error) toast.error("Error al eliminar");
    else toast.success("Mes eliminado");
    fetchAll();
  };

  if (loading) {
    return <div className="text-center py-12 text-muted-foreground">Cargando planificación...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{monthStats.length} meses con planificación</p>
        <Button variant="gold" size="sm" onClick={() => setCreateDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-1.5" />
          Crear planificación mensual
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {monthStats.map(stats => (
          <Card
            key={stats.month}
            className="bg-card border-border hover:border-primary/30 transition-colors cursor-pointer group"
            onClick={() => onSelectMonth(stats.month)}
          >
            <CardContent className="p-5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-heading font-bold text-foreground capitalize">
                    {formatMonthName(stats.month)}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Última edición: {new Date(stats.lastUpdated).toLocaleDateString("es-AR")}
                  </p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenuItem onClick={() => onSelectMonth(stats.month)}>
                      <ChevronRight className="w-4 h-4 mr-2" /> Ver mes
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { setDuplicateDialog({ source: stats.month }); setTargetMonth(""); }}>
                      <Copy className="w-4 h-4 mr-2" /> Duplicar mes
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive" onClick={() => handleDeleteMonth(stats.month)}>
                      <Trash2 className="w-4 h-4 mr-2" /> Eliminar mes
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>{stats.days} días</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Dumbbell className="w-3.5 h-3.5" />
                  <span>{stats.total} entrenam.</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Users className="w-3.5 h-3.5" />
                  <span>{stats.groups} grupos</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Eye className="w-3.5 h-3.5" />
                  <span>{stats.visible} visibles</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {monthStats.length === 0 && (
        <div className="text-center py-16">
          <Dumbbell className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No hay planificaciones cargadas</p>
          <Button variant="gold" size="sm" className="mt-4" onClick={() => setCreateDialogOpen(true)}>
            Crear primera planificación
          </Button>
        </div>
      )}

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading uppercase tracking-wider">Nueva planificación</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Mes</label>
              <Input type="month" value={newMonth} onChange={e => setNewMonth(e.target.value)} className="bg-secondary border-border" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setCreateDialogOpen(false)}>Cancelar</Button>
              <Button variant="gold" onClick={handleCreate}>Crear</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!duplicateDialog} onOpenChange={() => setDuplicateDialog(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading uppercase tracking-wider">Duplicar mes</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <p className="text-sm text-muted-foreground">
              Copiar todos los entrenamientos de <strong className="text-foreground">{duplicateDialog && formatMonthName(duplicateDialog.source)}</strong> a:
            </p>
            <Input type="month" value={targetMonth} onChange={e => setTargetMonth(e.target.value)} className="bg-secondary border-border" />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDuplicateDialog(null)}>Cancelar</Button>
              <Button variant="gold" onClick={handleDuplicate} disabled={!targetMonth}>Duplicar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MonthOverview;
