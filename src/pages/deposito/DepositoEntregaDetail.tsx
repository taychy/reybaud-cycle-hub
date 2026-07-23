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
  ShieldCheck,
  Zap,
  Printer,
  ScanLine,
} from "lucide-react";
import { toast } from "sonner";
import {
  parseDeliveryExcel,
  buildDeliveryExcelTemplate,
  type DeliveryExcelRow,
} from "@/lib/deliveryExcel";
import DeliveryPaymentsSection from "@/components/deposito/DeliveryPaymentsSection";
import DeliveryClientNotify from "@/components/deposito/DeliveryClientNotify";
import { computeDeliveryBalances, fmtMoneyBalance, type BalanceRow } from "@/lib/deliveryBalances";
import { compareVariantsBySize } from "@/lib/variantSort";
import CameraScanner from "@/components/deposito/CameraScanner";
import QRCode from "qrcode";

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
  precio_venta?: number | null;
  moneda?: string | null;
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
  const [payments, setPayments] = useState<Array<{ cliente_nombre: string; monto: number; moneda: string; validado: boolean }>>([]);
  const [loading, setLoading] = useState(true);
  const [showManual, setShowManual] = useState(false);
  const [showFromOrders, setShowFromOrders] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [search, setSearch] = useState("");
  const excelRef = useRef<HTMLInputElement>(null);
  const [modoRapido, setModoRapido] = useState<boolean>(() => {
    try { return localStorage.getItem("delivery_modo_rapido") === "1"; } catch { return false; }
  });
  const [confirmToggle, setConfirmToggle] = useState<{ item: DeliveryItem; next: boolean } | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanCount, setScanCount] = useState(0);
  const scanBusyRef = useRef(false);

  const clientCode = (cliente: string) => {
    if (!list) return "";
    // Encode as base64url to survive QR-safe chars and rebuild reliably.
    const raw = `${list.id}|${cliente}`;
    const b64 = btoa(unescape(encodeURIComponent(raw)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    return `RBDLV1:${b64}`;
  };

  const parseClientCode = (code: string): { listId: string; cliente: string } | null => {
    if (!code.startsWith("RBDLV1:")) return null;
    try {
      const b64 = code.slice(7).replace(/-/g, "+").replace(/_/g, "/");
      const raw = decodeURIComponent(escape(atob(b64)));
      const [listId, ...rest] = raw.split("|");
      if (!listId || rest.length === 0) return null;
      return { listId, cliente: rest.join("|") };
    } catch { return null; }
  };


  const setModoRapidoPersist = (v: boolean) => {
    setModoRapido(v);
    try { localStorage.setItem("delivery_modo_rapido", v ? "1" : "0"); } catch { /* ignore */ }
  };

  const fetch = async () => {
    if (!id) return;
    const [{ data: l }, { data: its }, { data: pays }] = await Promise.all([
      supabase.from("delivery_lists").select("*").eq("id", id).maybeSingle(),
      supabase
        .from("delivery_list_items")
        .select("*")
        .eq("list_id", id)
        .order("cliente_nombre")
        .order("posicion")
        .order("created_at"),
      supabase
        .from("delivery_list_payments")
        .select("cliente_nombre, monto, moneda, validado")
        .eq("list_id", id),
    ]);
    setList(l as any);
    setItems((its as any) || []);
    setPayments((pays as any) || []);
    setLoading(false);
  };

  useEffect(() => {
    fetch();
  }, [id]);

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const byClient: Record<string, DeliveryItem[]> = {};
    items.forEach((it) => {
      if (q) {
        const hay = `${it.cliente_nombre} ${it.producto} ${formatVariant(it.variante) || ""}`.toLowerCase();
        if (!hay.includes(q)) return;
      }
      (byClient[it.cliente_nombre] ||= []).push(it);
    });
    return Object.entries(byClient)
      .map(([cliente, its]) => [cliente, its.sort(compareVariantsBySize)] as [string, DeliveryItem[]])
      .sort((a, b) => a[0].localeCompare(b[0]));
  }, [items, search]);

  const totals = useMemo(() => {
    const total = items.length;
    const prep = items.filter((i) => i.preparado).length;
    return { total, prep, pct: total ? Math.round((prep / total) * 100) : 0 };
  }, [items]);

  const balancesByClient = useMemo(
    () => computeDeliveryBalances(items as any, payments as any),
    [items, payments],
  );

  const applyToggle = async (item: DeliveryItem, checked: boolean) => {
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

  const requestToggle = (item: DeliveryItem, checked: boolean) => {
    // Safety: always confirm when unchecking an already-prepared item.
    // Also confirm marking as prepared unless "Modo rápido" is enabled.
    if (checked && modoRapido) return applyToggle(item, true);
    if (!checked && !item.preparado) return applyToggle(item, false);
    setConfirmToggle({ item, next: checked });
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

  const generateLabels = async () => {
    if (!list) return;
    if (grouped.length === 0) {
      toast.error("No hay ítems para etiquetar");
      return;
    }
    const esc = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const cards = await Promise.all(
      grouped.map(async ([cliente, its]) => {
        const lines = its
          .map((it) => {
            const v = formatVariant(it.variante);
            const qty = it.cantidad > 1 ? ` × ${it.cantidad}` : "";
            return `<li>${esc(it.producto)}${v ? ` <span class="v">(${esc(v)})</span>` : ""}${qty}</li>`;
          })
          .join("");
        const totalItems = its.reduce((a, i) => a + (i.cantidad || 1), 0);
        const code = clientCode(cliente);
        const qrData = await QRCode.toDataURL(code, { margin: 0, width: 220, errorCorrectionLevel: "M" });
        const shortId = code.slice(-8).toUpperCase();
        return `
          <div class="label">
            <div class="hdr">
              <div class="title">${esc(list.titulo)}</div>
              <div class="count">${its.length} ítem${its.length !== 1 ? "s" : ""} · ${totalItems} u.</div>
            </div>
            <div class="body">
              <div class="info">
                <div class="client">${esc(cliente)}</div>
                <ul class="items">${lines}</ul>
              </div>
              <div class="qr">
                <img src="${qrData}" alt="QR" />
                <div class="qrid">#${shortId}</div>
              </div>
            </div>
            <div class="foot">Escaneá el QR para marcar como entregado · Reybaud${list.fecha_entrega ? ` · ${esc(list.fecha_entrega)}` : ""}</div>
          </div>`;
      }),
    );
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Etiquetas — ${esc(list.titulo)}</title>
<style>
  @page { size: A4; margin: 8mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, system-ui, Segoe UI, Roboto, sans-serif; margin: 0; color: #111; background: #fff; }
  .sheet { display: grid; grid-template-columns: 1fr 1fr; grid-auto-rows: 54mm; gap: 0; }
  .label {
    border: 1px dashed #666;
    padding: 4mm 5mm;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    page-break-inside: avoid;
  }
  .hdr { display: flex; justify-content: space-between; align-items: baseline; font-size: 8.5pt; color: #555; text-transform: uppercase; letter-spacing: .05em; }
  .hdr .title { font-weight: 700; }
  .body { display: flex; gap: 3mm; flex: 1; min-height: 0; margin-top: 1.5mm; }
  .info { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .client { font-size: 14pt; font-weight: 800; margin: 0 0 1.2mm; line-height: 1.1; text-transform: uppercase; }
  .items { margin: 0; padding-left: 4mm; font-size: 9.5pt; line-height: 1.2; flex: 1; overflow: hidden; }
  .items li { margin-bottom: 0.4mm; }
  .items .v { color: #555; font-size: 8.5pt; }
  .qr { flex: 0 0 22mm; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; }
  .qr img { width: 22mm; height: 22mm; display: block; }
  .qrid { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 7pt; color: #444; margin-top: 0.8mm; letter-spacing: .05em; }
  .foot { font-size: 7.5pt; color: #666; margin-top: 1.5mm; border-top: 1px dotted #bbb; padding-top: 1mm; }
  .toolbar { position: fixed; top: 8px; right: 8px; display: flex; gap: 6px; }
  .toolbar button { font: 500 13px system-ui; padding: 8px 12px; border-radius: 6px; border: 1px solid #ccc; background: #fff; cursor: pointer; }
  .toolbar button.primary { background: #111; color: #fff; border-color: #111; }
  @media print { .toolbar { display: none; } }
</style></head><body>
<div class="toolbar">
  <button onclick="window.print()" class="primary">Imprimir</button>
  <button onclick="window.close()">Cerrar</button>
</div>
<div class="sheet">${cards.join("")}</div>
<script>window.addEventListener('load', () => setTimeout(() => window.print(), 400));</script>
</body></html>`;
    const w = window.open("", "_blank");
    if (!w) {
      toast.error("Habilitá pop-ups para generar etiquetas");
      return;
    }
    w.document.write(html);
    w.document.close();
  };

  const handleScannedCode = async (code: string) => {
    if (scanBusyRef.current) return;
    const parsed = parseClientCode(code.trim());
    if (!parsed) {
      toast.error("Código no válido", { description: code.slice(0, 40) });
      return;
    }
    if (!list) return;
    if (parsed.listId !== list.id) {
      toast.error("Este código pertenece a otra lista de entregas");
      return;
    }
    const clienteItems = items.filter(
      (i) => i.cliente_nombre.trim().toLowerCase() === parsed.cliente.trim().toLowerCase(),
    );
    if (clienteItems.length === 0) {
      toast.error(`Sin ítems para "${parsed.cliente}"`);
      return;
    }
    const pending = clienteItems.filter((i) => !i.preparado);
    if (pending.length === 0) {
      toast.info(`${parsed.cliente} ya estaba entregado`);
      return;
    }
    scanBusyRef.current = true;
    setItems((prev) => prev.map((i) => (pending.some((p) => p.id === i.id) ? { ...i, preparado: true } : i)));
    const { data: userRes } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("delivery_list_items")
      .update({ preparado: true, preparado_by: userRes.user?.id ?? null })
      .in("id", pending.map((p) => p.id));
    scanBusyRef.current = false;
    if (error) {
      toast.error("No se pudo marcar como entregado");
      fetch();
      return;
    }
    setScanCount((n) => n + 1);
    toast.success(`✓ ${parsed.cliente}`, { description: `${pending.length} ítem${pending.length !== 1 ? "s" : ""} marcados como entregados` });
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
            <Button
              variant={modoRapido ? "default" : "outline"}
              size="sm"
              onClick={() => setModoRapidoPersist(!modoRapido)}
              title={modoRapido ? "Los ítems se marcan sin confirmación" : "Cada check pide confirmación"}
            >
              {modoRapido ? (
                <><Zap className="w-3.5 h-3.5 mr-1" /> Modo rápido</>
              ) : (
                <><ShieldCheck className="w-3.5 h-3.5 mr-1" /> Confirmar chequeos</>
              )}
            </Button>
            <Button variant="gold" size="sm" onClick={() => { setScanCount(0); setScannerOpen(true); }}>
              <ScanLine className="w-3.5 h-3.5 mr-1" /> Escanear entregas
            </Button>
            <Button variant="outline" size="sm" onClick={generateLabels}>
              <Printer className="w-3.5 h-3.5 mr-1" /> Generar etiquetas
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
          <Button variant="outline" size="sm" onClick={() => setShowHistory(true)}>
            <History className="w-3.5 h-3.5 mr-1" /> Historial
          </Button>
        </div>
      </div>

      {items.length > 0 && (
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o producto..."
            className="pl-9"
          />
        </div>
      )}

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
            const bal = balancesByClient[cliente] || [];
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
                {bal.length > 0 && bal.some((r) => r.total > 0 || r.cobrado > 0) && (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {bal.filter((r) => r.total > 0 || r.cobrado > 0).map((r) => (
                      <div key={r.moneda} className="text-[11px] rounded-md bg-secondary/60 border border-border/60 px-2 py-1 flex items-center gap-2">
                        <span className="text-muted-foreground">Total {r.moneda}</span>
                        <span className="font-semibold">{fmtMoneyBalance(r.total, r.moneda)}</span>
                        <span className="text-muted-foreground">·</span>
                        <span className="text-emerald-500">cobrado {fmtMoneyBalance(r.cobrado, r.moneda)}</span>
                        <span className="text-muted-foreground">·</span>
                        <span className={r.pendiente > 0.001 ? "text-amber-500 font-semibold" : "text-emerald-500 font-semibold"}>
                          {r.pendiente > 0.001 ? `saldo ${fmtMoneyBalance(r.pendiente, r.moneda)}` : "saldado"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
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
                          onCheckedChange={(v) => requestToggle(it, !!v)}
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
                    precio_venta: i.precio_venta ?? null,
                    moneda: i.moneda ?? null,
                  }))}
                  balances={bal}
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
      <HistoryDialog open={showHistory} onOpenChange={setShowHistory} listId={list.id} />

      <AlertDialog open={!!confirmToggle} onOpenChange={(v) => { if (!v) setConfirmToggle(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmToggle?.next ? "¿Confirmás que este ítem está entregado?" : "¿Desmarcar este ítem?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmToggle && (
                <>
                  <span className="block font-medium text-foreground mt-1">
                    {confirmToggle.item.cantidad > 1 ? `${confirmToggle.item.cantidad}× ` : ""}
                    {confirmToggle.item.producto}
                  </span>
                  {formatVariant(confirmToggle.item.variante) && (
                    <span className="block text-xs text-muted-foreground">{formatVariant(confirmToggle.item.variante)}</span>
                  )}
                  <span className="block text-xs text-muted-foreground mt-1">Cliente: {confirmToggle.item.cliente_nombre}</span>
                  {!confirmToggle.next && (
                    <span className="block text-xs text-amber-600 mt-2">
                      Este ítem ya estaba marcado como entregado. Solo desmarcalo si fue un error.
                    </span>
                  )}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmToggle) applyToggle(confirmToggle.item, confirmToggle.next);
                setConfirmToggle(null);
              }}
            >
              {confirmToggle?.next ? "Sí, marcar entregado" : "Sí, desmarcar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CameraScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onDetected={handleScannedCode}
        continuous
        hint={`${scanCount} entrega${scanCount !== 1 ? "s" : ""} marcada${scanCount !== 1 ? "s" : ""}`}
      />
    </div>
  );
};

const HistoryDialog = ({
  open,
  onOpenChange,
  listId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  listId: string;
}) => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    supabase
      .from("delivery_item_check_log")
      .select("*")
      .eq("list_id", listId)
      .order("created_at", { ascending: false })
      .limit(500)
      .then(({ data }) => {
        setLogs(data || []);
        setLoading(false);
      });
  }, [open, listId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Historial de tildados</DialogTitle>
        </DialogHeader>
        {loading ? (
          <p className="text-sm text-muted-foreground animate-pulse py-8 text-center">Cargando...</p>
        ) : logs.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Todavía no hay movimientos.</p>
        ) : (
          <div className="space-y-1.5 text-sm">
            {logs.map((l) => (
              <div key={l.id} className="flex items-start gap-2 p-2 rounded border border-border/50">
                <Badge variant={l.preparado ? "default" : "secondary"} className="text-[10px] shrink-0">
                  {l.preparado ? "✓ tildado" : "destildado"}
                </Badge>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{l.cliente_nombre} · {l.producto}</div>
                  {l.variante && <div className="text-xs text-muted-foreground">{l.variante}</div>}
                  <div className="text-[11px] text-muted-foreground">
                    {new Date(l.created_at).toLocaleString()} · {l.actor_type === "public" ? "link público" : "depósito/admin"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
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
