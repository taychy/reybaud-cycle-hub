import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

interface Emisor {
  id: string;
  nombre_fiscal: string;
  cuit: string;
  punto_venta: number;
  activo: boolean;
}

interface FacturaRow {
  id: string;
  cliente_nombre: string;
  cliente_cuit: string | null;
  condicion_fiscal: string;
  concepto: string;
  monto: number;
  emisor_id: string | null;
}

interface Props {
  factura: FacturaRow | null;
  emisores: Emisor[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEmitted: () => void;
}

const CONDICIONES = [
  { value: "consumidor_final", label: "Consumidor Final" },
  { value: "monotributista", label: "Monotributista" },
  { value: "resp_inscripto", label: "Responsable Inscripto" },
  { value: "exento", label: "Exento" },
];

export function InvoiceModal({ factura, emisores, open, onOpenChange, onEmitted }: Props) {
  const [emisorId, setEmisorId] = useState<string>(factura?.emisor_id || "");
  const [clienteCuit, setClienteCuit] = useState(factura?.cliente_cuit || "");
  const [condicion, setCondicion] = useState(factura?.condicion_fiscal || "consumidor_final");
  const [submitting, setSubmitting] = useState(false);

  if (!factura) return null;

  const activeEmisores = emisores.filter((e) => e.activo);

  const handleEmit = async () => {
    if (!emisorId) {
      toast.error("Seleccioná un emisor fiscal");
      return;
    }
    setSubmitting(true);
    try {
      // TODO: Integración real con AFIP via edge function
      // Por ahora, registrar la factura como emitida con datos manuales
      const now = new Date().toISOString();
      const emisor = emisores.find((e) => e.id === emisorId);
      const fakeComprobante = `FC-${emisor?.punto_venta?.toString().padStart(4, "0") || "0001"}-${String(Date.now()).slice(-8)}`;

      const { error } = await supabase
        .from("facturas")
        .update({
          emisor_id: emisorId,
          cliente_cuit: clienteCuit.trim() || null,
          condicion_fiscal: condicion,
          estado: "emitida",
          numero_comprobante: fakeComprobante,
          fecha_emision: now,
        } as any)
        .eq("id", factura.id);

      if (error) throw error;

      toast.success(`Factura ${fakeComprobante} registrada`);
      onOpenChange(false);
      onEmitted();
    } catch (err) {
      console.error(err);
      toast.error("Error al emitir la factura");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">Generar factura</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1">
            <p className="text-sm font-semibold text-foreground">{factura.cliente_nombre}</p>
            <p className="text-xs text-muted-foreground">{factura.concepto}</p>
            <p className="text-lg font-heading font-bold text-primary">
              ${factura.monto.toLocaleString("es-AR")}
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">DNI / CUIT del cliente</label>
            <Input
              placeholder="Ej: 20-12345678-9"
              value={clienteCuit}
              onChange={(e) => setClienteCuit(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Condición fiscal</label>
            <Select value={condicion} onValueChange={setCondicion}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONDICIONES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Emisor fiscal</label>
            {activeEmisores.length === 0 ? (
              <p className="text-xs text-destructive">No hay emisores activos. Configuralos en la pestaña Emisores.</p>
            ) : (
              <Select value={emisorId} onValueChange={setEmisorId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar emisor..." />
                </SelectTrigger>
                <SelectContent>
                  {activeEmisores.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.nombre_fiscal} — {e.cuit}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <Button
            className="w-full"
            disabled={submitting || activeEmisores.length === 0}
            onClick={handleEmit}
          >
            {submitting ? "Emitiendo..." : "Emitir factura"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
