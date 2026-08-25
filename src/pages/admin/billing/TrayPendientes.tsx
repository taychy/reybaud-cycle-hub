import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, RefreshCw, FileText, Loader2, Database } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { formatPrice } from "@/lib/currency";
import { BillingInvoiceLauncher, InvoiceSource } from "@/components/admin/BillingInvoiceLauncher";
import { BulkInvoiceModal, BulkFacturaRow } from "./BulkInvoiceModal";
import { isFacturaEmitida } from "@/lib/billingInvoiceLink";

const PAGE_SIZE = 50;

type SourceKind = "suscripcion" | "reservation_payment" | "store_order" | "store_preorder";

const SOURCE_UI: Record<string, { label: string; color: string; group: "escuela" | "viajes" | "tienda" }> = {
  suscripcion: { label: "Escuela", color: "bg-blue-500/10 text-blue-500 border-blue-500/30", group: "escuela" },
  reservation_payment: { label: "Viajes", color: "bg-purple-500/10 text-purple-500 border-purple-500/30", group: "viajes" },
  store_order: { label: "Tienda", color: "bg-amber-500/10 text-amber-500 border-amber-500/30", group: "tienda" },
  store_preorder: { label: "Preventa", color: "bg-amber-500/10 text-amber-500 border-amber-500/30", group: "tienda" },
};

const GROUP_SOURCES: Record<string, SourceKind[]> = {
  escuela: ["suscripcion"],
  viajes: ["reservation_payment"],
  tienda: ["store_order", "store_preorder"],
};

const COLS =
  "id, source, referencia_tipo, referencia_id, alumno_id, cliente_nombre, cliente_cuit, concepto, monto, moneda, segmento, metodo_pago, origen_registro, pagado_at, estado, factura_id";

interface ColaRow {
  id: string;
  source: string;
  referencia_tipo: string;
  referencia_id: string;
  alumno_id: string | null;
  cliente_nombre: string;
  cliente_cuit: string | null;
  concepto: string;
  monto: number;
  moneda: string;
  segmento: string | null;
  metodo_pago: string | null;
  origen_registro: string | null;
  pagado_at: string;
  estado: string;
  factura_id: string | null;
  factura_estado?: string | null;
  factura_cae?: string | null;
}

export function TrayPendientes({ onChanged }: { onChanged?: () => void }) {
  const [rows, setRows] = useState<ColaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [origen, setOrigen] = useState<"todos" | "escuela" | "viajes" | "tienda">("todos");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [emisores, setEmisores] = useState<any[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkRows, setBulkRows] = useState<BulkFacturaRow[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const fetchPage = useCallback(
    async (from: number): Promise<ColaRow[]> => {
      let q = supabase
        .from("facturacion_cola" as any)
        .select(COLS)
        .eq("estado", "pendiente")
        .order("pagado_at", { ascending: false })
        .range(from, from + PAGE_SIZE - 1);

      if (origen !== "todos") q = q.in("source", GROUP_SOURCES[origen]);
      if (debounced) q = q.or(`cliente_nombre.ilike.%${debounced}%,concepto.ilike.%${debounced}%`);

      const { data, error } = await q;
      if (error) throw error;
      const base = ((data as any[]) || []).map((r) => ({ ...r, monto: Number(r.monto || 0) })) as ColaRow[];

      // Estado de facturas en UNA sola consulta (evita N+1 en el listado)
      const ids = Array.from(new Set(base.map((r) => r.factura_id).filter(Boolean))) as string[];
      if (ids.length > 0) {
        const { data: facs } = await supabase.from("facturas").select("id, estado, cae").in("id", ids);
        const map = new Map((facs || []).map((f: any) => [f.id, f]));
        base.forEach((r) => {
          const f = r.factura_id ? map.get(r.factura_id) : null;
          r.factura_estado = f?.estado ?? null;
          r.factura_cae = f?.cae ?? null;
        });
      }
      return base;
    },
    [origen, debounced],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setSelected(new Set());
    try {
      const [page, emisoresRes] = await Promise.all([
        fetchPage(0),
        supabase
          .from("emisores_fiscales")
          .select("id, nombre_fiscal, cuit, punto_venta, activo, tiene_credenciales, limite_anual_ars")
          .eq("activo", true),
      ]);
      setEmisores((emisoresRes.data as any[]) || []);
      setRows(page);
      setHasMore(page.length === PAGE_SIZE);
    } catch (e: any) {
      toast({ title: "Error al cargar pendientes", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [fetchPage]);

  useEffect(() => { load(); }, [load]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const page = await fetchPage(rows.length);
      setRows((prev) => [...prev, ...page]);
      setHasMore(page.length === PAGE_SIZE);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleRebuild = async () => {
    setRebuilding(true);
    try {
      const { data, error } = await supabase.rpc("rebuild_facturacion_cola" as any, {});
      if (error) throw error;
      toast({ title: "Cola actualizada", description: `Se agregaron ${(data as any)?.inserted ?? 0} pagos nuevos.` });
      await load();
      onChanged?.();
    } catch (e: any) {
      toast({ title: "Error al refrescar la cola", description: e.message, variant: "destructive" });
    } finally {
      setRebuilding(false);
    }
  };

  const selectable = useMemo(() => rows.filter((r) => !isFacturaEmitida(r.factura_estado ? { estado: r.factura_estado, cae: r.factura_cae } : null)), [rows]);
  const allSelected = selectable.length > 0 && selectable.every((r) => selected.has(r.id));

  const toInvoiceSource = (r: ColaRow): InvoiceSource => ({
    alumno_id: r.alumno_id!,
    cliente_nombre: r.cliente_nombre,
    cliente_cuit: r.cliente_cuit,
    concepto: r.concepto,
    monto: r.monto,
    moneda: r.moneda,
    referencia_tipo: r.referencia_tipo as InvoiceSource["referencia_tipo"],
    referencia_id: r.referencia_id,
    segmento: (r.segmento as any) || "escuela",
    metodo_pago: r.metodo_pago ?? undefined,
    origen_registro: r.origen_registro ?? undefined,
    facturacion_cola_id: r.id,
  });

  const handleBulk = async () => {
    const targets = rows.filter((r) => selected.has(r.id));
    if (targets.length === 0) return;
    setPreparing(true);
    try {
      const prepared: BulkFacturaRow[] = [];
      let alreadyEmitted = 0;

      for (const r of targets) {
        if (isFacturaEmitida({ estado: r.factura_estado, cae: r.factura_cae })) { alreadyEmitted++; continue; }

        const src = toInvoiceSource(r);
        const { data, error } = await supabase.functions.invoke("auto-facturar", {
          body: {
            alumno_id: src.alumno_id,
            concepto: src.concepto,
            monto: src.monto,
            moneda: src.moneda ?? "ARS",
            referencia_tipo: src.referencia_tipo,
            referencia_id: src.referencia_id,
            segmento: src.segmento,
            metodo_pago: src.metodo_pago ?? undefined,
            origen_registro: src.origen_registro ?? undefined,
            facturacion_cola_id: r.id,
          },
        });
        if (error || (data as any)?.error) {
          console.warn("auto-facturar falló para", r.id, error || (data as any)?.error);
          continue;
        }
        if ((data as any)?.emitted) { alreadyEmitted++; continue; }

        // Recuperar SIEMPRE por el vínculo exacto con la fila de cola
        const { data: fac } = await supabase
          .from("facturas")
          .select("id, condicion_fiscal")
          .eq("facturacion_cola_id", r.id)
          .maybeSingle();
        if (!fac?.id) continue;

        prepared.push({
          id: fac.id,
          cliente_nombre: r.cliente_nombre,
          cliente_cuit: r.cliente_cuit,
          condicion_fiscal: (fac as any).condicion_fiscal || "consumidor_final",
          concepto: r.concepto,
          monto: r.monto,
          referencia_tipo: r.referencia_tipo,
          kind: "sin_factura",
        });
      }

      if (prepared.length === 0) {
        toast({
          title: "Nada para facturar",
          description: alreadyEmitted > 0 ? `${alreadyEmitted} ya estaban facturadas.` : "No se pudieron preparar las facturas.",
        });
        return;
      }
      setBulkRows(prepared);
      setBulkOpen(true);
    } finally {
      setPreparing(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar cliente o concepto..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={origen} onValueChange={(v: any) => setOrigen(v)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="escuela">Escuela</SelectItem>
            <SelectItem value="viajes">Viajes</SelectItem>
            <SelectItem value="tienda">Tienda</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Actualizar
        </Button>
        <Button variant="secondary" size="sm" onClick={handleRebuild} disabled={rebuilding}>
          {rebuilding ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Database className="w-4 h-4 mr-1" />}
          Buscar cobros nuevos
        </Button>
      </div>

      {selectable.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox
              checked={allSelected ? true : selected.size > 0 ? "indeterminate" : false}
              onCheckedChange={() => setSelected(allSelected ? new Set() : new Set(selectable.map((r) => r.id)))}
            />
            <span className="text-muted-foreground">
              {selected.size > 0 ? `${selected.size} seleccionado(s)` : `Seleccionar todos (${selectable.length})`}
            </span>
          </label>
          <Button size="sm" onClick={handleBulk} disabled={selected.size === 0 || preparing}>
            {preparing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FileText className="w-4 h-4 mr-1" />}
            Facturar seleccionados {selected.size > 0 && `(${selected.size})`}
          </Button>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-8">Cargando cobros...</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No hay cobros pendientes de facturar.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const ui = SOURCE_UI[r.source] || { label: r.source, color: "bg-muted text-muted-foreground border-border", group: "escuela" as const };
            const fecha = new Date(r.pagado_at).toLocaleDateString("es-AR", {
              day: "numeric", month: "short", year: "numeric", timeZone: "America/Argentina/Buenos_Aires",
            });
            const emitida = isFacturaEmitida({ estado: r.factura_estado, cae: r.factura_cae });
            return (
              <div key={r.id} className="rounded-xl border border-border bg-card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                {!emitida && (
                  <Checkbox
                    checked={selected.has(r.id)}
                    onCheckedChange={() =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        next.has(r.id) ? next.delete(r.id) : next.add(r.id);
                        return next;
                      })
                    }
                    className="shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-foreground">{r.cliente_nombre}</p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${ui.color}`}>{ui.label}</span>
                    {emitida && <Badge variant="default" className="text-[10px]">Facturada</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{r.concepto}</p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                    <span>{fecha}</span>
                    {r.metodo_pago && <span className="bg-muted px-1.5 py-0.5 rounded">{r.metodo_pago}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <p className="text-sm font-bold tabular-nums">{formatPrice(r.monto, r.moneda as any)}</p>
                  {r.alumno_id ? (
                    <BillingInvoiceLauncher
                      source={toInvoiceSource(r)}
                      variant="default"
                      existingFactura={r.factura_id ? { id: r.factura_id, estado: r.factura_estado ?? null, cae: r.factura_cae ?? null } : null}
                      onEmitted={() => { load(); onChanged?.(); }}
                    />
                  ) : (
                    <span className="text-xs text-muted-foreground">Sin ficha de cliente</span>
                  )}
                </div>
              </div>
            );
          })}

          {hasMore && (
            <div className="pt-2 text-center">
              <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null} Cargar más
              </Button>
            </div>
          )}
        </div>
      )}

      <BulkInvoiceModal
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        rows={bulkRows}
        emisores={emisores}
        onDone={() => { load(); onChanged?.(); }}
      />
    </div>
  );
}
