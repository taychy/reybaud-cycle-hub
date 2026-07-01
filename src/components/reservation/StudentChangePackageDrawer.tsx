import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Package, Info, CheckCircle2, Clock, XCircle } from "lucide-react";
import {
  previewPackageChange, applyPackageChange, type PackageChangePreview,
} from "@/lib/packageChangePreview";
import PackageChangePreviewCard from "@/components/admin/PackageChangePreviewCard";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  reservationId: string;
  eventId: string;
  alumnoId: string;
  currentPackageId?: string | null;
  eventTitle?: string;
  onSubmitted?: () => void;
}

interface PackageOption {
  id: string;
  nombre: string;
  activo: boolean;
  sort_order: number | null;
}

interface PendingRequest {
  id: string;
  estado: string;
  package_nuevo_id: string;
  package_actual_id: string | null;
  motivo_alumno: string | null;
  nota_admin: string | null;
  created_at: string;
  resolved_at: string | null;
  applied_at: string | null;
}

const ESTADO_BADGE: Record<string, { label: string; className: string; icon: any }> = {
  pendiente: { label: "Pendiente de revisión", className: "bg-amber-500/15 text-amber-400 border-amber-500/40", icon: Clock },
  aprobada: { label: "Aprobada · esperando aplicar", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40", icon: CheckCircle2 },
  aplicada: { label: "Aplicada", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40", icon: CheckCircle2 },
  rechazada: { label: "Rechazada", className: "bg-destructive/15 text-destructive border-destructive/40", icon: XCircle },
  expirada: { label: "Expirada", className: "bg-muted text-muted-foreground border-border", icon: XCircle },
  cancelada: { label: "Cancelada", className: "bg-muted text-muted-foreground border-border", icon: XCircle },
};

export default function StudentChangePackageDrawer({
  open, onOpenChange, reservationId, eventId, alumnoId, currentPackageId, eventTitle, onSubmitted,
}: Props) {
  const [packages, setPackages] = useState<PackageOption[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [preview, setPreview] = useState<PackageChangePreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pending, setPending] = useState<PendingRequest | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const loadPending = async () => {
    const { data } = await supabase
      .from("event_package_change_requests" as any)
      .select("id, estado, package_nuevo_id, package_actual_id, motivo_alumno, nota_admin, created_at, resolved_at, applied_at")
      .eq("reservation_id", reservationId)
      .in("estado", ["pendiente", "aprobada"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setPending((data as any) || null);
  };

  useEffect(() => {
    if (!open) return;
    setSelectedId("");
    setPreview(null);
    setMotivo("");
    supabase.from("event_packages")
      .select("id, nombre, activo, sort_order")
      .eq("event_id", eventId)
      .eq("activo", true)
      .order("sort_order")
      .then(({ data }) => setPackages((data as any) || []));
    loadPending();
  }, [open, eventId, reservationId]);

  useEffect(() => {
    if (!selectedId) { setPreview(null); return; }
    setLoadingPreview(true);
    previewPackageChange(reservationId, selectedId)
      .then(setPreview)
      .catch(e => toast.error("No se pudo simular el cambio", { description: e.message }))
      .finally(() => setLoadingPreview(false));
  }, [selectedId, reservationId]);

  const options = useMemo(
    () => packages.filter(p => p.id !== currentPackageId),
    [packages, currentPackageId],
  );

  const handleSubmit = async () => {
    if (!preview || !selectedId) return;
    if (preview.status === "no_posible") {
      toast.error("Este cambio no es posible. Contactá al equipo si querés analizarlo.");
      return;
    }
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("event_package_change_requests" as any).insert({
        reservation_id: reservationId,
        alumno_id: alumnoId,
        event_id: eventId,
        package_actual_id: preview.package_actual?.id || currentPackageId || null,
        package_nuevo_id: selectedId,
        estado: "pendiente",
        preview_snapshot: preview as any,
        motivo_alumno: motivo.trim() || null,
        requested_by: user?.id || null,
      });
      if (error) throw error;
      toast.success("Solicitud enviada", {
        description: "Nuestro equipo la revisa y te avisa por email.",
      });
      onSubmitted?.();
      await loadPending();
      setSelectedId("");
      setMotivo("");
    } catch (e: any) {
      toast.error("No se pudo enviar la solicitud", { description: e.message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!pending) return;
    setCancelling(true);
    try {
      const { error } = await supabase
        .from("event_package_change_requests" as any)
        .update({ estado: "cancelada", resolved_at: new Date().toISOString() })
        .eq("id", pending.id);
      if (error) throw error;
      toast.success("Solicitud cancelada");
      await loadPending();
    } catch (e: any) {
      toast.error("No se pudo cancelar", { description: e.message });
    } finally {
      setCancelling(false);
    }
  };

  const pendingBadge = pending ? ESTADO_BADGE[pending.estado] : null;
  const pendingPackage = pending ? packages.find(p => p.id === pending.package_nuevo_id) : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[92vh] overflow-y-auto pb-safe">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" /> Cambiar mi paquete
          </SheetTitle>
          <SheetDescription>
            {eventTitle ? `${eventTitle} · ` : ""}Simulá el cambio y enviá la solicitud. La aprueba el equipo de Reybaud.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 mt-4">
          {/* Solicitud pendiente */}
          {pending && pendingBadge && (
            <div className="rounded-lg border border-border bg-card/40 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Badge variant="outline" className={pendingBadge.className}>
                  <pendingBadge.icon className="w-3 h-3 mr-1" /> {pendingBadge.label}
                </Badge>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(pending.created_at).toLocaleDateString("es-AR", { day: "numeric", month: "short" })}
                </span>
              </div>
              <div className="text-xs">
                <p className="text-muted-foreground">Solicitaste cambiar a</p>
                <p className="font-medium">{pendingPackage?.nombre || "—"}</p>
              </div>
              {pending.motivo_alumno && (
                <p className="text-xs text-muted-foreground italic">"{pending.motivo_alumno}"</p>
              )}
              {pending.nota_admin && (
                <div className="text-xs bg-muted/40 rounded p-2">
                  <p className="text-muted-foreground text-[10px] mb-0.5">Nota del equipo</p>
                  <p>{pending.nota_admin}</p>
                </div>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-destructive w-full"
                onClick={handleCancel}
                disabled={cancelling}
              >
                {cancelling ? <Loader2 className="w-3 h-3 animate-spin" /> : "Cancelar mi solicitud"}
              </Button>
            </div>
          )}

          {!pending && (
            <>
              <div>
                <Label className="text-xs">Elegí el paquete al que querés cambiar</Label>
                <div className="grid gap-2 mt-2">
                  {options.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      No hay otros paquetes disponibles en este evento.
                    </p>
                  )}
                  {options.map(p => {
                    const selected = selectedId === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelectedId(p.id)}
                        className={`text-left rounded-md border px-3 py-2 text-sm transition-colors ${
                          selected
                            ? "border-primary bg-primary/10"
                            : "border-border bg-card/40 hover:bg-card/60"
                        }`}
                      >
                        <p className="font-medium">{p.nombre}</p>
                        {selected && (
                          <p className="text-[10px] text-primary mt-0.5">Simulando impacto…</p>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {selectedId && (
                <>
                  <PackageChangePreviewCard preview={preview} loading={loadingPreview} />
                  {preview?.status === "requiere_aprobacion" && (
                    <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs flex gap-2">
                      <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-amber-400">Este cambio necesita revisión del equipo</p>
                        <p className="text-muted-foreground mt-0.5">
                          Puede afectar la disponibilidad de otras habitaciones. Vamos a evaluarlo y te avisamos por email en las próximas horas.
                        </p>
                      </div>
                    </div>
                  )}

                  <div>
                    <Label className="text-xs">Contanos por qué querés cambiar (opcional)</Label>
                    <Textarea
                      value={motivo}
                      onChange={(e) => setMotivo(e.target.value)}
                      rows={3}
                      placeholder="Ej: mi hermano ya reservó y quiero compartir habitación con él…"
                      className="mt-1"
                    />
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <SheetFooter className="mt-6 flex-col gap-2 sm:flex-col">
          {!pending && (
            <Button
              className="w-full"
              onClick={handleSubmit}
              disabled={!selectedId || submitting || !preview || preview.status === "no_posible"}
            >
              {submitting
                ? <Loader2 className="w-4 h-4 animate-spin mr-2" />
                : null}
              Enviar solicitud
            </Button>
          )}
          <Button variant="ghost" className="w-full" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
