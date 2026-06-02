import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ShoppingBag, ChevronRight, Package, CheckCircle2, Clock } from "lucide-react";
import { formatPrice } from "@/lib/currency";
import MisPreventas from "@/components/store/MisPreventas";

interface Props {
  alumnoId: string | null;
}

const orderStatusMeta = (s: string) => ({
  pendiente: { label: "Pendiente", color: "text-muted-foreground", icon: Clock },
  pendiente_pago: { label: "Esperando pago", color: "text-muted-foreground", icon: Clock },
  pagado: { label: "Pagado", color: "text-cyan", icon: CheckCircle2 },
  preparando: { label: "Preparando", color: "text-primary", icon: Package },
  enviado: { label: "Enviado", color: "text-primary", icon: Package },
  entregado: { label: "Entregado", color: "text-green-400", icon: CheckCircle2 },
  cancelado: { label: "Cancelado", color: "text-destructive", icon: Clock },
}[s] || { label: s, color: "text-muted-foreground", icon: Clock });

const MisComprasSection = ({ alumnoId }: Props) => {
  const [open, setOpen] = useState(false);
  const [preorders, setPreorders] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!alumnoId) { setLoading(false); return; }
    let active = true;
    (async () => {
      const [pre, ord] = await Promise.all([
        supabase.from("store_preorders" as any).select("id, producto_nombre, estado, estado_pago_sena, sena_monto, saldo_pendiente, moneda, created_at, cantidad, variante, forma_pago_sena").eq("alumno_id", alumnoId).order("created_at", { ascending: false }),
        supabase.from("store_orders").select("id, order_number, total, currency, status, created_at").eq("alumno_id", alumnoId).order("created_at", { ascending: false }),
      ]);
      if (!active) return;
      setPreorders((pre.data as any[]) || []);
      setOrders((ord.data as any[]) || []);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [alumnoId, open]);

  if (!alumnoId) return null;

  const total = preorders.length + orders.length;
  if (loading || total === 0) return null;

  const pendientes =
    preorders.filter((p) => ["pendiente_pago_sena", "reservada"].includes(p.estado)).length +
    orders.filter((o) => ["pendiente", "pendiente_pago"].includes(o.status)).length;

  const activas =
    preorders.filter((p) => ["en_produccion", "lista_para_retirar"].includes(p.estado)).length +
    orders.filter((o) => ["pagado", "preparando", "enviado"].includes(o.status)).length;

  const entregadas =
    preorders.filter((p) => p.estado === "entregada").length +
    orders.filter((o) => o.status === "entregado").length;

  return (
    <section>
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-xl border border-border bg-card p-3 flex items-center gap-3 hover:bg-card/80 transition-colors text-left"
      >
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <ShoppingBag className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-heading font-bold uppercase tracking-wider text-foreground">Mis compras</p>
          <p className="text-[11px] text-muted-foreground">
            {pendientes > 0 && <span className="text-primary font-semibold">{pendientes} pendiente{pendientes !== 1 ? "s" : ""}</span>}
            {pendientes > 0 && (activas > 0 || entregadas > 0) && " · "}
            {activas > 0 && <>{activas} activa{activas !== 1 ? "s" : ""}</>}
            {activas > 0 && entregadas > 0 && " · "}
            {entregadas > 0 && <>{entregadas} entregada{entregadas !== 1 ? "s" : ""}</>}
            {pendientes === 0 && activas === 0 && entregadas === 0 && <>{total} operación{total !== 1 ? "es" : ""}</>}
          </p>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="h-[90vh] overflow-y-auto p-0 flex flex-col">
          <SheetHeader className="p-4 border-b border-border">
            <SheetTitle className="font-heading uppercase tracking-wider">Mis compras</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto">
            <Tabs defaultValue={preorders.length > 0 ? "preventas" : "compras"} className="w-full">
              <div className="px-4 pt-3">
                <TabsList className="grid grid-cols-2 w-full">
                  <TabsTrigger value="preventas">
                    Preventas {preorders.length > 0 && <span className="ml-1 text-[10px] opacity-70">({preorders.length})</span>}
                  </TabsTrigger>
                  <TabsTrigger value="compras">
                    Compras {orders.length > 0 && <span className="ml-1 text-[10px] opacity-70">({orders.length})</span>}
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="preventas" className="px-4 py-3 mt-0">
                {preorders.length === 0 ? (
                  <p className="text-center text-sm text-muted-foreground py-8">Todavía no tenés preventas</p>
                ) : (
                  <MisPreventas alumnoId={alumnoId} />
                )}
              </TabsContent>

              <TabsContent value="compras" className="px-4 py-3 mt-0 space-y-2">
                {orders.length === 0 ? (
                  <p className="text-center text-sm text-muted-foreground py-8">Todavía no tenés compras</p>
                ) : (
                  orders.map((o) => {
                    const meta = orderStatusMeta(o.status);
                    const Icon = meta.icon;
                    return (
                      <div key={o.id} className="rounded-xl border border-border bg-card p-3 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-heading font-bold text-sm">Pedido #{o.order_number}</p>
                          <span className={`inline-flex items-center gap-1 text-[10px] font-heading font-bold uppercase ${meta.color}`}>
                            <Icon className="w-3 h-3" /> {meta.label}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                          <span>{new Date(o.created_at).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" })}</span>
                          <b className="text-foreground">{formatPrice(Number(o.total), o.currency || "ARS")}</b>
                        </div>
                      </div>
                    );
                  })
                )}
              </TabsContent>
            </Tabs>
          </div>
          <div className="p-4 border-t border-border">
            <Button variant="ghost" className="w-full" onClick={() => setOpen(false)}>Cerrar</Button>
          </div>
        </SheetContent>
      </Sheet>
    </section>
  );
};

export default MisComprasSection;
