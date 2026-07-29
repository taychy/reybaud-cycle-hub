import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Plus, Mail, Phone, Globe, Pencil, Truck } from "lucide-react";

interface Supplier {
  id: string;
  nombre: string;
  email: string | null;
  email_cc: string | null;
  telefono: string | null;
  sitio_web: string | null;
  notas: string | null;
  activo: boolean;
}

const empty = (): Partial<Supplier> => ({
  nombre: "", email: "", email_cc: "", telefono: "", sitio_web: "", notas: "", activo: true,
});

const StoreSuppliers = () => {
  const { toast } = useToast();
  const [rows, setRows] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<Supplier>>(empty());

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("store_suppliers")
      .select("id, nombre, email, email_cc, telefono, sitio_web, notas, activo")
      .order("nombre");
    setRows((data as any) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.nombre?.trim()) {
      toast({ title: "Falta el nombre", variant: "destructive" });
      return;
    }
    const payload = {
      nombre: form.nombre.trim(),
      email: form.email?.trim() || null,
      email_cc: form.email_cc?.trim() || null,
      telefono: form.telefono?.trim() || null,
      sitio_web: form.sitio_web?.trim() || null,
      notas: form.notas?.trim() || null,
      activo: form.activo !== false,
    };
    const { error } = form.id
      ? await supabase.from("store_suppliers").update(payload).eq("id", form.id)
      : await supabase.from("store_suppliers").insert(payload);
    if (error) {
      toast({ title: "Error al guardar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Proveedor guardado" });
    setOpen(false);
    setForm(empty());
    load();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-heading font-bold flex items-center gap-2">
            <Truck className="w-5 h-5 text-primary" /> Proveedores
          </h1>
          <p className="text-sm text-muted-foreground">
            Cargá el email de cada proveedor: desde Ventas podés avisarle un pedido con un click.
          </p>
        </div>
        <Button onClick={() => { setForm(empty()); setOpen(true); }}>
          <Plus className="w-4 h-4 mr-2" /> Nuevo proveedor
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando...</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay proveedores cargados.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((s) => (
            <div key={s.id} className="rounded-xl border border-border bg-card p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-heading font-semibold">{s.nombre}</p>
                  {!s.activo && <span className="text-[10px] uppercase text-muted-foreground">Inactivo</span>}
                </div>
                <Button size="sm" variant="ghost" onClick={() => { setForm(s); setOpen(true); }}>
                  <Pencil className="w-4 h-4" />
                </Button>
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                <p className="flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5" />
                  {s.email || <span className="text-destructive">Sin email de pedidos</span>}
                  {s.email_cc ? ` · CC: ${s.email_cc}` : ""}
                </p>
                {s.telefono && <p className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> {s.telefono}</p>}
                {s.sitio_web && <p className="flex items-center gap-1.5"><Globe className="w-3.5 h-3.5" /> {s.sitio_web}</p>}
                {s.notas && <p className="pt-1 whitespace-pre-line">{s.notas}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">{form.id ? "Editar proveedor" : "Nuevo proveedor"}</DialogTitle>
            <DialogDescription>Estos datos se usan para enviarle los pedidos por email.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Nombre</Label>
              <Input value={form.nombre || ""} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Email de pedidos</Label>
              <Input type="email" value={form.email || ""} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="ventas@proveedor.com" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Email en copia (opcional)</Label>
              <Input type="email" value={form.email_cc || ""} onChange={(e) => setForm((f) => ({ ...f, email_cc: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Teléfono</Label>
                <Input value={form.telefono || ""} onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Sitio web</Label>
                <Input value={form.sitio_web || ""} onChange={(e) => setForm((f) => ({ ...f, sitio_web: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notas internas</Label>
              <Textarea rows={2} value={form.notas || ""} onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))} />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <Label className="text-xs">Activo</Label>
              <Switch checked={form.activo !== false} onCheckedChange={(v) => setForm((f) => ({ ...f, activo: v }))} />
            </div>
            <Button className="w-full" onClick={save}>Guardar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StoreSuppliers;
