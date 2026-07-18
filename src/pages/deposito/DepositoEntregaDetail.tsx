import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Link2,
  Upload,
  Plus,
  Trash2,
  ShoppingCart,
  ClipboardList,
  Download,
  Lock,
  Unlock,
  FileSpreadsheet,
  UserRound,
  Search,
  History,
} from "lucide-react";
import { toast } from "sonner";
import {
  parseDeliveryExcel,
  buildDeliveryExcelTemplate,
  type DeliveryExcelRow,
} from "@/lib/deliveryExcel";
import DeliveryPaymentsSection from "@/components/deposito/DeliveryPaymentsSection";
import DeliveryClientNotify from "@/components/deposito/DeliveryClientNotify";

interface DeliveryList {
  id: string;
  titulo: string;
  descripcion: string | null;
  fecha_entrega: string | null;
  estado: string;
  origen: string;
  public_token: string;
  public_editable: boolean;
}

interface DeliveryItem {
  id: string;
  list_id: string;
  cliente_nombre: string;
  producto: string;
  variante: string | null;
  cantidad: number;
  notas: string | null;
  preparado: boolean;
  preparado_at: string | null;
  source_type: string | null;
  source_order_id: string | null;
  source_preorder_id: string | null;
  alumno_id: string | null;
  aviso_retiro_enviado_at: string | null;
  aviso_retiro_channel: string | null;
}

const formatVariant = (v: any): string | null => {
  if (!v) return null;
  if (typeof v === "string") return v;
  if (typeof v === "object") {
    const entries = Object.entries(v).filter(([, val]) => val != null && val !== "");
    if (entries.length === 0) return null;
    return entries.map(([k, val]) => `${k}: ${val}`).join(" · ");
  }
  return String(v);
};

const DepositoEntregaDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [list, setList] = useState<DeliveryList | null>(null);
  const [items, setItems] = useState<DeliveryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showManual, setShowManual] = useState(false);
  const [showFromOrders, setShowFromOrders] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const excelRef = useRef<HTMLInputElement>(null);

  const fetch = async () => {
    if (!id) return;
    const [{ data: l }, { data: its }] = await Promise.all([
      supabase.from("delivery_lists").select("*").eq("id", id).maybeSingle(),
      supabase
        .from("delivery_list_items")
        .select("*")
        .eq("list_id", id)
        .order("cliente_nombre")
        .order("posicion")
        .order("created_at"),
    ]);
    setList(l as any);
    setItems((its as any) || []);
    setLoading(false);
  };

  useEffect(() => {
    fetch();
  }, [id]);

  const grouped = useMemo(() => {
    const byClient: Record<string, DeliveryItem[]> = {};
    items.forEach((it) => {
      (byClient[it.cliente_nombre] ||= []).push(it);
    });
    return Object.entries(byClient).sort((a, b) => a[0].localeCompare(b[0]));
  }, [items]);

  const totals = useMemo(() => {
    const total = items.length;
    const prep = items.filter((i) => i.preparado).length;
    return { total, prep, pct: total ? Math.round((prep / total) * 100) : 0 };
  }, [items]);

  const toggleItem = async (item: DeliveryItem, checked: boolean) => {
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, preparado: checked } : i)));
    const { data: userRes } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("delivery_list_items")
      .update({ preparado: checked, preparado_by: checked ? userRes.user?.id ?? null : null })
      .eq("id", item.id);
    if (error) {
      toast.error("No se pudo actualizar");
      fetch();
    }
  };

  const removeItem = async (item: DeliveryItem) => {
    if (!confirm("¿Eliminar este ítem?")) return;
    const { error } = await supabase.from("delivery_list_items").delete().eq("id", item.id);
    if (error) return toast.error(error.message);
    setItems((prev) => prev.filter((i) => i.id !== item.id));
  };

  const copyPublicLink = () => {
    if (!list) return;
    const url = `${window.location.origin}/entrega/${list.public_token}`;
    navigator.clipboard.writeText(url);
    toast.success("Link copiado", { description: url });
  };

  const togglePublicEditable = async () => {
    if (!list) return;
    const { error } = await supabase
      .from("delivery_lists")
      .update({ public_editable: !list.public_editable })
      .eq("id", list.id);
    if (error) return toast.error(error.message);
    setList({ ...list, public_editable: !list.public_editable });
    toast.success(list.public_editable ? "Link ahora es sólo lectura" : "Link ahora es editable");
  };

  const closeList = async () => {
    if (!list) return;
    const nuevo = list.estado === "abierta" ? "cerrada" : "abierta";
    const { error } = await supabase.from("delivery_lists").update({ estado: nuevo }).eq("id", list.id);
    if (error) return toast.error(error.message);
    setList({ ...list, estado: nuevo });
    toast.success(nuevo === "cerrada" ? "Lista cerrada" : "Lista reabierta");
  };

  const handleImportExcel = async (file: File) => {
    if (!list) return;
    const { rows, errors } = await parseDeliveryExcel(file);
    if (errors.length && rows.length === 0) {
      toast.error(errors[0]);
      return;
    }
    if (rows.length === 0) {
      toast.error("El archivo no tiene filas válidas.");
      return;
    }
    const payload = rows.map((r, idx) => ({
      list_id: list.id,
      cliente_nombre: r.cliente_nombre,
      producto: r.producto,
      variante: r.variante,
      cantidad: r.cantidad,
      notas: r.notas,
      source_type: "excel",
      posicion: idx,
    }));
    const { error } = await supabase.from("delivery_list_items").insert(payload);
    if (error) return toast.error(error.message);
    toast.success(`${rows.length} ítems importados${errors.length ? ` · ${errors.length} filas omitidas` : ""}`);
    await supabase.from("delivery_lists").update({ origen: "excel" }).eq("id", list.id);
    setShowImport(false);
    fetch();
  };

  const downloadTemplate = async () => {
    const blob = await buildDeliveryExcelTemplate();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "plantilla-entregas.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <div className="py-16 text-center text-muted-foreground animate-pulse">Cargando...</div>;
  if (!list) return <div className="py-16 text-center text-muted-foreground">Lista no encontrada.</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate("/deposito/entregas")}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Volver
        </Button>
        {list.estado !== "abierta" && (
          <Badge variant="secondary" className="text-[10px]">{list.estado}</Badge>
        )}
      </div>

      <div className="glass-card rounded-lg p-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-xl font-heading font-bold uppercase tracking-wider">{list.titulo}</h1>
            {list.descripcion && <p className="text-sm text-muted-foreground mt-1">{list.descripcion}</p>}
            {list.fecha_entrega && (
              <p className="text-xs text-muted-foreground mt-1">Entrega: {list.fecha_entrega}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button variant="outline" size="sm" onClick={copyPublicLink}>
              <Link2 className="w-3.5 h-3.5 mr-1" /> Copiar link
            </Button>
            <Button variant="outline" size="sm" onClick={togglePublicEditable}>
              {list.public_editable ? (
                <><Unlock className="w-3.5 h-3.5 mr-1" /> Editable</>
              ) : (
                <><Lock className="w-3.5 h-3.5 mr-1" /> Solo lectura</>
              )}
            </Button>
            <Button variant="outline" size="sm" onClick={closeList}>
              {list.estado === "abierta" ? "Cerrar lista" : "Reabrir"}
            </Button>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>Progreso</span>
            <span className="font-medium text-foreground">{totals.prep}/{totals.total} · {totals.pct}%</span>
          </div>
          <div className="h-2 rounded bg-secondary overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${totals.pct}%` }} />
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 pt-1">
          <Button variant="gold" size="sm" onClick={() => setShowManual(true)}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Ítem manual
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowFromOrders(true)}>
            <ShoppingCart className="w-3.5 h-3.5 mr-1" /> Desde pedidos pagos
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowImport(true)}>
            <FileSpreadsheet className="w-3.5 h-3.5 mr-1" /> Importar Excel
          </Button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="glass-card rounded-lg p-8 text-center space-y-2">
          <ClipboardList className="w-8 h-8 mx-auto text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">Todavía no cargaste ningún ítem.</p>
          <p className="text-xs text-muted-foreground">
            Podés agregarlos manualmente, importar un Excel o traerlos de los pedidos pagos.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {grouped.map(([cliente, its]) => {
            const total = its.length;
            const prep = its.filter((i) => i.preparado).length;
            const pct = Math.round((prep / total) * 100);
            const complete = prep === total;
            return (
              <div key={cliente} className={`glass-card rounded-lg p-3 border ${complete ? "border-primary/40" : "border-transparent"}`}>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <UserRound className="w-4 h-4 text-primary shrink-0" />
                    <span className="font-medium truncate">{cliente}</span>
                    {complete && <Badge className="text-[10px]">Listo</Badge>}
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">{prep}/{total} · {pct}%</span>
                </div>
                <div className="h-1 rounded bg-secondary overflow-hidden mb-2">
                  <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                </div>
                <div className="space-y-1">
                  {its.map((it) => {
                    const variantText = formatVariant(it.variante);
                    return (
                      <label
                        key={it.id}
                        className={`flex items-start gap-2 p-2 rounded-md cursor-pointer transition-colors ${
                          it.preparado ? "bg-primary/5" : "hover:bg-secondary/50"
                        }`}
                      >
                        <Checkbox
                          checked={it.preparado}
                          onCheckedChange={(v) => toggleItem(it, !!v)}
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          <div className={`text-sm ${it.preparado ? "line-through text-muted-foreground" : ""}`}>
                            {it.cantidad > 1 && <span className="font-semibold mr-1">{it.cantidad}×</span>}
                            {it.producto}
                          </div>
                          {variantText && (
                            <div className="text-xs text-muted-foreground">{variantText}</div>
                          )}
                          {it.notas && (
                            <div className="text-xs text-muted-foreground italic">{it.notas}</div>
                          )}
                          {(it.source_order_id || it.source_preorder_id) && (
                            <div className="text-[10px] text-muted-foreground/70 mt-0.5">
                              {it.source_preorder_id ? "Preventa" : "Pedido"} vinculado
                            </div>
                          )}
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            removeItem(it);
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </label>
                    );
                  })}
                </div>
                <DeliveryClientNotify
                  listId={list.id}
                  listTitulo={list.titulo}
                  clienteNombre={cliente}
                  items={its.map(i => ({
                    id: i.id,
                    producto: i.producto,
                    variante: i.variante,
                    cantidad: i.cantidad,
                    alumno_id: i.alumno_id,
                    aviso_retiro_enviado_at: i.aviso_retiro_enviado_at,
                    aviso_retiro_channel: i.aviso_retiro_channel,
                  }))}
                  onChanged={fetch}
                />
                <DeliveryPaymentsSection
                  mode="auth"
                  listId={list.id}
                  clienteNombre={cliente}
                />
              </div>
            );
          })}
        </div>
      )}

      <ManualItemDialog
        open={showManual}
        onOpenChange={setShowManual}
        listId={list.id}
        onSaved={fetch}
      />
      <FromOrdersDialog
        open={showFromOrders}
        onOpenChange={setShowFromOrders}
        listId={list.id}
        onSaved={fetch}
      />
      <Dialog open={showImport} onOpenChange={setShowImport}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Importar desde Excel</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Subí un archivo .xlsx. Detecto las columnas automáticamente por su encabezado — necesito al menos
              <b> Cliente</b> y <b>Producto</b>. Opcionales: <b>Variante</b>, <b>Cantidad</b>, <b>Notas</b>.
            </p>
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <Download className="w-3.5 h-3.5 mr-1" /> Descargar plantilla
            </Button>
            <input
              ref={excelRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImportExcel(f);
                e.target.value = "";
              }}
            />
            <Button variant="gold" onClick={() => excelRef.current?.click()}>
              <Upload className="w-4 h-4 mr-1" /> Elegir archivo
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const ManualItemDialog = ({
  open,
  onOpenChange,
  listId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  listId: string;
  onSaved: () => void;
}) => {
  const [form, setForm] = useState({ cliente_nombre: "", producto: "", variante: "", cantidad: "1", notas: "" });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.cliente_nombre.trim() || !form.producto.trim()) {
      toast.error("Completá cliente y producto");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("delivery_list_items").insert({
      list_id: listId,
      cliente_nombre: form.cliente_nombre.trim(),
      producto: form.producto.trim(),
      variante: form.variante.trim() || null,
      cantidad: Math.max(1, parseFloat(form.cantidad) || 1),
      notas: form.notas.trim() || null,
      source_type: "manual",
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Ítem agregado");
    setForm({ cliente_nombre: "", producto: "", variante: "", cantidad: "1", notas: "" });
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo ítem manual</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Cliente</Label>
            <Input value={form.cliente_nombre} onChange={(e) => setForm({ ...form, cliente_nombre: e.target.value })} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>Producto</Label>
            <Input value={form.producto} onChange={(e) => setForm({ ...form, producto: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>Variante</Label>
              <Input
                placeholder="Talle M · Negro"
                value={form.variante}
                onChange={(e) => setForm({ ...form, variante: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Cantidad</Label>
              <Input type="number" min={1} value={form.cantidad} onChange={(e) => setForm({ ...form, cantidad: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Notas (opcional)</Label>
            <Textarea rows={2} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button variant="gold" onClick={save} disabled={saving}>
            {saving ? "Guardando..." : "Agregar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const FromOrdersDialog = ({
  open,
  onOpenChange,
  listId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  listId: string;
  onSaved: () => void;
}) => {
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<any[]>([]);
  const [preorders, setPreorders] = useState<any[]>([]);
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [selectedPreorders, setSelectedPreorders] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      const [{ data: ords }, { data: preos }] = await Promise.all([
        supabase
          .from("store_orders")
          .select("id,order_number,customer_name,status,delivered_at,created_at,store_order_items(id,product_name,quantity,variant_selection)")
          .in("status", ["pagado", "pendiente_pago_efectivo"])
          .is("delivered_at", null)
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("store_preorders")
          .select("id,alumno_nombre,producto_nombre,cantidad,variante,estado,saldo_pendiente,created_at")
          .not("estado", "in", "(entregada,cancelada)")
          .order("created_at", { ascending: false })
          .limit(200),
      ]);
      setOrders(ords || []);
      setPreorders((preos || []).filter((p: any) => Number(p.saldo_pendiente || 0) === 0 || p.estado === "lista_para_retirar"));
      setSelectedOrders(new Set());
      setSelectedPreorders(new Set());
      setLoading(false);
    })();
  }, [open]);

  const save = async () => {
    if (selectedOrders.size === 0 && selectedPreorders.size === 0) {
      toast.error("Seleccioná al menos un pedido");
      return;
    }
    setSaving(true);
    const payload: any[] = [];
    orders
      .filter((o) => selectedOrders.has(o.id))
      .forEach((o) => {
        (o.store_order_items || []).forEach((it: any, idx: number) => {
          payload.push({
            list_id: listId,
            cliente_nombre: o.customer_name || "Sin nombre",
            producto: it.product_name,
            variante: it.variant_selection ? JSON.stringify(it.variant_selection) : null,
            cantidad: it.quantity || 1,
            notas: o.order_number ? `Pedido #${o.order_number}` : null,
            source_type: "store_order",
            source_order_id: o.id,
            source_order_item_id: it.id,
            posicion: idx,
          });
        });
      });
    preorders
      .filter((p) => selectedPreorders.has(p.id))
      .forEach((p) => {
        payload.push({
          list_id: listId,
          cliente_nombre: p.alumno_nombre || "Sin nombre",
          producto: p.producto_nombre,
          variante: p.variante ? JSON.stringify(p.variante) : null,
          cantidad: p.cantidad || 1,
          notas: "Preventa",
          source_type: "store_preorder",
          source_preorder_id: p.id,
        });
      });
    // Format variant column better: try to convert JSON to readable text
    payload.forEach((it) => {
      if (typeof it.variante === "string" && it.variante.startsWith("{")) {
        try {
          const obj = JSON.parse(it.variante);
          it.variante = Object.entries(obj)
            .filter(([, v]) => v != null && v !== "")
            .map(([k, v]) => `${k}: ${v}`)
            .join(" · ") || null;
        } catch {}
      }
    });
    const { error } = await supabase.from("delivery_list_items").insert(payload);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`${payload.length} ítems agregados`);
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Agregar desde pedidos pagos</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {loading ? (
            <div className="py-8 text-center text-muted-foreground animate-pulse">Cargando...</div>
          ) : (
            <>
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Pedidos de tienda ({orders.length})
                </h3>
                {orders.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No hay pedidos pagos pendientes de entrega.</p>
                ) : (
                  <div className="space-y-1">
                    {orders.map((o) => (
                      <label key={o.id} className="flex items-start gap-2 p-2 rounded-md hover:bg-secondary/50 cursor-pointer">
                        <Checkbox
                          checked={selectedOrders.has(o.id)}
                          onCheckedChange={(v) => {
                            const next = new Set(selectedOrders);
                            if (v) next.add(o.id);
                            else next.delete(o.id);
                            setSelectedOrders(next);
                          }}
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0 text-sm">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{o.customer_name}</span>
                            <Badge variant="outline" className="text-[10px]">#{o.order_number}</Badge>
                            <Badge variant="secondary" className="text-[10px]">{o.status}</Badge>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {(o.store_order_items || []).length} ítem(s)
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Preventas pagas ({preorders.length})
                </h3>
                {preorders.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No hay preventas pagas pendientes.</p>
                ) : (
                  <div className="space-y-1">
                    {preorders.map((p) => (
                      <label key={p.id} className="flex items-start gap-2 p-2 rounded-md hover:bg-secondary/50 cursor-pointer">
                        <Checkbox
                          checked={selectedPreorders.has(p.id)}
                          onCheckedChange={(v) => {
                            const next = new Set(selectedPreorders);
                            if (v) next.add(p.id);
                            else next.delete(p.id);
                            setSelectedPreorders(next);
                          }}
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0 text-sm">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{p.alumno_nombre}</span>
                            <Badge variant="secondary" className="text-[10px]">{p.estado}</Badge>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {p.cantidad}× {p.producto_nombre}
                            {formatVariant(p.variante) && ` · ${formatVariant(p.variante)}`}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button variant="gold" onClick={save} disabled={saving}>
            {saving ? "Guardando..." : `Agregar (${selectedOrders.size + selectedPreorders.size})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DepositoEntregaDetail;
