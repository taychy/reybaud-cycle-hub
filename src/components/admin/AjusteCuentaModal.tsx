import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { MONEDAS } from "@/lib/currency";
import { toast } from "sonner";

export interface AjusteCuentaValue {
  id?: string;
  tipo: "cargo" | "credito";
  concepto: string;
  monto: number;
  moneda: string;
  fecha: string;
  notas?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  alumnoId: string;
  initialValue: AjusteCuentaValue | null;
  onSaved: () => void;
}

export function AjusteCuentaModal({ open, onOpenChange, alumnoId, initialValue, onSaved }: Props) {
  const today = new Date().toISOString().substring(0, 10);
  const [tipo, setTipo] = useState<"cargo" | "credito">("cargo");
  const [concepto, setConcepto] = useState("");
  const [monto, setMonto] = useState<string>("");
  const [moneda, setMoneda] = useState("ARS");
  const [fecha, setFecha] = useState(today);
  const [notas, setNotas] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTipo(initialValue?.tipo || "cargo");
      setConcepto(initialValue?.concepto || "");
      setMonto(initialValue?.monto ? String(initialValue.monto) : "");
      setMoneda(initialValue?.moneda || "ARS");
      setFecha(initialValue?.fecha ? initialValue.fecha.substring(0, 10) : today);
      setNotas(initialValue?.notas || "");
    }
  }, [open, initialValue, today]);

  const handleSave = async () => {
    const montoNum = parseFloat(monto);
    if (!concepto.trim()) {
      toast.error("Indicá un concepto");
      return;
    }
    if (!montoNum || montoNum <= 0) {
      toast.error("Monto inválido");
      return;
    }

    setSaving(true);
    const payload = {
      alumno_id: alumnoId,
      tipo,
      concepto: concepto.trim(),
      monto: montoNum,
      moneda,
      fecha,
      notas: notas.trim() || null,
    };

    let error;
    if (initialValue?.id) {
      ({ error } = await supabase.from("cuenta_ajustes").update(payload).eq("id", initialValue.id));
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      ({ error } = await supabase.from("cuenta_ajustes").insert({
        ...payload,
        created_by: user?.id || null,
      }));
    }
    setSaving(false);

    if (error) {
      console.error(error);
      toast.error("No se pudo guardar el ajuste");
      return;
    }
    toast.success(initialValue?.id ? "Ajuste actualizado" : "Ajuste registrado");
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{initialValue?.id ? "Editar ajuste" : "Nuevo ajuste manual"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Tipo</Label>
              <Select value={tipo} onValueChange={(v: any) => setTipo(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cargo">Cargo (debe)</SelectItem>
                  <SelectItem value="credito">Crédito (a favor)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Moneda</Label>
              <Select value={moneda} onValueChange={setMoneda}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONEDAS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Concepto</Label>
            <Input value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Ej: Multa por baja anticipada" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Monto</Label>
              <Input type="number" min="0" step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Fecha</Label>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Notas (opcional)</Label>
            <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
