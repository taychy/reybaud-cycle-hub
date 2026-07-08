import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Sparkles } from "lucide-react";
import { previewPackageChange, applyPackageChange, type PackageChangePreview } from "@/lib/packageChangePreview";
import PackageChangePreviewCard from "./PackageChangePreviewCard";
import { assignPaymentPlanToReservation } from "@/lib/assignPaymentPlan";
import { formatPrice } from "@/lib/currency";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  reservationId: string;
  eventId: string;
  currentPackageId?: string | null;
  reservationHasPaymentPlan?: boolean;
  onDone?: () => void;
}

interface PackageRow { id: string; nombre: string; }
interface StageRow { id: string; nombre: string; precio: number; currency: string; vigente_desde: string | null; vigente_hasta: string | null; }
interface PlanRow { id: string; nombre: string; cantidad_cuotas: number; }

export default function AdminChangePackageDialog({
  open, onOpenChange, reservationId, eventId, currentPackageId, reservationHasPaymentPlan, onDone,
}: Props) {
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [stages, setStages] = useState<StageRow[]>([]);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [selectedStage, setSelectedStage] = useState<string>("__vigente__");
  const [selectedPlan, setSelectedPlan] = useState<string>("__ninguno__");
  const [useManual, setUseManual] = useState(false);
  const [manualPrice, setManualPrice] = useState<string>("");
  const [preview, setPreview] = useState<PackageChangePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [override, setOverride] = useState(false);
  const [note, setNote] = useState("");
  const { toast } = useToast();

  // Reset al abrir
  useEffect(() => {
    if (!open) return;
    setSelectedId("");
    setSelectedStage("__vigente__");
    setSelectedPlan("__ninguno__");
    setUseManual(false);
    setManualPrice("");
    setPreview(null); setOverride(false); setNote("");
    supabase.from("event_packages")
      .select("id, nombre")
      .eq("event_id", eventId)
      .eq("activo", true)
      .order("sort_order")
      .then(({ data }) => setPackages((data || []) as any));
  }, [open, eventId]);

  // Al elegir paquete: cargar stages y plans
  useEffect(() => {
    if (!selectedId) { setStages([]); setPlans([]); return; }
    setSelectedStage("__vigente__");
    setSelectedPlan("__ninguno__");
    supabase.from("event_package_price_stages" as any)
      .select("id, nombre, precio, currency, vigente_desde, vigente_hasta")
      .eq("package_id", selectedId)
      .eq("activo", true)
      .order("sort_order")
      .then(({ data }) => setStages(((data as any) || []) as StageRow[]));
    supabase.from("event_package_payment_plans" as any)
      .select("id, nombre, cantidad_cuotas")
      .eq("package_id", selectedId)
      .is("archived_at", null)
      .eq("activo", true)
      .order("version", { ascending: false })
      .then(({ data }) => setPlans(((data as any) || []) as PlanRow[]));
  }, [selectedId]);

  // Precio override calculado
  const priceOverride = useMemo<number | null>(() => {
    if (useManual) {
      const n = parseFloat(manualPrice);
      return Number.isFinite(n) && n > 0 ? n : null;
    }
    if (selectedStage && selectedStage !== "__vigente__") {
      const s = stages.find((x) => x.id === selectedStage);
      return s ? Number(s.precio) : null;
    }
    return null;
  }, [useManual, manualPrice, selectedStage, stages]);

  // Preview reactivo
  useEffect(() => {
    if (!selectedId) { setPreview(null); return; }
    if (useManual && priceOverride === null) { setPreview(null); return; }
    setLoading(true);
    previewPackageChange(reservationId, selectedId, null, priceOverride)
      .then(setPreview)
      .catch(e => toast({ title: "Error", description: e.message, variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [selectedId, reservationId, priceOverride, useManual]);

  const apply = async () => {
    if (!preview || !preview.revalidation_token) return;
    setApplying(true);
    try {
      const res = await applyPackageChange({
        reservationId,
        packageNuevoId: selectedId,
        revalidationToken: preview.revalidation_token,
        overridePlazaLibre: override,
        adminNote: note || null,
        priceOverride,
      });

      // Si eligió plan y la reserva no tenía plan (o vale la pena reasignar), asignarlo.
      const shouldAssignPlan = selectedPlan && selectedPlan !== "__ninguno__" && !reservationHasPaymentPlan;
      if (shouldAssignPlan) {
        const newPrice = preview?.package_nuevo?.precio_aplicable ?? 0;
        const planRes = await assignPaymentPlanToReservation({
          reservationId,
          paymentPlanId: selectedPlan,
          precioFinal: newPrice,
        });
        if (!planRes.ok) {
          toast({
            title: "Paquete cambiado, pero el plan no se pudo asignar",
            description: (planRes as any).error,
            variant: "destructive",
          });
        }
      }

      toast({
        title: "Cambio aplicado",
        description: res.credit_created
          ? `Crédito de ${res.credit_created}`
          : res.debit_created
          ? `Débito de ${res.debit_created}`
          : "Reserva actualizada",
      });
      onOpenChange(false);
      onDone?.();
    } catch (e: any) {
      toast({ title: "No se pudo aplicar", description: e.message, variant: "destructive" });
    } finally {
      setApplying(false);
    }
  };

  const canApply = preview && preview.status !== "no_posible";
  const currency = preview?.package_nuevo?.currency || "ARS";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cambiar paquete (admin)</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Paquete destino</Label>
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger><SelectValue placeholder="Elegí un paquete" /></SelectTrigger>
              <SelectContent>
                {packages.map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nombre}{p.id === currentPackageId ? " (actual)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedId && (
            <>
              <div>
                <Label className="text-xs">Etapa de precio</Label>
                <Select
                  value={useManual ? "__vigente__" : selectedStage}
                  onValueChange={setSelectedStage}
                  disabled={useManual}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__vigente__">Etapa vigente automática</SelectItem>
                    {stages.map(s => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.nombre} — {formatPrice(Number(s.precio), s.currency)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {stages.length === 0 && (
                  <p className="text-[10px] text-muted-foreground mt-1">Este paquete no tiene etapas de precio configuradas.</p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <Checkbox checked={useManual} onCheckedChange={(v) => setUseManual(!!v)} />
                  <span>Precio manual (override admin)</span>
                </label>
                {useManual && (
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder={`Monto en ${currency}`}
                    value={manualPrice}
                    onChange={(e) => setManualPrice(e.target.value)}
                  />
                )}
              </div>

              <div>
                <Label className="text-xs flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Plan de pagos
                  {reservationHasPaymentPlan && (
                    <span className="text-[10px] text-muted-foreground">(reserva ya tiene plan, no se toca)</span>
                  )}
                </Label>
                <Select
                  value={selectedPlan}
                  onValueChange={setSelectedPlan}
                  disabled={reservationHasPaymentPlan}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__ninguno__">
                      {reservationHasPaymentPlan ? "Mantener plan actual" : "No asignar plan (cobra como pago único)"}
                    </SelectItem>
                    {plans.map(pl => (
                      <SelectItem key={pl.id} value={pl.id}>
                        {pl.nombre} — {pl.cantidad_cuotas} cuotas
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!reservationHasPaymentPlan && selectedPlan !== "__ninguno__" && (
                  <p className="text-[10px] text-emerald-500 mt-1">
                    Se generarán las cuotas al aplicar y los pagos existentes se imputarán en orden (seña primero).
                  </p>
                )}
              </div>
            </>
          )}

          <PackageChangePreviewCard preview={preview} loading={loading} />

          {preview?.status === "requiere_aprobacion" && (
            <label className="flex items-start gap-2 text-xs cursor-pointer">
              <Checkbox checked={override} onCheckedChange={(v) => setOverride(!!v)} />
              <span>Asumo el costo de la plaza libre / autorizo la excepción (queda registrado en el historial).</span>
            </label>
          )}

          <div>
            <Label className="text-xs">Nota admin (opcional)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Motivo del cambio" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={apply} disabled={!canApply || applying || (useManual && priceOverride === null)}>
            {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : "Aplicar cambio"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
