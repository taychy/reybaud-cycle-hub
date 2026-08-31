import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Loader2, Undo2, ShoppingCart, RefreshCw } from "lucide-react";
import { formatVariante } from "@/lib/productQr";
import { diasAfuera, alertaAntiguedad, esPruebaActiva, resultadoClass, resultadoLabel } from "@/lib/pruebas";
import AddPruebaDialog from "@/components/store/AddPruebaDialog";

interface Props {
  orderId: string;
  alumnoId?: string | null;
  currency?: string;
  /** Oculta el botón de alta (vistas de solo seguimiento). */
  readOnly?: boolean;
  /** Se dispara cuando una prueba cambia de estado (por ej. para refrescar el total del pedido). */
  onChanged?: () => void;
}

const PruebasSection = ({ orderId, alumnoId, currency = "ARS", readOnly = false, onChanged }: Props) => {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [ventaFor, setVentaFor] = useState<any | null>(null);
  const [precio, setPrecio] = useState("");
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("store_cambios" as any)
      .select("*, producto:store_products!store_cambios_producto_id_fkey(name)")
      .eq("order_id", orderId)
      .eq("tipo", "prueba")
      .order("created_at", { ascending: false });
    setRows((data as any[]) || []);
    setLoading(false);
  }, [orderId]);

  useEffect(() => { load(); }, [load]);

  const run = async (id: string, fn: () => PromiseLike<{ error: any }>, okTitle: string) => {
    setBusy(id);
    const { error } = await fn();
    setBusy(null);
    if (error) {
      toast({ title: "No se pudo completar", description: error.message, variant: "destructive" });
      return false;
    }
    toast({ title: okTitle });
    load();
    onChanged?.();
    return true;
  };

  const devolver = (c: any) =>
    run(c.id, () => supabase.rpc("prueba_devolver" as any, { p_cambio_id: c.id, p_nota: null }),
      "Prueba devuelta · stock reingresado");

  const usarComoCambio = (c: any) =>
    run(c.id, () => supabase.rpc("prueba_usar_como_cambio" as any, { p_cambio_id: c.id, p_nota: null }),
      "Convertida en cambio real");

  const confirmarVenta = async () => {
    if (!ventaFor) return;
    const monto = Number(precio);
    if (!monto || monto <= 0) {
      toast({ title: "Indicá el precio de venta", variant: "destructive" });
      return;
    }
    const ok = await run(
      ventaFor.id,
      () => supabase.rpc("prueba_convertir_en_venta" as any, { p_cambio_id: ventaFor.id, p_precio: monto, p_nota: null }),
      "Convertida en venta · se sumó al pedido",
    );
    if (ok) { setVentaFor(null); setPrecio(""); }
  };

  const activas = rows.filter(esPruebaActiva);
  const cerradas = rows.filter((r) => !esPruebaActiva(r));

  const renderRow = (c: any) => {
    const activa = esPruebaActiva(c);
    const dias = diasAfuera(c);
    const alerta = alertaAntiguedad(dias);
    return (
      <div key={c.id} className="rounded-lg border border-border p-2.5 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold truncate">{c.producto?.name || "Producto"}</p>
            <p className="text-[11px] text-muted-foreground">
              {formatVariante(c.variante_origen)} · salió el{" "}
              {new Date(c.prueba_salida_at || c.created_at).toLocaleDateString("es-AR")}
              {activa && (
                <span className={alerta === "critico" ? " text-destructive font-semibold" : alerta === "atencion" ? " text-amber-400" : ""}>
                  {" "}· {dias}d afuera
                </span>
              )}
            </p>
            {c.comentario && <p className="text-[11px] text-muted-foreground italic">"{c.comentario}"</p>}
          </div>
          <Badge className={`text-[10px] uppercase shrink-0 ${resultadoClass(c)}`}>{resultadoLabel(c)}</Badge>
        </div>

        {activa && !readOnly && (
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="outline" className="h-7 text-[11px]" disabled={busy === c.id} onClick={() => devolver(c)}>
              {busy === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Undo2 className="w-3 h-3 mr-1" /> Recibir devolución</>}
            </Button>
            <Button size="sm" className="h-7 text-[11px]" disabled={busy === c.id} onClick={() => { setVentaFor(c); setPrecio(""); }}>
              <ShoppingCart className="w-3 h-3 mr-1" /> Se la quedó
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-[11px]" disabled={busy === c.id} onClick={() => usarComoCambio(c)}>
              <RefreshCw className="w-3 h-3 mr-1" /> Usar como cambio
            </Button>
          </div>
        )}
      </div>
    );
  };

  return (
    <section className="rounded-lg border border-border p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-[11px] font-heading uppercase text-muted-foreground">
          Prendas de prueba {activas.length > 0 && <span className="text-amber-400">· {activas.length} afuera</span>}
        </h4>
        {!readOnly && (
          <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setAddOpen(true)}>
            <Plus className="w-3 h-3 mr-1" /> Agregar prenda de prueba
          </Button>
        )}
      </div>

      {loading ? (
        <div className="py-3 flex justify-center"><Loader2 className="w-4 h-4 animate-spin" /></div>
      ) : rows.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          Sin prendas de prueba. Se usa cuando mandás un talle extra para probar: no se cobra ni suma al total.
        </p>
      ) : (
        <div className="space-y-2">
          {activas.map(renderRow)}
          {cerradas.length > 0 && (
            <div className="pt-1 space-y-2">
              <p className="text-[10px] uppercase text-muted-foreground">Historial</p>
              {cerradas.map(renderRow)}
            </div>
          )}
        </div>
      )}

      <AddPruebaDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        orderId={orderId}
        alumnoId={alumnoId}
        onCreated={load}
      />

      <AlertDialog open={!!ventaFor} onOpenChange={(v) => { if (!v) { setVentaFor(null); setPrecio(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Convertir prueba en venta</AlertDialogTitle>
            <AlertDialogDescription>
              Se agrega la prenda al pedido y se suma al total a cobrar. El stock no se vuelve a descontar porque la
              unidad ya salió cuando se envió a prueba.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1">
            <Label htmlFor="precio-prueba" className="text-xs">Precio de venta ({currency}) *</Label>
            <Input
              id="precio-prueba"
              type="number"
              min={0}
              value={precio}
              onChange={(e) => setPrecio(e.target.value)}
              placeholder="0"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Volver</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); confirmarVenta(); }} disabled={!precio}>
              Confirmar venta
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
};

export default PruebasSection;
