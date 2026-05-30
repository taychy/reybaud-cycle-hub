import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { AlertTriangle, PauseCircle, Check, X } from "lucide-react";

interface PausaConfirmDialogProps {
  open: boolean;
  alumnoId: string;
  planNombre: string;
  onCancel: () => void;
  /** Recibe la fecha de regreso confirmada (YYYY-MM-DD). */
  onConfirm: (fechaRegreso: string) => void;
}

interface ActiveSub {
  id: string;
  plan_nombre: string;
  categoria: string;
  fecha_fin: string | null;
}

/** Hoy en formato YYYY-MM-DD (local). */
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Suma `days` días a una fecha YYYY-MM-DD y devuelve YYYY-MM-DD. */
const addDays = (yyyymmdd: string, days: number) => {
  const [y, m, d] = yyyymmdd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
};

const formatHuman = (yyyymmdd: string) => {
  const [y, m, d] = yyyymmdd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" });
};

const CATEGORIA_LABEL: Record<string, string> = {
  grupal: "Grupal",
  pista: "Pista",
  asesoria: "Asesoría",
};

const PausaConfirmDialog = ({ open, alumnoId, planNombre, onCancel, onConfirm }: PausaConfirmDialogProps) => {
  const today = todayStr();
  const minDate = addDays(today, 7);
  const maxDate = addDays(today, 60);
  const defaultDate = addDays(today, 30);

  const [fechaRegreso, setFechaRegreso] = useState(defaultDate);
  const [activeSubs, setActiveSubs] = useState<ActiveSub[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open || !alumnoId) return;
    let cancel = false;
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from("suscripciones")
        .select("id, fecha_fin, planes(nombre, categoria)")
        .eq("alumno_id", alumnoId)
        .in("estado", ["activa", "pendiente", "pendiente_verificacion", "pago_pendiente", "acceso_pausado"])
        .is("cancelada_at", null);
      if (cancel) return;
      const subs = ((data as any[]) || [])
        .filter((s) => ["grupal", "pista", "asesoria"].includes(s.planes?.categoria))
        .map((s) => ({
          id: s.id,
          plan_nombre: s.planes?.nombre || "Plan",
          categoria: s.planes?.categoria,
          fecha_fin: s.fecha_fin,
        }));
      setActiveSubs(subs);
      setLoading(false);
    })();
    return () => {
      cancel = true;
    };
  }, [open, alumnoId]);

  const handleConfirm = () => {
    if (!fechaRegreso || fechaRegreso < minDate || fechaRegreso > maxDate) return;
    onConfirm(fechaRegreso);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-amber-500/10 flex items-center justify-center">
              <PauseCircle className="w-5 h-5 text-amber-400" />
            </div>
            <DialogTitle>Activar {planNombre}</DialogTitle>
          </div>
          <DialogDescription className="pt-2">
            Pausá tu plan por el motivo que necesites: vacaciones, lesión, enfermedad o simplemente un descanso. Tu lugar en la escuela y la comunidad se mantiene.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Qué pasa cuando se activa */}
          <div className="rounded-lg border border-border bg-card/60 p-3 space-y-2 text-sm">
            <p className="font-medium text-foreground">Mientras estés en pausa:</p>
            <ul className="space-y-1.5">
              <li className="flex gap-2 items-start text-muted-foreground">
                <Check className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                <span>Seguís en el grupo de WhatsApp y la comunidad</span>
              </li>
              <li className="flex gap-2 items-start text-muted-foreground">
                <Check className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                <span>Podés ver eventos y comprar en la tienda</span>
              </li>
              <li className="flex gap-2 items-start text-muted-foreground">
                <X className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                <span>No tenés acceso a entrenamientos ni clases en la app</span>
              </li>
              <li className="flex gap-2 items-start text-muted-foreground">
                <X className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                <span>No podés asistir a Pista ni a Asesoría</span>
              </li>
            </ul>
          </div>

          {/* Suscripciones que se cancelan */}
          {!loading && activeSubs.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-2 text-sm">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                <p className="text-foreground">
                  Se van a cancelar estos planes (mantenés acceso hasta su fecha de vencimiento):
                </p>
              </div>
              <ul className="space-y-1 pl-6">
                {activeSubs.map((s) => (
                  <li key={s.id} className="text-muted-foreground">
                    <span className="text-foreground font-medium">{s.plan_nombre}</span>
                    <span className="text-xs"> · {CATEGORIA_LABEL[s.categoria] || s.categoria}</span>
                    {s.fecha_fin && (
                      <span className="text-xs"> · hasta {formatHuman(s.fecha_fin.substring(0, 10))}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Fecha de regreso */}
          <div className="space-y-1.5">
            <Label htmlFor="fecha-regreso" className="text-sm">
              Fecha estimada de regreso <span className="text-destructive">*</span>
            </Label>
            <Input
              id="fecha-regreso"
              type="date"
              value={fechaRegreso}
              min={minDate}
              max={maxDate}
              onChange={(e) => setFechaRegreso(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              La pausa dura entre 7 días y 2 meses. Si no reactivás antes del {formatHuman(maxDate)}, tu cuenta pasa a inactiva y tenés que volver a contratar un plan.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button variant="gold" onClick={handleConfirm} disabled={!fechaRegreso || fechaRegreso < minDate || fechaRegreso > maxDate}>
            Continuar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PausaConfirmDialog;
