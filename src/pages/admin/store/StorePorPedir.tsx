import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "@/hooks/use-toast";
import { Loader2, PackagePlus, AlertTriangle, RefreshCw, Info, ChevronDown, ChevronUp, Boxes } from "lucide-react";
import { compareVariantsBySize } from "@/lib/variantSort";
import { Link } from "react-router-dom";

const sb: any = supabase;

/** Estados de venta que todavía requieren traer mercadería. */
const PENDING_STATUSES = ["pendiente", "pendiente_pago", "pendiente_pago_efectivo", "pagado", "preparando"];

/** Días sin pedir a partir de los cuales avisamos. */
const REMINDER_DAYS = 3;

interface SaleRef {
  itemId: string;
  orderId: string;
  orderNumber: string | null;
  cliente: string;
  quantity: number;
  createdAt: string;
}

interface Group {
  key: string;
  supplierId: string;
  supplierNombre: string;
  productId: string | null;
  productoNombre: string;
  variante: Record<string, string>;
  varianteLabel: string;
  vendida: number;
  stock: number;
  sugerido: number;
  oldestAt: string;
  sales: SaleRef[];
}

interface SupplierBlock {
  supplierId: string;
  nombre: string;
  email: string | null;
  groups: Group[];
}

const buildVariantKey = (variante: Record<string, string>, specs: { name: string }[] | null) => {
  const entries = Object.entries(variante || {});
  if (entries.length === 0) return null;
  if (specs && specs.length > 0) {
    const parts = specs
      .map((s) => (variante[s.name] != null ? `${s.name}:${variante[s.name]}` : null))
      .filter(Boolean) as string[];
    return parts.length ? parts.join("|") : null;
  }
  return entries
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => `${k}:${v}`)
    .join("|");
};

const varianteLabel = (variante: Record<string, string>) => {
  const entries = Object.entries(variante || {});
  if (!entries.length) return "Sin variante";
  return entries.map(([k, v]) => `${k}: ${v}`).join(" · ");
};

const daysSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);

const StorePorPedir = () => {
  const [loading, setLoading] = useState(true);
  const [blocks, setBlocks] = useState<SupplierBlock[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [qtyOverride, setQtyOverride] = useState<Record<string, number>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [dialogSupplier, setDialogSupplier] = useState<SupplierBlock | null>(null);
  const [fechaEta, setFechaEta] = useState("");
  const [moneda, setMoneda] = useState("ARS");
  const [notas, setNotas] = useState("");
  const [emailProveedor, setEmailProveedor] = useState("");
  const [enviarEmail, setEnviarEmail] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: items, error } = await sb
        .from("store_order_items")
        .select("id, order_id, product_id, product_name, quantity, variant_selection, created_at, order:store_orders!inner(id, order_number, customer_name, status, created_at)")
        .is("supplier_order_item_id", null)
        .in("order.status", PENDING_STATUSES);
      if (error) throw error;

      const productIds = Array.from(new Set((items || []).map((i: any) => i.product_id).filter(Boolean)));
      if (productIds.length === 0) {
        setBlocks([]);
        return;
      }

      const { data: prods, error: pErr } = await sb
        .from("store_products")
        .select("id, name, variants, variant_stock, stock, supplier_id, es_externo")
        .in("id", productIds);
      if (pErr) throw pErr;

      const prodById = new Map<string, any>((prods || []).map((p: any) => [p.id, p]));
      const supplierIds = Array.from(new Set((prods || []).map((p: any) => p.supplier_id).filter(Boolean)));
      if (supplierIds.length === 0) {
        setBlocks([]);
        return;
      }

      const { data: sups, error: sErr } = await sb
        .from("store_suppliers")
        .select("id, nombre, email")
        .in("id", supplierIds);
      if (sErr) throw sErr;
      const supById = new Map<string, any>((sups || []).map((s: any) => [s.id, s]));

      const groups = new Map<string, Group>();
      for (const it of items || []) {
        const p = it.product_id ? prodById.get(it.product_id) : null;
        if (!p?.supplier_id) continue;
        const sup = supById.get(p.supplier_id);
        if (!sup) continue;

        const variante = (it.variant_selection || {}) as Record<string, string>;
        const vKey = buildVariantKey(variante, p.variants || null);
        const key = `${p.supplier_id}::${p.id}::${vKey || "-"}`;

        const stockVariante = vKey
          ? Number((p.variant_stock || {})[vKey] ?? 0)
          : Number(p.stock ?? 0);

        const existing = groups.get(key);
        const sale: SaleRef = {
          itemId: it.id,
          orderId: it.order_id,
          orderNumber: it.order?.order_number ?? null,
          cliente: it.order?.customer_name || "Cliente",
          quantity: Number(it.quantity) || 0,
          createdAt: it.order?.created_at || it.created_at,
        };
        if (existing) {
          existing.vendida += sale.quantity;
          existing.sales.push(sale);
          if (sale.createdAt < existing.oldestAt) existing.oldestAt = sale.createdAt;
        } else {
          groups.set(key, {
            key,
            supplierId: p.supplier_id,
            supplierNombre: sup.nombre,
            productId: p.id,
            productoNombre: p.name || it.product_name,
            variante,
            varianteLabel: varianteLabel(variante),
            vendida: sale.quantity,
            stock: stockVariante,
            sugerido: 0,
            oldestAt: sale.createdAt,
            sales: [sale],
          });
        }
      }

      const list = Array.from(groups.values()).map((g) => ({
        ...g,
        sugerido: Math.max(0, g.vendida - g.stock),
      }));

      const bySupplier = new Map<string, SupplierBlock>();
      for (const g of list) {
        const sup = supById.get(g.supplierId);
        if (!bySupplier.has(g.supplierId)) {
          bySupplier.set(g.supplierId, {
            supplierId: g.supplierId,
            nombre: sup?.nombre || "Proveedor",
            email: sup?.email || null,
            groups: [],
          });
        }
        bySupplier.get(g.supplierId)!.groups.push(g);
      }

      const result = Array.from(bySupplier.values());
      for (const b of result) {
        b.groups.sort((a, c) =>
          a.productoNombre === c.productoNombre
            ? compareVariantsBySize(a.variante, c.variante)
            : a.productoNombre.localeCompare(c.productoNombre)
        );
      }
      result.sort((a, b) => a.nombre.localeCompare(b.nombre));
      setBlocks(result);

      // Preseleccionar todo lo que requiere pedido (falta stock).
      setSelected((prev) => {
        const next = { ...prev };
        for (const b of result) for (const g of b.groups) if (!(g.key in next)) next[g.key] = g.sugerido > 0;
        return next;
      });
    } catch (e: any) {
      toast({ title: "Error al cargar", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const qtyFor = (g: Group) => (qtyOverride[g.key] != null ? qtyOverride[g.key] : g.sugerido);

  const atrasados = useMemo(
    () => blocks.flatMap((b) => b.groups).filter((g) => g.sugerido > 0 && daysSince(g.oldestAt) >= REMINDER_DAYS),
    [blocks]
  );

  const openDialog = (block: SupplierBlock) => {
    const chosen = block.groups.filter((g) => selected[g.key] && qtyFor(g) > 0);
    if (chosen.length === 0) {
      toast({ title: "Nada seleccionado", description: "Elegí al menos un ítem con cantidad mayor a 0.", variant: "destructive" });
      return;
    }
    setDialogSupplier(block);
    setEmailProveedor(block.email || "");
    setEnviarEmail(!!block.email);
    setFechaEta("");
    setMoneda("ARS");
    setNotas("");
  };

  const confirmar = async () => {
    if (!dialogSupplier) return;
    const chosen = dialogSupplier.groups.filter((g) => selected[g.key] && qtyFor(g) > 0);
    const email = emailProveedor.trim();
    if (enviarEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast({ title: "Email inválido", description: "Revisá el email del proveedor o desactivá el envío.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const groupsPayload = chosen.map((g) => ({
        product_id: g.productId,
        producto_nombre: g.productoNombre,
        variante: g.variante,
        cantidad: qtyFor(g),
        notas: g.sales.map((s) => `${s.cliente}${s.orderNumber ? ` (#${s.orderNumber})` : ""} x${s.quantity}`).join(" · "),
        store_order_item_ids: g.sales.map((s) => s.itemId),
      }));

      const { data, error } = await sb.rpc("create_supplier_order_from_sales", {
        p_supplier_id: dialogSupplier.supplierId,
        p_proveedor_nombre: dialogSupplier.nombre,
        p_proveedor_email: email || null,
        p_fecha_estimada_entrega: fechaEta || null,
        p_moneda: moneda,
        p_notas: notas.trim() || null,
        p_groups: groupsPayload,
      });
      if (error) throw error;
      const created = Array.isArray(data) ? data[0] : data;

      if (enviarEmail && email) {
        const { error: mailErr } = await sb.functions.invoke("send-transactional-email", {
          body: {
            templateName: "supplier-order-created",
            recipientEmail: email,
            idempotencyKey: `supplier-order-${created?.order_id}-created`,
            templateData: {
              proveedorNombre: dialogSupplier.nombre,
              numero: created?.numero || "",
              fechaPedido: new Date().toISOString().slice(0, 10),
              fechaEta: fechaEta || null,
              moneda,
              totalEstimado: 0,
              notas: notas.trim() || null,
              items: groupsPayload.map((g) => ({
                producto_nombre: g.producto_nombre,
                variante: g.variante,
                cantidad_pedida: g.cantidad,
                precio_unitario: null,
                notas: null,
              })),
              contactoNombre: "Equipo Reybaud",
            },
          },
        });
        if (mailErr) {
          toast({ title: `Pedido ${created?.numero} creado, pero falló el email`, description: mailErr.message, variant: "destructive" });
        } else {
          toast({ title: `Pedido ${created?.numero} creado`, description: `Email enviado a ${email}` });
        }
      } else {
        toast({ title: `Pedido ${created?.numero} creado`, description: "Podés completar precios y enviarlo desde Pedidos a proveedor." });
      }
      setDialogSupplier(null);
      await load();
    } catch (e: any) {
      toast({ title: "Error al armar el pedido", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-10 justify-center">
        <Loader2 className="w-4 h-4 animate-spin" /> Cargando ventas pendientes...
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-heading font-bold uppercase tracking-wide">Por pedir al proveedor</h2>
            <p className="text-sm text-muted-foreground max-w-2xl">
              Ventas de productos con proveedor que todavía no fueron incluidas en ningún pedido. Se agrupan por producto y
              variante, y se descuenta el stock que ya tenés en depósito.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw className="w-4 h-4 mr-1" /> Actualizar
          </Button>
        </div>

        {atrasados.length > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
            <AlertTriangle className="w-4 h-4 mt-0.5 text-destructive shrink-0" />
            <span>
              Hay <strong>{atrasados.length}</strong> {atrasados.length === 1 ? "ítem esperando" : "ítems esperando"} hace más de{" "}
              {REMINDER_DAYS} días sin pedirse al proveedor.
            </span>
          </div>
        )}

        {blocks.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No hay ventas pendientes de pedir. Cuando entre una venta de un producto con proveedor asignado, aparece acá.
            </CardContent>
          </Card>
        )}

        {blocks.map((b) => {
          const chosen = b.groups.filter((g) => selected[g.key] && qtyFor(g) > 0);
          const totalUnidades = chosen.reduce((acc, g) => acc + qtyFor(g), 0);
          return (
            <Card key={b.supplierId}>
              <CardContent className="p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">{b.nombre}</p>
                    <p className="text-xs text-muted-foreground">
                      {b.email || "Sin email cargado"} · {b.groups.length} {b.groups.length === 1 ? "variante" : "variantes"} con ventas pendientes
                    </p>
                  </div>
                  <Button onClick={() => openDialog(b)} disabled={chosen.length === 0}>
                    <PackagePlus className="w-4 h-4 mr-1" />
                    Armar pedido ({totalUnidades} u.)
                  </Button>
                </div>

                <div className="divide-y divide-border rounded-md border border-border">
                  {b.groups.map((g) => {
                    const cubierto = g.sugerido === 0;
                    const dias = daysSince(g.oldestAt);
                    return (
                      <div key={g.key} className="p-3 space-y-2">
                        <div className="flex items-start gap-3">
                          <Checkbox
                            checked={!!selected[g.key]}
                            onCheckedChange={(v) => setSelected((s) => ({ ...s, [g.key]: !!v }))}
                            className="mt-1"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium truncate">{g.productoNombre}</span>
                              <Badge variant="outline" className="text-[10px]">{g.varianteLabel}</Badge>
                              {cubierto && (
                                <Badge className="bg-green-500/20 text-green-400 text-[10px] gap-1">
                                  <Boxes className="w-3 h-3" /> Cubierto con stock
                                </Badge>
                              )}
                              {!cubierto && dias >= REMINDER_DAYS && (
                                <Badge className="bg-destructive/20 text-destructive text-[10px]">
                                  Esperando {dias} días
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Vendidas: <strong>{g.vendida}</strong> · Stock en depósito: <strong>{g.stock}</strong> · A pedir sugerido:{" "}
                              <strong>{g.sugerido}</strong>
                            </p>
                          </div>
                          <div className="w-24 shrink-0">
                            <div className="flex items-center gap-1">
                              <Label className="text-[10px] text-muted-foreground">A pedir</Label>
                              <Tooltip>
                                <TooltipTrigger asChild><Info className="w-3 h-3 text-muted-foreground" /></TooltipTrigger>
                                <TooltipContent className="max-w-xs text-xs">
                                  Sugerido = vendidas − stock disponible de esa variante. Podés ajustarlo si querés pedir de más.
                                </TooltipContent>
                              </Tooltip>
                            </div>
                            <Input
                              type="number"
                              min={0}
                              className="h-8"
                              value={qtyFor(g)}
                              onChange={(e) => setQtyOverride((q) => ({ ...q, [g.key]: Math.max(0, Number(e.target.value) || 0) }))}
                            />
                          </div>
                        </div>

                        <button
                          type="button"
                          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                          onClick={() => setExpanded((s) => ({ ...s, [g.key]: !s[g.key] }))}
                        >
                          {expanded[g.key] ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          {g.sales.length} {g.sales.length === 1 ? "venta" : "ventas"} de origen
                        </button>
                        {expanded[g.key] && (
                          <ul className="text-xs text-muted-foreground pl-5 space-y-0.5">
                            {g.sales.map((s) => (
                              <li key={s.itemId}>
                                {s.cliente} {s.orderNumber ? `· #${s.orderNumber}` : ""} — {s.quantity} u. ·{" "}
                                {new Date(s.createdAt).toLocaleDateString("es-AR")}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })}

        <p className="text-xs text-muted-foreground">
          Los pedidos armados se gestionan en{" "}
          <Link to="/admin/tienda/pedidos-proveedor" className="underline">Pedidos a proveedor</Link>, donde se controla el
          ingreso con escaneo y se actualiza el stock.
        </p>

        <Dialog open={!!dialogSupplier} onOpenChange={(o) => !o && setDialogSupplier(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Armar pedido a {dialogSupplier?.nombre}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="rounded-md border border-border p-3 text-sm space-y-1 max-h-52 overflow-y-auto">
                {dialogSupplier?.groups
                  .filter((g) => selected[g.key] && qtyFor(g) > 0)
                  .map((g) => (
                    <div key={g.key} className="flex justify-between gap-2">
                      <span className="truncate">{g.productoNombre} · {g.varianteLabel}</span>
                      <strong>{qtyFor(g)} u.</strong>
                    </div>
                  ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Entrega estimada</Label>
                  <Input type="date" value={fechaEta} onChange={(e) => setFechaEta(e.target.value)} />
                </div>
                <div>
                  <Label>Moneda</Label>
                  <Select value={moneda} onValueChange={setMoneda}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ARS">ARS</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Notas para el proveedor</Label>
                <Textarea rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} />
              </div>
              <div>
                <Label>Email del proveedor</Label>
                <Input type="email" value={emailProveedor} onChange={(e) => setEmailProveedor(e.target.value)} placeholder="ventas@proveedor.com" />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={enviarEmail} onCheckedChange={(v) => setEnviarEmail(!!v)} />
                Enviar el pedido por email al proveedor ahora
              </label>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setDialogSupplier(null)} disabled={saving}>Cancelar</Button>
              <Button onClick={() => void confirmar()} disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                Crear pedido
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
};

export default StorePorPedir;
