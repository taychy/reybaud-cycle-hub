import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, AlertCircle } from "lucide-react";

type Preview = {
  status: "match" | "revision_manual" | "ya_vinculada" | "vinculada";
  motivo?: string;
  origen?: "viajes" | "tienda";
  cliente?: string;
  monto?: number;
  moneda?: string;
  pago_original?: string;
  pago_monto?: number;
  ya_devuelto?: number;
  parcial?: boolean;
};

const fmt = (n?: number) => `$ ${Number(n ?? 0).toLocaleString("es-AR")}`;

export default function VincularDevolucionMpDialog({
  movementId, onClose, onDone,
}: { movementId: string | null; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);

  useEffect(() => {
    if (!movementId) { setPreview(null); return; }
    setLoading(true);
    supabase.rpc("vincular_devolucion_mp" as any, { p_movement_id: movementId, p_confirmar: false })
      .then(({ data, error }) => {
        if (error) setPreview({ status: "revision_manual", motivo: error.message });
        else setPreview(data as Preview);
        setLoading(false);
      });
  }, [movementId]);

  async function confirmar() {
    if (!movementId) return;
    setSaving(true);
    const { data, error } = await supabase.rpc("vincular_devolucion_mp" as any, { p_movement_id: movementId, p_confirmar: true });
    setSaving(false);
    const r = data as Preview | null;
    if (error || !r || r.status === "revision_manual") {
      toast({ title: "Revisión manual", description: error?.message ?? r?.motivo ?? "No se pudo vincular", variant: "destructive" });
      return;
    }
    toast({ title: r.status === "ya_vinculada" ? "Ya estaba vinculada" : "Devolución vinculada" });
    onDone();
  }

  const ok = preview?.status === "match";

  return (
    <Dialog open={!!movementId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Vincular devolución</DialogTitle></DialogHeader>
        {loading || !preview ? (
          <div className="py-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : ok ? (
          <div className="space-y-2 text-sm">
            <Row k="Origen" v={preview.origen === "viajes" ? "Viajes" : "Tienda"} />
            <Row k="Alumno / cliente" v={preview.cliente || "—"} />
            <Row k="Monto devuelto" v={`${fmt(preview.monto)} ${preview.moneda ?? ""}`} />
            <Row k="Pago original" v={`#${preview.pago_original} · ${fmt(preview.pago_monto)}`} />
            {!!preview.ya_devuelto && <Row k="Ya devuelto antes" v={fmt(preview.ya_devuelto)} />}
            <Row k="Tipo" v={preview.parcial ? "Devolución parcial" : "Devolución total"} />
            <p className="text-xs text-muted-foreground pt-2">Se reutiliza el gasto existente del refund. No modifica stock ni pagos.</p>
          </div>
        ) : preview.status === "ya_vinculada" ? (
          <p className="text-sm">Este refund ya está vinculado a una devolución.</p>
        ) : (
          <div className="flex gap-2 text-sm">
            <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
            <div><p className="font-semibold">Revisión manual</p><p className="text-muted-foreground">{preview.motivo}</p></div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          {ok && (
            <Button onClick={confirmar} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Confirmar vínculo
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-3"><span className="text-muted-foreground">{k}</span><span className="font-medium text-right">{v}</span></div>;
}
