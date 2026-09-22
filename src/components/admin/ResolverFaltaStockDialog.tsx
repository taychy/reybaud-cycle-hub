import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { formatPrice } from "@/lib/currency";
import { AlertTriangle, Loader2, PackageSearch } from "lucide-react";
import {
  calcularDiferencia, RESOLUCION_LABEL, stockDeSeleccion, variantesDisponibles,
  varianteTexto, type ResolucionEconomica,
} from "@/lib/faltaStock";

export interface FaltaStockItem {
  id: string;
  product_id: string | null;
  producto_nombre: string;
  variante: Record<string, any> | null;
  cantidad: number;
  precio_unitario: number;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orderNumber: number;
  currency: string;
  items: FaltaStockItem[];
  onDone: () => void;
}

const ResolverFaltaStockDialog = ({ open, onOpenChange, orderNumber, currency, items, onDone }: Props) => {
  const { toast } = useToast();
  const [itemId, setItemId] = useState<string>("");
  const [productos, setProductos] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reemplazoId, setReemplazoId] = useState<string>("");
  const [varianteKey, setVarianteKey] = useState<string>("");
  const [resolucion, setResolucion] = useState<ResolucionEconomica | "">("");
  const [comentario, setComentario] = useState("");

  useEffect(() => {
    if (!open) return;
    setItemId(items[0]?.id || "");
    setReemplazoId("");
    setVarianteKey("");
    setResolucion("");
    setComentario("");
    setLoading(true);
    void (async () => {
      const { data } = await supabase
        .from("store_products")
        .select("id, name, price, currency, stock, variants, variant_stock, status, is_combo")
        .eq("status", "active")
        .order("name");
      setProductos((data as any[]) || []);
      setLoading(false);
    })();
  }, [open]);

  const item = items.find((i) => i.id === itemId) || null;
  const cantidad = Math.max(Number(item?.cantidad) || 1, 1);

  // Sólo productos con alguna variante (o stock simple) realmente disponible.
  const disponibles = useMemo(
    () => productos.filter((p) => {
      if ((p.currency || "ARS") !== (currency || "ARS")) return false;
      const conVariantes = variantesDisponibles(p);
      if (conVariantes.length > 0) return conVariantes.some((v) => v.stock >= cantidad);
      return (Number(p.stock) || 0) >= cantidad;
    }),
    [productos, currency, cantidad],
  );

  const reemplazo = disponibles.find((p) => p.id === reemplazoId) || null;
  const variantesReemplazo = reemplazo ? variantesDisponibles(reemplazo).filter((v) => v.stock >= cantidad) : [];

  const varianteDestino: Record<string, string> = useMemo(() => {
    if (!varianteKey) return {};
    return Object.fromEntries(
      varianteKey.split("|").map((p) => {
        const i = p.indexOf(":");
        return [p.slice(0, i), p.slice(i + 1)];
      }),
    );
  }, [varianteKey]);

  const stockElegido = reemplazo
    ? (varianteKey ? stockDeSeleccion(reemplazo, varianteDestino) : Number(reemplazo.stock) || 0)
    : 0;

  const calc = item && reemplazo
    ? calcularDiferencia(Number(item.precio_unitario) || 0, cantidad, Number(reemplazo.price) || 0)
    : null;

  useEffect(() => {
    if (!calc) { setResolucion(""); return; }
    if (calc.opciones.length === 1) setResolucion(calc.opciones[0]);
    else if (!calc.opciones.includes(resolucion as ResolucionEconomica)) setResolucion("");
  }, [calc?.diferencia, reemplazoId]);

  const variantesRequeridas = Array.isArray(reemplazo?.variants)
    ? reemplazo.variants.filter((v: any) => v?.name).length > 0
    : false;

  const puedeConfirmar =
    !!item && !!reemplazo && !!resolucion && !busy &&
    (!variantesRequeridas || !!varianteKey) &&
    stockElegido >= cantidad;

  const confirmar = async () => {
    if (!item || !reemplazo || !resolucion) return;
    setBusy(true);
    const { error } = await supabase.rpc("resolver_falta_stock" as any, {
      p_order_item_id: item.id,
      p_producto_reemplazo_id: reemplazo.id,
      p_variante_destino: varianteDestino,
      p_resolucion: resolucion,
      p_comentario: comentario || null,
    });
    setBusy(false);
    if (error) {
      toast({ title: "No se pudo resolver", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: "Sustitución registrada",
      description: resolucion === "devolucion"
        ? "Queda pendiente registrar la devolución del dinero."
        : "El reemplazo sigue el flujo normal de depósito.",
    });
    onOpenChange(false);
    onDone();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            <PackageSearch className="w-4 h-4 text-amber-400" />
            Resolver falta de stock · pedido #{orderNumber}
          </DialogTitle>
          <DialogDescription>
            El pedido y su pago quedan como están. Se reemplaza la mercadería y se decide la diferencia.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {/* 1. Ítem original */}
          <div className="space-y-1">
            <Label className="text-[11px] uppercase text-muted-foreground">Producto que no se pudo entregar</Label>
            <Select value={itemId} onValueChange={setItemId}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Elegí el producto" /></SelectTrigger>
              <SelectContent>
                {items.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.producto_nombre}{varianteTexto(i.variante) ? ` · ${varianteTexto(i.variante)}` : ""} ×{i.cantidad}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {item && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 space-y-1">
              <div className="flex items-center gap-2 text-amber-400 text-[11px] font-heading uppercase">
                <AlertTriangle className="w-3.5 h-3.5" /> Original no entregado
              </div>
              <p className="font-medium">{item.producto_nombre}</p>
              {varianteTexto(item.variante) && (
                <p className="text-xs text-muted-foreground">{varianteTexto(item.variante)}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Cantidad {cantidad} · cobrado {formatPrice((Number(item.precio_unitario) || 0) * cantidad, currency)}
              </p>
            </div>
          )}

          {/* 2. Reemplazo */}
          <div className="space-y-1">
            <Label className="text-[11px] uppercase text-muted-foreground">Producto de reemplazo (con stock real)</Label>
            {loading ? (
              <div className="py-3 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
            ) : (
              <Select value={reemplazoId} onValueChange={(v) => { setReemplazoId(v); setVarianteKey(""); }}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Elegí el reemplazo" /></SelectTrigger>
                <SelectContent>
                  {disponibles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} · {formatPrice(Number(p.price) || 0, p.currency || currency)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {!loading && disponibles.length === 0 && (
              <p className="text-xs text-muted-foreground">No hay productos con stock disponible en esta moneda.</p>
            )}
          </div>

          {reemplazo && variantesReemplazo.length > 0 && (
            <div className="space-y-1">
              <Label className="text-[11px] uppercase text-muted-foreground">Variante disponible</Label>
              <Select value={varianteKey} onValueChange={setVarianteKey}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Elegí la variante" /></SelectTrigger>
                <SelectContent>
                  {variantesReemplazo.map((v) => (
                    <SelectItem key={v.key} value={v.key}>
                      {v.key.split("|").join(" · ")} — {v.stock} en stock
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* 3. Diferencia */}
          {calc && (
            <div className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Cobrado por el original</span>
                <b>{formatPrice(calc.original, currency)}</b>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Precio del reemplazo</span>
                <b>{formatPrice(calc.reemplazo, currency)}</b>
              </div>
              <div className="flex justify-between text-sm border-t border-border pt-2">
                <span className="text-muted-foreground">Diferencia</span>
                <b className={calc.diferencia > 0 ? "text-amber-400" : calc.diferencia < 0 ? "text-cyan" : ""}>
                  {calc.diferencia === 0 ? "Sin diferencia" : formatPrice(Math.abs(calc.diferencia), currency)}
                  {calc.diferencia > 0 ? " a favor de Reybaud" : calc.diferencia < 0 ? " a favor del alumno" : ""}
                </b>
              </div>

              {calc.opciones.length > 1 ? (
                <div className="space-y-1 pt-1">
                  <Label className="text-[11px] uppercase text-muted-foreground">¿Qué se hace con la diferencia?</Label>
                  <Select value={resolucion} onValueChange={(v) => setResolucion(v as ResolucionEconomica)}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Elegí una opción" /></SelectTrigger>
                    <SelectContent>
                      {calc.opciones.map((o) => (
                        <SelectItem key={o} value={o}>{RESOLUCION_LABEL[o]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {resolucion === "devolucion" && (
                    <p className="text-[11px] text-muted-foreground">
                      Se marca como devolución pendiente: el dinero se registra después, al hacerla efectiva.
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground">Mismo precio: no se genera ningún ajuste.</p>
              )}
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-[11px] uppercase text-muted-foreground">Comentario (opcional)</Label>
            <Textarea rows={2} value={comentario} onChange={(e) => setComentario(e.target.value)} />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Volver</Button>
            <Button onClick={confirmar} disabled={!puedeConfirmar}>
              {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
              Confirmar sustitución
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ResolverFaltaStockDialog;
