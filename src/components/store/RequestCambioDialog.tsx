import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, AlertTriangle } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  productId: string;
  productName: string;
  origenTipo: "compra" | "preorder";
  compraId?: string | null;
  preorderId?: string | null;
  varianteOrigen: Record<string, any>;
  onSubmitted?: () => void;
}

const MOTIVOS = [
  { v: "talle", l: "Cambio de talle" },
  { v: "color", l: "Cambio de color" },
  { v: "defecto", l: "Producto con defecto" },
  { v: "otro", l: "Otro motivo" },
];

const RequestCambioDialog = ({
  open, onOpenChange, productId, productName, origenTipo,
  compraId, preorderId, varianteOrigen, onSubmitted,
}: Props) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [product, setProduct] = useState<any>(null);
  const [motivo, setMotivo] = useState("talle");
  const [varDestino, setVarDestino] = useState<Record<string, string>>({});
  const [comentario, setComentario] = useState("");
  const [noStock, setNoStock] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!open || !productId) return;
    setLoading(true);
    setNoStock(false);
    setVarDestino({});
    setComentario("");
    setMotivo("talle");
    (async () => {
      const { data } = await supabase.from("store_products").select("*").eq("id", productId).single();
      setProduct(data);
      setLoading(false);
    })();
  }, [open, productId]);

  const variantsConfig: any[] = (origenTipo === "preorder" && product?.is_preorder && product?.preorder_status === "abierta"
    ? product?.preorder_variants
    : product?.variants) || [];

  const hasVariantSelectors = Array.isArray(variantsConfig) && variantsConfig.length > 0;

  // Mapa de stock por variante: clave "Atributo:Valor" → cantidad
  const variantStock: Record<string, number> = (product?.variant_stock as any) || {};
  const getStockFor = (attr: string, opt: string): number | null => {
    const k = `${attr}:${opt}`;
    if (variantStock[k] === undefined || variantStock[k] === null) return null;
    return Number(variantStock[k]) || 0;
  };
  const stockOfSelection = (() => {
    if (!hasVariantSelectors) return null;
    const stocks = variantsConfig.map((vc: any, idx: number) => {
      const key = vc.name || vc.label || `attr_${idx}`;
      const val = varDestino[key];
      if (!val) return null;
      return getStockFor(key, val);
    });
    if (stocks.some((s) => s === null)) return null;
    return Math.min(...(stocks as number[]));
  })();
  const selectionOutOfStock = stockOfSelection !== null && stockOfSelection <= 0;

  const handleSubmit = async () => {
    if (!noStock && hasVariantSelectors) {
      const sigDestino = JSON.stringify(varDestino);
      const sigOrigen = JSON.stringify(varianteOrigen);
      if (sigDestino === "{}" || sigDestino === sigOrigen) {
        toast({ title: "Elegí una variante distinta a la original", variant: "destructive" });
        return;
      }
      if (selectionOutOfStock) {
        toast({
          title: "Sin stock de esa variante",
          description: "Elegí otra opción o marcá la casilla de devolución.",
          variant: "destructive",
        });
        return;
      }
    }
    setSaving(true);
    const { error } = await supabase.rpc("request_cambio_indumentaria" as any, {
      p_producto_id: productId,
      p_origen_tipo: origenTipo,
      p_compra_id: compraId || null,
      p_preorder_id: preorderId || null,
      p_variante_origen: varianteOrigen,
      p_variante_destino: noStock ? null : varDestino,
      p_motivo: motivo,
      p_comentario: comentario || null,
      p_fotos: [],
    });
    setSaving(false);
    if (error) {
      toast({ title: "No se pudo solicitar el cambio", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: noStock ? "Devolución solicitada" : "Cambio aprobado",
      description: noStock
        ? "Te contactamos para coordinar el reintegro."
        : "Ya quedó cargado en depósito. Te avisamos cuando esté listo para retirar.",
    });
    onOpenChange(false);
    onSubmitted?.();
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading uppercase tracking-wider">Solicitar cambio</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-card p-3">
              <p className="text-sm font-semibold">{productName}</p>
              {Object.keys(varianteOrigen || {}).length > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Original: {Object.entries(varianteOrigen).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                </p>
              )}
            </div>

            <div>
              <Label className="text-xs">Motivo</Label>
              <Select value={motivo} onValueChange={setMotivo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MOTIVOS.map((m) => <SelectItem key={m.v} value={m.v}>{m.l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {!noStock && hasVariantSelectors && (
              <div className="space-y-2">
                <Label className="text-xs">Nueva variante</Label>
                {variantsConfig.map((vc: any, idx: number) => {
                  const key = vc.name || vc.label || `attr_${idx}`;
                  const opts: string[] = vc.options || vc.values || [];
                  return (
                    <Select
                      key={key}
                      value={varDestino[key] || ""}
                      onValueChange={(v) => setVarDestino((p) => ({ ...p, [key]: v }))}
                    >
                      <SelectTrigger><SelectValue placeholder={key} /></SelectTrigger>
                      <SelectContent>
                        {opts.map((o) => {
                          const st = getStockFor(key, o);
                          const out = st !== null && st <= 0;
                          return (
                            <SelectItem key={o} value={o} disabled={out}>
                              <span className="flex items-center gap-2">
                                <span>{o}</span>
                                {st !== null && (
                                  <span className={`text-[10px] ${out ? "text-destructive" : st <= 2 ? "text-amber-400" : "text-muted-foreground"}`}>
                                    {out ? "sin stock" : `${st} disp.`}
                                  </span>
                                )}
                              </span>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  );
                })}
                {selectionOutOfStock && (
                  <p className="text-[11px] text-destructive flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> No hay stock de esa variante. Elegí otra o marcá devolución abajo.
                  </p>
                )}
              </div>
            )}

            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-2">
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input type="checkbox" checked={noStock} onChange={(e) => setNoStock(e.target.checked)} />
                <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
                <span>No hay stock de la variante que necesito — solicitar devolución</span>
              </label>
              {noStock && (
                <p className="text-[11px] text-muted-foreground">
                  Vamos a notificar a administración. Te contactan para coordinar el reintegro o saldo a favor.
                </p>
              )}
            </div>


            <div>
              <Label className="text-xs">Comentario</Label>
              <Textarea
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                placeholder="Contanos brevemente el motivo o detalle del cambio."
                rows={3}
              />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving || loading}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : noStock ? "Solicitar devolución" : "Solicitar cambio"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RequestCambioDialog;
