import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Search, RefreshCw, FileText, Loader2, Database } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { formatPrice } from "@/lib/currency";
import { BillingInvoiceLauncher, InvoiceSource } from "@/components/admin/BillingInvoiceLauncher";
import { BulkInvoiceModal, BulkFacturaRow } from "./BulkInvoiceModal";
import { AgeGroupedList } from "./AgeGroupedList";

/**
 * Lee directamente de `facturacion_cola` — cola de pagos confirmados.
 * Regla: un pago confirmado = un ítem facturable. El estado de la suscripción
 * (activa/vencida/cancelada) es sólo contexto y NO decide visibilidad.
 */
type SourceKind = "suscripcion" | "reservation_payment" | "store_order" | "store_preorder";

const SOURCE_UI: Record<SourceKind, { label: string; color: string; group: "suscripcion" | "evento" | "tienda" }> = {
  suscripcion: {
    label: "Suscripción",
    color: "bg-blue-500/10 text-blue-500 border-blue-500/30",
    group: "suscripcion",
  },
  reservation_payment: {
    label: "Evento / Viaje",
    color: "bg-purple-500/10 text-purple-500 border-purple-500/30",
    group: "evento",
  },
  store_order: {
    label: "Tienda",
    color: "bg-amber-500/10 text-amber-500 border-amber-500/30",
    group: "tienda",
  },
  store_preorder: {
    label: "Preventa",
    color: "bg-amber-500/10 text-amber-500 border-amber-500/30",
    group: "tienda",
  },
};

interface ColaRow {
  id: string;
  source: SourceKind;
  pago_id: string;
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
  periodo_pago: string;
  periodo_operativo: string;
  motivo_arrastre: string | null;
  estado: "pendiente" | "facturada" | "excluida" | "anulada";
  factura_id: string | null;
  factura_estado: string | null;
  factura_cae: string | null;
}

export function PendingPaymentsList({ groupByAge = false }: { groupByAge?: boolean } = {}) {
  const [rows, setRows] = useState<ColaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [rebuilding, setRebuilding] = useState(false);
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"todos" | "suscripcion" | "evento" | "tienda">("todos");
  const [showFacturadas, setShowFacturadas] = useState(false);
  const [montoMin, setMontoMin] = useState<string>("");
  const [montoMax, setMontoMax] = useState<string>("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [emisores, setEmisores] = useState<any[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkRows, setBulkRows] = useState<BulkFacturaRow[]>([]);
  const [preparing, setPreparing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setSelected(new Set());

    const [cola, emisoresRes] = await Promise.all([
      supabase
        .from("facturacion_cola" as any)
        .select("*")
        .neq("estado", "anulada")
        .neq("estado", "excluida")
        .order("pagado_at", { ascending: false })
        .limit(2000),
      supabase
        .from("emisores_fiscales")
        .select("id, nombre_fiscal, cuit, punto_venta, activo, tiene_credenciales, limite_anual_ars")
        .order("created_at", { ascending: true }),
    ]);

    setEmisores((emisoresRes.data as any[]) || []);

    const colaRows = (cola.data as any[]) || [];

    // Cruce con facturas emitidas para mostrar CAE / error
    const facturaIds = Array.from(new Set(colaRows.map((r) => r.factura_id).filter(Boolean)));
    const facMap = new Map<string, { estado: string; cae: string | null }>();
    if (facturaIds.length > 0) {
      const { data: facs } = await supabase
        .from("facturas")
        .select("id, estado, cae")
        .in("id", facturaIds);
      (facs || []).forEach((f: any) => facMap.set(f.id, { estado: f.estado, cae: f.cae }));
    }

    const enriched: ColaRow[] = colaRows.map((r) => {
      const f = r.factura_id ? facMap.get(r.factura_id) : null;
      return {
        ...r,
        monto: Number(r.monto || 0),
        factura_estado: f?.estado || (r.estado === "facturada" ? "emitida" : null),
        factura_cae: f?.cae || null,
      };
    });

    setRows(enriched);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRebuild = async () => {
    setRebuilding(true);
    try {
      const { data, error } = await supabase.rpc("rebuild_facturacion_cola" as any, {});
      if (error) throw error;
      const res: any = data;
      toast({
        title: "Cola actualizada",
        description: `Se agregaron ${res?.inserted ?? 0} nuevos pagos confirmados.`,
      });
      await load();
    } catch (e: any) {
      toast({ title: "Error al refrescar la cola", description: e.message, variant: "destructive" });
    } finally {
      setRebuilding(false);
    }
  };

  const filtered = useMemo(() => {
    const min = montoMin.trim() === "" ? null : Number(montoMin);
    const max = montoMax.trim() === "" ? null : Number(montoMax);
    return rows.filter((r) => {
      const facturada = r.estado === "facturada" || (r.factura_estado === "emitida" && !!r.factura_cae);
      if (!showFacturadas && facturada) return false;
      if (sourceFilter !== "todos" && SOURCE_UI[r.source].group !== sourceFilter) return false;
      if (min !== null && !isNaN(min) && r.monto < min) return false;
      if (max !== null && !isNaN(max) && r.monto > max) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !r.cliente_nombre.toLowerCase().includes(q) &&
          !r.concepto.toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [rows, sourceFilter, search, showFacturadas, montoMin, montoMax]);

  const selectableFiltered = useMemo(
    () => filtered.filter((r) => !(r.estado === "facturada" || (r.factura_estado === "emitida" && !!r.factura_cae))),
    [filtered],
  );

  const counts = useMemo(() => {
    const base = showFacturadas
      ? rows
      : rows.filter((r) => !(r.estado === "facturada" || (r.factura_estado === "emitida" && !!r.factura_cae)));
    return {
      total: rows.length,
      sin_facturar: rows.filter((r) => r.estado !== "facturada").length,
      suscripcion: base.filter((r) => SOURCE_UI[r.source].group === "suscripcion").length,
      evento: base.filter((r) => SOURCE_UI[r.source].group === "evento").length,
      tienda: base.filter((r) => SOURCE_UI[r.source].group === "tienda").length,
    };
  }, [rows, showFacturadas]);

  const allSelected = selectableFiltered.length > 0 && selectableFiltered.every((r) => selected.has(r.id));
  const someSelected = selected.size > 0 && !allSelected;

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(selectableFiltered.map((r) => r.id)));
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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
  });

  const handleBulkInvoice = async () => {
    const targets = rows.filter((r) => selected.has(r.id));
    if (targets.length === 0) return;
    setPreparing(true);
    try {
      const prepared: BulkFacturaRow[] = [];
      let createdCount = 0;
      let alreadyEmittedCount = 0;

      for (const r of targets) {
        if (r.estado === "facturada" || (r.factura_estado === "emitida" && r.factura_cae)) {
          alreadyEmittedCount++;
          continue;
        }

        let facturaId = r.factura_id;
        let condicionFiscal = "consumidor_final";

        if (!facturaId) {
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
            },
          });
          if (error || (data as any)?.error) {
            console.warn("auto-facturar falló para", r.id, error || (data as any)?.error);
            continue;
          }
          if ((data as any)?.emitted) {
            alreadyEmittedCount++;
            continue;
          }
          const { data: nueva } = await supabase
            .from("facturas")
            .select("id, condicion_fiscal")
            .eq("referencia_tipo", src.referencia_tipo)
            .eq("referencia_id", src.referencia_id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          facturaId = (nueva as any)?.id || null;
          condicionFiscal = (nueva as any)?.condicion_fiscal || condicionFiscal;
          if (facturaId) createdCount++;
        }

        if (!facturaId) continue;

        prepared.push({
          id: facturaId,
          cliente_nombre: r.cliente_nombre,
          cliente_cuit: r.cliente_cuit,
          condicion_fiscal: condicionFiscal,
          concepto: r.concepto,
          monto: r.monto,
          referencia_tipo: r.referencia_tipo,
          kind: "sin_factura",
        });
      }

      if (prepared.length === 0) {
        toast({
          title: "Nada para facturar",
          description: alreadyEmittedCount > 0
            ? `${alreadyEmittedCount} ya tenían CAE emitido.`
            : "No se pudieron preparar las facturas.",
        });
        return;
      }

      if (createdCount > 0) {
        toast({
          title: `${createdCount} factura(s) preparadas`,
          description: "Elegí el emisor y emitilas en AFIP.",
        });
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
          <Input
            placeholder="Buscar cliente, servicio o producto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={sourceFilter} onValueChange={(v: any) => setSourceFilter(v)}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los orígenes</SelectItem>
            <SelectItem value="suscripcion">Suscripciones ({counts.suscripcion})</SelectItem>
            <SelectItem value="evento">Eventos / Viajes ({counts.evento})</SelectItem>
            <SelectItem value="tienda">Tienda ({counts.tienda})</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1">
          <Input type="number" inputMode="decimal" placeholder="Monto mín." value={montoMin} onChange={(e) => setMontoMin(e.target.value)} className="w-28" />
          <span className="text-muted-foreground text-xs">—</span>
          <Input type="number" inputMode="decimal" placeholder="Monto máx." value={montoMax} onChange={(e) => setMontoMax(e.target.value)} className="w-28" />
          {(montoMin || montoMax) && (
            <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => { setMontoMin(""); setMontoMax(""); }}>
              Limpiar
            </Button>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowFacturadas((v) => !v)}>
          {showFacturadas ? "Ocultar ya facturadas" : "Ver también facturadas"}
        </Button>
        <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} />
          Actualizar
        </Button>
        <Button variant="secondary" size="sm" onClick={handleRebuild} disabled={rebuilding}>
          {rebuilding ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Database className="w-4 h-4 mr-1" />}
          Refrescar cola
        </Button>
      </div>

      {selectableFiltered.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox
              checked={allSelected ? true : someSelected ? "indeterminate" : false}
              onCheckedChange={toggleAll}
            />
            <span className="text-muted-foreground">
              {selected.size > 0
                ? `${selected.size} seleccionado(s) de ${selectableFiltered.length}`
                : `Seleccionar todos (${selectableFiltered.length})`}
            </span>
          </label>
          <Button size="sm" onClick={handleBulkInvoice} disabled={selected.size === 0 || preparing}>
            {preparing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FileText className="w-4 h-4 mr-1" />}
            Facturar seleccionados {selected.size > 0 && `(${selected.size})`}
          </Button>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Cola de pagos confirmados. {counts.sin_facturar} sin factura emitida.{" "}
        <span className="italic">
          Un pago confirmado = un ítem facturable. Incluye efectivo, transferencias y MP.
          Pagos pendientes de verificación no entran. Si falta algún pago reciente, tocá "Refrescar cola".
        </span>
      </p>

      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-8">Cargando pagos...</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          No hay pagos {showFacturadas ? "" : "sin facturar "}para mostrar.
        </p>
      ) : (() => {
        const renderRow = (r: ColaRow) => {
          const facturada = r.estado === "facturada" || (r.factura_estado === "emitida" && !!r.factura_cae);
          const fecha = new Date(r.pagado_at).toLocaleDateString("es-AR", {
            day: "numeric", month: "short", year: "numeric",
            timeZone: "America/Argentina/Buenos_Aires",
          });
          const isSelected = selected.has(r.id);
          const ui = SOURCE_UI[r.source];

          return (
            <div key={r.id} className="rounded-xl border border-border bg-card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
              {!facturada && (
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => toggleOne(r.id)}
                  className="mt-1 sm:mt-0 shrink-0"
                />
              )}
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-foreground">{r.cliente_nombre}</p>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${ui.color}`}>{ui.label}</span>
                  {facturada ? (
                    <Badge variant="default" className="text-[10px]" title={r.factura_cae ? `CAE ${r.factura_cae}` : undefined}>
                      Facturada AFIP
                    </Badge>
                  ) : r.factura_estado === "error" ? (
                    <Badge variant="destructive" className="text-[10px]">Error AFIP</Badge>
                  ) : r.factura_estado ? (
                    <Badge variant="outline" className="text-[10px]">Pendiente</Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px]">Sin factura</Badge>
                  )}
                  {r.metodo_pago && (
                    <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                      {r.metodo_pago}
                    </span>
                  )}
                  {r.motivo_arrastre && (
                    <span className="text-[10px] text-yellow-600 bg-yellow-500/10 border border-yellow-500/30 px-1.5 py-0.5 rounded" title={r.motivo_arrastre}>
                      Arrastre
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{r.concepto}</p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                  <span>{fecha}</span>
                  <span className="font-semibold text-foreground">{formatPrice(r.monto, r.moneda as any)}</span>
                  {r.cliente_cuit && <span>DNI/CUIT {r.cliente_cuit}</span>}
                </div>
              </div>
              <div className="shrink-0">
                <BillingInvoiceLauncher
                  source={toInvoiceSource(r)}
                  variant="default"
                  onEmitted={load}
                />
              </div>
            </div>
          );
        };

        if (groupByAge) {
          return (
            <div className="pb-20">
              <AgeGroupedList
                items={filtered}
                getDate={(r) => r.pagado_at}
                renderItem={renderRow}
              />
            </div>
          );
        }
        return <div className="space-y-2 pb-20">{filtered.map(renderRow)}</div>;
      })()}


      <BulkInvoiceModal
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        rows={bulkRows}
        emisores={emisores}
        onDone={load}
      />
    </div>
  );
}
