import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, Loader2, Truck, ChevronLeft, ChevronRight, Package, ListChecks, ArrowLeft, ScanLine, Keyboard, Link2, AlertTriangle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import CameraScanner from "@/components/deposito/CameraScanner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

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

  // Sort by producto → variante for grouped counting
  const sortItems = (list: any[]) =>
    [...list].sort((a, b) => {
      const p = String(a.producto_nombre || "").localeCompare(String(b.producto_nombre || ""), "es");
      if (p !== 0) return p;
      return formatVariante(a.variante).localeCompare(formatVariante(b.variante), "es");
    });

  useEffect(() => {
    if (!selectedId) { setItems([]); setCounts({}); return; }
    setLoading(true);
    sb.from("supplier_order_items").select("*").eq("supplier_order_id", selectedId).then(({ data }: any) => {
      const list = sortItems(data || []);
      setItems(list);
      // Try restore autosave
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
    });
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
    </Card>
  );
};

export default SupplierOrderCheckStage;
