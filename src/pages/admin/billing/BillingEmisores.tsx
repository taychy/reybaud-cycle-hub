import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, ShieldCheck, ShieldAlert, Star, Zap } from "lucide-react";
import { toast } from "sonner";

interface Emisor {
  id: string;
  nombre_fiscal: string;
  cuit: string;
  punto_venta: number;
  activo: boolean;
  cert_pem?: string | null;
  key_pem?: string | null;
  es_predeterminado?: boolean;
  facturacion_automatica?: boolean;
}

interface BillingEmisoresProps {
  onDataChange?: () => void;
}

export function BillingEmisores({ onDataChange }: BillingEmisoresProps = {}) {
  const [emisores, setEmisores] = useState<Emisor[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Emisor | null>(null);
  const [form, setForm] = useState({ nombre_fiscal: "", cuit: "", punto_venta: "1", cert_pem: "", key_pem: "" });
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
    setForm({ nombre_fiscal: "", cuit: "", punto_venta: "1", cert_pem: "", key_pem: "" });
    setDialogOpen(true);
  };

  const openEdit = (e: Emisor) => {
    setEditing(e);
    setForm({
      nombre_fiscal: e.nombre_fiscal,
      cuit: e.cuit,
      punto_venta: String(e.punto_venta),
      cert_pem: e.cert_pem || "",
      key_pem: e.key_pem || "",
    });
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
        cert_pem: form.cert_pem.trim() || null,
        key_pem: form.key_pem.trim() || null,
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
      onDataChange?.();
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
    onDataChange?.();
  };

  const setAsDefault = async (emisor: Emisor) => {
    const newValue = !emisor.es_predeterminado;
    await supabase
      .from("emisores_fiscales")
      .update({ es_predeterminado: newValue } as any)
      .eq("id", emisor.id);
    toast.success(newValue ? `${emisor.nombre_fiscal} es ahora el emisor predeterminado` : "Emisor predeterminado desactivado");
    await load();
    onDataChange?.();
  };

  const toggleAutoFacturacion = async (emisor: Emisor) => {
    await supabase
      .from("emisores_fiscales")
      .update({ facturacion_automatica: !emisor.facturacion_automatica } as any)
      .eq("id", emisor.id);
    toast.success(emisor.facturacion_automatica ? "Facturación automática desactivada" : "Facturación automática activada");
    await load();
    onDataChange?.();
  };

  const hasCerts = (e: Emisor) => !!(e.cert_pem && e.key_pem);

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
                  <div className="flex items-center gap-1 mt-1">
                    {hasCerts(e) ? (
                      <>
                        <ShieldCheck className="w-3.5 h-3.5 text-green-500" />
                        <span className="text-xs text-green-500">Certificado AFIP cargado</span>
                      </>
                    ) : (
                      <>
                        <ShieldAlert className="w-3.5 h-3.5 text-yellow-500" />
                        <span className="text-xs text-yellow-500">Sin certificado AFIP</span>
                      </>
                    )}
                  </div>
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
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
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

            <div className="border-t border-border pt-4 space-y-1">
              <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4" />
                Certificado digital AFIP
              </h4>
              <p className="text-xs text-muted-foreground">
                Pegá el contenido del certificado (.pem/.crt) y la clave privada (.key) para emitir facturas reales contra AFIP.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Certificado (.pem / .crt)</label>
              <Textarea
                placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
                rows={4}
                className="font-mono text-xs"
                value={form.cert_pem}
                onChange={(e) => setForm({ ...form, cert_pem: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Clave privada (.key)</label>
              <Textarea
                placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----"
                rows={4}
                className="font-mono text-xs"
                value={form.key_pem}
                onChange={(e) => setForm({ ...form, key_pem: e.target.value })}
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
