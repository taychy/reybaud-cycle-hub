import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft,
  Download,
  ExternalLink,
  Lock,
  LockOpen,
  Package,
  Banknote,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { formatPrice } from "@/lib/currency";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface DeliveryList {
  id: string;
  titulo: string;
  descripcion: string | null;
  fecha_entrega: string | null;
  estado: string;
  caja_estado: string;
  caja_abierta_at: string | null;
  caja_cerrada_at: string | null;
  costo_total_mercaderia: number | null;
  pagado_a_proveedor: number | null;
  moneda_costo: string | null;
  proveedor_nombre: string | null;
  notas_cierre: string | null;
  created_at: string;
}

interface Summary {
  list_id: string;
  titulo: string;
  caja_estado: string;
  items_total: number;
  items_entregados: number;
  items_pendientes: number;
  esperado_cobrar: number;
  total_cobrado: number;
  total_cobrado_validado: number;
  total_pendiente: number;
  costo_total_mercaderia: number;
  pagado_a_proveedor: number;
  saldo_a_proveedor: number;
  margen_bruto: number;
  cobros_sin_validar: number;
}

interface SupplierPayment {
  id: string;
  delivery_list_id: string;
  monto: number;
  moneda: string;
  metodo: string;
  fecha: string;
  notas: string | null;
  registrado_por_nombre: string | null;
  created_at: string;
}

interface Payment {
  id: string;
  cliente_nombre: string;
  monto: number;
  moneda: string;
  forma_pago: string;
  validado: boolean;
  created_at: string;
  cargado_por_nombre: string | null;
  notas?: string | null;
}


interface Item {
  id: string;
  cliente_nombre: string;
  producto: string;
  variante: string | null;
  cantidad: number;
  notas: string | null;
  preparado: boolean;
  costo_unitario: number | null;
  precio_venta: number | null;
  moneda: string | null;
  posicion: number;
  store_product_id: string | null;
}

interface StoreProductLite {
  id: string;
  name: string;
  price: number | null;
  currency: string | null;
  costo: number | null;
  costo_moneda: string | null;
}

const AdminEntregaDetail = () => {
  const { listId } = useParams();
  const navigate = useNavigate();

  const [list, setList] = useState<DeliveryList | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [supplierPayments, setSupplierPayments] = useState<SupplierPayment[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [tab, setTab] = useState<"resumen" | "productos" | "items" | "cobros" | "proveedor" | "cierre">("resumen");
  const [storeProducts, setStoreProducts] = useState<StoreProductLite[]>([]);
  const [productEdits, setProductEdits] = useState<Record<string, { costo: string; precio: string; moneda: string; store_product_id: string }>>({});
  const [loading, setLoading] = useState(true);

  const [showNewPayment, setShowNewPayment] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const [notasCierre, setNotasCierre] = useState("");
  const [newPay, setNewPay] = useState({
    monto: "",
    moneda: "ARS",
    metodo: "transferencia",
    fecha: new Date().toISOString().slice(0, 10),
    notas: "",
  });
  const [savingCost, setSavingCost] = useState(false);
  const [costForm, setCostForm] = useState({ costo: "", proveedor: "", moneda: "ARS" });
  const [itemEdits, setItemEdits] = useState<Record<string, { costo_unitario: string; precio_venta: string; moneda: string }>>({});
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [payEdit, setPayEdit] = useState({ monto: "", moneda: "ARS", forma_pago: "efectivo", validado: false, notas: "", cliente_nombre: "" });
  const [savingPayEdit, setSavingPayEdit] = useState(false);
  const [deletingPaymentId, setDeletingPaymentId] = useState<string | null>(null);

  const openEditPayment = (p: Payment) => {
    setEditingPayment(p);
    setPayEdit({
      monto: String(p.monto ?? ""),
      moneda: p.moneda || "ARS",
      forma_pago: p.forma_pago || "efectivo",
      validado: !!p.validado,
      notas: p.notas || "",
      cliente_nombre: p.cliente_nombre || "",
    });
  };

  const savePaymentEdit = async () => {
    if (!editingPayment) return;
    const monto = parseFloat(payEdit.monto);
    if (isNaN(monto) || monto <= 0) { toast.error("Monto inválido"); return; }
    setSavingPayEdit(true);
    const { error } = await supabase
      .from("delivery_list_payments")
      .update({
        monto,
        moneda: payEdit.moneda,
        forma_pago: payEdit.forma_pago,
        validado: payEdit.validado,
        notas: payEdit.notas || null,
        cliente_nombre: payEdit.cliente_nombre,
      })
      .eq("id", editingPayment.id);
    setSavingPayEdit(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Cobro actualizado");
    setEditingPayment(null);
    await load();
  };

  const deletePayment = async () => {
    if (!deletingPaymentId) return;
    const { error } = await supabase.from("delivery_list_payments").delete().eq("id", deletingPaymentId);
    if (error) { toast.error(error.message); return; }
    toast.success("Cobro eliminado");
    setDeletingPaymentId(null);
    setEditingPayment(null);
    await load();
  };


  const load = async () => {
    if (!listId) return;
    setLoading(true);
    const [{ data: l }, { data: sum }, { data: sp }, { data: pays }, { data: its }] = await Promise.all([
      supabase.from("delivery_lists").select("*").eq("id", listId).maybeSingle(),
      supabase.rpc("delivery_list_summary_row", { p_list_id: listId }),
      supabase.from("delivery_supplier_payments").select("*").eq("delivery_list_id", listId).order("fecha", { ascending: false }),
      supabase
        .from("delivery_list_payments")
        .select("id, cliente_nombre, monto, moneda, forma_pago, validado, created_at, cargado_por_nombre, notas")
        .eq("list_id", listId)
        .order("created_at", { ascending: false }),
      supabase
        .from("delivery_list_items")
        .select("id, cliente_nombre, producto, variante, cantidad, notas, preparado, costo_unitario, precio_venta, moneda, posicion, store_product_id")
        .eq("list_id", listId)
        .order("cliente_nombre", { ascending: true })
        .order("posicion", { ascending: true }),
    ]);
    if (l) {
      setList(l as DeliveryList);
      setCostForm({
        costo: (l as any).costo_total_mercaderia?.toString() || "",
        proveedor: (l as any).proveedor_nombre || "",
        moneda: (l as any).moneda_costo || "ARS",
      });
    }
    if (sum && (sum as any[])[0]) setSummary((sum as any)[0] as Summary);
    setSupplierPayments((sp as any) || []);
    setPayments((pays as any) || []);
    const itemsData = ((its as any) || []) as Item[];
    setItems(itemsData);
    const edits: Record<string, { costo_unitario: string; precio_venta: string; moneda: string }> = {};
    itemsData.forEach((it) => {
      edits[it.id] = {
        costo_unitario: it.costo_unitario?.toString() ?? "",
        precio_venta: it.precio_venta?.toString() ?? "",
        moneda: it.moneda ?? "ARS",
      };
    });
    setItemEdits(edits);

    // productEdits: aggregated per producto+variante
    const pEdits: Record<string, { costo: string; precio: string; moneda: string; store_product_id: string }> = {};
    itemsData.forEach((it) => {
      const key = `${it.producto}||${it.variante ?? ""}`;
      if (!pEdits[key]) {
        pEdits[key] = {
          costo: it.costo_unitario?.toString() ?? "",
          precio: it.precio_venta?.toString() ?? "",
          moneda: it.moneda ?? "ARS",
          store_product_id: it.store_product_id ?? "",
        };
      }
    });
    setProductEdits(pEdits);

    // Fetch store products (once per load)
    const { data: sp2 } = await supabase
      .from("store_products")
      .select("id, name, price, currency, costo, costo_moneda")
      .order("name", { ascending: true });
    setStoreProducts((sp2 as any) || []);

    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listId]);

  const cajaAbierta = list?.caja_estado === "abierta";

  const grouped = useMemo(() => {
    const map: Record<string, Item[]> = {};
    items.forEach((it) => {
      const k = it.cliente_nombre || "(sin cliente)";
      if (!map[k]) map[k] = [];
      map[k].push(it);
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b, "es"));
  }, [items]);

  const productGroups = useMemo(() => {
    const map: Record<string, { producto: string; variante: string | null; items: Item[]; unidades: number; itemIds: string[] }> = {};
    items.forEach((it) => {
      const key = `${it.producto}||${it.variante ?? ""}`;
      if (!map[key]) map[key] = { producto: it.producto, variante: it.variante, items: [], unidades: 0, itemIds: [] };
      map[key].items.push(it);
      map[key].unidades += Number(it.cantidad || 0);
      map[key].itemIds.push(it.id);
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b, "es"));
  }, [items]);

  const [productSaveState, setProductSaveState] = useState<Record<string, "saving" | "saved" | undefined>>({});
  const saveProductGroup = async (key: string, itemIds: string[]) => {
    const edit = productEdits[key];
    if (!edit) return;
    const costo = edit.costo === "" ? null : Number(edit.costo);
    const precio = edit.precio === "" ? null : Number(edit.precio);
    const patch: any = {
      costo_unitario: costo,
      precio_venta: precio,
      moneda: edit.moneda || "ARS",
      store_product_id: edit.store_product_id || null,
    };
    setProductSaveState((s) => ({ ...s, [key]: "saving" }));
    const { error } = await supabase.from("delivery_list_items").update(patch).in("id", itemIds);
    if (error) {
      setProductSaveState((s) => ({ ...s, [key]: undefined }));
      return toast.error(error.message);
    }
    toast.success(`Actualizados ${itemIds.length} ítem(s)`);
    setProductSaveState((s) => ({ ...s, [key]: "saved" }));
    setTimeout(() => setProductSaveState((s) => ({ ...s, [key]: undefined })), 2500);
    load();
  };

  const linkAndPullFromStore = (key: string, storeProductId: string) => {
    const sp = storeProducts.find((s) => s.id === storeProductId);
    const current = productEdits[key];
    if (!sp || !current) return;
    setProductEdits({
      ...productEdits,
      [key]: {
        ...current,
        store_product_id: storeProductId,
        costo: sp.costo != null ? String(sp.costo) : current.costo,
        precio: sp.price != null ? String(sp.price) : current.precio,
        moneda: sp.costo_moneda || sp.currency || current.moneda,
      },
    });
  };

  const toggleEntregado = async (item: Item, checked: boolean) => {
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, preparado: checked } : i)));
    const { data: userRes } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("delivery_list_items")
      .update({ preparado: checked, preparado_by: checked ? userRes.user?.id ?? null : null })
      .eq("id", item.id);
    if (error) {
      toast.error(error.message);
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, preparado: !checked } : i)));
    }
  };

  const saveItemMoney = async (item: Item) => {
    const edit = itemEdits[item.id];
    if (!edit) return;
    const costo = edit.costo_unitario === "" ? null : Number(edit.costo_unitario);
    const precio = edit.precio_venta === "" ? null : Number(edit.precio_venta);
    const { error } = await supabase
      .from("delivery_list_items")
      .update({ costo_unitario: costo, precio_venta: precio, moneda: edit.moneda || "ARS" })
      .eq("id", item.id);
    if (error) return toast.error(error.message);
    toast.success("Guardado");
    load();
  };

  const saveCost = async () => {
    if (!list) return;
    setSavingCost(true);
    const { error } = await supabase
      .from("delivery_lists")
      .update({
        costo_total_mercaderia: Number(costForm.costo) || 0,
        proveedor_nombre: costForm.proveedor.trim() || null,
        moneda_costo: costForm.moneda,
      })
      .eq("id", list.id);
    setSavingCost(false);
    if (error) return toast.error(error.message);
    toast.success("Costo actualizado");
    load();
  };

  const addSupplierPayment = async () => {
    if (!list) return;
    const monto = Number(newPay.monto);
    if (!monto || monto <= 0) return toast.error("Monto inválido");
    const { data: userRes } = await supabase.auth.getUser();
    const { data: prof } = await supabase
      .from("admin_profiles")
      .select("first_name, last_name")
      .eq("user_id", userRes.user?.id || "")
      .maybeSingle();
    const nombre = prof ? `${prof.first_name || ""} ${prof.last_name || ""}`.trim() : null;
    const { error } = await supabase.from("delivery_supplier_payments").insert({
      delivery_list_id: list.id,
      monto,
      moneda: newPay.moneda,
      metodo: newPay.metodo,
      fecha: newPay.fecha,
      notas: newPay.notas.trim() || null,
      registrado_por: userRes.user?.id || null,
      registrado_por_nombre: nombre,
    });
    if (error) return toast.error(error.message);
    toast.success("Pago a proveedor registrado");
    setShowNewPayment(false);
    setNewPay({ monto: "", moneda: "ARS", metodo: "transferencia", fecha: new Date().toISOString().slice(0, 10), notas: "" });
    load();
  };

  const deleteSupplierPayment = async (id: string) => {
    const { error } = await supabase.from("delivery_supplier_payments").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Pago eliminado");
    load();
  };

  const closeCash = async () => {
    if (!list) return;
    const { error } = await supabase.rpc("close_delivery_cash", { p_list_id: list.id, p_notas: notasCierre.trim() || null });
    if (error) return toast.error(error.message);
    toast.success("Caja cerrada");
    setShowClose(false);
    setNotasCierre("");
    exportPdf();
    load();
  };

  const reopenCash = async () => {
    if (!list) return;
    const { error } = await supabase.rpc("reopen_delivery_cash", { p_list_id: list.id });
    if (error) return toast.error(error.message);
    toast.success("Caja reabierta");
    load();
  };

  const exportPdf = () => {
    if (!list || !summary) return;
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(`Cierre de caja — ${list.titulo}`, 14, 18);
    doc.setFontSize(10);
    doc.text(`Fecha: ${new Date().toLocaleString("es-AR")}`, 14, 26);
    if (list.proveedor_nombre) doc.text(`Proveedor: ${list.proveedor_nombre}`, 14, 32);
    autoTable(doc, {
      startY: 40,
      head: [["Indicador", "Valor"]],
      body: [
        ["Ítems totales", String(summary.items_total)],
        ["Entregados", String(summary.items_entregados)],
        ["Pendientes", String(summary.items_pendientes)],
        ["Esperado a cobrar", formatPrice(summary.esperado_cobrar, "ARS")],
        ["Total cobrado", formatPrice(summary.total_cobrado, "ARS")],
        ["Pendiente de cobro", formatPrice(summary.total_pendiente, "ARS")],
        ["Costo mercadería", formatPrice(summary.costo_total_mercaderia, "ARS")],
        ["Pagado a proveedor", formatPrice(summary.pagado_a_proveedor, "ARS")],
        ["Saldo a proveedor", formatPrice(summary.saldo_a_proveedor, "ARS")],
        ["Margen bruto", formatPrice(summary.margen_bruto, "ARS")],
      ],
    });
    const byMethod: Record<string, number> = {};
    payments.forEach((p) => {
      const k = `${p.forma_pago} · ${p.moneda}`;
      byMethod[k] = (byMethod[k] || 0) + Number(p.monto);
    });
    autoTable(doc, { head: [["Cobros por método", "Monto"]], body: Object.entries(byMethod).map(([k, v]) => [k, formatPrice(v, "ARS")]) });
    if (supplierPayments.length > 0) {
      autoTable(doc, {
        head: [["Fecha", "Método", "Monto", "Notas"]],
        body: supplierPayments.map((s) => [s.fecha, s.metodo, formatPrice(s.monto, s.moneda), s.notas || ""]),
      });
    }
    doc.save(`cierre-entrega-${list.titulo.replace(/\s+/g, "_")}.pdf`);
  };

  if (loading || !list || !summary) {
    return <div className="max-w-6xl mx-auto p-6 text-sm text-muted-foreground animate-pulse">Cargando...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="ghost" size="sm" onClick={() => navigate("/admin/entregas")}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Volver
        </Button>
        <h1 className="font-heading text-2xl flex-1">{list.titulo}</h1>
        <Badge variant={cajaAbierta ? "default" : "secondary"} className="text-[10px]">
          {cajaAbierta ? <><LockOpen className="w-3 h-3 mr-1" /> Caja abierta</> : <><Lock className="w-3 h-3 mr-1" /> Caja cerrada</>}
        </Badge>
        <Button variant="ghost" size="sm" asChild>
          <Link to={`/deposito/entregas/${list.id}`}>
            <ExternalLink className="w-3 h-3 mr-1" /> Ver en depósito
          </Link>
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(v: any) => setTab(v)}>
        <TabsList className="grid grid-cols-3 md:grid-cols-6 w-full">
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="productos">Productos</TabsTrigger>
          <TabsTrigger value="items">Clientes</TabsTrigger>
          <TabsTrigger value="cobros">Cobros ({payments.length})</TabsTrigger>
          <TabsTrigger value="proveedor">Proveedor</TabsTrigger>
          <TabsTrigger value="cierre">Cierre</TabsTrigger>
        </TabsList>

        {/* RESUMEN */}
        <TabsContent value="resumen" className="space-y-3 pt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Card><CardContent className="p-3"><div className="text-[10px] uppercase text-muted-foreground">Esperado</div><div className="font-heading text-xl">{formatPrice(summary.esperado_cobrar, "ARS")}</div></CardContent></Card>
            <Card><CardContent className="p-3"><div className="text-[10px] uppercase text-muted-foreground">Cobrado</div><div className="font-heading text-xl text-primary">{formatPrice(summary.total_cobrado, "ARS")}</div></CardContent></Card>
            <Card><CardContent className="p-3"><div className="text-[10px] uppercase text-muted-foreground">Por cobrar</div><div className="font-heading text-xl text-amber-500">{formatPrice(summary.total_pendiente, "ARS")}</div></CardContent></Card>
            <Card><CardContent className="p-3"><div className="text-[10px] uppercase text-muted-foreground">Margen bruto</div><div className="font-heading text-xl">{formatPrice(summary.margen_bruto, "ARS")}</div></CardContent></Card>
          </div>
          <div className="text-xs text-muted-foreground space-y-0.5">
            <div><Package className="w-3 h-3 inline mr-1" />{summary.items_entregados} entregados de {summary.items_total} ({summary.items_pendientes} pendientes)</div>
            <div><Banknote className="w-3 h-3 inline mr-1" />Costo mercadería {formatPrice(summary.costo_total_mercaderia, "ARS")} · Pagado {formatPrice(summary.pagado_a_proveedor, "ARS")} · Saldo {formatPrice(summary.saldo_a_proveedor, "ARS")}</div>
            {list.caja_abierta_at && <div>Caja abierta el {new Date(list.caja_abierta_at).toLocaleString("es-AR")}</div>}
            {list.caja_cerrada_at && <div>Caja cerrada el {new Date(list.caja_cerrada_at).toLocaleString("es-AR")}</div>}
          </div>
        </TabsContent>

        {/* PRODUCTOS (fuente única de costo/precio por producto+variante) */}
        <TabsContent value="productos" className="space-y-3 pt-4">
          <p className="text-xs text-muted-foreground">
            Cargá costo y precio a nivel <strong>producto + variante</strong>: se aplica a todos los clientes que llevaron ese ítem. Vinculá a un producto de la tienda para heredar los valores.
          </p>
          {productGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Sin productos.</p>
          ) : (
            <div className="space-y-2">
              {productGroups.map(([key, g]) => {
                const edit = productEdits[key] || { costo: "", precio: "", moneda: "ARS", store_product_id: "" };
                const linked = storeProducts.find((s) => s.id === edit.store_product_id);
                return (
                  <Card key={key}>
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">
                            {g.producto}
                            {g.variante ? <span className="text-muted-foreground text-xs"> · {g.variante}</span> : null}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {g.unidades} unidad(es) · {g.items.length} cliente(s)
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {productSaveState[key] === "saved" && <Badge className="text-[10px] bg-emerald-600 hover:bg-emerald-600">✓ Guardado</Badge>}
                          {linked && <Badge variant="secondary" className="text-[10px]">🔗 tienda</Badge>}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
                        <div className="col-span-2">
                          <Label className="text-[10px] uppercase text-muted-foreground">Producto de tienda</Label>
                          <Select
                            value={edit.store_product_id || "none"}
                            onValueChange={(v) => {
                              if (v === "none") {
                                setProductEdits({ ...productEdits, [key]: { ...edit, store_product_id: "" } });
                              } else {
                                linkAndPullFromStore(key, v);
                              }
                            }}
                          >
                            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Sin vincular" /></SelectTrigger>
                            <SelectContent className="max-h-64">
                              <SelectItem value="none">Sin vincular</SelectItem>
                              {storeProducts.map((sp) => (
                                <SelectItem key={sp.id} value={sp.id}>{sp.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-[10px] uppercase text-muted-foreground">Costo unit.</Label>
                          <Input
                            type="number"
                            value={edit.costo}
                            onChange={(e) => setProductEdits({ ...productEdits, [key]: { ...edit, costo: e.target.value } })}
                            placeholder="0"
                            className="h-8 text-sm"
                          />
                        </div>
                        <div>
                          <Label className="text-[10px] uppercase text-muted-foreground">Precio venta</Label>
                          <Input
                            type="number"
                            value={edit.precio}
                            onChange={(e) => setProductEdits({ ...productEdits, [key]: { ...edit, precio: e.target.value } })}
                            placeholder="0"
                            className="h-8 text-sm"
                          />
                        </div>
                        <div className="flex gap-1">
                          <Select value={edit.moneda} onValueChange={(v) => setProductEdits({ ...productEdits, [key]: { ...edit, moneda: v } })}>
                            <SelectTrigger className="h-8 text-sm w-20"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="ARS">ARS</SelectItem>
                              <SelectItem value="USD">USD</SelectItem>
                              <SelectItem value="EUR">EUR</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            size="sm"
                            onClick={() => saveProductGroup(key, g.itemIds)}
                            disabled={productSaveState[key] === "saving"}
                            className={productSaveState[key] === "saved" ? "bg-emerald-600 hover:bg-emerald-600" : ""}
                          >
                            {productSaveState[key] === "saving" ? "Guardando…" : productSaveState[key] === "saved" ? "✓ Guardado" : "Aplicar"}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ÍTEMS Y CLIENTES (solo entrega + resumen de plata read-only) */}
        <TabsContent value="items" className="space-y-3 pt-4">
          <p className="text-xs text-muted-foreground">
            Marcá los ítems entregados. El costo y precio se configura en la pestaña <strong>Productos</strong>.
          </p>
          {grouped.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Sin ítems.</p>
          ) : (
            grouped.map(([cliente, its]) => {
              const done = its.filter((i) => i.preparado).length;
              return (
                <Card key={cliente}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center justify-between">
                      <span>{cliente}</span>
                      <Badge variant="secondary" className="text-[10px]">{done}/{its.length} entregados</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1.5">
                    {its.map((it) => (
                      <div key={it.id} className="flex items-start gap-2 rounded-md border border-border/60 p-2">
                        <Checkbox
                          checked={it.preparado}
                          disabled={!cajaAbierta}
                          onCheckedChange={(v) => toggleEntregado(it, !!v)}
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          <div className={`text-sm ${it.preparado ? "line-through text-muted-foreground" : ""}`}>
                            {it.producto}{it.variante ? <span className="text-muted-foreground text-xs"> · {it.variante}</span> : null} × {it.cantidad}
                          </div>
                          {it.notas && <div className="text-[11px] text-muted-foreground">{it.notas}</div>}
                        </div>
                        <div className="text-right shrink-0 text-[11px] text-muted-foreground">
                          {it.precio_venta != null
                            ? <div className="text-foreground">{formatPrice(Number(it.precio_venta) * Number(it.cantidad || 1), it.moneda || "ARS")}</div>
                            : <div className="italic">sin precio</div>}
                          {it.costo_unitario != null && (
                            <div>costo {formatPrice(Number(it.costo_unitario), it.moneda || "ARS")}</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        {/* COBROS */}
        <TabsContent value="cobros" className="space-y-2 pt-4">
          <div className="flex justify-between items-center">
            <p className="text-xs text-muted-foreground">Cobros reportados por el entregador. Entran directo a la caja.</p>
            <Button size="sm" variant="ghost" asChild>
              <Link to="/admin/cobros-entrega">Validar cobros <ExternalLink className="w-3 h-3 ml-1" /></Link>
            </Button>
          </div>
          {payments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No hay cobros aún.</p>
          ) : (
            <div className="space-y-1.5">
              {payments.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => openEditPayment(p)}
                  className="w-full flex items-center justify-between rounded-md bg-secondary/40 hover:bg-secondary/60 transition px-3 py-2 text-sm text-left"
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">{p.cliente_nombre}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {new Date(p.created_at).toLocaleString("es-AR")} · {p.forma_pago}
                      {p.cargado_por_nombre ? ` · ${p.cargado_por_nombre}` : ""}
                      <span className="ml-1 opacity-70">· tocá para editar</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0 flex items-center gap-2">
                    <span className="font-medium">{formatPrice(p.monto, p.moneda)}</span>
                    {p.validado ? (
                      <Badge className="text-[9px] bg-primary/20 text-primary">✓</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[9px] text-amber-500 border-amber-500/50">pend</Badge>
                    )}
                  </div>
                </button>
              ))}

            </div>
          )}
        </TabsContent>

        {/* PROVEEDOR */}
        <TabsContent value="proveedor" className="space-y-3 pt-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Datos del proveedor y costo</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <Label className="text-xs">Proveedor</Label>
                  <Input value={costForm.proveedor} onChange={(e) => setCostForm({ ...costForm, proveedor: e.target.value })} placeholder="Ej: Santini" />
                </div>
                <div>
                  <Label className="text-xs">Moneda</Label>
                  <Select value={costForm.moneda} onValueChange={(v) => setCostForm({ ...costForm, moneda: v })}>
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
                <Label className="text-xs">Costo total de la mercadería</Label>
                <Input type="number" value={costForm.costo} onChange={(e) => setCostForm({ ...costForm, costo: e.target.value })} placeholder="0" />
              </div>
              <Button size="sm" variant="gold" onClick={saveCost} disabled={savingCost}>
                {savingCost ? "Guardando..." : "Guardar costo"}
              </Button>
            </CardContent>
          </Card>

          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium">Pagos al proveedor ({supplierPayments.length})</h4>
            <Button size="sm" variant="gold" onClick={() => setShowNewPayment(true)}>
              <Plus className="w-3 h-3 mr-1" /> Nuevo pago
            </Button>
          </div>

          {supplierPayments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Sin pagos registrados.</p>
          ) : (
            <div className="space-y-1.5">
              {supplierPayments.map((sp) => (
                <div key={sp.id} className="flex items-center justify-between rounded-md bg-secondary/40 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium">{formatPrice(sp.monto, sp.moneda)} · {sp.metodo}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {sp.fecha}
                      {sp.registrado_por_nombre ? ` · ${sp.registrado_por_nombre}` : ""}
                      {sp.notas ? ` · ${sp.notas}` : ""}
                    </div>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => deleteSupplierPayment(sp.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* CIERRE */}
        <TabsContent value="cierre" className="space-y-3 pt-4">
          {summary.cobros_sin_validar > 0 && (
            <div className="text-xs bg-amber-500/10 text-amber-600 rounded-md p-2">
              ⚠ Hay {summary.cobros_sin_validar} cobro(s) sin validar. Podés cerrar igualmente, quedan trazados.
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={exportPdf}>
              <Download className="w-3.5 h-3.5 mr-1" /> Descargar PDF
            </Button>
            {cajaAbierta ? (
              <Button variant="destructive" size="sm" onClick={() => setShowClose(true)}>
                <Lock className="w-3.5 h-3.5 mr-1" /> Cerrar caja
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={reopenCash}>
                <LockOpen className="w-3.5 h-3.5 mr-1" /> Reabrir (super admin)
              </Button>
            )}
          </div>
          {list.notas_cierre && (
            <div className="text-xs bg-secondary/40 rounded-md p-2">
              <div className="text-muted-foreground uppercase text-[9px] mb-1">Notas de cierre</div>
              {list.notas_cierre}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* NEW SUPPLIER PAYMENT */}
      <Dialog open={showNewPayment} onOpenChange={setShowNewPayment}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nuevo pago al proveedor</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <Label>Monto</Label>
                <Input type="number" value={newPay.monto} onChange={(e) => setNewPay({ ...newPay, monto: e.target.value })} />
              </div>
              <div>
                <Label>Moneda</Label>
                <Select value={newPay.moneda} onValueChange={(v) => setNewPay({ ...newPay, moneda: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ARS">ARS</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Método</Label>
                <Select value={newPay.metodo} onValueChange={(v) => setNewPay({ ...newPay, metodo: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="transferencia">Transferencia</SelectItem>
                    <SelectItem value="efectivo">Efectivo</SelectItem>
                    <SelectItem value="mp">Mercado Pago</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
                    <SelectItem value="otro">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Fecha</Label>
                <Input type="date" value={newPay.fecha} onChange={(e) => setNewPay({ ...newPay, fecha: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Notas (opcional)</Label>
              <Textarea rows={2} value={newPay.notas} onChange={(e) => setNewPay({ ...newPay, notas: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewPayment(false)}>Cancelar</Button>
            <Button variant="gold" onClick={addSupplierPayment}>Registrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CLOSE CASH */}
      <AlertDialog open={showClose} onOpenChange={setShowClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cerrar caja de esta lista?</AlertDialogTitle>
            <AlertDialogDescription>
              Una vez cerrada no se podrán registrar más cobros ni pagos a proveedor. Solo un super admin puede reabrir. Se descargará el PDF de cierre.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea placeholder="Notas de cierre (opcional)" value={notasCierre} onChange={(e) => setNotasCierre(e.target.value)} rows={3} />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={closeCash}>Sí, cerrar caja</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* EDIT PAYMENT */}
      <Dialog open={!!editingPayment} onOpenChange={(o) => !o && setEditingPayment(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar cobro</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Cliente</Label>
              <Input value={payEdit.cliente_nombre} onChange={(e) => setPayEdit({ ...payEdit, cliente_nombre: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Monto</Label>
                <Input type="number" step="0.01" value={payEdit.monto} onChange={(e) => setPayEdit({ ...payEdit, monto: e.target.value })} />
              </div>
              <div>
                <Label>Moneda</Label>
                <Select value={payEdit.moneda} onValueChange={(v) => setPayEdit({ ...payEdit, moneda: v })}>
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
              <Label>Forma de pago</Label>
              <Select value={payEdit.forma_pago} onValueChange={(v) => setPayEdit({ ...payEdit, forma_pago: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="efectivo">Efectivo</SelectItem>
                  <SelectItem value="transferencia">Transferencia</SelectItem>
                  <SelectItem value="mp">Mercado Pago</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                  <SelectItem value="otro">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="pay-validado" checked={payEdit.validado} onCheckedChange={(v) => setPayEdit({ ...payEdit, validado: !!v })} />
              <Label htmlFor="pay-validado" className="cursor-pointer">Validado</Label>
            </div>
            <div>
              <Label>Notas</Label>
              <Textarea rows={2} value={payEdit.notas} onChange={(e) => setPayEdit({ ...payEdit, notas: e.target.value })} />
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="destructive" onClick={() => editingPayment && setDeletingPaymentId(editingPayment.id)} className="sm:mr-auto">
              <Trash2 className="w-3.5 h-3.5 mr-1" /> Eliminar
            </Button>
            <Button variant="outline" onClick={() => setEditingPayment(null)}>Cancelar</Button>
            <Button variant="gold" onClick={savePaymentEdit} disabled={savingPayEdit}>
              {savingPayEdit ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DELETE PAYMENT CONFIRM */}
      <AlertDialog open={!!deletingPaymentId} onOpenChange={(o) => !o && setDeletingPaymentId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este cobro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. El cobro se quitará de la caja de la entrega.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={deletePayment}>Sí, eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>

  );
};

export default AdminEntregaDetail;
