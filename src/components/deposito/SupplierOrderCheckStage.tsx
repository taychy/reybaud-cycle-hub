import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, Loader2, Truck, ChevronLeft, ChevronRight, Package, ListChecks, ArrowLeft, ScanLine, Keyboard, Link2, AlertTriangle, Tag } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import CameraScanner from "@/components/deposito/CameraScanner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { compareVariantsBySize } from "@/lib/variantSort";
import { printNiimbotLabels, type NiimbotPreviewItem } from "@/lib/niimbotLabels";
import NiimbotLabelPreviewDialog from "@/components/deposito/NiimbotLabelPreviewDialog";

// Serializa un objeto de variante de forma canónica (claves ordenadas y normalizadas)
const canonVariante = (v: any): string => {
  if (!v || typeof v !== "object") return "{}";
  const obj: Record<string, string> = {};
  Object.keys(v)
    .filter((k) => v[k] !== null && v[k] !== undefined && String(v[k]).trim() !== "")
    .sort()
    .forEach((k) => { obj[k.toLowerCase()] = String(v[k]).trim().toLowerCase(); });
  return JSON.stringify(obj);
};

const sb: any = supabase;

interface Props {
  saving: boolean;
  isLast: boolean;
  initialOrderId?: string | null;
  initialNota?: string | null;
  onConfirm: (payload: { nota: string | null; entidad_ref_id: string | null }) => Promise<void> | void;
  onCancel: () => void;
}

const formatVariante = (v: any) => {
  if (!v || typeof v !== "object") return "";
  const entries = Object.entries(v).filter(([, val]) => val);
  if (!entries.length) return "";
  return entries.map(([k, val]) => `${k}: ${val}`).join(" / ");
};

type Phase = "select" | "count" | "summary";

const SupplierOrderCheckStage = ({ saving, isLast, initialOrderId, initialNota, onConfirm, onCancel }: Props) => {
  const [orders, setOrders] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [items, setItems] = useState<any[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [nota, setNota] = useState(initialNota || "");
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<Phase>("select");
  const [idx, setIdx] = useState(0);
  const [visited, setVisited] = useState<Record<string, boolean>>({});

  // Modo de conteo: manual (input) o escaneo por cámara
  const [mode, setMode] = useState<"manual" | "scan">("manual");
  const [scanOpen, setScanOpen] = useState(false);
  const [scanCount, setScanCount] = useState(0);
  const [linkOpen, setLinkOpen] = useState(false);
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  const [linkItemId, setLinkItemId] = useState<string>("");
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    sb.from("supplier_orders")
      .select("*")
      .in("estado", ["abierto", "recibido_parcial"])
      .order("created_at", { ascending: false })
      .then(({ data }: any) => {
        setOrders(data || []);
        if (initialOrderId && (data || []).some((o: any) => o.id === initialOrderId)) {
          setSelectedId(initialOrderId);
        }
      });
  }, [initialOrderId]);

  // Sort by producto → variante (talle first) for grouped counting
  const sortItems = (list: any[]) =>
    [...list].sort((a, b) => {
      const p = String(a.producto_nombre || "").localeCompare(String(b.producto_nombre || ""), "es");
      if (p !== 0) return p;
      return compareVariantsBySize(a.variante, b.variante);
    });

  useEffect(() => {
    if (!selectedId) { setItems([]); setCounts({}); return; }
    setLoading(true);
    (async () => {
      const { data } = await sb
        .from("supplier_order_items")
        .select("*")
        .eq("supplier_order_id", selectedId);
      let list = sortItems(data || []);
      const productIds = [...new Set(list.map((it: any) => it.product_id).filter(Boolean))];
      if (productIds.length) {
        const { data: prods } = await sb
          .from("store_products")
          .select("id, sku_base")
          .in("id", productIds);
        const skuMap = new Map<string, string | null>(
          (prods || []).map((p: any) => [p.id, p.sku_base ?? null]),
        );
        list = list.map((it: any) => ({ ...it, sku_base: skuMap.get(it.product_id) ?? null }));
      }
      setItems(list);
      const saved = localStorage.getItem(`sup-count:${selectedId}`);
      let restored: Record<string, number> | null = null;
      let restoredVisited: Record<string, boolean> | null = null;
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          restored = parsed.counts || null;
          restoredVisited = parsed.visited || null;
        } catch {}
      }
      const initial: Record<string, number> = {};
      list.forEach((it: any) => {
        initial[it.id] = restored && restored[it.id] != null ? restored[it.id] : (it.cantidad_recibida || 0);
      });
      setCounts(initial);
      setVisited(restoredVisited || {});
      setIdx(0);
      setLoading(false);
    })();
  }, [selectedId]);


  // Autosave
  useEffect(() => {
    if (!selectedId || !items.length) return;
    localStorage.setItem(`sup-count:${selectedId}`, JSON.stringify({ counts, visited }));
  }, [counts, visited, selectedId, items.length]);

  const selectedOrder = orders.find((o) => o.id === selectedId);

  const resumen = useMemo(() => {
    let ok = 0, falta = 0, sobra = 0;
    const detalles: string[] = [];
    items.forEach((it) => {
      const recibido = counts[it.id] || 0;
      const pedido = it.cantidad_pedida || 0;
      const label = `${it.producto_nombre}${formatVariante(it.variante) ? ` (${formatVariante(it.variante)})` : ""}`;
      if (recibido === pedido) { ok++; }
      else if (recibido < pedido) { falta++; detalles.push(`Falta ${pedido - recibido} de "${label}" (recibido ${recibido}/${pedido})`); }
      else { sobra++; detalles.push(`Sobran ${recibido - pedido} de "${label}" (recibido ${recibido}/${pedido})`); }
    });
    const visitCount = items.filter((it) => visited[it.id]).length;
    return { ok, falta, sobra, detalles, visitCount };
  }, [items, counts, visited]);

  const current = items[idx];
  const currentRecibido = current ? (counts[current.id] || 0) : 0;
  const currentPedido = current ? (current.cantidad_pedida || 0) : 0;
  const currentDiff = currentRecibido - currentPedido;

  const setCurrentCount = (n: number) => {
    if (!current) return;
    const val = Math.max(0, n);
    setCounts((c) => ({ ...c, [current.id]: val }));
  };

  const incrementItem = (itemId: string, delta = 1) => {
    setCounts((c) => ({ ...c, [itemId]: Math.max(0, (c[itemId] || 0) + delta) }));
    setVisited((v) => ({ ...v, [itemId]: true }));
  };

  const [printingItemId, setPrintingItemId] = useState<string | null>(null);
  const [previewLabels, setPreviewLabels] = useState<NiimbotPreviewItem[]>([]);
  const [previewTitle, setPreviewTitle] = useState<string>("Vista previa de etiqueta");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewHint, setPreviewHint] = useState<string | undefined>(undefined);

  const handlePrintNiimbot = async (
    item: any,
    copies: number,
    mode: "label" | "scan-source" = "label",
  ) => {
    if (!item?.product_id) {
      toast({
        title: "Ítem sin producto vinculado",
        description: "Vinculá el ítem a un producto de tienda antes de imprimir.",
        variant: "destructive",
      });
      return;
    }
    setPrintingItemId(item.id + ":" + mode);
    try {
      const res = await printNiimbotLabels(
        [
          {
            product_id: item.product_id,
            product_name: item.producto_nombre,
            sku_base: item.sku_base ?? null,
            variant_key: item.variante
              ? Object.entries(item.variante)
                  .filter(([, v]) => v)
                  .map(([k, v]) => `${k}:${v}`)
                  .join("|") || null
              : null,
            variante: item.variante || {},
            copies: Math.max(1, copies || 1),
          },
        ],
        { filenameHint: item.producto_nombre, mode, preview: true },
      );
      if (res.previews && res.previews.length) {
        setPreviewLabels(res.previews);
        setPreviewTitle(
          mode === "scan-source"
            ? `Fuente escaneable · ${item.producto_nombre}`
            : `Etiqueta Niimbot · ${item.producto_nombre}`,
        );
        setPreviewHint(item.producto_nombre);
        setPreviewOpen(true);
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setPrintingItemId(null);
    }
  };

  // Al escanear un código: buscar en product_barcodes; si existe y matchea una línea del pedido → +1.
  // Si no existe → abrir diálogo obligatorio para vincularlo con una línea del pedido.
  // Si existe pero no matchea ninguna línea → registrar incidente y avisar.
  const handleScannedCode = async (codigo: string) => {
    const code = codigo.trim();
    if (!code) return;
    try {
      const { data: bc } = await sb
        .from("product_barcodes")
        .select("id, store_product_id, variante")
        .eq("codigo", code)
        .maybeSingle();

      if (bc) {
        const match = items.find(
          (it) =>
            it.product_id &&
            it.product_id === bc.store_product_id &&
            canonVariante(it.variante) === canonVariante(bc.variante),
        );
        if (match) {
          incrementItem(match.id, 1);
          setScanCount((n) => n + 1);
          toast({ title: "✓ " + match.producto_nombre, description: formatVariante(match.variante) || undefined });
          return;
        }
        // Código conocido pero no corresponde al pedido: incidente y bloqueo
        const { data: { user } } = await supabase.auth.getUser();
        await sb.from("scan_incidents").insert({
          codigo: code,
          supplier_order_id: selectedId,
          motivo: "no_corresponde",
          detalle: "Código ya vinculado a otro producto/variante fuera del pedido actual.",
          scanned_by: user?.id ?? null,
        });
        toast({
          title: "Código no corresponde a este pedido",
          description: "Se registró un incidente para que admin lo revise.",
          variant: "destructive",
        });
        return;
      }

      // Desconocido → forzar vinculación
      setPendingCode(code);
      setLinkItemId("");
      setScanOpen(false);
      setLinkOpen(true);
    } catch (e: any) {
      toast({ title: "Error al leer código", description: e.message, variant: "destructive" });
    }
  };

  const confirmLinkBarcode = async () => {
    if (!pendingCode || !linkItemId) return;
    const item = items.find((it) => it.id === linkItemId);
    if (!item?.product_id) {
      return toast({
        title: "Esta línea no está vinculada a un producto de tienda",
        description: "Vinculá primero el ítem al producto para poder escanear.",
        variant: "destructive",
      });
    }
    setLinking(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await sb.from("product_barcodes").insert({
        codigo: pendingCode,
        store_product_id: item.product_id,
        variante: item.variante || {},
        proveedor: selectedOrder?.proveedor_nombre ?? null,
        origen: "proveedor",
        created_by: user?.id ?? null,
      });
      if (error) throw error;
      incrementItem(item.id, 1);
      setScanCount((n) => n + 1);
      toast({ title: "Código vinculado", description: `${item.producto_nombre}${formatVariante(item.variante) ? " · " + formatVariante(item.variante) : ""}` });
      setLinkOpen(false);
      setPendingCode(null);
      setLinkItemId("");
      // Reabrir escáner para seguir
      setTimeout(() => setScanOpen(true), 150);
    } catch (e: any) {
      toast({ title: "No se pudo vincular", description: e.message, variant: "destructive" });
    } finally {
      setLinking(false);
    }
  };

  const skipLinkAsIncident = async () => {
    if (!pendingCode) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await sb.from("scan_incidents").insert({
        codigo: pendingCode,
        supplier_order_id: selectedId,
        motivo: "desconocido",
        detalle: "Operario descartó vincular el código durante el conteo.",
        scanned_by: user?.id ?? null,
      });
      toast({ title: "Código guardado como incidente" });
    } catch {}
    setLinkOpen(false);
    setPendingCode(null);
    setLinkItemId("");
    setTimeout(() => setScanOpen(true), 150);
  };

  const markVisitedAndNext = () => {
    if (!current) return;
    setVisited((v) => ({ ...v, [current.id]: true }));
    if (idx < items.length - 1) setIdx(idx + 1);
    else setPhase("summary");
  };

  const handleConfirm = async () => {
    if (!selectedId) return toast({ title: "Elegí un pedido", variant: "destructive" });
    if (!items.length) return toast({ title: "El pedido no tiene ítems", variant: "destructive" });

    try {
      for (const it of items) {
        const newCount = counts[it.id] || 0;
        if (newCount !== (it.cantidad_recibida || 0)) {
          await sb.from("supplier_order_items").update({ cantidad_recibida: newCount }).eq("id", it.id);
        }
      }
      const allOk = items.every((it) => (counts[it.id] || 0) >= (it.cantidad_pedida || 0));
      const someReceived = items.some((it) => (counts[it.id] || 0) > 0);
      const nuevoEstado = allOk ? "cerrado" : someReceived ? "recibido_parcial" : "abierto";
      await sb.from("supplier_orders").update({ estado: nuevoEstado }).eq("id", selectedId);

      const lines = [
        `Pedido: ${selectedOrder?.numero} · ${selectedOrder?.proveedor_nombre}`,
        `OK: ${resumen.ok} · Faltantes: ${resumen.falta} · Sobrantes: ${resumen.sobra}`,
        ...resumen.detalles,
      ];
      if (nota.trim()) lines.push("", "Observaciones:", nota.trim());

      localStorage.removeItem(`sup-count:${selectedId}`);
      await onConfirm({ nota: lines.join("\n"), entidad_ref_id: selectedId });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const totalEsperado = items.reduce((s, it) => s + (it.cantidad_pedida || 0), 0);
  const totalRecibido = items.reduce((s, it) => s + (counts[it.id] || 0), 0);
  const progressPct = items.length ? Math.round((resumen.visitCount / items.length) * 100) : 0;

  // ============ PHASE: SELECT ORDER ============
  if (phase === "select") {
    return (
      <Card className="border-primary/40">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Package className="w-4 h-4" /> Paso 1 · Elegí el pedido</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium block mb-1">Pedido al proveedor</label>
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger>
                <SelectValue placeholder="Elegí un pedido abierto…" />
              </SelectTrigger>
              <SelectContent>
                {orders.length === 0 && <div className="text-xs text-muted-foreground p-2">No hay pedidos abiertos.</div>}
                {orders.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.numero} · {o.proveedor_nombre} · {new Date(o.fecha_pedido + "T00:00:00").toLocaleDateString("es-AR")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedOrder && (
            <div className="rounded-md border border-border bg-muted/30 p-3 space-y-1 text-sm">
              <div className="flex items-center gap-2 font-medium"><Truck className="w-4 h-4" /> {selectedOrder.proveedor_nombre}</div>
              <div className="text-xs text-muted-foreground">Nº {selectedOrder.numero}</div>
              {selectedOrder.fecha_estimada_entrega && (
                <div className="text-xs text-muted-foreground">ETA: {new Date(selectedOrder.fecha_estimada_entrega + "T00:00:00").toLocaleDateString("es-AR")}</div>
              )}
              {loading ? (
                <div className="text-xs text-muted-foreground pt-1"><Loader2 className="w-3 h-3 inline animate-spin mr-1" /> Cargando ítems…</div>
              ) : (
                <div className="text-xs text-muted-foreground pt-1">{items.length} líneas · {totalEsperado} unidades esperadas</div>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <Button
              className="flex-1"
              disabled={!selectedId || loading || !items.length}
              onClick={() => { setPhase("count"); setIdx(0); }}
            >
              Empezar conteo <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
            <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ============ PHASE: SUMMARY ============
  if (phase === "summary") {
    return (
      <Card className="border-primary/40">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><ListChecks className="w-4 h-4" /> Paso final · Resumen del conteo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-md bg-green-500/10 border border-green-500/30 p-3">
              <div className="text-2xl font-bold text-green-400">{resumen.ok}</div>
              <div className="text-xs text-muted-foreground">OK</div>
            </div>
            <div className="rounded-md bg-destructive/10 border border-destructive/30 p-3">
              <div className="text-2xl font-bold text-destructive">{resumen.falta}</div>
              <div className="text-xs text-muted-foreground">Faltantes</div>
            </div>
            <div className="rounded-md bg-amber-500/10 border border-amber-500/30 p-3">
              <div className="text-2xl font-bold text-amber-400">{resumen.sobra}</div>
              <div className="text-xs text-muted-foreground">Sobrantes</div>
            </div>
          </div>

          <div className="text-xs text-muted-foreground text-center">
            Total esperado: <b>{totalEsperado}</b> · Total contado: <b>{totalRecibido}</b>
          </div>

          <div className="max-h-64 overflow-auto rounded-md border border-border divide-y divide-border">
            {items.map((it) => {
              const r = counts[it.id] || 0;
              const p = it.cantidad_pedida || 0;
              const diff = r - p;
              const color = diff === 0 ? "text-green-400" : diff < 0 ? "text-destructive" : "text-amber-400";
              return (
                <div key={it.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <div className="flex-1 min-w-0">
                    <div className="truncate">{it.producto_nombre}</div>
                    {formatVariante(it.variante) && <div className="text-[11px] text-muted-foreground">{formatVariante(it.variante)}</div>}
                  </div>
                  <div className="text-xs tabular-nums text-muted-foreground">{r}/{p}</div>
                  <div className={`text-xs font-medium w-10 text-right tabular-nums ${color}`}>{diff > 0 ? `+${diff}` : diff}</div>
                </div>
              );
            })}
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">Observaciones generales (opcional)</label>
            <Textarea rows={3} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Comentarios, daños, sustituciones…" />
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { setPhase("count"); setIdx(items.length - 1); }}>
              <ChevronLeft className="w-4 h-4 mr-1" /> Volver a revisar
            </Button>
            <Button onClick={handleConfirm} disabled={saving} className="flex-1">
              {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-1" />}
              {isLast ? "Finalizar proceso" : "Confirmar etapa"}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ============ PHASE: COUNT (per-item wizard) ============
  const diffLabel =
    currentDiff === 0 ? { text: "Coincide", cls: "bg-green-500/20 text-green-400 border-green-500/40" } :
    currentDiff < 0 ? { text: `Falta ${-currentDiff}`, cls: "bg-destructive/20 text-destructive border-destructive/40" } :
    { text: `Sobra ${currentDiff}`, cls: "bg-amber-500/20 text-amber-400 border-amber-500/40" };

  return (
    <Card className="border-primary/40">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <button onClick={() => setPhase("select")} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
            <ArrowLeft className="w-3 h-3" /> Cambiar pedido
          </button>
          <div className="text-xs text-muted-foreground tabular-nums">Ítem {idx + 1} de {items.length}</div>
        </div>
        <Progress value={progressPct} className="h-1.5 mt-2" />
        <div className="text-[11px] text-muted-foreground flex gap-2 mt-1">
          <span className="text-green-400">{resumen.ok} OK</span>
          <span>·</span>
          <span className="text-destructive">{resumen.falta} faltan</span>
          <span>·</span>
          <span className="text-amber-400">{resumen.sobra} sobran</span>
          <span>·</span>
          <span>{items.length - resumen.visitCount} pendientes</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant={mode === "manual" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("manual")}
            className="h-9"
          >
            <Keyboard className="w-4 h-4 mr-1" /> Cantidad
          </Button>
          <Button
            type="button"
            variant={mode === "scan" ? "default" : "outline"}
            size="sm"
            onClick={() => { setMode("scan"); setScanCount(0); setScanOpen(true); }}
            className="h-9"
          >
            <ScanLine className="w-4 h-4 mr-1" /> Escaneo
          </Button>
        </div>
        {mode === "scan" && (
          <div className="mt-2 flex items-center justify-between gap-2 rounded-md border border-primary/40 bg-primary/5 p-2 text-xs">
            <span>Escaneos en esta sesión: <b className="tabular-nums">{scanCount}</b></span>
            <Button size="sm" variant="outline" className="h-7" onClick={() => setScanOpen(true)}>
              <ScanLine className="w-3.5 h-3.5 mr-1" /> Abrir cámara
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">

        {current && (
          <>
            <div className="text-center space-y-1 py-2">
              <div className="text-lg font-semibold leading-tight">{current.producto_nombre}</div>
              {formatVariante(current.variante) && (
                <div className="text-sm text-muted-foreground">{formatVariante(current.variante)}</div>
              )}
            </div>

            <div className="rounded-lg border border-border bg-muted/20 p-4 text-center">
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Esperado</div>
              <div className="text-4xl font-bold tabular-nums">{currentPedido}</div>
            </div>

            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground text-center mb-2">Recibidas</div>
              <div className="flex items-center justify-center gap-3">
                <Button variant="outline" size="icon" className="h-12 w-12 rounded-full text-xl" onClick={() => setCurrentCount(currentRecibido - 1)}>−</Button>
                <Input
                  type="number"
                  min={0}
                  className="w-24 h-14 text-center text-3xl font-bold tabular-nums"
                  value={currentRecibido}
                  onChange={(e) => setCurrentCount(Number(e.target.value) || 0)}
                />
                <Button variant="outline" size="icon" className="h-12 w-12 rounded-full text-xl" onClick={() => setCurrentCount(currentRecibido + 1)}>+</Button>
              </div>
              <div className="flex justify-center mt-3">
                <Badge className={`${diffLabel.cls} border`}>{diffLabel.text}</Badge>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePrintNiimbot(current, currentRecibido || currentPedido || 1, "label")}
                disabled={printingItemId?.startsWith(current.id) || !current.product_id}
                title={!current.product_id ? "Vinculá el ítem a un producto para imprimir" : ""}
              >
                <Tag className="w-4 h-4 mr-1" />
                {printingItemId === current.id + ":label"
                  ? "Generando..."
                  : `Etiqueta Niimbot (${currentRecibido || currentPedido || 1})`}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePrintNiimbot(current, 1, "scan-source")}
                disabled={printingItemId?.startsWith(current.id) || !current.product_id}
                title="PNG con QR grande para que la app Niimbot lo escanee y copie el código"
              >
                <Tag className="w-4 h-4 mr-1" />
                {printingItemId === current.id + ":scan-source"
                  ? "Generando..."
                  : "Fuente escaneable"}
              </Button>
            </div>

            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                onClick={() => setIdx(Math.max(0, idx - 1))}
                disabled={idx === 0}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button className="flex-1" onClick={markVisitedAndNext}>
                {idx === items.length - 1 ? "Ir al resumen" : "Siguiente"}
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>

            {items.length > 1 && (
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer hover:text-foreground">Saltar a otro ítem…</summary>
                <div className="mt-2 grid grid-cols-1 gap-1 max-h-40 overflow-auto">
                  {items.map((it, i) => {
                    const r = counts[it.id] || 0;
                    const p = it.cantidad_pedida || 0;
                    const state = !visited[it.id] ? "•" : r === p ? "✓" : "!";
                    const stateCls = !visited[it.id] ? "text-muted-foreground" : r === p ? "text-green-400" : "text-destructive";
                    return (
                      <button
                        key={it.id}
                        onClick={() => setIdx(i)}
                        className={`text-left flex items-center gap-2 px-2 py-1 rounded hover:bg-muted/50 ${i === idx ? "bg-muted/40" : ""}`}
                      >
                        <span className={`w-4 text-center ${stateCls}`}>{state}</span>
                        <span className="flex-1 truncate">{it.producto_nombre}{formatVariante(it.variante) ? ` · ${formatVariante(it.variante)}` : ""}</span>
                        <span className="tabular-nums">{r}/{p}</span>
                      </button>
                    );
                  })}
                </div>
              </details>
            )}
          </>
        )}
      </CardContent>

      <CameraScanner
        open={scanOpen}
        continuous
        onClose={() => setScanOpen(false)}
        onDetected={handleScannedCode}
        hint={<>Escaneos: <b className="tabular-nums ml-1">{scanCount}</b></>}
      />

      <Dialog open={linkOpen} onOpenChange={(v) => { if (!v) skipLinkAsIncident(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="w-5 h-5" /> Vincular código nuevo
            </DialogTitle>
            <DialogDescription>
              Este código no está registrado. Elegí a qué línea del pedido corresponde para
              guardarlo y contarlo. La próxima vez se reconocerá solo.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-md border border-border bg-muted/40 p-2 text-xs font-mono break-all">
            {pendingCode}
          </div>

          <div className="max-h-72 overflow-auto space-y-1">
            {items.filter((it) => it.product_id).length === 0 && (
              <div className="flex items-start gap-2 text-xs text-amber-500 p-2 border border-amber-500/40 rounded-md bg-amber-500/10">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                Ninguna línea del pedido está vinculada a un producto de tienda. Vinculá primero
                los ítems al catálogo desde el pedido al proveedor.
              </div>
            )}
            {items.filter((it) => it.product_id).map((it) => {
              const active = linkItemId === it.id;
              return (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => setLinkItemId(it.id)}
                  className={`w-full text-left px-3 py-2 rounded border text-sm transition ${
                    active ? "border-primary bg-primary/10" : "border-border hover:bg-muted/40"
                  }`}
                >
                  <div className="font-medium">{it.producto_nombre}</div>
                  {formatVariante(it.variante) && (
                    <div className="text-[11px] text-muted-foreground">{formatVariante(it.variante)}</div>
                  )}
                </button>
              );
            })}
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="ghost" onClick={skipLinkAsIncident} disabled={linking}>
              Descartar
            </Button>
            <Button onClick={confirmLinkBarcode} disabled={!linkItemId || linking}>
              {linking ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Link2 className="w-4 h-4 mr-1" />}
              Vincular y contar +1
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <NiimbotLabelPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        previews={previewLabels}
        title={previewTitle}
        filenameHint={previewHint}
      />
    </Card>
  );
};

export default SupplierOrderCheckStage;
