import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ShoppingBag, ChevronRight, Package, CheckCircle2, Clock, RefreshCw, XCircle } from "lucide-react";
import { formatPrice } from "@/lib/currency";
import MisPreventas from "@/components/store/MisPreventas";
import MisCambios from "@/components/store/MisCambios";
import RequestCambioDialog from "@/components/store/RequestCambioDialog";
import OrderDetailDialog from "@/components/store/OrderDetailDialog";

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
  cancelado: { label: "Cancelado", color: "text-destructive", icon: XCircle },
}[s] || { label: s, color: "text-muted-foreground", icon: Clock });

const daysSince = (d: string) => Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
const WINDOW_MS = 12 * 60 * 60 * 1000;
const isWithinEditWindow = (createdAt: string, status: string) =>
  ["pendiente", "pendiente_pago"].includes(status) &&
  Date.now() - new Date(createdAt).getTime() < WINDOW_MS;

const MisComprasSection = ({ alumnoId }: Props) => {
  const [open, setOpen] = useState(false);
  const [preorders, setPreorders] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [orderItems, setOrderItems] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [cambioTarget, setCambioTarget] = useState<{
    productId: string; productName: string; origenTipo: "compra" | "preorder";
    compraId?: string | null; preorderId?: string | null; varianteOrigen: Record<string, any>;
  } | null>(null);
  const [cambioVersion, setCambioVersion] = useState(0);

  useEffect(() => {
    if (!alumnoId) { setLoading(false); return; }
    let active = true;
    (async () => {
      const [pre, ord] = await Promise.all([
        supabase.from("store_preorders" as any).select("id, product_id, producto_nombre, estado, estado_pago_sena, sena_monto, saldo_pendiente, moneda, created_at, cantidad, variante, forma_pago_sena").eq("alumno_id", alumnoId).order("created_at", { ascending: false }),
        supabase.from("store_orders").select("id, order_number, total, currency, status, created_at").eq("alumno_id", alumnoId).order("created_at", { ascending: false }),
      ]);
      if (!active) return;
      const ordList = (ord.data as any[]) || [];
      setPreorders((pre.data as any[]) || []);
      setOrders(ordList);

      // load items for delivered orders for cambio buttons
      const deliveredIds = ordList.filter((o) => o.status === "entregado").map((o) => o.id);
      if (deliveredIds.length) {
        const { data: items } = await supabase
          .from("store_order_items")
          .select("order_id, product_id, product_name, variant_selection")
          .in("order_id", deliveredIds);
        const grouped: Record<string, any[]> = {};
        (items || []).forEach((it: any) => {
          grouped[it.order_id] = grouped[it.order_id] || [];
          grouped[it.order_id].push(it);
        });
        setOrderItems(grouped);
      }
      setLoading(false);
    })();
    return () => { active = false; };
  }, [alumnoId, open, cambioVersion]);

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
                <TabsList className="grid grid-cols-3 w-full">
                  <TabsTrigger value="preventas">
                    Preventas {preorders.length > 0 && <span className="ml-1 text-[10px] opacity-70">({preorders.length})</span>}
                  </TabsTrigger>
                  <TabsTrigger value="compras">
                    Compras {orders.length > 0 && <span className="ml-1 text-[10px] opacity-70">({orders.length})</span>}
                  </TabsTrigger>
                  <TabsTrigger value="cambios">
                    <RefreshCw className="w-3 h-3 mr-1" /> Cambios
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="preventas" className="px-4 py-3 mt-0">
                {preorders.length === 0 ? (
                  <p className="text-center text-sm text-muted-foreground py-8">Todavía no tenés preventas</p>
                ) : (
                  <>
                    <MisPreventas alumnoId={alumnoId} />
                    {/* Botón cambio para preventas entregadas */}
                    <div className="mt-3 space-y-2">
                      {preorders.filter((p) => p.estado === "entregada" && p.product_id && daysSince(p.created_at) <= 30).map((p) => (
                        <Button
                          key={`pre-cambio-${p.id}`}
                          variant="outline"
                          size="sm"
                          className="w-full justify-between"
                          onClick={() => setCambioTarget({
                            productId: p.product_id,
                            productName: p.producto_nombre || "Preventa",
                            origenTipo: "preorder",
                            preorderId: p.id,
                            varianteOrigen: p.variante || {},
                          })}
                        >
                          <span className="text-[11px]">Solicitar cambio · {p.producto_nombre}</span>
                          <RefreshCw className="w-3.5 h-3.5" />
                        </Button>
                      ))}
                    </div>
                  </>
                )}
              </TabsContent>

              <TabsContent value="compras" className="px-4 py-3 mt-0 space-y-2">
                {orders.length === 0 ? (
                  <p className="text-center text-sm text-muted-foreground py-8">Todavía no tenés compras</p>
                ) : (
                  orders.map((o) => {
                    const meta = orderStatusMeta(o.status);
                    const Icon = meta.icon;
                    const items = orderItems[o.id] || [];
                    const eligible = o.status === "entregado" && daysSince(o.created_at) <= 30;
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
                        {eligible && items.length > 0 && (
                          <div className="pt-2 border-t border-border/50 space-y-1">
                            {items.filter((it) => it.product_id).map((it) => (
                              <button
                                key={it.product_id + JSON.stringify(it.variant_selection)}
                                className="w-full flex items-center justify-between text-[11px] text-primary hover:underline"
                                onClick={() => setCambioTarget({
                                  productId: it.product_id,
                                  productName: it.product_name,
                                  origenTipo: "compra",
                                  compraId: o.id,
                                  varianteOrigen: it.variant_selection || {},
                                })}
                              >
                                <span>Solicitar cambio · {it.product_name}</span>
                                <RefreshCw className="w-3 h-3" />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </TabsContent>

              <TabsContent value="cambios" className="px-4 py-3 mt-0">
                <MisCambios alumnoId={alumnoId} key={cambioVersion} />
              </TabsContent>
            </Tabs>
          </div>
          <div className="p-4 border-t border-border">
            <Button variant="ghost" className="w-full" onClick={() => setOpen(false)}>Cerrar</Button>
          </div>
        </SheetContent>
      </Sheet>

      {cambioTarget && (
        <RequestCambioDialog
          open={!!cambioTarget}
          onOpenChange={(v) => !v && setCambioTarget(null)}
          productId={cambioTarget.productId}
          productName={cambioTarget.productName}
          origenTipo={cambioTarget.origenTipo}
          compraId={cambioTarget.compraId}
          preorderId={cambioTarget.preorderId}
          varianteOrigen={cambioTarget.varianteOrigen}
          onSubmitted={() => setCambioVersion((v) => v + 1)}
        />
      )}
    </section>
  );
};

export default MisComprasSection;
