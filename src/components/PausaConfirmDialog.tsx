import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, PauseCircle, Check, X, HeartPulse, Palmtree } from "lucide-react";
import { cn } from "@/lib/utils";

export type PausaTipo = "lesion" | "vacaciones";

export interface PausaConfirmData {
  fechaRegreso: string;
  tipo: PausaTipo;
  motivo: string;
}

interface PausaConfirmDialogProps {
  open: boolean;
  alumnoId: string;
  planNombre: string;
  onCancel: () => void;
  /** Recibe la fecha de regreso confirmada, el tipo y el motivo (opcional). */
  onConfirm: (data: PausaConfirmData) => void;
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

  const [step, setStep] = useState<"tipo" | "detalle">("tipo");
  const [tipo, setTipo] = useState<PausaTipo | null>(null);
  const [motivo, setMotivo] = useState("");
  const [fechaRegreso, setFechaRegreso] = useState("");
  const [activeSubs, setActiveSubs] = useState<ActiveSub[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    // Reset al abrir
    setStep("tipo");
    setTipo(null);
    setMotivo("");
    setFechaRegreso("");
  }, [open]);

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

  const pickTipo = (t: PausaTipo) => {
    setTipo(t);
    setStep("detalle");
  };

  const handleConfirm = () => {
    if (!tipo) return;
    // Fecha opcional: si no la eligió, usamos el default (+30 días)
    const finalFecha = fechaRegreso || defaultDate;
    if (finalFecha < minDate || finalFecha > maxDate) return;
    onConfirm({ fechaRegreso: finalFecha, tipo, motivo: motivo.trim() });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-md max-h-[85dvh] overflow-y-auto overscroll-contain">
        {step === "tipo" && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-full bg-amber-500/10 flex items-center justify-center">
                  <PauseCircle className="w-5 h-5 text-amber-400" />
                </div>
                <DialogTitle>¿Por qué querés pausar?</DialogTitle>
              </div>
              <DialogDescription className="pt-2">
                Contanos el motivo. En cualquier caso te ofrecemos el <span className="font-medium text-foreground">Plan Reducido</span> para que no pierdas tu lugar en la comunidad ni en los grupos de WhatsApp.
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-1 gap-3">
              <button
                type="button"
                onClick={() => pickTipo("lesion")}
                className={cn(
                  "group relative w-full text-left rounded-xl border border-border bg-card/60 hover:bg-card p-4",
                  "hover:border-rose-500/50 transition-colors"
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-rose-500/10 flex items-center justify-center shrink-0">
                    <HeartPulse className="w-5 h-5 text-rose-400" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Lesión o enfermedad</p>
                    <p className="text-sm text-muted-foreground">
                      Necesito parar por un tema de salud.
                    </p>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => pickTipo("vacaciones")}
                className={cn(
                  "group relative w-full text-left rounded-xl border border-border bg-card/60 hover:bg-card p-4",
                  "hover:border-sky-500/50 transition-colors"
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-sky-500/10 flex items-center justify-center shrink-0">
                    <Palmtree className="w-5 h-5 text-sky-400" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Vacaciones o descanso</p>
                    <p className="text-sm text-muted-foreground">
                      Me voy de viaje o quiero desconectar un tiempo.
                    </p>
                  </div>
                </div>
              </button>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onCancel} className="w-full sm:w-auto">
                Cancelar
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "detalle" && tipo && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    "w-9 h-9 rounded-full flex items-center justify-center",
                    tipo === "lesion" ? "bg-rose-500/10" : "bg-sky-500/10"
                  )}
                >
                  {tipo === "lesion" ? (
                    <HeartPulse className="w-5 h-5 text-rose-400" />
                  ) : (
                    <Palmtree className="w-5 h-5 text-sky-400" />
                  )}
                </div>
                <DialogTitle>Activar {planNombre}</DialogTitle>
              </div>
              <DialogDescription className="pt-2">
                {tipo === "lesion"
                  ? "Cuando te recuperes, reactivás tu plan original en un click. Mientras tanto seguís en la comunidad."
                  : "Cuando vuelvas, reactivás tu plan original en un click. Mientras tanto seguís en la comunidad."}
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

              {/* Motivo (opcional) */}
              <div className="space-y-1.5">
                <Label htmlFor="motivo-pausa" className="text-sm">
                  Contanos un poco más <span className="text-muted-foreground text-xs">(opcional)</span>
                </Label>
                <Textarea
                  id="motivo-pausa"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value.slice(0, 300))}
                  placeholder={
                    tipo === "lesion"
                      ? "Ej: cirugía de rodilla, gripe fuerte, lumbalgia…"
                      : "Ej: viaje familiar 3 semanas, mudanza, examen…"
                  }
                  rows={2}
                />
              </div>

              {/* Fecha de regreso (opcional) */}
              <div className="space-y-1.5">
                <Label htmlFor="fecha-regreso" className="text-sm">
                  Fecha estimada de regreso <span className="text-muted-foreground text-xs">(opcional)</span>
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
                  Si no la sabés, usamos {formatHuman(defaultDate)} como estimado. Podés reactivar antes cuando quieras. Máximo hasta {formatHuman(maxDate)}.
                </p>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-2">
              <Button variant="outline" onClick={() => setStep("tipo")}>
                Atrás
              </Button>
              <Button
                variant="gold"
                onClick={handleConfirm}
                disabled={!!fechaRegreso && (fechaRegreso < minDate || fechaRegreso > maxDate)}
              >
                Continuar
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default PausaConfirmDialog;
