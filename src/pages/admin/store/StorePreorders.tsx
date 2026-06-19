import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Search, FileSpreadsheet, FileText, Eye, Truck, Store, Package, MapPin, Phone, User, Mail, QrCode } from "lucide-react";
import { formatPrice } from "@/lib/currency";
import ExcelJS from "exceljs";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { printSinglePreorderLabel } from "@/lib/preorderLabels";

interface Preorder {
  id: string;
  alumno_id: string;
  product_id: string;
  cantidad: number;
  variante: any;
  producto_nombre: string;
  precio_unitario: number;
  moneda: string;
  sena_monto: number;
  precio_total: number;
  saldo_pendiente: number;
  estado: string;
  estado_pago_sena: string;
  forma_pago_sena: string | null;
  notas: string | null;
  created_at: string;
  modalidad?: string | null;
  items?: any[] | null;
  entrega_metodo?: string | null;
  sede_retiro_id?: string | null;
  envio_direccion?: string | null;
  envio_contacto?: string | null;
  envio_notas?: string | null;
  envio_costo?: number | null;
  envio_estado?: string | null;
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

const ESTADOS = [
  "pendiente_pago_sena",
  "reservada",
  "en_produccion",
  "lista_para_retirar",
  "entregada",
  "cancelada",
  "vencida",
];
const ESTADOS_PAGO = ["pendiente", "pendiente_verificacion", "confirmada", "rechazada"];
const ENVIO_ESTADOS = ["a_cotizar", "cotizado", "pagado", "enviado", "entregado"];

const estadoColor = (e: string) => {
  switch (e) {
    case "reservada": return "bg-cyan/20 text-cyan";
    case "en_produccion": return "bg-primary/20 text-primary";
    case "lista_para_retirar": return "bg-gold-dark/20 text-gold";
    case "entregada": return "bg-green-500/20 text-green-400";
    case "cancelada":
    case "vencida": return "bg-destructive/20 text-destructive";
    default: return "bg-muted text-muted-foreground";
  }
};

// Aplana cada reserva en líneas por componente (combo) o única (individual).
// Devuelve [{producto, variante, cantidad, alumno}, ...] para exports y agrupado.
const flattenLines = (rows: Preorder[], alumnos: Record<string, Alumno>) => {
  const lines: {
    preorder_id: string;
    alumno: Alumno | undefined;
    producto: string;
    variante: Record<string, any>;
    cantidad: number;
    precio_unitario: number;
    moneda: string;
  }[] = [];
  rows.forEach((r) => {
    const al = alumnos[r.alumno_id];
    if (r.items && Array.isArray(r.items) && r.items.length > 0) {
      r.items.forEach((it: any) => {
        lines.push({
          preorder_id: r.id,
          alumno: al,
          producto: `${r.producto_nombre} · ${it.nombre || "componente"}`,
          variante: it.variante || {},
          cantidad: r.cantidad,
          precio_unitario: Number(it.precio || 0),
          moneda: r.moneda,
        });
      });
    } else {
      lines.push({
        preorder_id: r.id,
        alumno: al,
        producto: r.producto_nombre,
        variante: r.variante || {},
        cantidad: r.cantidad,
        precio_unitario: Number(r.precio_unitario || 0),
        moneda: r.moneda,
      });
    }
  });
  return lines;
};

const varianteToKey = (v: Record<string, any>) =>
  Object.entries(v || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, val]) => `${k}: ${val}`)
    .join(" · ") || "—";

const StorePreorders = () => {
  const [rows, setRows] = useState<Preorder[]>([]);
  const [alumnosMap, setAlumnosMap] = useState<Record<string, Alumno>>({});
  const [sedesMap, setSedesMap] = useState<Record<string, Sede>>({});
  const [filterEstado, setFilterEstado] = useState("all");
  const [filterEntrega, setFilterEntrega] = useState("all");
  const [filterProducto, setFilterProducto] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<Preorder | null>(null);
  const { toast } = useToast();

  const load = async () => {
    const { data } = await supabase
      .from("store_preorders" as any)
      .select("*")
      .order("created_at", { ascending: false });
    const list = (data as any[]) || [];
    setRows(list);
    if (list.length) {
      const ids = Array.from(new Set(list.map((r) => r.alumno_id)));
      const sedeIds = Array.from(new Set(list.map((r: any) => r.sede_retiro_id).filter(Boolean)));
      const [{ data: alus }, { data: sds }] = await Promise.all([
        supabase.from("alumnos").select("id, nombre, apellido, email, telefono, dni").in("id", ids),
        sedeIds.length ? supabase.from("sedes").select("id, nombre, direccion, ciudad").in("id", sedeIds) : Promise.resolve({ data: [] as any[] }),
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

  const productosUnicos = useMemo(
    () => Array.from(new Set(rows.map((r) => r.producto_nombre))).sort(),
    [rows]
  );

  const filtered = rows.filter((r) => {
    if (filterEstado !== "all" && r.estado !== filterEstado) return false;
    if (filterEntrega !== "all" && (r.entrega_metodo || "") !== filterEntrega) return false;
    if (filterProducto !== "all" && r.producto_nombre !== filterProducto) return false;
    if (search) {
      const s = search.toLowerCase();
      const al = alumnosMap[r.alumno_id];
      const nombre = al ? `${al.nombre || ""} ${al.apellido || ""}` : ((r as any).alumno_nombre || "");
      const email = al?.email || (r as any).alumno_email || "";
      const dni = al?.dni || (r as any).alumno_dni || "";
      const fullName = `${nombre} ${email} ${dni}`.toLowerCase();
      if (!r.producto_nombre.toLowerCase().includes(s) && !fullName.includes(s)) return false;
    }
    return true;
  });

  const updateField = async (id: string, patch: Partial<Preorder>) => {
    const { error } = await supabase.from("store_preorders" as any).update(patch as any).eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Actualizado" });
    load();
    if (detail?.id === id) setDetail({ ...detail, ...patch } as Preorder);
  };

  const confirmarSena = (r: Preorder) =>
    updateField(r.id, { estado_pago_sena: "confirmada", estado: r.estado === "pendiente_pago_sena" ? "reservada" : r.estado } as any);

  const rechazarSena = (r: Preorder) =>
    updateField(r.id, { estado_pago_sena: "rechazada" } as any);

  const enviarRecordatorio = async (r: Preorder) => {
    const isSaldo = r.estado_pago_sena === "confirmada" && Number(r.saldo_pendiente || 0) > 0;
    const isSena = r.estado_pago_sena !== "confirmada";
    if (!isSaldo && !isSena) {
      toast({ title: "Sin recordatorio", description: "Esta preventa ya está totalmente pagada." });
      return;
    }
    const al = alumnosMap[r.alumno_id];
    const email = al?.email || (r as any).alumno_email;
    if (!email) {
      toast({ title: "Sin email", description: "El cliente no tiene email cargado.", variant: "destructive" });
      return;
    }
    toast({ title: "Enviando…", description: `Recordatorio de ${isSaldo ? "saldo" : "seña"} a ${email}` });
    const { data, error } = await supabase.functions.invoke("preorder-payment-reminders", {
      body: { preorder_id: r.id, manual: true },
    });
    if (error || (data as any)?.error) {
      toast({ title: "Error", description: error?.message || (data as any)?.error, variant: "destructive" });
    } else {
      toast({ title: "✓ Recordatorio enviado", description: `${isSaldo ? "Saldo" : "Seña"} a ${email}` });
    }
  };

  const imprimirEtiqueta = async (r: Preorder) => {
    const al = alumnosMap[r.alumno_id];
    const sede = r.sede_retiro_id ? sedesMap[r.sede_retiro_id] : null;
    await printSinglePreorderLabel({
      id: r.id,
      short_number: r.id.slice(0, 8).toUpperCase(),
      producto_nombre: r.producto_nombre,
      cantidad: r.cantidad,
      variante: r.variante,
      items: r.items,
      precio_total: Number(r.precio_total || 0),
      sena_monto: Number(r.sena_monto || 0),
      saldo_pendiente: Number(r.saldo_pendiente || 0),
      moneda: r.moneda,
      estado_pago_sena: r.estado_pago_sena,
      entrega_metodo: r.entrega_metodo,
      sede_nombre: sede?.nombre || null,
      envio_direccion: r.envio_direccion,
      envio_contacto: r.envio_contacto,
      envio_notas: r.envio_notas,
      alumno_nombre: `${al?.nombre || ""} ${al?.apellido || ""}`.trim() || (r as any).alumno_nombre || null,
      alumno_email: al?.email || (r as any).alumno_email || null,
      alumno_telefono: al?.telefono || (r as any).alumno_telefono || null,
      created_at: r.created_at,
    });
  };


  // ─── Export: pedido al proveedor (Excel con 2 hojas) ───
  const exportarProveedor = async () => {
    if (filtered.length === 0) {
      toast({ title: "Nada para exportar", variant: "destructive" });
      return;
    }
    const lines = flattenLines(filtered, alumnosMap);
    const wb = new ExcelJS.Workbook();

    // Hoja 1: Resumen por producto+variante
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

    // Hoja 2: Detalle por alumno
    const sheet2 = wb.addWorksheet("Detalle por alumno");
    sheet2.columns = [
      { header: "Fecha", key: "fecha", width: 12 },
      { header: "Alumno", key: "alumno", width: 28 },
      { header: "DNI", key: "dni", width: 12 },
      { header: "Teléfono", key: "telefono", width: 16 },
      { header: "Producto", key: "producto", width: 40 },
      { header: "Variante", key: "variante", width: 24 },
      { header: "Cant", key: "cantidad", width: 8 },
      { header: "Entrega", key: "entrega", width: 14 },
      { header: "Sede / Dirección", key: "sede", width: 36 },
      { header: "Estado", key: "estado", width: 18 },
    ];
    filtered.forEach((r) => {
      const al = alumnosMap[r.alumno_id];
      const sede = r.sede_retiro_id ? sedesMap[r.sede_retiro_id]?.nombre : null;
      const entrega = r.entrega_metodo === "envio_moto" ? "Envío moto" : r.entrega_metodo === "retiro_sede" ? "Retiro sede" : "—";
      const destino = r.entrega_metodo === "envio_moto" ? (r.envio_direccion || "—") : (sede || "—");

      const lineItems = r.items && r.items.length > 0
        ? r.items
        : [{ nombre: r.producto_nombre, variante: r.variante || {} }];

      lineItems.forEach((it: any, idx: number) => {
        sheet2.addRow({
          fecha: idx === 0 ? new Date(r.created_at).toLocaleDateString("es-AR") : "",
          alumno: idx === 0 ? `${al?.nombre || ""} ${al?.apellido || ""}`.trim() : "",
          dni: idx === 0 ? (al?.dni || "") : "",
          telefono: idx === 0 ? (al?.telefono || "") : "",
          producto: r.items && r.items.length > 0 ? `${r.producto_nombre} · ${it.nombre || ""}` : r.producto_nombre,
          variante: varianteToKey(it.variante || {}),
          cantidad: r.cantidad,
          entrega: idx === 0 ? entrega : "",
          sede: idx === 0 ? destino : "",
          estado: idx === 0 ? r.estado.replace(/_/g, " ") : "",
        });
      });
    });
    sheet2.getRow(1).font = { bold: true };

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pedido-proveedor-${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── Export: PDF resumen por talle ───
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
    doc.text("Pedido a proveedor — Preventas", 14, 16);
    doc.setFontSize(10);
    doc.text(`Generado: ${new Date().toLocaleString("es-AR")}`, 14, 22);
    doc.text(`Reservas incluidas: ${filtered.length}`, 14, 28);

    autoTable(doc, {
      startY: 34,
      head: [["Producto", "Variante", "Cantidad"]],
      body: Array.from(grouped.values())
        .sort((a, b) => a.producto.localeCompare(b.producto) || a.variante.localeCompare(b.variante))
        .map((g) => [g.producto, g.variante, String(g.cantidad)]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [40, 40, 40] },
    });

    doc.save(`pedido-proveedor-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  // ─── Export: orden de venta individual (PDF) ───
  const exportarOrdenVenta = (r: Preorder) => {
    const al = alumnosMap[r.alumno_id];
    const sede = r.sede_retiro_id ? sedesMap[r.sede_retiro_id] : null;
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Orden de venta — Preventa", 14, 18);
    doc.setFontSize(10);
    doc.text(`Nº ${r.id.slice(0, 8).toUpperCase()}`, 14, 25);
    doc.text(`Fecha: ${new Date(r.created_at).toLocaleString("es-AR")}`, 14, 31);

    doc.setFontSize(11);
    doc.text("Cliente", 14, 42);
    doc.setFontSize(9);
    doc.text(`${al?.nombre || ""} ${al?.apellido || ""}`.trim() || "—", 14, 48);
    doc.text(`DNI: ${al?.dni || "—"}   ·   Tel: ${al?.telefono || "—"}`, 14, 53);
    doc.text(`Email: ${al?.email || "—"}`, 14, 58);

    doc.setFontSize(11);
    doc.text("Entrega", 14, 68);
    doc.setFontSize(9);
    if (r.entrega_metodo === "envio_moto") {
      doc.text("Envío por moto (a cotizar)", 14, 74);
      doc.text(`Dirección: ${r.envio_direccion || "—"}`, 14, 79);
      doc.text(`Contacto: ${r.envio_contacto || "—"}`, 14, 84);
      if (r.envio_notas) doc.text(`Notas: ${r.envio_notas}`, 14, 89);
    } else {
      doc.text(`Retiro en sede: ${sede?.nombre || "—"}`, 14, 74);
      if (sede?.direccion) doc.text(`${sede.direccion}${sede.ciudad ? `, ${sede.ciudad}` : ""}`, 14, 79);
    }

    const items = r.items && r.items.length > 0
      ? r.items.map((it: any) => [it.nombre || "—", varianteToKey(it.variante || {}), String(r.cantidad), formatPrice(Number(it.precio || 0), r.moneda)])
      : [[r.producto_nombre, varianteToKey(r.variante || {}), String(r.cantidad), formatPrice(Number(r.precio_unitario), r.moneda)]];

    autoTable(doc, {
      startY: 100,
      head: [["Producto / Componente", "Variante", "Cant", "Precio"]],
      body: items,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [40, 40, 40] },
    });

    const afterY = (doc as any).lastAutoTable.finalY + 8;
    doc.setFontSize(10);
    doc.text(`Total: ${formatPrice(Number(r.precio_total), r.moneda)}`, 140, afterY);
    doc.text(`Seña: ${formatPrice(Number(r.sena_monto), r.moneda)} (${r.estado_pago_sena})`, 140, afterY + 6);
    doc.text(`Saldo: ${formatPrice(Number(r.saldo_pendiente), r.moneda)}`, 140, afterY + 12);
    if (r.envio_costo != null) doc.text(`Envío: ${formatPrice(Number(r.envio_costo), r.moneda)}`, 140, afterY + 18);

    doc.save(`orden-${r.id.slice(0, 8)}.pdf`);
  };

  if (loading) return <div className="animate-pulse text-muted-foreground">Cargando preventas...</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-heading font-bold">Preventas</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportarProveedor}>
            <FileSpreadsheet className="w-4 h-4 mr-1" /> Excel proveedor
          </Button>
          <Button variant="outline" size="sm" onClick={exportarPDF}>
            <FileText className="w-4 h-4 mr-1" /> PDF resumen
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar por alumno, DNI o producto..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
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
            <SelectItem value="all">Todos los estados</SelectItem>
            {ESTADOS.map((e) => <SelectItem key={e} value={e}>{e.replace(/_/g, " ")}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="text-xs text-muted-foreground self-center ml-auto">{filtered.length} reservas</div>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="px-3 py-3 text-left text-xs font-heading uppercase">Fecha</th>
              <th className="px-3 py-3 text-left text-xs font-heading uppercase">Alumno</th>
              <th className="px-3 py-3 text-left text-xs font-heading uppercase">Producto</th>
              <th className="px-3 py-3 text-center text-xs font-heading uppercase">Cant.</th>
              <th className="px-3 py-3 text-center text-xs font-heading uppercase">Entrega</th>
              <th className="px-3 py-3 text-right text-xs font-heading uppercase">Total</th>
              <th className="px-3 py-3 text-center text-xs font-heading uppercase">Pago seña</th>
              <th className="px-3 py-3 text-center text-xs font-heading uppercase">Estado</th>
              <th className="px-3 py-3 text-right text-xs font-heading uppercase"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((r) => {
              const al = alumnosMap[r.alumno_id];
              const tieneItems = Array.isArray(r.items) && r.items.length > 0;
              return (
                <tr key={r.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => setDetail(r)}>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString("es-AR")}</td>
                  <td className="px-3 py-2">
                    <div>{`${al?.nombre || ""} ${al?.apellido || ""}`.trim() || (r as any).alumno_nombre || "—"}</div>
                    <div className="text-[10px] text-muted-foreground">{al?.telefono || (r as any).alumno_telefono || al?.email || (r as any).alumno_email || ""}</div>
                  </td>

                  <td className="px-3 py-2">
                    <div className="font-medium">{r.producto_nombre}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {tieneItems
                        ? `${r.items!.length} componente${r.items!.length > 1 ? "s" : ""}`
                        : varianteToKey(r.variante || {})}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-center">{r.cantidad}</td>
                  <td className="px-3 py-2 text-center text-xs">
                    {r.entrega_metodo === "envio_moto" ? (
                      <span className="inline-flex items-center gap-1 text-primary"><Truck className="w-3 h-3" /> Moto</span>
                    ) : r.entrega_metodo === "retiro_sede" ? (
                      <span className="inline-flex items-center gap-1 text-cyan"><Store className="w-3 h-3" /> Sede</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-heading">{formatPrice(Number(r.precio_total), r.moneda)}</td>
                  <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                    <Select value={r.estado_pago_sena} onValueChange={(v) => updateField(r.id, { estado_pago_sena: v } as any)}>
                      <SelectTrigger className="h-7 text-xs w-[140px] mx-auto"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ESTADOS_PAGO.map((e) => <SelectItem key={e} value={e}>{e.replace(/_/g, " ")}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                    <Select value={r.estado} onValueChange={(v) => updateField(r.id, { estado: v } as any)}>
                      <SelectTrigger className={`h-7 text-xs w-[160px] mx-auto ${estadoColor(r.estado)}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ESTADOS.map((e) => <SelectItem key={e} value={e}>{e.replace(/_/g, " ")}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <Button size="sm" variant="ghost" title="Enviar recordatorio de pago" onClick={() => enviarRecordatorio(r)}>
                        <Mail className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="ghost" title="Imprimir etiqueta con QR" onClick={() => imprimirEtiqueta(r)}>
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
        {filtered.length === 0 && <div className="p-8 text-center text-muted-foreground">No hay preventas con esos filtros.</div>}
      </div>

      {/* DETAIL DRAWER */}
      <Sheet open={!!detail} onOpenChange={(v) => !v && setDetail(null)}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          {detail && (() => {
            const al = alumnosMap[detail.alumno_id];
            const sede = detail.sede_retiro_id ? sedesMap[detail.sede_retiro_id] : null;
            const items = Array.isArray(detail.items) && detail.items.length > 0 ? detail.items : null;
            return (
              <>
                <SheetHeader>
                  <SheetTitle className="font-heading">{detail.producto_nombre}</SheetTitle>
                  <SheetDescription>
                    Reserva #{detail.id.slice(0, 8).toUpperCase()} · {new Date(detail.created_at).toLocaleString("es-AR")}
                  </SheetDescription>
                </SheetHeader>

                <div className="mt-4 space-y-4 text-sm">
                  {/* Alumno */}
                  <section className="rounded-lg border border-border p-3 space-y-1">
                    <h4 className="text-[11px] font-heading uppercase text-muted-foreground flex items-center gap-1"><User className="w-3 h-3" /> Cliente</h4>
                    <div className="font-medium">{`${al?.nombre || ""} ${al?.apellido || ""}`.trim() || (detail as any).alumno_nombre || "—"}</div>
                    <div className="text-xs text-muted-foreground">
                      {(al?.dni || (detail as any).alumno_dni) && <>DNI {al?.dni || (detail as any).alumno_dni} · </>}
                      {(al?.telefono || (detail as any).alumno_telefono) && <><Phone className="inline w-3 h-3" /> {al?.telefono || (detail as any).alumno_telefono} · </>}
                      {al?.email || (detail as any).alumno_email}
                    </div>
                  </section>

                  {/* Detalle del pedido */}
                  <section className="rounded-lg border border-border p-3 space-y-2">
                    <h4 className="text-[11px] font-heading uppercase text-muted-foreground flex items-center gap-1"><Package className="w-3 h-3" /> Pedido (x{detail.cantidad})</h4>
                    {items ? (
                      <ul className="divide-y divide-border">
                        {items.map((it: any, i: number) => (
                          <li key={i} className="py-2">
                            <div className="font-medium">{it.nombre || "Componente"}</div>
                            <div className="text-xs text-muted-foreground">{varianteToKey(it.variante || {})}</div>
                            {it.precio != null && (
                              <div className="text-[11px] text-muted-foreground">{formatPrice(Number(it.precio), detail.moneda)}</div>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="text-xs">
                        <div>{detail.producto_nombre}</div>
                        <div className="text-muted-foreground">{varianteToKey(detail.variante || {})}</div>
                      </div>
                    )}
                  </section>

                  {/* Entrega */}
                  <section className="rounded-lg border border-border p-3 space-y-2">
                    <h4 className="text-[11px] font-heading uppercase text-muted-foreground flex items-center gap-1">
                      {detail.entrega_metodo === "envio_moto" ? <Truck className="w-3 h-3" /> : <Store className="w-3 h-3" />}
                      Entrega
                    </h4>
                    {detail.entrega_metodo === "envio_moto" ? (
                      <div className="space-y-2 text-xs">
                        <div className="flex items-start gap-1"><MapPin className="w-3 h-3 mt-0.5" /> {detail.envio_direccion || "—"}</div>
                        <div className="flex items-start gap-1"><Phone className="w-3 h-3 mt-0.5" /> {detail.envio_contacto || "—"}</div>
                        {detail.envio_notas && <div className="text-muted-foreground">📝 {detail.envio_notas}</div>}
                        <div className="grid grid-cols-2 gap-2 pt-2">
                          <div>
                            <label className="text-[10px] uppercase text-muted-foreground">Costo envío (cotizado)</label>
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
                            <Select value={detail.envio_estado || "a_cotizar"} onValueChange={(v) => updateField(detail.id, { envio_estado: v } as any)}>
                              <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {ENVIO_ESTADOS.map((e) => <SelectItem key={e} value={e}>{e.replace(/_/g, " ")}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                    ) : detail.entrega_metodo === "retiro_sede" ? (
                      <div className="text-xs">
                        <div className="font-medium">{sede?.nombre || "Sede sin especificar"}</div>
                        {sede?.direccion && <div className="text-muted-foreground">{sede.direccion}{sede.ciudad ? `, ${sede.ciudad}` : ""}</div>}
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground italic">Sin método de entrega elegido (reserva previa al cambio).</div>
                    )}
                  </section>

                  {/* Pago */}
                  <section className="rounded-lg border border-border p-3 space-y-1 text-xs">
                    <h4 className="text-[11px] font-heading uppercase text-muted-foreground">Pago</h4>
                    <div className="flex justify-between"><span className="text-muted-foreground">Total</span><b>{formatPrice(Number(detail.precio_total), detail.moneda)}</b></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Seña</span><b>{formatPrice(Number(detail.sena_monto), detail.moneda)}</b></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Saldo pendiente</span><b>{formatPrice(Number(detail.saldo_pendiente), detail.moneda)}</b></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Forma pago seña</span><b>{detail.forma_pago_sena || "—"}</b></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Estado pago</span><b>{detail.estado_pago_sena}</b></div>
                    {detail.notas && (
                      <div className="pt-1 text-muted-foreground">📝 {detail.notas}</div>
                    )}
                    {detail.estado_pago_sena === "pendiente_verificacion" && (
                      <div className="flex gap-2 pt-2">
                        <Button size="sm" variant="outline" className="flex-1" onClick={() => confirmarSena(detail)}>Confirmar seña</Button>
                        <Button size="sm" variant="ghost" onClick={() => rechazarSena(detail)}>Rechazar</Button>
                      </div>
                    )}
                  </section>

                  {/* Notas internas */}
                  <section className="rounded-lg border border-border p-3 space-y-1">
                    <label className="text-[11px] font-heading uppercase text-muted-foreground">Notas internas</label>
                    <Textarea
                      rows={2}
                      defaultValue={detail.notas || ""}
                      onBlur={(e) => {
                        if (e.target.value !== (detail.notas || "")) updateField(detail.id, { notas: e.target.value || null } as any);
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
                    <Button onClick={() => enviarRecordatorio(detail)} className="col-span-2">
                      <Mail className="w-4 h-4 mr-1" />
                      {detail.estado_pago_sena === "confirmada" && Number(detail.saldo_pendiente || 0) > 0
                        ? "Enviar recordatorio de saldo"
                        : "Enviar recordatorio de seña"}
                    </Button>
                  </div>
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default StorePreorders;
