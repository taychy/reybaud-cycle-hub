import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { previewPackageChange, applyPackageChange, type PackageChangePreview } from "@/lib/packageChangePreview";
import PackageChangePreviewCard from "./PackageChangePreviewCard";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  reservationId: string;
  eventId: string;
  currentPackageId?: string | null;
  onDone?: () => void;
}

export default function AdminChangePackageDialog({
  open, onOpenChange, reservationId, eventId, currentPackageId, onDone,
}: Props) {
  const [packages, setPackages] = useState<{ id: string; nombre: string }[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [preview, setPreview] = useState<PackageChangePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [override, setOverride] = useState(false);
  const [note, setNote] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    setSelectedId(""); setPreview(null); setOverride(false); setNote("");
    supabase.from("event_packages")
      .select("id, nombre")
      .eq("event_id", eventId)
      .eq("activo", true)
      .order("sort_order")
      .then(({ data }) => setPackages((data || []).filter(p => p.id !== currentPackageId)));
  }, [open, eventId, currentPackageId]);

  useEffect(() => {
    if (!selectedId) { setPreview(null); return; }
    setLoading(true);
    previewPackageChange(reservationId, selectedId)
      .then(setPreview)
      .catch(e => toast({ title: "Error", description: e.message, variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [selectedId, reservationId]);

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
      });
      toast({ title: "Cambio aplicado", description: res.credit_created ? `Crédito de ${res.credit_created}` : "Reserva actualizada" });
      onOpenChange(false);
      onDone?.();
    } catch (e: any) {
      toast({ title: "No se pudo aplicar", description: e.message, variant: "destructive" });
    } finally {
      setApplying(false);
    }
  };

  const canApply = preview && preview.status !== "no_posible";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cambiar paquete (admin)</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Paquete destino</Label>
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger><SelectValue placeholder="Elegí un paquete" /></SelectTrigger>
              <SelectContent>
                {packages.map(p => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

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
          <Button onClick={apply} disabled={!canApply || applying}>
            {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : "Aplicar cambio"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
