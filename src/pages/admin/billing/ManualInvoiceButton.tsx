import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { Plus } from "lucide-react";
import { toast } from "sonner";

interface Emisor {
  id: string;
  nombre_fiscal: string;
  cuit: string;
  activo: boolean;
}

const CONDICIONES = [
  { value: "consumidor_final", label: "Consumidor Final" },
  { value: "monotributista", label: "Monotributista" },
  { value: "resp_inscripto", label: "Responsable Inscripto" },
  { value: "exento", label: "Exento" },
];

interface Props {
  emisores: Emisor[];
  onCreated: () => void;
}

export function ManualInvoiceButton({ emisores, onCreated }: Props) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    cliente_nombre: "",
    cliente_cuit: "",
    condicion_fiscal: "consumidor_final",
    concepto: "",
    monto: "",
  });

  const resetForm = () =>
    setForm({ cliente_nombre: "", cliente_cuit: "", condicion_fiscal: "consumidor_final", concepto: "", monto: "" });

  const handleCreate = async () => {
    if (!form.cliente_nombre.trim() || !form.concepto.trim() || !form.monto) {
      toast.error("Completá cliente, concepto y monto");
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.from("facturas").insert({
        cliente_nombre: form.cliente_nombre.trim(),
        cliente_cuit: form.cliente_cuit.trim() || null,
        condicion_fiscal: form.condicion_fiscal,
        concepto: form.concepto.trim(),
        monto: parseFloat(form.monto),
        referencia_tipo: "manual",
        estado: "sin_factura",
      } as any);

      if (error) throw error;

      toast.success("Pago registrado para facturar");
      setOpen(false);
      resetForm();
      onCreated();
    } catch {
      toast.error("Error al registrar");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="w-4 h-4 mr-1" /> Registrar pago
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-heading">Registrar pago para facturar</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Cliente</label>
            <Input
              placeholder="Nombre del cliente"
              value={form.cliente_nombre}
              onChange={(e) => setForm({ ...form, cliente_nombre: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">DNI / CUIT (opcional)</label>
            <Input
              placeholder="Ej: 20-12345678-9"
              value={form.cliente_cuit}
              onChange={(e) => setForm({ ...form, cliente_cuit: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Condición fiscal</label>
            <Select value={form.condicion_fiscal} onValueChange={(v) => setForm({ ...form, condicion_fiscal: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CONDICIONES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Concepto</label>
            <Input
              placeholder="Ej: Cuota mensual G2"
              value={form.concepto}
              onChange={(e) => setForm({ ...form, concepto: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Monto</label>
            <Input
              type="number"
              placeholder="Ej: 25000"
              min={0}
              value={form.monto}
              onChange={(e) => setForm({ ...form, monto: e.target.value })}
            />
          </div>
          <Button className="w-full" disabled={submitting} onClick={handleCreate}>
            {submitting ? "Guardando..." : "Registrar pago"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
