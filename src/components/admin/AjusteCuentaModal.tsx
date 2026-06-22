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
import { PAYMENT_METHODS, type PaymentMethodKey } from "@/lib/paymentMethods";
import { toast } from "sonner";

export interface AjusteCuentaValue {
  id?: string;
  tipo: "cargo" | "credito";
  concepto: string;
  monto: number;
  moneda: string;
  fecha: string;
  notas?: string;
  medio_pago?: string | null;
  cuenta_mp_id?: string | null;
  referencia_externa?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  alumnoId: string;
  initialValue: AjusteCuentaValue | null;
  onSaved: () => void;
}

const NONE = "__none__";

// Auto-resolve cuenta_mp_id from PaymentMethodKey when slug matches
const MP_KEYS: PaymentMethodKey[] = ["mp_externo_josi", "mp_externo_scarlett", "mp_externo_claudio", "mercadopago"];

export function AjusteCuentaModal({ open, onOpenChange, alumnoId, initialValue, onSaved }: Props) {
  const today = new Date().toISOString().substring(0, 10);
  const [tipo, setTipo] = useState<"cargo" | "credito">("cargo");
  const [concepto, setConcepto] = useState("");
  const [monto, setMonto] = useState<string>("");
  const [moneda, setMoneda] = useState("ARS");
  const [fecha, setFecha] = useState(today);
  const [notas, setNotas] = useState("");
  const [medioPago, setMedioPago] = useState<string>(NONE);
  const [cuentaMpId, setCuentaMpId] = useState<string | null>(null);
  const [referenciaExterna, setReferenciaExterna] = useState("");
  const [cuentasMp, setCuentasMp] = useState<Array<{ id: string; slug: string; alias: string | null; titular: string | null }>>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTipo(initialValue?.tipo || "cargo");
      setConcepto(initialValue?.concepto || "");
      setMonto(initialValue?.monto ? String(initialValue.monto) : "");
      setMoneda(initialValue?.moneda || "ARS");
      setFecha(initialValue?.fecha ? initialValue.fecha.substring(0, 10) : today);
      setNotas(initialValue?.notas || "");
      setMedioPago(initialValue?.medio_pago || NONE);
      setCuentaMpId(initialValue?.cuenta_mp_id || null);
      setReferenciaExterna(initialValue?.referencia_externa || "");
    }
  }, [open, initialValue, today]);

  // Load MP accounts once
  useEffect(() => {
    supabase
      .from("cuentas_mp" as any)
      .select("id, slug, alias, titular")
      .eq("activa", true)
      .order("titular")
      .then(({ data }) => setCuentasMp(((data as any) || [])));
  }, []);

  // Auto-resolve cuenta_mp_id when medio_pago matches a known MP slug
  useEffect(() => {
    if (!medioPago || medioPago === NONE) {
      setCuentaMpId(null);
      return;
    }
    if (MP_KEYS.includes(medioPago as PaymentMethodKey)) {
      // slug in cuentas_mp tipically: "josi" | "scarlett" | "claudio"
      const slugGuess = medioPago.replace("mp_externo_", "");
      const found = cuentasMp.find((c) => c.slug === slugGuess);
      setCuentaMpId(found?.id || null);
    } else {
      setCuentaMpId(null);
    }
  }, [medioPago, cuentasMp]);

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
    const payload: any = {
      alumno_id: alumnoId,
      tipo,
      concepto: concepto.trim(),
      monto: montoNum,
      moneda,
      fecha,
      notas: notas.trim() || null,
      medio_pago: medioPago === NONE ? null : medioPago,
      cuenta_mp_id: cuentaMpId,
      referencia_externa: referenciaExterna.trim() || null,
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

          {/* Medio de pago / cuenta (opcional, aplica a ambos tipos) */}
          <div className="space-y-1.5">
            <Label className="text-xs">
              Medio de pago <span className="text-muted-foreground">(opcional)</span>
            </Label>
            <Select value={medioPago} onValueChange={setMedioPago}>
              <SelectTrigger><SelectValue placeholder="Sin especificar" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Sin especificar / Otro</SelectItem>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {medioPago !== NONE && MP_KEYS.includes(medioPago as PaymentMethodKey) && (
              <p className="text-[10px] text-muted-foreground">
                {cuentaMpId ? "✓ Cuenta MP vinculada automáticamente" : "⚠ No se encontró cuenta MP activa para este medio"}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">N° operación / referencia <span className="text-muted-foreground">(opcional)</span></Label>
            <Input
              value={referenciaExterna}
              onChange={(e) => setReferenciaExterna(e.target.value)}
              placeholder="Ej: 162457893 · CBU últimos 4 · Nº recibo"
            />
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
