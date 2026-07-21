import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
  Truck,
  Lock,
  LockOpen,
  Plus,
  Download,
  Trash2,
  ExternalLink,
  Package,
  Banknote,
  Store,
  ChevronRight,
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
  comprobante_url: string | null;
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
}

const AdminEntregasCaja = () => {
  const [params, setParams] = useSearchParams();
  const activeListId = params.get("list");

  const [lists, setLists] = useState<DeliveryList[]>([]);
  const [summaries, setSummaries] = useState<Record<string, Summary>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"abiertas" | "cerradas" | "todas">("abiertas");

  // Detail state
  const [selectedList, setSelectedList] = useState<DeliveryList | null>(null);
  const [detailSummary, setDetailSummary] = useState<Summary | null>(null);
  const [supplierPayments, setSupplierPayments] = useState<SupplierPayment[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [detailTab, setDetailTab] = useState<"resumen" | "cobros" | "proveedor" | "cierre">("resumen");

  // Dialogs
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

  const loadLists = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("delivery_lists")
      .select("*")
      .order("created_at", { ascending: false });
    const ls = (data as DeliveryList[]) || [];
    setLists(ls);
    // Load summaries in parallel
    const results = await Promise.all(
      ls.map((l) => supabase.rpc("delivery_list_summary_row", { p_list_id: l.id })),
    );
    const map: Record<string, Summary> = {};
    results.forEach((r, i) => {
      if (r.data && r.data[0]) map[ls[i].id] = r.data[0] as Summary;
    });
    setSummaries(map);
    setLoading(false);
  };

  useEffect(() => {
    loadLists();
  }, []);

  useEffect(() => {
    if (activeListId && lists.length > 0) {
      const l = lists.find((x) => x.id === activeListId);
      if (l) openDetail(l);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeListId, lists]);

  const openDetail = async (list: DeliveryList) => {
    setSelectedList(list);
    setCostForm({
      costo: list.costo_total_mercaderia?.toString() || "",
      proveedor: list.proveedor_nombre || "",
      moneda: list.moneda_costo || "ARS",
    });
    setParams({ list: list.id });
    const [{ data: sum }, { data: sp }, { data: pays }] = await Promise.all([
      supabase.rpc("delivery_list_summary_row", { p_list_id: list.id }),
      supabase
        .from("delivery_supplier_payments")
        .select("*")
        .eq("delivery_list_id", list.id)
        .order("fecha", { ascending: false }),
      supabase
        .from("delivery_list_payments")
        .select("id, cliente_nombre, monto, moneda, forma_pago, validado, created_at, cargado_por_nombre")
        .eq("list_id", list.id)
        .order("created_at", { ascending: false }),
    ]);
    if (sum && sum[0]) setDetailSummary(sum[0] as Summary);
    setSupplierPayments((sp as any) || []);
    setPayments((pays as any) || []);
  };

  const closeDetail = () => {
    setSelectedList(null);
    setDetailSummary(null);
    setSupplierPayments([]);
    setPayments([]);
    setParams({});
  };

  const saveCost = async () => {
    if (!selectedList) return;
    setSavingCost(true);
    const { error } = await supabase
      .from("delivery_lists")
      .update({
        costo_total_mercaderia: Number(costForm.costo) || 0,
        proveedor_nombre: costForm.proveedor.trim() || null,
        moneda_costo: costForm.moneda,
      })
      .eq("id", selectedList.id);
    setSavingCost(false);
    if (error) return toast.error(error.message);
    toast.success("Costo actualizado");
    await openDetail({
      ...selectedList,
      costo_total_mercaderia: Number(costForm.costo) || 0,
      proveedor_nombre: costForm.proveedor.trim() || null,
      moneda_costo: costForm.moneda,
    });
    loadLists();
  };

  const addSupplierPayment = async () => {
    if (!selectedList) return;
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
      delivery_list_id: selectedList.id,
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
    setNewPay({
      monto: "",
      moneda: "ARS",
      metodo: "transferencia",
      fecha: new Date().toISOString().slice(0, 10),
      notas: "",
    });
    openDetail(selectedList);
    loadLists();
  };

  const deleteSupplierPayment = async (id: string) => {
    const { error } = await supabase.from("delivery_supplier_payments").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Pago eliminado");
    if (selectedList) openDetail(selectedList);
    loadLists();
  };

  const closeCash = async () => {
    if (!selectedList) return;
    const { error } = await supabase.rpc("close_delivery_cash", {
      p_list_id: selectedList.id,
      p_notas: notasCierre.trim() || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Caja cerrada");
    setShowClose(false);
    setNotasCierre("");
    exportPdf();
    openDetail(selectedList);
    loadLists();
  };

  const reopenCash = async () => {
    if (!selectedList) return;
    const { error } = await supabase.rpc("reopen_delivery_cash", { p_list_id: selectedList.id });
    if (error) return toast.error(error.message);
    toast.success("Caja reabierta");
    openDetail(selectedList);
    loadLists();
  };

  const exportPdf = () => {
    if (!selectedList || !detailSummary) return;
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(`Cierre de caja — ${selectedList.titulo}`, 14, 18);
    doc.setFontSize(10);
    doc.text(`Fecha: ${new Date().toLocaleString("es-AR")}`, 14, 26);
    if (selectedList.proveedor_nombre)
      doc.text(`Proveedor: ${selectedList.proveedor_nombre}`, 14, 32);

    autoTable(doc, {
      startY: 40,
      head: [["Indicador", "Valor"]],
      body: [
        ["Ítems totales", String(detailSummary.items_total)],
        ["Entregados", String(detailSummary.items_entregados)],
        ["Pendientes", String(detailSummary.items_pendientes)],
        ["Esperado a cobrar", formatPrice(detailSummary.esperado_cobrar, "ARS")],
        ["Total cobrado", formatPrice(detailSummary.total_cobrado, "ARS")],
        ["Pendiente de cobro", formatPrice(detailSummary.total_pendiente, "ARS")],
        ["Costo mercadería", formatPrice(detailSummary.costo_total_mercaderia, "ARS")],
        ["Pagado a proveedor", formatPrice(detailSummary.pagado_a_proveedor, "ARS")],
        ["Saldo a proveedor", formatPrice(detailSummary.saldo_a_proveedor, "ARS")],
        ["Margen bruto", formatPrice(detailSummary.margen_bruto, "ARS")],
      ],
    });

    // Payments breakdown by method+currency
    const byMethod: Record<string, number> = {};
    payments.forEach((p) => {
      const k = `${p.forma_pago} · ${p.moneda}`;
      byMethod[k] = (byMethod[k] || 0) + Number(p.monto);
    });
    autoTable(doc, {
      head: [["Cobros por método", "Monto"]],
      body: Object.entries(byMethod).map(([k, v]) => [k, formatPrice(v, "ARS")]),
    });

    if (supplierPayments.length > 0) {
      autoTable(doc, {
        head: [["Fecha", "Método", "Monto", "Notas"]],
        body: supplierPayments.map((s) => [
          s.fecha,
          s.metodo,
          formatPrice(s.monto, s.moneda),
          s.notas || "",
        ]),
      });
    }

    if (notasCierre.trim() || selectedList.notas_cierre) {
      const y = (doc as any).lastAutoTable?.finalY || 100;
      doc.setFontSize(10);
      doc.text("Notas de cierre:", 14, y + 10);
      doc.setFontSize(9);
      doc.text(notasCierre.trim() || selectedList.notas_cierre || "", 14, y + 16, {
        maxWidth: 180,
      });
    }

    doc.save(`cierre-entrega-${selectedList.titulo.replace(/\s+/g, "_")}.pdf`);
  };

  const visibleLists = useMemo(() => {
    return lists.filter((l) => {
      if (filter === "abiertas") return l.caja_estado === "abierta";
      if (filter === "cerradas") return l.caja_estado === "cerrada";
      return true;
    });
  }, [lists, filter]);

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Store className="w-6 h-6 text-primary" />
          <div>
            <h1 className="font-heading text-2xl">Entregas / Caja</h1>
            <p className="text-xs text-muted-foreground">
              Contabilidad por lote de entrega. Cada lista es una caja independiente.
            </p>
          </div>
        </div>
        <div className="flex gap-1 rounded-lg bg-secondary p-1">
          {(["abiertas", "cerradas", "todas"] as const).map((k) => (
            <Button
              key={k}
              size="sm"
              variant={filter === k ? "default" : "ghost"}
              onClick={() => setFilter(k)}
              className="capitalize"
            >
              {k}
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground animate-pulse">Cargando...</p>
      ) : visibleLists.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No hay listas en este filtro.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {visibleLists.map((l) => {
            const s = summaries[l.id];
            return (
              <Card
                key={l.id}
                className={`cursor-pointer hover:border-primary/50 transition-colors ${
                  l.caja_estado === "cerrada" ? "opacity-70" : ""
                }`}
                onClick={() => openDetail(l)}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                    {l.titulo}
                    <Badge
                      variant={l.caja_estado === "abierta" ? "default" : "secondary"}
                      className="text-[10px]"
                    >
                      {l.caja_estado === "abierta" ? (
                        <><LockOpen className="w-3 h-3 mr-1" /> Abierta</>
                      ) : (
                        <><Lock className="w-3 h-3 mr-1" /> Cerrada</>
                      )}
                    </Badge>
                    {s?.cobros_sin_validar > 0 && (
                      <Badge variant="destructive" className="text-[10px]">
                        {s.cobros_sin_validar} sin validar
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 space-y-2">
                  {s && (
                    <>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <div className="text-muted-foreground">Entregas</div>
                          <div className="font-medium">
                            {s.items_entregados}/{s.items_total}
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Cobrado</div>
                          <div className="font-medium text-primary">
                            {formatPrice(s.total_cobrado, "ARS")}
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Por cobrar</div>
                          <div className="font-medium text-amber-500">
                            {formatPrice(s.total_pendiente, "ARS")}
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Saldo proveedor</div>
                          <div className="font-medium">
                            {formatPrice(s.saldo_a_proveedor, l.moneda_costo || "ARS")}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-xs pt-1">
                        <span className="text-muted-foreground">
                          Margen: {formatPrice(s.margen_bruto, "ARS")}
                        </span>
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* DETAIL DIALOG */}
      <Dialog open={!!selectedList} onOpenChange={(o) => !o && closeDetail()}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {selectedList && detailSummary && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 flex-wrap">
                  {selectedList.titulo}
                  <Badge
                    variant={selectedList.caja_estado === "abierta" ? "default" : "secondary"}
                    className="text-[10px]"
                  >
                    {selectedList.caja_estado === "abierta" ? "Caja abierta" : "Caja cerrada"}
                  </Badge>
                  <Button variant="ghost" size="sm" asChild>
                    <Link to={`/deposito/entregas/${selectedList.id}`}>
                      <ExternalLink className="w-3 h-3 mr-1" /> Ver depósito
                    </Link>
                  </Button>
                </DialogTitle>
              </DialogHeader>

              <Tabs value={detailTab} onValueChange={(v: any) => setDetailTab(v)}>
                <TabsList className="grid grid-cols-4">
                  <TabsTrigger value="resumen">Resumen</TabsTrigger>
                  <TabsTrigger value="cobros">Cobros ({payments.length})</TabsTrigger>
                  <TabsTrigger value="proveedor">Proveedor</TabsTrigger>
                  <TabsTrigger value="cierre">Cierre</TabsTrigger>
                </TabsList>

                <TabsContent value="resumen" className="space-y-3 pt-3">
                  <div className="grid grid-cols-2 gap-2">
                    <Card>
                      <CardContent className="p-3">
                        <div className="text-[10px] uppercase text-muted-foreground">Esperado</div>
                        <div className="font-heading text-xl">
                          {formatPrice(detailSummary.esperado_cobrar, "ARS")}
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-3">
                        <div className="text-[10px] uppercase text-muted-foreground">Cobrado</div>
                        <div className="font-heading text-xl text-primary">
                          {formatPrice(detailSummary.total_cobrado, "ARS")}
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-3">
                        <div className="text-[10px] uppercase text-muted-foreground">Por cobrar</div>
                        <div className="font-heading text-xl text-amber-500">
                          {formatPrice(detailSummary.total_pendiente, "ARS")}
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-3">
                        <div className="text-[10px] uppercase text-muted-foreground">Margen bruto</div>
                        <div className="font-heading text-xl">
                          {formatPrice(detailSummary.margen_bruto, "ARS")}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    <div>
                      <Package className="w-3 h-3 inline mr-1" />
                      {detailSummary.items_entregados} entregados de {detailSummary.items_total} (
                      {detailSummary.items_pendientes} pendientes)
                    </div>
                    <div>
                      <Banknote className="w-3 h-3 inline mr-1" />
                      Costo mercadería {formatPrice(detailSummary.costo_total_mercaderia, "ARS")} · Pagado
                      al proveedor {formatPrice(detailSummary.pagado_a_proveedor, "ARS")} · Saldo{" "}
                      {formatPrice(detailSummary.saldo_a_proveedor, "ARS")}
                    </div>
                    {selectedList.caja_abierta_at && (
                      <div>
                        Caja abierta el{" "}
                        {new Date(selectedList.caja_abierta_at).toLocaleString("es-AR")}
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="cobros" className="space-y-2 pt-3">
                  <div className="flex justify-between items-center">
                    <p className="text-xs text-muted-foreground">
                      Cobros reportados por el entregador. Entran directo a la caja.
                    </p>
                    <Button size="sm" variant="ghost" asChild>
                      <Link to="/admin/cobros-entrega">
                        Validar cobros <ExternalLink className="w-3 h-3 ml-1" />
                      </Link>
                    </Button>
                  </div>
                  {payments.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">
                      No hay cobros aún.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {payments.map((p) => (
                        <div
                          key={p.id}
                          className="flex items-center justify-between rounded-md bg-secondary/40 px-3 py-2 text-sm"
                        >
                          <div className="min-w-0">
                            <div className="font-medium truncate">{p.cliente_nombre}</div>
                            <div className="text-[10px] text-muted-foreground">
                              {new Date(p.created_at).toLocaleString("es-AR")} · {p.forma_pago}
                              {p.cargado_por_nombre ? ` · ${p.cargado_por_nombre}` : ""}
                            </div>
                          </div>
                          <div className="text-right shrink-0 flex items-center gap-2">
                            <span className="font-medium">{formatPrice(p.monto, p.moneda)}</span>
                            {p.validado ? (
                              <Badge className="text-[9px] bg-primary/20 text-primary">✓</Badge>
                            ) : (
                              <Badge variant="outline" className="text-[9px] text-amber-500 border-amber-500/50">
                                pend
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="proveedor" className="space-y-3 pt-3">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Datos del proveedor y costo</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-2">
                          <Label className="text-xs">Proveedor</Label>
                          <Input
                            value={costForm.proveedor}
                            onChange={(e) => setCostForm({ ...costForm, proveedor: e.target.value })}
                            placeholder="Ej: Santini"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Moneda</Label>
                          <Select
                            value={costForm.moneda}
                            onValueChange={(v) => setCostForm({ ...costForm, moneda: v })}
                          >
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
                        <Input
                          type="number"
                          value={costForm.costo}
                          onChange={(e) => setCostForm({ ...costForm, costo: e.target.value })}
                          placeholder="0"
                        />
                      </div>
                      <Button size="sm" variant="gold" onClick={saveCost} disabled={savingCost}>
                        {savingCost ? "Guardando..." : "Guardar costo"}
                      </Button>
                    </CardContent>
                  </Card>

                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium">
                      Pagos al proveedor ({supplierPayments.length})
                    </h4>
                    <Button size="sm" variant="gold" onClick={() => setShowNewPayment(true)}>
                      <Plus className="w-3 h-3 mr-1" /> Nuevo pago
                    </Button>
                  </div>

                  {supplierPayments.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Sin pagos registrados.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {supplierPayments.map((sp) => (
                        <div
                          key={sp.id}
                          className="flex items-center justify-between rounded-md bg-secondary/40 px-3 py-2 text-sm"
                        >
                          <div className="min-w-0">
                            <div className="font-medium">
                              {formatPrice(sp.monto, sp.moneda)} · {sp.metodo}
                            </div>
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

                <TabsContent value="cierre" className="space-y-3 pt-3">
                  {detailSummary.cobros_sin_validar > 0 && (
                    <div className="text-xs bg-amber-500/10 text-amber-600 rounded-md p-2">
                      ⚠ Hay {detailSummary.cobros_sin_validar} cobro(s) sin validar. Podés cerrar
                      igualmente, quedan trazados.
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={exportPdf}>
                      <Download className="w-3.5 h-3.5 mr-1" /> Descargar PDF
                    </Button>
                    {selectedList.caja_estado === "abierta" ? (
                      <Button variant="destructive" size="sm" onClick={() => setShowClose(true)}>
                        <Lock className="w-3.5 h-3.5 mr-1" /> Cerrar caja
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" onClick={reopenCash}>
                        <LockOpen className="w-3.5 h-3.5 mr-1" /> Reabrir (super admin)
                      </Button>
                    )}
                  </div>
                  {selectedList.notas_cierre && (
                    <div className="text-xs bg-secondary/40 rounded-md p-2">
                      <div className="text-muted-foreground uppercase text-[9px] mb-1">
                        Notas de cierre
                      </div>
                      {selectedList.notas_cierre}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* NEW SUPPLIER PAYMENT DIALOG */}
      <Dialog open={showNewPayment} onOpenChange={setShowNewPayment}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo pago al proveedor</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <Label>Monto</Label>
                <Input
                  type="number"
                  value={newPay.monto}
                  onChange={(e) => setNewPay({ ...newPay, monto: e.target.value })}
                />
              </div>
              <div>
                <Label>Moneda</Label>
                <Select
                  value={newPay.moneda}
                  onValueChange={(v) => setNewPay({ ...newPay, moneda: v })}
                >
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
                <Select
                  value={newPay.metodo}
                  onValueChange={(v) => setNewPay({ ...newPay, metodo: v })}
                >
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
                <Input
                  type="date"
                  value={newPay.fecha}
                  onChange={(e) => setNewPay({ ...newPay, fecha: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>Notas (opcional)</Label>
              <Textarea
                rows={2}
                value={newPay.notas}
                onChange={(e) => setNewPay({ ...newPay, notas: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewPayment(false)}>Cancelar</Button>
            <Button variant="gold" onClick={addSupplierPayment}>Registrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CLOSE CASH CONFIRM */}
      <AlertDialog open={showClose} onOpenChange={setShowClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cerrar caja de esta lista?</AlertDialogTitle>
            <AlertDialogDescription>
              Una vez cerrada no se podrán registrar más cobros ni pagos a proveedor. Solo un super
              admin puede reabrir. Se descargará el PDF de cierre.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            placeholder="Notas de cierre (opcional)"
            value={notasCierre}
            onChange={(e) => setNotasCierre(e.target.value)}
            rows={3}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={closeCash}>Sí, cerrar caja</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminEntregasCaja;
