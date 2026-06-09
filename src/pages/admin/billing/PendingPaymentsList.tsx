import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Search, RefreshCw, FileText, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { formatPrice } from "@/lib/currency";
import { BillingInvoiceLauncher, InvoiceSource } from "@/components/admin/BillingInvoiceLauncher";
import { BulkInvoiceModal, BulkFacturaRow } from "./BulkInvoiceModal";

/**
 * Sólo mostramos pagos confirmados desde esta fecha en adelante.
 * Pagos previos no entran al listado (por pedido del usuario).
 */
const CUTOFF_DATE = "2026-05-28";

type Source = "suscripcion" | "evento" | "tienda";

interface PendingPayment {
  key: string;
  source: Source;
  alumno_id: string;
  cliente_nombre: string;
  cliente_cuit: string | null;
  concepto: string;
  monto: number;
  moneda: string;
  fecha: string; // ISO
  metodo_pago: string | null;
  origen_registro: string | null;
  invoiceSource: InvoiceSource;
  factura_estado: string | null;
  factura_cae: string | null;
  factura_id: string | null;
}

const SOURCE_LABEL: Record<Source, string> = {
  suscripcion: "Suscripción",
  evento: "Evento / Viaje",
  tienda: "Tienda",
};

const SOURCE_COLOR: Record<Source, string> = {
  suscripcion: "bg-blue-500/10 text-blue-500 border-blue-500/30",
  evento: "bg-purple-500/10 text-purple-500 border-purple-500/30",
  tienda: "bg-amber-500/10 text-amber-500 border-amber-500/30",
};

/** Métodos de pago que NO se facturan (sólo comprobante interno por mail). */
function isEfectivo(metodo: string | null | undefined): boolean {
  if (!metodo) return false;
  const m = metodo.toLowerCase().trim();
  return m === "efectivo" || m === "cash" || m.includes("efectivo");
}

/** Pagos no confirmados: sin método o marcados como pendientes de verificación. */
function isPagoPendiente(metodo: string | null | undefined): boolean {
  if (!metodo) return true;
  const m = metodo.toLowerCase().trim();
  return (
    m === "pendiente" ||
    m === "pendiente_verificacion" ||
    m.includes("pendiente") ||
    m.includes("verificac")
  );
}

export function PendingPaymentsList() {
  const [rows, setRows] = useState<PendingPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"todos" | Source>("todos");
  const [showFacturadas, setShowFacturadas] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [emisores, setEmisores] = useState<any[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkRows, setBulkRows] = useState<BulkFacturaRow[]>([]);
  const [preparing, setPreparing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setSelected(new Set());

    // 1) Suscripciones confirmadas (activa) desde cutoff
    const subsPromise = supabase
      .from("suscripciones")
      .select(`
        id, alumno_id, plan_id, estado, fecha_inicio, updated_at, metodo_pago, origen_registro,
        precio_final, precio_base,
        alumnos:alumno_id (id, nombre, apellido, documento),
        planes:plan_id (id, nombre, precio, moneda)
      `)
      .eq("estado", "activa")
      .gte("updated_at", CUTOFF_DATE)
      .order("updated_at", { ascending: false })
      .limit(500);

    // 2) Reservas de eventos con pago al menos parcial confirmado desde cutoff
    const reservasPromise = supabase
      .from("event_reservations")
      .select(`
        id, event_id, alumno_id, payment_status, amount_paid, amount_total, moneda, currency_snapshot, updated_at, metodo_pago,
        alumnos:alumno_id (id, nombre, apellido, documento),
        events:event_id (id, name, title)
      `)
      .in("payment_status", ["pago_validado", "parcial"])
      .gt("amount_paid", 0)
      .gte("updated_at", CUTOFF_DATE)
      .order("updated_at", { ascending: false })
      .limit(500);

    // 3) Preventas con seña confirmada desde cutoff
    const preordersPromise = supabase
      .from("store_preorders")
      .select(`
        id, alumno_id, product_id, producto_nombre, precio_total, sena_monto, moneda,
        estado, estado_pago_sena, forma_pago_sena, updated_at, entregada_at
      `)
      .eq("estado_pago_sena", "confirmada")
      .not("estado", "in", "(cancelada,vencida)")
      .gte("updated_at", CUTOFF_DATE)
      .order("updated_at", { ascending: false })
      .limit(500);

    // 4) Pedidos de tienda pagados desde cutoff
    const ordersPromise = supabase
      .from("store_orders")
      .select(`
        id, order_number, alumno_id, customer_name, total, currency, status,
        metodo_pago, origen_registro, pagado_at, updated_at,
        alumnos:alumno_id (id, nombre, apellido, documento),
        store_order_items (product_name, quantity)
      `)
      .eq("status", "pagado")
      .gte("updated_at", CUTOFF_DATE)
      .order("updated_at", { ascending: false })
      .limit(500);

    // Emisores (para el modal bulk)
    const emisoresPromise = supabase
      .from("emisores_fiscales")
      .select("*")
      .order("created_at", { ascending: true });

    const [subs, reservas, preorders, orders, emisoresRes] = await Promise.all([
      subsPromise, reservasPromise, preordersPromise, ordersPromise, emisoresPromise,
    ]);

    setEmisores((emisoresRes.data as any[]) || []);

    // Fetch alumnos para preorders (sin FK declarada → no podemos embeber)
    const preorderAlumnoIds = Array.from(
      new Set((preorders.data || []).map((p: any) => p.alumno_id).filter(Boolean))
    );
    const alumnosMap = new Map<string, any>();
    if (preorderAlumnoIds.length > 0) {
      const { data: alumnosData } = await supabase
        .from("alumnos")
        .select("id, nombre, apellido, documento")
        .in("id", preorderAlumnoIds);
      (alumnosData || []).forEach((a: any) => alumnosMap.set(a.id, a));
    }

    const subRows: PendingPayment[] = (subs.data || []).map((s: any) => {
      const alumno = s.alumnos;
      const nombre = `${alumno?.nombre || ""} ${alumno?.apellido || ""}`.trim() || "—";
      const monto = Number(s.precio_final ?? s.precio_base ?? s.planes?.precio ?? 0);
      return {
        key: `sub:${s.id}`,
        source: "suscripcion",
        alumno_id: s.alumno_id,
        cliente_nombre: nombre,
        cliente_cuit: alumno?.documento || null,
        concepto: `Suscripción ${s.planes?.nombre || ""}`.trim(),
        monto,
        moneda: s.planes?.moneda || "ARS",
        fecha: s.fecha_inicio || s.updated_at,
        metodo_pago: s.metodo_pago || null,
        origen_registro: s.origen_registro || null,
        invoiceSource: {
          alumno_id: s.alumno_id,
          cliente_nombre: nombre,
          cliente_cuit: alumno?.documento || null,
          concepto: `Suscripción ${s.planes?.nombre || ""}`.trim(),
          monto,
          moneda: s.planes?.moneda || "ARS",
          referencia_tipo: "suscripcion",
          referencia_id: s.id,
          segmento: "escuela",
          metodo_pago: s.metodo_pago || null,
          origen_registro: s.origen_registro || null,
        },
        factura_estado: null,
        factura_cae: null,
        factura_id: null,
      };
    });

    const evRows: PendingPayment[] = (reservas.data || []).map((r: any) => {
      const alumno = r.alumnos;
      const nombre = `${alumno?.nombre || ""} ${alumno?.apellido || ""}`.trim() || "—";
      const eventoName = r.events?.name || r.events?.title || "Evento";
      const monto = Number(r.amount_paid || 0);
      return {
        key: `ev:${r.id}`,
        source: "evento",
        alumno_id: r.alumno_id,
        cliente_nombre: nombre,
        cliente_cuit: alumno?.documento || null,
        concepto: `Reserva ${eventoName}`,
        monto,
        moneda: r.currency_snapshot || r.moneda || "ARS",
        fecha: r.updated_at,
        metodo_pago: r.metodo_pago || null,
        origen_registro: null,
        invoiceSource: {
          alumno_id: r.alumno_id,
          cliente_nombre: nombre,
          cliente_cuit: alumno?.documento || null,
          concepto: `Reserva ${eventoName}`,
          monto,
          moneda: r.currency_snapshot || r.moneda || "ARS",
          referencia_tipo: "evento",
          referencia_id: r.id,
          segmento: "viajes",
          metodo_pago: r.metodo_pago || null,
        },
        factura_estado: null,
        factura_cae: null,
        factura_id: null,
      };
    });

    const tiendaRows: PendingPayment[] = (preorders.data || []).map((p: any) => {
      const alumno = alumnosMap.get(p.alumno_id);
      const nombre = `${alumno?.nombre || ""} ${alumno?.apellido || ""}`.trim() || "—";
      const monto = p.estado === "entregada" ? Number(p.precio_total) : Number(p.sena_monto);
      const conceptoBase = `${p.producto_nombre}${p.estado === "entregada" ? "" : " (seña)"}`;
      return {
        key: `tie:${p.id}`,
        source: "tienda",
        alumno_id: p.alumno_id,
        cliente_nombre: nombre,
        cliente_cuit: alumno?.documento || null,
        concepto: conceptoBase,
        monto,
        moneda: p.moneda || "ARS",
        fecha: p.entregada_at || p.updated_at,
        metodo_pago: p.forma_pago_sena || null,
        origen_registro: null,
        invoiceSource: {
          alumno_id: p.alumno_id,
          cliente_nombre: nombre,
          cliente_cuit: alumno?.documento || null,
          concepto: conceptoBase,
          monto,
          moneda: p.moneda || "ARS",
          referencia_tipo: "pedido",
          referencia_id: p.id,
          segmento: "tienda",
          metodo_pago: p.forma_pago_sena || null,
        },
        factura_estado: null,
        factura_cae: null,
        factura_id: null,
      };
    });

    const orderRows: PendingPayment[] = (orders.data || []).map((o: any) => {
      const alumno = o.alumnos;
      const nombre = alumno
        ? `${alumno.nombre || ""} ${alumno.apellido || ""}`.trim() || o.customer_name || "—"
        : (o.customer_name || "—");
      const items = (o.store_order_items || []) as Array<{ product_name: string; quantity: number }>;
      const resumen = items.length === 0
        ? `Pedido #${o.order_number}`
        : items.length === 1
          ? `${items[0].product_name}${items[0].quantity > 1 ? ` x${items[0].quantity}` : ""}`
          : `Pedido #${o.order_number} (${items.length} ítems)`;
      const concepto = `Pedido tienda #${o.order_number} — ${resumen}`;
      return {
        key: `ord:${o.id}`,
        source: "tienda",
        alumno_id: o.alumno_id,
        cliente_nombre: nombre,
        cliente_cuit: alumno?.documento || null,
        concepto,
        monto: Number(o.total || 0),
        moneda: o.currency || "ARS",
        fecha: o.pagado_at || o.updated_at,
        metodo_pago: o.metodo_pago || null,
        origen_registro: o.origen_registro || null,
        invoiceSource: {
          alumno_id: o.alumno_id,
          cliente_nombre: nombre,
          cliente_cuit: alumno?.documento || null,
          concepto,
          monto: Number(o.total || 0),
          moneda: o.currency || "ARS",
          referencia_tipo: "pedido_tienda",
          referencia_id: o.id,
          segmento: "tienda",
          metodo_pago: o.metodo_pago || null,
          origen_registro: o.origen_registro || null,
        },
        factura_estado: null,
        factura_cae: null,
        factura_id: null,
      };
    });

    // ⚠️ Excluir efectivo (no se factura en AFIP) y pagos pendientes de verificación.
    const allRows = [...subRows, ...evRows, ...tiendaRows, ...orderRows].filter(
      (r) => !isEfectivo(r.metodo_pago) && !isPagoPendiente(r.metodo_pago) && r.monto > 0,
    );

    // 4) Cruce con facturas existentes
    const refsByType: Record<string, string[]> = {};
    allRows.forEach((r) => {
      const t = r.invoiceSource.referencia_tipo;
      if (!refsByType[t]) refsByType[t] = [];
      refsByType[t].push(r.invoiceSource.referencia_id);
    });

    const facturasMap = new Map<string, { id: string; estado: string; cae: string | null }>();
    for (const [tipo, ids] of Object.entries(refsByType)) {
      if (ids.length === 0) continue;
      const { data } = await supabase
        .from("facturas")
        .select("id, referencia_tipo, referencia_id, estado, cae")
        .eq("referencia_tipo", tipo)
        .in("referencia_id", ids);
      (data || []).forEach((f: any) => {
        facturasMap.set(`${f.referencia_tipo}:${f.referencia_id}`, {
          id: f.id, estado: f.estado, cae: f.cae,
        });
      });
    }

    const enriched = allRows.map((r) => {
      const f = facturasMap.get(`${r.invoiceSource.referencia_tipo}:${r.invoiceSource.referencia_id}`);
      return {
        ...r,
        factura_estado: f?.estado || null,
        factura_cae: f?.cae || null,
        factura_id: f?.id || null,
      };
    });

    enriched.sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
    setRows(enriched);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const facturada = r.factura_estado === "emitida" && !!r.factura_cae;
      if (!showFacturadas && facturada) return false;
      if (sourceFilter !== "todos" && r.source !== sourceFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !r.cliente_nombre.toLowerCase().includes(q) &&
          !r.concepto.toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [rows, sourceFilter, search, showFacturadas]);

  const selectableFiltered = useMemo(
    () => filtered.filter((r) => !(r.factura_estado === "emitida" && !!r.factura_cae)),
    [filtered],
  );

  const counts = useMemo(() => ({
    total: rows.length,
    sin_facturar: rows.filter((r) => !(r.factura_estado === "emitida" && !!r.factura_cae)).length,
    suscripcion: rows.filter((r) => r.source === "suscripcion").length,
    evento: rows.filter((r) => r.source === "evento").length,
    tienda: rows.filter((r) => r.source === "tienda").length,
  }), [rows]);

  const allSelected = selectableFiltered.length > 0 && selectableFiltered.every((r) => selected.has(r.key));
  const someSelected = selected.size > 0 && !allSelected;

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(selectableFiltered.map((r) => r.key)));
  };

  const toggleOne = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  /** Prepara facturas (crea registros si no existen) y abre BulkInvoiceModal. */
  const handleBulkInvoice = async () => {
    const targets = rows.filter((r) => selected.has(r.key));
    if (targets.length === 0) return;
    setPreparing(true);
    try {
      const prepared: BulkFacturaRow[] = [];
      let createdCount = 0;
      let alreadyEmittedCount = 0;

      for (const r of targets) {
        // Ya facturada con CAE → omitir
        if (r.factura_estado === "emitida" && r.factura_cae) {
          alreadyEmittedCount++;
          continue;
        }

        let facturaId = r.factura_id;
        let condicionFiscal = "consumidor_final";

        if (!facturaId) {
          // Crear registro vía auto-facturar (puede o no emitir según config)
          const { data, error } = await supabase.functions.invoke("auto-facturar", {
            body: {
              alumno_id: r.invoiceSource.alumno_id,
              concepto: r.invoiceSource.concepto,
              monto: r.invoiceSource.monto,
              moneda: r.invoiceSource.moneda ?? "ARS",
              referencia_tipo: r.invoiceSource.referencia_tipo,
              referencia_id: r.invoiceSource.referencia_id,
              segmento: r.invoiceSource.segmento,
              metodo_pago: r.invoiceSource.metodo_pago ?? undefined,
              origen_registro: r.invoiceSource.origen_registro ?? undefined,
            },
          });
          if (error || data?.error) {
            console.warn("auto-facturar falló para", r.key, error || data?.error);
            continue;
          }
          if (data?.emitted) {
            alreadyEmittedCount++;
            continue;
          }
          // Releer factura recién creada
          const { data: nueva } = await supabase
            .from("facturas")
            .select("id, condicion_fiscal")
            .eq("referencia_tipo", r.invoiceSource.referencia_tipo)
            .eq("referencia_id", r.invoiceSource.referencia_id)
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
          concepto: r.invoiceSource.concepto,
          monto: r.invoiceSource.monto,
          referencia_tipo: r.invoiceSource.referencia_tipo,
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
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar cliente o concepto..."
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
        <Button variant="outline" size="sm" onClick={() => setShowFacturadas((v) => !v)}>
          {showFacturadas ? "Ocultar ya facturadas" : "Ver también facturadas"}
        </Button>
        <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} />
          Actualizar
        </Button>
      </div>

      {/* Barra de acción masiva */}
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
          <Button
            size="sm"
            onClick={handleBulkInvoice}
            disabled={selected.size === 0 || preparing}
          >
            {preparing ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <FileText className="w-4 h-4 mr-1" />
            )}
            Facturar seleccionados {selected.size > 0 && `(${selected.size})`}
          </Button>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Mostrando pagos confirmados desde el {new Date(CUTOFF_DATE).toLocaleDateString("es-AR")}.
        {" "}{counts.sin_facturar} sin factura emitida.
        {" "}<span className="italic">Los pagos en efectivo y los pagos pendientes de verificación no aparecen acá.</span>
      </p>

      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-8">Cargando pagos...</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          No hay pagos {showFacturadas ? "" : "sin facturar "}para mostrar.
        </p>
      ) : (
        <div className="space-y-2 pb-20">
          {filtered.map((r) => {
            const facturada = r.factura_estado === "emitida" && !!r.factura_cae;
            const fecha = r.fecha
              ? new Date(r.fecha).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" })
              : "—";
            const isSelected = selected.has(r.key);

            return (
              <div
                key={r.key}
                className="rounded-xl border border-border bg-card p-4 flex flex-col sm:flex-row sm:items-center gap-3"
              >
                {!facturada && (
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleOne(r.key)}
                    className="mt-1 sm:mt-0 shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-foreground">{r.cliente_nombre}</p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${SOURCE_COLOR[r.source]}`}>
                      {SOURCE_LABEL[r.source]}
                    </span>
                    {facturada ? (
                      <Badge variant="default" className="text-[10px]" title={`CAE ${r.factura_cae}`}>
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
                  </div>
                  <p className="text-xs text-muted-foreground">{r.concepto}</p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                    <span>{fecha}</span>
                    <span className="font-semibold text-foreground">{formatPrice(r.monto, r.moneda)}</span>
                    {r.cliente_cuit && <span>DNI/CUIT {r.cliente_cuit}</span>}
                  </div>
                </div>
                <div className="shrink-0">
                  <BillingInvoiceLauncher
                    source={r.invoiceSource}
                    variant="default"
                    onEmitted={load}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

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
