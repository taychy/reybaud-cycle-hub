import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Truck, Plus, Package, ChevronRight, CalendarDays } from "lucide-react";
import { toast } from "sonner";

interface DeliveryList {
  id: string;
  titulo: string;
  descripcion: string | null;
  fecha_entrega: string | null;
  estado: string;
  origen: string;
  created_at: string;
}

interface DeliveryListWithStats extends DeliveryList {
  total_items: number;
  preparados: number;
}

const DepositoEntregas = () => {
  const navigate = useNavigate();
  const [lists, setLists] = useState<DeliveryListWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ titulo: "", descripcion: "", fecha_entrega: "" });
  const [filter, setFilter] = useState<"abiertas" | "todas">("abiertas");

  const fetchLists = async () => {
    setLoading(true);
    const { data: rawLists } = await supabase
      .from("delivery_lists")
      .select("*")
      .order("created_at", { ascending: false });
    const ls = (rawLists as DeliveryList[]) || [];
    if (ls.length === 0) {
      setLists([]);
      setLoading(false);
      return;
    }
    const { data: items } = await supabase
      .from("delivery_list_items")
      .select("list_id,preparado")
      .in("list_id", ls.map((l) => l.id));
    const stats: Record<string, { total: number; prep: number }> = {};
    (items || []).forEach((it: any) => {
      const s = (stats[it.list_id] ||= { total: 0, prep: 0 });
      s.total++;
      if (it.preparado) s.prep++;
    });
    setLists(
      ls.map((l) => ({
        ...l,
        total_items: stats[l.id]?.total || 0,
        preparados: stats[l.id]?.prep || 0,
      })),
    );
    setLoading(false);
  };

  useEffect(() => {
    fetchLists();
  }, []);

  const handleCreate = async () => {
    if (!form.titulo.trim()) {
      toast.error("Falta el título");
      return;
    }
    setCreating(true);
    const { data: userRes } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("delivery_lists")
      .insert({
        titulo: form.titulo.trim(),
        descripcion: form.descripcion.trim() || null,
        fecha_entrega: form.fecha_entrega || null,
        created_by: userRes.user?.id ?? null,
      })
      .select()
      .single();
    setCreating(false);
    if (error || !data) {
      toast.error(error?.message || "Error al crear lista");
      return;
    }
    toast.success("Lista creada");
    setShowCreate(false);
    setForm({ titulo: "", descripcion: "", fecha_entrega: "" });
    navigate(`/deposito/entregas/${data.id}`);
  };

  const visibleLists = lists.filter((l) => (filter === "abiertas" ? l.estado === "abierta" : true));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Truck className="w-5 h-5 text-primary" />
          <div>
            <h1 className="text-xl font-heading font-bold uppercase tracking-wider">Listas de entrega</h1>
            <p className="text-xs text-muted-foreground">Lotes de paquetes por preparar y entregar.</p>
          </div>
        </div>
        <Button variant="gold" size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4 mr-1" /> Nueva
        </Button>
      </div>

      <div className="flex gap-1 border-b border-border">
        {[
          { k: "abiertas", label: "Abiertas" },
          { k: "todas", label: "Todas" },
        ].map((tab) => (
          <button
            key={tab.k}
            onClick={() => setFilter(tab.k as any)}
            className={`px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors ${
              filter === tab.k ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-16 text-center text-muted-foreground animate-pulse">Cargando...</div>
      ) : visibleLists.length === 0 ? (
        <div className="py-16 text-center">
          <Package className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground mb-4">No hay listas de entrega.</p>
          <Button variant="gold" size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4 mr-1" /> Crear la primera
          </Button>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {visibleLists.map((l) => {
            const pct = l.total_items > 0 ? Math.round((l.preparados / l.total_items) * 100) : 0;
            return (
              <Link
                key={l.id}
                to={`/deposito/entregas/${l.id}`}
                className="glass-card rounded-lg p-4 hover:border-primary/50 border border-transparent transition-colors flex items-center gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-foreground truncate">{l.titulo}</span>
                    {l.estado !== "abierta" && (
                      <Badge variant="secondary" className="text-[10px]">
                        {l.estado}
                      </Badge>
                    )}
                  </div>
                  {l.descripcion && (
                    <p className="text-xs text-muted-foreground line-clamp-1 mb-1">{l.descripcion}</p>
                  )}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {l.fecha_entrega && (
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="w-3 h-3" /> {l.fecha_entrega}
                      </span>
                    )}
                    <span>
                      {l.preparados}/{l.total_items} · {pct}%
                    </span>
                  </div>
                  <div className="mt-2 h-1 rounded bg-secondary overflow-hidden">
                    <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </Link>
            );
          })}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva lista de entrega</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Título</Label>
              <Input
                value={form.titulo}
                onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                placeholder="Preventa Invierno 2026 / Pedido Santini / Entregas 18-07"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Descripción (opcional)</Label>
              <Textarea
                value={form.descripcion}
                onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>Fecha de entrega (opcional)</Label>
              <Input
                type="date"
                value={form.fecha_entrega}
                onChange={(e) => setForm({ ...form, fecha_entrega: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
            <Button variant="gold" onClick={handleCreate} disabled={creating}>
              {creating ? "Creando..." : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DepositoEntregas;
