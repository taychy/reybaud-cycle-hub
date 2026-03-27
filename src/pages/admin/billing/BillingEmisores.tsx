import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil } from "lucide-react";
import { toast } from "sonner";

interface Emisor {
  id: string;
  nombre_fiscal: string;
  cuit: string;
  punto_venta: number;
  activo: boolean;
}

interface BillingEmisoresProps {
  onDataChange?: () => void;
}

export function BillingEmisores({ onDataChange }: BillingEmisoresProps = {}) {
  const [emisores, setEmisores] = useState<Emisor[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Emisor | null>(null);
  const [form, setForm] = useState({ nombre_fiscal: "", cuit: "", punto_venta: "1" });
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("emisores_fiscales")
      .select("*")
      .order("created_at", { ascending: true });
    setEmisores((data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditing(null);
    setForm({ nombre_fiscal: "", cuit: "", punto_venta: "1" });
    setDialogOpen(true);
  };

  const openEdit = (e: Emisor) => {
    setEditing(e);
    setForm({ nombre_fiscal: e.nombre_fiscal, cuit: e.cuit, punto_venta: String(e.punto_venta) });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.nombre_fiscal.trim() || !form.cuit.trim()) {
      toast.error("Completá nombre fiscal y CUIT");
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        nombre_fiscal: form.nombre_fiscal.trim(),
        cuit: form.cuit.trim(),
        punto_venta: parseInt(form.punto_venta) || 1,
      };

      if (editing) {
        const { error } = await supabase
          .from("emisores_fiscales")
          .update(payload as any)
          .eq("id", editing.id);
        if (error) throw error;
        toast.success("Emisor actualizado");
      } else {
        const { error } = await supabase
          .from("emisores_fiscales")
          .insert(payload as any);
        if (error) throw error;
        toast.success("Emisor creado");
      }

      setDialogOpen(false);
      await load();
    } catch {
      toast.error("Error al guardar");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (emisor: Emisor) => {
    await supabase
      .from("emisores_fiscales")
      .update({ activo: !emisor.activo } as any)
      .eq("id", emisor.id);
    await load();
  };

  if (loading) return <div className="text-muted-foreground text-center py-8">Cargando...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-heading font-semibold text-muted-foreground uppercase tracking-wider">
          Emisores fiscales ({emisores.length})
        </h3>
        <Button size="sm" onClick={openNew}>
          <Plus className="w-4 h-4 mr-1" /> Nuevo emisor
        </Button>
      </div>

      {emisores.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          No hay emisores configurados. Agregá al menos uno para poder facturar.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {emisores.map((e) => (
            <div
              key={e.id}
              className={`rounded-xl border p-4 space-y-2 transition-colors ${
                e.activo ? "border-border bg-card" : "border-border/50 bg-card/50 opacity-60"
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">{e.nombre_fiscal}</p>
                  <p className="text-xs text-muted-foreground">CUIT: {e.cuit}</p>
                  <p className="text-xs text-muted-foreground">Pto. Venta: {e.punto_venta}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(e)}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Switch checked={e.activo} onCheckedChange={() => toggleActive(e)} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading">
              {editing ? "Editar emisor" : "Nuevo emisor fiscal"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Nombre fiscal</label>
              <Input
                placeholder="Ej: Juan Pérez"
                value={form.nombre_fiscal}
                onChange={(e) => setForm({ ...form, nombre_fiscal: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">CUIT</label>
              <Input
                placeholder="Ej: 20-12345678-9"
                value={form.cuit}
                onChange={(e) => setForm({ ...form, cuit: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Punto de venta</label>
              <Input
                type="number"
                min={1}
                value={form.punto_venta}
                onChange={(e) => setForm({ ...form, punto_venta: e.target.value })}
              />
            </div>
            <Button className="w-full" disabled={submitting} onClick={handleSave}>
              {submitting ? "Guardando..." : editing ? "Actualizar" : "Crear emisor"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
