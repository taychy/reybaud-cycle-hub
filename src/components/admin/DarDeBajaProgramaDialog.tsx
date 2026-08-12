import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, AlertTriangle } from "lucide-react";
import { formatPrice } from "@/lib/currency";
import { toast } from "@/hooks/use-toast";

const sb: any = supabase;

interface Preview {
  error?: string;
  alumno?: string;
  email?: string | null;
  plan_nombre?: string;
  estado?: string;
  moneda?: string;
  precio?: number;
  pagado_real?: number;
  saldo?: number;
  pago_ficticio?: boolean;
  mp_payment_id?: string | null;
}

interface Props {
  suscripcionId: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone?: () => void;
}

export default function DarDeBajaProgramaDialog({ suscripcionId, open, onOpenChange, onDone }: Props) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [tratamiento, setTratamiento] = useState("conservar_como_disponible");

  useEffect(() => {
    if (!open || !suscripcionId) return;
    setPreview(null);
    setMotivo("");
    setLoading(true);
    (async () => {
      const { data, error } = await sb.rpc("preview_baja_programa", { _suscripcion_id: suscripcionId });
      setLoading(false);
      if (error) {
        toast({ title: "No se pudo leer la inscripción", description: error.message, variant: "destructive" });
        return;
      }
      const p = data as Preview;
      setPreview(p);
      setTratamiento(Number(p?.pagado_real || 0) > 0 ? "conservar_como_disponible" : "sin_pago");
    })();
  }, [open, suscripcionId]);

  const confirm = async () => {
    if (!suscripcionId) return;
    if (!motivo.trim()) {
      toast({ title: "Escribí el motivo de la baja", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { data, error } = await sb.rpc("dar_de_baja_programa", {
      _suscripcion_id: suscripcionId,
      _motivo: motivo.trim(),
      _tratamiento_pago: tratamiento,
    });
    setSaving(false);
    if (error) {
      toast({ title: "No se pudo dar de baja", description: error.message, variant: "destructive" });
      return;
    }
    const r = (data || {}) as any;
    toast({
      title: r.ya_aplicada ? "La inscripción ya estaba dada de baja" : "Inscripción dada de baja",
      description:
        Number(r.saldo_disponible_alumno || 0) > 0
          ? `Saldo disponible del alumno: ${formatPrice(Number(r.saldo_disponible_alumno), preview?.moneda || "ARS")}`
          : undefined,
    });
    onOpenChange(false);
    onDone?.();
  };

  const moneda = preview?.moneda || "ARS";
  const pagado = Number(preview?.pagado_real || 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Dar de baja del programa</DialogTitle>
          <DialogDescription>
            Se cancela la inscripción y se libera el cupo. Los pagos reales nunca se eliminan.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Verificando…
          </div>
        ) : preview?.error ? (
          <p className="text-sm text-destructive">No se encontró la inscripción.</p>
        ) : preview ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-border p-3 text-sm space-y-1">
              <Row label="Alumno" value={preview.alumno || "—"} />
              <Row label="Programa" value={preview.plan_nombre || "—"} />
              <Row label="Estado actual" value={preview.estado || "—"} />
              <Row label="Precio" value={formatPrice(Number(preview.precio || 0), moneda)} />
              <Row label="Pagado real" value={formatPrice(pagado, moneda)} />
              <Row label="Saldo de la obligación" value={formatPrice(Number(preview.saldo || 0), moneda)} />
            </div>

            {preview.pago_ficticio && (
              <div className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
                <span>
                  Este pago fue cargado a mano y no tiene una operación real asociada. Al dar de baja se
                  neutraliza para no dejar un saldo a favor que nunca ingresó.
                </span>
              </div>
            )}

            {pagado > 0 && !preview.pago_ficticio && (
              <div className="space-y-2">
                <p className="text-sm">
                  Esta inscripción tiene <b>{formatPrice(pagado, moneda)}</b> pagados.
                </p>
                <RadioGroup value={tratamiento} onValueChange={setTratamiento} className="space-y-2">
                  <label className="flex gap-2 items-start rounded-lg border border-border p-3 cursor-pointer">
                    <RadioGroupItem value="conservar_como_disponible" className="mt-0.5" />
                    <span className="text-xs">
                      <b className="text-sm block">Conservar como saldo disponible</b>
                      El pago no se elimina. Quedará disponible en la cuenta del alumno para aplicarlo a otra
                      deuda, total o parcialmente.
                    </span>
                  </label>
                  <label className="flex gap-2 items-start rounded-lg border border-border p-3 cursor-pointer">
                    <RadioGroupItem value="reembolso_externo" className="mt-0.5" />
                    <span className="text-xs">
                      <b className="text-sm block">Registrar que fue reembolsado externamente</b>
                      El dinero se devolvió por fuera del sistema. No queda saldo disponible.
                    </span>
                  </label>
                </RadioGroup>
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-xs">Motivo de baja</Label>
              <Textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={3}
                placeholder="Ej: No realizará el programa. Fue derivado a clase evaluatoria."
              />
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={confirm} disabled={saving || loading || !preview || !!preview?.error}>
            {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Confirmar baja
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between gap-3">
    <span className="text-muted-foreground">{label}</span>
    <span className="font-medium text-right">{value}</span>
  </div>
);
