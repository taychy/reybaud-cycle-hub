import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
  Search, FileSpreadsheet, FileText, Eye, Truck, Store, Package, MapPin,
  Phone, User, QrCode, MessageCircle, Mail, DollarSign, Ban,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { formatPrice } from "@/lib/currency";
import ExcelJS from "exceljs";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { printSinglePreorderLabel } from "@/lib/preorderLabels";
import { ConfirmFullPaymentDialog } from "@/components/store/ConfirmFullPaymentDialog";
import { getPaymentMethodLabel } from "@/lib/paymentMethods";

interface OrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  producto_nombre: string;
  variante: any;
  cantidad: number;
  precio_unitario: number;
}

interface Order {
  id: string;
  order_number: number;
  alumno_id: string | null;
  customer_name: string;
  customer_email: string | null;
  total: number;
  currency: string;
  status: string;
  notes: string | null;
  shipping_tracking: string | null;
  created_at: string;
  metodo_pago: string | null;
  pagado_at: string | null;
  entrega_metodo: string | null;
  sede_retiro_id: string | null;
  envio_direccion: string | null;
  envio_contacto: string | null;
  envio_notas: string | null;
  envio_costo: number | null;
  envio_estado: string | null;
  delivered_at: string | null;
  items?: OrderItem[];
}

interface Alumno {
  id: string;
  nombre?: string | null;
  apellido?: string | null;
  email?: string | null;
  telefono?: string | null;
  dni?: string | null;
}

interface Sede {
  id: string;
  nombre: string;
  direccion?: string | null;
  ciudad?: string | null;
}

const STATUSES = [
  "pendiente",
  "pendiente_pago",
  "pendiente_pago_efectivo",
  "pagado",
  "preparando",
  "enviado",
  "entregado",
  "cancelado",
];

const ENVIO_ESTADOS = ["a_cotizar", "cotizado", "pagado", "enviado", "entregado"];

const estadoColor = (e: string) => {
  switch (e) {
    case "pagado": return "bg-emerald-500/20 text-emerald-400";
    case "preparando": return "bg-accent/20 text-accent";
    case "enviado": return "bg-primary/20 text-primary";
    case "entregado": return "bg-green-500/20 text-green-400";
    case "cancelado": return "bg-destructive/20 text-destructive";
    case "pendiente_pago":
    case "pendiente_pago_efectivo": return "bg-amber-500/20 text-amber-400";
    default: return "bg-muted text-muted-foreground";
  }
};

// El pago es independiente del estado de fulfillment.
// Solo se considera pagado cuando hay un registro real en `pagado_at`
// (lo setea el admin al confirmar el cobro) o cuando el flujo
// originó el pedido ya pago (status inicial "pagado" sin tránsito por entrega).
const isPagado = (o: Order) => !!o.pagado_at;

const isEntregado = (o: Order) => o.status === "entregado" || !!o.delivered_at;

// Estado de pago consolidado para la columna PAGO
const getPagoStatus = (o: Order) => {
  if (o.status === "cancelado") return "irrelevante" as const;
  if (isPagado(o)) return "pagado" as const;
  if (isEntregado(o)) return "deuda_entregada" as const;
  return "pendiente" as const;
};

const varianteToKey = (v: Record<string, any>) =>
  Object.entries(v || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, val]) => `${k}: ${val}`)
    .join(" · ") || "—";

// Aplana líneas para exports
const flattenLines = (orders: Order[], alumnos: Record<string, Alumno>) => {
  const lines: {
    order_id: string;
    alumno: Alumno | undefined;
    customer_name: string;
    producto: string;
    variante: Record<string, any>;
    cantidad: number;
    precio_unitario: number;
    moneda: string;
  }[] = [];
  orders.forEach((o) => {
    const al = o.alumno_id ? alumnos[o.alumno_id] : undefined;
    (o.items || []).forEach((it) => {
      lines.push({
        order_id: o.id,
        alumno: al,
        customer_name: o.customer_name,
        producto: it.producto_nombre,
        variante: it.variante || {},
        cantidad: Number(it.cantidad || 0),
        precio_unitario: Number(it.precio_unitario || 0),
        moneda: o.currency,
      });
    });
  });
  return lines;
};

interface StoreOrdersProps {
  /** Si se pasa, solo muestra pedidos con estos status y bloquea el filtro */
  restrictStatuses?: string[];
  title?: string;
  subtitle?: string;
}

const StoreOrders = ({ restrictStatuses, title = "Pedidos", subtitle }: StoreOrdersProps = {}) => {
  const [rows, setRows] = useState<Order[]>([]);
  const [alumnosMap, setAlumnosMap] = useState<Record<string, Alumno>>({});
  const [sedesMap, setSedesMap] = useState<Record<string, Sede>>({});
  const [filterEstado, setFilterEstado] = useState("all");
  const [filterEntrega, setFilterEntrega] = useState("all");
  const [filterProducto, setFilterProducto] = useState("all");
  const [search, setSearch] = useState("");
  const [soloDeudores, setSoloDeudores] = useState(false);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<Order | null>(null);
  const [payOrder, setPayOrder] = useState<Order | null>(null);
  const { toast } = useToast();

  const load = async () => {
    const { data: orders } = await supabase
      .from("store_orders")
      .select("*")
      .order("created_at", { ascending: false });
    const list = (orders as any[]) || [];

    // Items
    const orderIds = list.map((o) => o.id);
    let itemsByOrder: Record<string, OrderItem[]> = {};
    if (orderIds.length) {
      const { data: items } = await supabase
        .from("store_order_items")
        .select("*")
        .in("order_id", orderIds);
      (items || []).forEach((it: any) => {
        (itemsByOrder[it.order_id] = itemsByOrder[it.order_id] || []).push(it);
      });
    }
    const enriched: Order[] = list.map((o: any) => ({ ...o, items: itemsByOrder[o.id] || [] }));
    setRows(enriched);

    if (enriched.length) {
      const alIds = Array.from(new Set(enriched.map((o) => o.alumno_id).filter(Boolean))) as string[];
      const sedeIds = Array.from(new Set(enriched.map((o) => o.sede_retiro_id).filter(Boolean))) as string[];
      const [{ data: alus }, { data: sds }] = await Promise.all([
        alIds.length
          ? supabase.from("alumnos").select("id, nombre, apellido, email, telefono, dni").in("id", alIds)
          : Promise.resolve({ data: [] as any[] }),
        sedeIds.length
          ? supabase.from("sedes").select("id, nombre, direccion, ciudad").in("id", sedeIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const am: Record<string, Alumno> = {};
      (alus || []).forEach((a: any) => { am[a.id] = a; });
      setAlumnosMap(am);
      const sm: Record<string, Sede> = {};
      (sds || []).forEach((s: any) => { sm[s.id] = s; });
      setSedesMap(sm);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const productosUnicos = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => (r.items || []).forEach((it) => set.add(it.producto_nombre)));
    return Array.from(set).sort();
  }, [rows]);

  const filtered = rows.filter((r) => {
    if (restrictStatuses && !restrictStatuses.includes(r.status)) return false;
    if (filterEstado !== "all" && r.status !== filterEstado) return false;
    if (filterEntrega !== "all" && (r.entrega_metodo || "") !== filterEntrega) return false;
    if (filterProducto !== "all" && !(r.items || []).some((it) => it.producto_nombre === filterProducto)) return false;
    if (soloDeudores) {
      const s = getPagoStatus(r);
      if (s !== "deuda_entregada" && s !== "pendiente") return false;
    }
    if (search) {
      const s = search.toLowerCase();
      const al = r.alumno_id ? alumnosMap[r.alumno_id] : null;
      const nombre = al ? `${al.nombre || ""} ${al.apellido || ""}` : r.customer_name;
      const email = al?.email || r.customer_email || "";
      const dni = al?.dni || "";
      const productos = (r.items || []).map((i) => i.producto_nombre).join(" ");
      const haystack = `${nombre} ${email} ${dni} ${productos} #${r.order_number}`.toLowerCase();
      if (!haystack.includes(s)) return false;
    }
    return true;
  });

  const deudoresCount = useMemo(
    () => rows.filter((r) => {
      const s = getPagoStatus(r);
      return s === "deuda_entregada" || s === "pendiente";
    }).length,
    [rows],
  );
  const deudaEntregadaCount = useMemo(
    () => rows.filter((r) => getPagoStatus(r) === "deuda_entregada").length,
    [rows],
  );

  const updateField = async (id: string, patch: Partial<Order>) => {
    const { error } = await supabase.from("store_orders").update(patch as any).eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Actualizado" });
    load();
    if (detail?.id === id) setDetail({ ...detail, ...patch } as Order);
  };

  const registrarPago = async (
    o: Order,
    value: { metodo_pago: string; referencia?: string | null; monto: number; partial: boolean },
  ) => {
    const nowIso = new Date().toISOString();
    const traza = `[${new Date().toLocaleString("es-AR")}] Pago registrado por admin · ${getPaymentMethodLabel(value.metodo_pago)} · ${formatPrice(value.monto, o.currency)}${value.referencia ? ` · Ref: ${value.referencia}` : ""}`;
    const patch: any = {
      status: "pagado",
      pagado_at: nowIso,
      metodo_pago: value.metodo_pago,
      notes: [o.notes, traza].filter(Boolean).join("\n"),
    };
    const { error } = await supabase.from("store_orders").update(patch).eq("id", o.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "✓ Pago registrado", description: getPaymentMethodLabel(value.metodo_pago) });
    if (detail?.id === o.id) setDetail({ ...detail, ...patch });
    load();
  };

  const imprimirEtiqueta = async (o: Order) => {
    const al = o.alumno_id ? alumnosMap[o.alumno_id] : null;
    const sede = o.sede_retiro_id ? sedesMap[o.sede_retiro_id] : null;
    const firstItem = (o.items || [])[0];
    const productoNombre = (o.items || []).length > 1
      ? `${(o.items || []).length} productos`
      : firstItem?.producto_nombre || "Pedido";
    const total = Number(o.total || 0);
    const pagado = isPagado(o);
    await printSinglePreorderLabel({
      id: o.id,
      alumno_id: o.alumno_id || undefined,
      short_number: `#${o.order_number}`,
      producto_nombre: productoNombre,
      cantidad: (o.items || []).reduce((s, i) => s + Number(i.cantidad || 0), 0) || 1,
      variante: firstItem?.variante || {},
      items: (o.items || []).map((i) => ({
        nombre: i.producto_nombre,
        variante: i.variante,
        precio: i.precio_unitario,
      })),
      precio_total: total,
      sena_monto: pagado ? total : 0,
      saldo_pendiente: pagado ? 0 : total,
      moneda: o.currency,
      estado_pago_sena: pagado ? "confirmada" : "pendiente",
      entrega_metodo: o.entrega_metodo,
      sede_nombre: sede?.nombre || null,
      envio_direccion: o.envio_direccion,
      envio_contacto: o.envio_contacto,
      envio_notas: o.envio_notas,
      alumno_nombre: `${al?.nombre || ""} ${al?.apellido || ""}`.trim() || o.customer_name,
      alumno_email: al?.email || o.customer_email,
      alumno_telefono: al?.telefono || null,
      created_at: o.created_at,
    });
  };

  const enviarWhatsApp = (o: Order) => {
    const al = o.alumno_id ? alumnosMap[o.alumno_id] : null;
    const tel = (al?.telefono || "").replace(/\D/g, "");
    if (!tel) {
      toast({ title: "Sin teléfono", description: "El cliente no tiene WhatsApp cargado.", variant: "destructive" });
      return;
    }
    let waTel = tel;
    if (!waTel.startsWith("54")) waTel = "549" + waTel.replace(/^0?15?/, "");
    else if (waTel.startsWith("54") && !waTel.startsWith("549")) waTel = "549" + waTel.slice(2);

    const nombre = al?.nombre || o.customer_name.split(" ")[0] || "";
    const total = Number(o.total || 0);
    const pagado = isPagado(o);

    const lines: string[] = [];
    lines.push(`Hola ${nombre}! 👋`);
    lines.push("");
    if (pagado) {
      lines.push(`Te confirmo tu pedido *#${o.order_number}* (${formatPrice(total, o.currency)}).`);
      if (o.entrega_metodo === "retiro_sede") {
        const sede = o.sede_retiro_id ? sedesMap[o.sede_retiro_id] : null;
        lines.push(`Lo podés retirar en: ${sede?.nombre || "nuestra sede"}.`);
      } else if (o.entrega_metodo === "envio_moto") {
        lines.push(`Te lo enviamos a: ${o.envio_direccion || "la dirección registrada"}.`);
      }
    } else {
      lines.push(`Te paso el recordatorio del pedido *#${o.order_number}*:`);
      lines.push(`Total: *${formatPrice(total, o.currency)}*`);
      lines.push(`Por favor confirmá el pago así lo preparamos. ¡Gracias!`);
    }
    lines.push("");
    lines.push("— Ciclismo Reybaud");
    const msg = encodeURIComponent(lines.join("\n"));
    window.open(`https://wa.me/${waTel}?text=${msg}`, "_blank");
  };

  // ─── Export: pedido al proveedor ───
  const exportarProveedor = async () => {
    if (filtered.length === 0) {
      toast({ title: "Nada para exportar", variant: "destructive" });
      return;
    }
    const lines = flattenLines(filtered, alumnosMap);
    const wb = new ExcelJS.Workbook();

    const sheet1 = wb.addWorksheet("Resumen por talle");
    sheet1.columns = [
      { header: "Producto", key: "producto", width: 40 },
      { header: "Variante", key: "variante", width: 28 },
      { header: "Cantidad", key: "cantidad", width: 12 },
    ];
    const grouped = new Map<string, { producto: string; variante: string; cantidad: number }>();
    lines.forEach((l) => {
      const v = varianteToKey(l.variante);
      const key = `${l.producto}__${v}`;
      const ex = grouped.get(key);
      if (ex) ex.cantidad += l.cantidad;
      else grouped.set(key, { producto: l.producto, variante: v, cantidad: l.cantidad });
    });
    Array.from(grouped.values())
      .sort((a, b) => a.producto.localeCompare(b.producto) || a.variante.localeCompare(b.variante))
      .forEach((g) => sheet1.addRow(g));
    sheet1.getRow(1).font = { bold: true };

    const sheet2 = wb.addWorksheet("Detalle por alumno");
    sheet2.columns = [
      { header: "Fecha", key: "fecha", width: 12 },
      { header: "#", key: "numero", width: 8 },
      { header: "Cliente", key: "alumno", width: 28 },
      { header: "DNI", key: "dni", width: 12 },
      { header: "Teléfono", key: "telefono", width: 16 },
      { header: "Producto", key: "producto", width: 40 },
      { header: "Variante", key: "variante", width: 24 },
      { header: "Cant", key: "cantidad", width: 8 },
      { header: "Entrega", key: "entrega", width: 14 },
      { header: "Sede / Dirección", key: "sede", width: 36 },
      { header: "Estado", key: "estado", width: 16 },
      { header: "Pago", key: "pago", width: 14 },
    ];
    filtered.forEach((r) => {
      const al = r.alumno_id ? alumnosMap[r.alumno_id] : null;
      const sede = r.sede_retiro_id ? sedesMap[r.sede_retiro_id]?.nombre : null;
      const entrega = r.entrega_metodo === "envio_moto" ? "Envío moto" : r.entrega_metodo === "retiro_sede" ? "Retiro sede" : "—";
      const destino = r.entrega_metodo === "envio_moto" ? (r.envio_direccion || "—") : (sede || "—");
      const itemList = (r.items || []).length > 0 ? r.items! : [{ producto_nombre: "—", variante: {}, cantidad: 1 } as any];
      itemList.forEach((it: any, idx: number) => {
        sheet2.addRow({
          fecha: idx === 0 ? new Date(r.created_at).toLocaleDateString("es-AR") : "",
          numero: idx === 0 ? r.order_number : "",
          alumno: idx === 0 ? (`${al?.nombre || ""} ${al?.apellido || ""}`.trim() || r.customer_name) : "",
          dni: idx === 0 ? (al?.dni || "") : "",
          telefono: idx === 0 ? (al?.telefono || "") : "",
          producto: it.producto_nombre,
          variante: varianteToKey(it.variante || {}),
          cantidad: it.cantidad,
          entrega: idx === 0 ? entrega : "",
          sede: idx === 0 ? destino : "",
          estado: idx === 0 ? r.status.replace(/_/g, " ") : "",
          pago: idx === 0 ? (isPagado(r) ? "PAGADO" : "PENDIENTE") : "",
        });
      });
    });
    sheet2.getRow(1).font = { bold: true };

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pedidos-${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── Export: PDF resumen ───
  const exportarPDF = () => {
    if (filtered.length === 0) {
      toast({ title: "Nada para exportar", variant: "destructive" });
      return;
    }
    const lines = flattenLines(filtered, alumnosMap);
    const grouped = new Map<string, { producto: string; variante: string; cantidad: number }>();
    lines.forEach((l) => {
      const v = varianteToKey(l.variante);
      const key = `${l.producto}__${v}`;
      const ex = grouped.get(key);
      if (ex) ex.cantidad += l.cantidad;
      else grouped.set(key, { producto: l.producto, variante: v, cantidad: l.cantidad });
    });

    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text("Resumen de pedidos", 14, 16);
    doc.setFontSize(10);
    doc.text(`Generado: ${new Date().toLocaleString("es-AR")}`, 14, 22);
    doc.text(`Pedidos incluidos: ${filtered.length}`, 14, 28);

    autoTable(doc, {
      startY: 34,
      head: [["Producto", "Variante", "Cantidad"]],
      body: Array.from(grouped.values())
        .sort((a, b) => a.producto.localeCompare(b.producto) || a.variante.localeCompare(b.variante))
        .map((g) => [g.producto, g.variante, String(g.cantidad)]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [40, 40, 40] },
    });

    doc.save(`pedidos-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  // ─── Export: orden de venta individual ───
  const exportarOrdenVenta = (r: Order) => {
    const al = r.alumno_id ? alumnosMap[r.alumno_id] : null;
    const sede = r.sede_retiro_id ? sedesMap[r.sede_retiro_id] : null;
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(`Orden de venta — Pedido #${r.order_number}`, 14, 18);
    doc.setFontSize(10);
    doc.text(`Fecha: ${new Date(r.created_at).toLocaleString("es-AR")}`, 14, 25);

    doc.setFontSize(11);
    doc.text("Cliente", 14, 36);
    doc.setFontSize(9);
    doc.text(`${al?.nombre || ""} ${al?.apellido || ""}`.trim() || r.customer_name, 14, 42);
    doc.text(`DNI: ${al?.dni || "—"}   ·   Tel: ${al?.telefono || "—"}`, 14, 47);
    doc.text(`Email: ${al?.email || r.customer_email || "—"}`, 14, 52);

    doc.setFontSize(11);
    doc.text("Entrega", 14, 62);
    doc.setFontSize(9);
    if (r.entrega_metodo === "envio_moto") {
      doc.text("Envío por moto", 14, 68);
      doc.text(`Dirección: ${r.envio_direccion || "—"}`, 14, 73);
      doc.text(`Contacto: ${r.envio_contacto || "—"}`, 14, 78);
      if (r.envio_notas) doc.text(`Notas: ${r.envio_notas}`, 14, 83);
    } else if (r.entrega_metodo === "retiro_sede") {
      doc.text(`Retiro en sede: ${sede?.nombre || "—"}`, 14, 68);
      if (sede?.direccion) doc.text(`${sede.direccion}${sede.ciudad ? `, ${sede.ciudad}` : ""}`, 14, 73);
    } else {
      doc.text("Sin método de entrega definido", 14, 68);
    }

    const items = (r.items || []).map((it) => [
      it.producto_nombre,
      varianteToKey(it.variante || {}),
      String(it.cantidad),
      formatPrice(Number(it.precio_unitario || 0), r.currency),
    ]);

    autoTable(doc, {
      startY: 94,
      head: [["Producto", "Variante", "Cant", "Precio"]],
      body: items.length ? items : [["—", "—", "—", "—"]],
      styles: { fontSize: 9 },
      headStyles: { fillColor: [40, 40, 40] },
    });

    const afterY = (doc as any).lastAutoTable.finalY + 8;
    doc.setFontSize(10);
    doc.text(`Total: ${formatPrice(Number(r.total), r.currency)}`, 140, afterY);
    doc.text(`Estado: ${r.status.replace(/_/g, " ")}`, 140, afterY + 6);
    doc.text(`Pago: ${isPagado(r) ? "PAGADO" : "PENDIENTE"}`, 140, afterY + 12);

    doc.save(`pedido-${r.order_number}.pdf`);
  };

  if (loading) return <div className="animate-pulse text-muted-foreground">Cargando pedidos...</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-heading font-bold">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportarProveedor}>
            <FileSpreadsheet className="w-4 h-4 mr-1" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={exportarPDF}>
            <FileText className="w-4 h-4 mr-1" /> PDF resumen
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por cliente, #, producto, DNI..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={filterProducto} onValueChange={setFilterProducto}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Producto" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los productos</SelectItem>
            {productosUnicos.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterEntrega} onValueChange={setFilterEntrega}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Entrega" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toda entrega</SelectItem>
            <SelectItem value="retiro_sede">Retiro en sede</SelectItem>
            <SelectItem value="envio_moto">Envío por moto</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterEstado} onValueChange={setFilterEstado}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{restrictStatuses ? "Todos (nuevos)" : "Todos los estados"}</SelectItem>
            {(restrictStatuses || STATUSES).map((e) => (
              <SelectItem key={e} value={e}>{e.replace(/_/g, " ")}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-3 self-center ml-auto text-xs">
          <button
            type="button"
            onClick={() => setSoloDeudores((v) => !v)}
            className={`px-2 py-1 rounded font-heading uppercase tracking-wider transition-colors ${
              soloDeudores
                ? "bg-destructive text-destructive-foreground"
                : "bg-destructive/15 text-destructive hover:bg-destructive/25"
            }`}
            title="Mostrar solo pedidos sin pagar"
          >
            {soloDeudores ? "✓ " : ""}Deudores: {deudoresCount}
            {deudaEntregadaCount > 0 && <span className="ml-1 opacity-80">({deudaEntregadaCount} entregados)</span>}
          </button>
          <span className="text-muted-foreground">{filtered.length} pedido(s)</span>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="px-3 py-3 text-left text-xs font-heading uppercase">Fecha</th>
              <th className="px-3 py-3 text-left text-xs font-heading uppercase">#</th>
              <th className="px-3 py-3 text-left text-xs font-heading uppercase">Cliente</th>
              <th className="px-3 py-3 text-left text-xs font-heading uppercase">Producto</th>
              <th className="px-3 py-3 text-center text-xs font-heading uppercase">Cant.</th>
              <th className="px-3 py-3 text-center text-xs font-heading uppercase">Entrega</th>
              <th className="px-3 py-3 text-right text-xs font-heading uppercase">Total</th>
              <th className="px-3 py-3 text-center text-xs font-heading uppercase">Pago</th>
              <th className="px-3 py-3 text-center text-xs font-heading uppercase">Estado</th>
              <th className="px-3 py-3 text-right text-xs font-heading uppercase"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((r) => {
              const al = r.alumno_id ? alumnosMap[r.alumno_id] : null;
              const items = r.items || [];
              const totalCant = items.reduce((s, i) => s + Number(i.cantidad || 0), 0);
              const pagoStatus = getPagoStatus(r);
              const isDeudaEntregada = pagoStatus === "deuda_entregada";
              const rowCls = isDeudaEntregada
                ? "hover:bg-destructive/10 cursor-pointer bg-destructive/5 border-l-2 border-destructive"
                : "hover:bg-muted/30 cursor-pointer";
              const productoLabel =
                items.length === 0
                  ? "—"
                  : items.length === 1
                  ? items[0].producto_nombre
                  : `${items.length} productos`;
              const productoSub =
                items.length === 1
                  ? varianteToKey(items[0].variante || {})
                  : items.length > 1
                  ? items.map((i) => i.producto_nombre).join(" · ")
                  : "";

              return (
                <tr key={r.id} className={rowCls} onClick={() => setDetail(r)}>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleDateString("es-AR")}
                  </td>
                  <td className="px-3 py-2 text-xs font-mono">#{r.order_number}</td>
                  <td className="px-3 py-2">
                    <div>{`${al?.nombre || ""} ${al?.apellido || ""}`.trim() || r.customer_name}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {al?.telefono || al?.email || r.customer_email || ""}
                    </div>
                  </td>
                  <td className="px-3 py-2 max-w-[260px]">
                    <div className="font-medium truncate">{productoLabel}</div>
                    {productoSub && (
                      <div className="text-[10px] text-muted-foreground truncate">{productoSub}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">{totalCant || "—"}</td>
                  <td className="px-3 py-2 text-center text-xs">
                    {r.entrega_metodo === "envio_moto" ? (
                      <span className="inline-flex items-center gap-1 text-primary"><Truck className="w-3 h-3" /> Moto</span>
                    ) : r.entrega_metodo === "retiro_sede" ? (
                      <span className="inline-flex items-center gap-1 text-cyan"><Store className="w-3 h-3" /> Sede</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-heading">{formatPrice(Number(r.total), r.currency)}</td>
                  <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                    {pagoStatus === "pagado" ? (
                      <span className="inline-block text-[10px] font-heading uppercase px-2 py-1 rounded bg-emerald-500/20 text-emerald-400" title="Pago registrado">
                        Pagado
                      </span>
                    ) : pagoStatus === "deuda_entregada" ? (
                      <span
                        className="inline-flex flex-col items-center gap-0.5 text-[10px] font-heading uppercase px-2 py-1 rounded bg-destructive text-destructive-foreground"
                        title="Producto entregado sin pago — cobrar"
                      >
                        <span>⚠ Debe</span>
                        <span className="font-mono normal-case">{formatPrice(Number(r.total), r.currency)}</span>
                      </span>
                    ) : pagoStatus === "irrelevante" ? (
                      <span className="inline-block text-[10px] font-heading uppercase px-2 py-1 rounded bg-muted text-muted-foreground">—</span>
                    ) : (
                      <span className="inline-block text-[10px] font-heading uppercase px-2 py-1 rounded bg-amber-500/20 text-amber-400" title="Sin pago registrado">
                        Pendiente
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                    <Select value={r.status} onValueChange={(v) => updateField(r.id, { status: v } as any)}>
                      <SelectTrigger className={`h-7 text-xs w-[160px] mx-auto ${estadoColor(r.status)}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {STATUSES.map((e) => <SelectItem key={e} value={e}>{e.replace(/_/g, " ")}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      {!isPagado(r) && r.status !== "cancelado" && (
                        <Button size="sm" variant="ghost" title="Registrar pago" className="text-emerald-500 hover:text-emerald-400" onClick={() => setPayOrder(r)}>
                          <DollarSign className="w-4 h-4" />
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" title="Enviar mensaje por WhatsApp" className="text-green-500 hover:text-green-400" onClick={() => enviarWhatsApp(r)}>
                        <MessageCircle className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="ghost" title="Imprimir etiqueta con QR" className="bg-cyan/10 hover:bg-cyan/20 text-cyan" onClick={() => imprimirEtiqueta(r)}>
                        <QrCode className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="ghost" title="Ver detalle" onClick={() => setDetail(r)}>
                        <Eye className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="p-8 text-center text-muted-foreground">No hay pedidos con esos filtros.</div>}
      </div>

      {/* DETAIL DRAWER */}
      <Sheet open={!!detail} onOpenChange={(v) => !v && setDetail(null)}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          {detail && (() => {
            const al = detail.alumno_id ? alumnosMap[detail.alumno_id] : null;
            const sede = detail.sede_retiro_id ? sedesMap[detail.sede_retiro_id] : null;
            const items = detail.items || [];
            return (
              <>
                <SheetHeader>
                  <SheetTitle className="font-heading">Pedido #{detail.order_number}</SheetTitle>
                  <SheetDescription>
                    {new Date(detail.created_at).toLocaleString("es-AR")}
                  </SheetDescription>
                </SheetHeader>

                <div className="mt-4 space-y-4 text-sm">
                  {/* Cliente */}
                  <section className="rounded-lg border border-border p-3 space-y-1">
                    <h4 className="text-[11px] font-heading uppercase text-muted-foreground flex items-center gap-1"><User className="w-3 h-3" /> Cliente</h4>
                    <div className="font-medium">{`${al?.nombre || ""} ${al?.apellido || ""}`.trim() || detail.customer_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {al?.dni && <>DNI {al.dni} · </>}
                      {al?.telefono && <><Phone className="inline w-3 h-3" /> {al.telefono} · </>}
                      {al?.email || detail.customer_email}
                    </div>
                  </section>

                  {/* Pedido */}
                  <section className="rounded-lg border border-border p-3 space-y-2">
                    <h4 className="text-[11px] font-heading uppercase text-muted-foreground flex items-center gap-1"><Package className="w-3 h-3" /> Productos</h4>
                    {items.length === 0 ? (
                      <div className="text-xs text-muted-foreground italic">Sin items registrados.</div>
                    ) : (
                      <ul className="divide-y divide-border">
                        {items.map((it, i) => (
                          <li key={i} className="py-2 space-y-1">
                            <div className="flex justify-between gap-2">
                              <div className="font-medium">{it.producto_nombre} <span className="text-muted-foreground">x{it.cantidad}</span></div>
                              <div className="text-xs text-muted-foreground">{formatPrice(Number(it.precio_unitario || 0), detail.currency)}</div>
                            </div>
                            {Object.keys(it.variante || {}).length > 0 && (
                              <div className="text-[11px] text-muted-foreground">{varianteToKey(it.variante)}</div>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>

                  {/* Entrega */}
                  <section className="rounded-lg border border-border p-3 space-y-2">
                    <h4 className="text-[11px] font-heading uppercase text-muted-foreground flex items-center gap-1">
                      {detail.entrega_metodo === "envio_moto" ? <Truck className="w-3 h-3" /> : <Store className="w-3 h-3" />}
                      Entrega
                    </h4>
                    <Select
                      value={detail.entrega_metodo || "sin_definir"}
                      onValueChange={(v) => updateField(detail.id, { entrega_metodo: v === "sin_definir" ? null : v } as any)}
                    >
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sin_definir">Sin definir</SelectItem>
                        <SelectItem value="retiro_sede">Retiro en sede</SelectItem>
                        <SelectItem value="envio_moto">Envío por moto</SelectItem>
                      </SelectContent>
                    </Select>

                    {detail.entrega_metodo === "envio_moto" ? (
                      <div className="space-y-2 text-xs">
                        <div>
                          <label className="text-[10px] uppercase text-muted-foreground">Dirección</label>
                          <Input
                            defaultValue={detail.envio_direccion || ""}
                            onBlur={(e) => {
                              if (e.target.value !== (detail.envio_direccion || "")) {
                                updateField(detail.id, { envio_direccion: e.target.value || null } as any);
                              }
                            }}
                          />
                        </div>
                        <div>
                          <label className="text-[10px] uppercase text-muted-foreground">Contacto</label>
                          <Input
                            defaultValue={detail.envio_contacto || ""}
                            onBlur={(e) => {
                              if (e.target.value !== (detail.envio_contacto || "")) {
                                updateField(detail.id, { envio_contacto: e.target.value || null } as any);
                              }
                            }}
                          />
                        </div>
                        <div>
                          <label className="text-[10px] uppercase text-muted-foreground">Notas envío</label>
                          <Textarea
                            rows={2}
                            defaultValue={detail.envio_notas || ""}
                            onBlur={(e) => {
                              if (e.target.value !== (detail.envio_notas || "")) {
                                updateField(detail.id, { envio_notas: e.target.value || null } as any);
                              }
                            }}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] uppercase text-muted-foreground">Costo envío</label>
                            <Input
                              type="number"
                              defaultValue={detail.envio_costo ?? ""}
                              onBlur={(e) => {
                                const v = e.target.value ? Number(e.target.value) : null;
                                if (v !== (detail.envio_costo ?? null)) updateField(detail.id, { envio_costo: v } as any);
                              }}
                            />
                          </div>
                          <div>
                            <label className="text-[10px] uppercase text-muted-foreground">Estado envío</label>
                            <Select
                              value={detail.envio_estado || "a_cotizar"}
                              onValueChange={(v) => updateField(detail.id, { envio_estado: v } as any)}
                            >
                              <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {ENVIO_ESTADOS.map((e) => <SelectItem key={e} value={e}>{e.replace(/_/g, " ")}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                    ) : detail.entrega_metodo === "retiro_sede" ? (
                      <div className="text-xs space-y-2">
                        {sede ? (
                          <div>
                            <div className="font-medium">{sede.nombre}</div>
                            {sede.direccion && (
                              <div className="text-muted-foreground">
                                {sede.direccion}{sede.ciudad ? `, ${sede.ciudad}` : ""}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-muted-foreground italic">Sede sin asignar.</div>
                        )}
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground italic">Elegí un método de entrega.</div>
                    )}
                  </section>

                  {/* Pago */}
                  <section className="rounded-lg border border-border p-3 space-y-1 text-xs">
                    <h4 className="text-[11px] font-heading uppercase text-muted-foreground">Pago</h4>
                    <div className="flex justify-between"><span className="text-muted-foreground">Total</span><b>{formatPrice(Number(detail.total), detail.currency)}</b></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Estado</span><b>{isPagado(detail) ? "Pagado" : "Pendiente"}</b></div>
                    {detail.metodo_pago && (
                      <div className="flex justify-between"><span className="text-muted-foreground">Método</span><b>{getPaymentMethodLabel(detail.metodo_pago)}</b></div>
                    )}
                    {detail.pagado_at && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Pagado el</span>
                        <b>{new Date(detail.pagado_at).toLocaleDateString("es-AR")}</b>
                      </div>
                    )}
                    {!isPagado(detail) && detail.status !== "cancelado" && (
                      <div className="pt-2">
                        <Button size="sm" className="w-full" onClick={() => setPayOrder(detail)}>
                          <DollarSign className="w-4 h-4 mr-1" />
                          Registrar pago ({formatPrice(Number(detail.total), detail.currency)})
                        </Button>
                      </div>
                    )}
                    {isPagado(detail) && (
                      <div className="pt-2 text-[11px] text-emerald-400 text-center font-medium">
                        ✓ Pago registrado
                      </div>
                    )}
                  </section>

                  {/* Tracking */}
                  <section className="rounded-lg border border-border p-3 space-y-1">
                    <label className="text-[11px] font-heading uppercase text-muted-foreground">Tracking envío</label>
                    <Input
                      defaultValue={detail.shipping_tracking || ""}
                      placeholder="Número de tracking / OCA / Andreani..."
                      onBlur={(e) => {
                        if (e.target.value !== (detail.shipping_tracking || "")) {
                          updateField(detail.id, { shipping_tracking: e.target.value || null } as any);
                        }
                      }}
                    />
                  </section>

                  {/* Notas */}
                  <section className="rounded-lg border border-border p-3 space-y-1">
                    <label className="text-[11px] font-heading uppercase text-muted-foreground">Notas internas</label>
                    <Textarea
                      rows={3}
                      defaultValue={detail.notes || ""}
                      onBlur={(e) => {
                        if (e.target.value !== (detail.notes || "")) updateField(detail.id, { notes: e.target.value || null } as any);
                      }}
                    />
                  </section>

                  <div className="grid grid-cols-2 gap-2 pt-2">
                    <Button onClick={() => exportarOrdenVenta(detail)} variant="outline">
                      <FileText className="w-4 h-4 mr-1" /> Orden venta
                    </Button>
                    <Button onClick={() => imprimirEtiqueta(detail)} variant="outline">
                      <QrCode className="w-4 h-4 mr-1" /> Etiqueta QR
                    </Button>
                    <Button onClick={() => enviarWhatsApp(detail)} variant="outline" className="border-green-500/30 text-green-500 hover:bg-green-500/10 col-span-2">
                      <MessageCircle className="w-4 h-4 mr-1" /> Enviar WhatsApp
                    </Button>
                  </div>
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>

      {/* Confirmar pago */}
      {payOrder && (
        <ConfirmFullPaymentDialog
          open={!!payOrder}
          onOpenChange={(v) => !v && setPayOrder(null)}
          title={`Registrar pago — Pedido #${payOrder.order_number}`}
          description={`Total: ${formatPrice(Number(payOrder.total), payOrder.currency)}`}
          monto={Number(payOrder.total || 0)}
          moneda={payOrder.currency}
          defaultMethod={payOrder.metodo_pago || "efectivo"}
          allowPartial={false}
          onConfirm={async (val) => {
            await registrarPago(payOrder, val);
            setPayOrder(null);
          }}
        />
      )}
    </div>
  );
};

export default StoreOrders;
