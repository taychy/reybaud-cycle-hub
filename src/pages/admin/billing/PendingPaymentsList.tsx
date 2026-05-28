import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Search, RefreshCw } from "lucide-react";
import { formatPrice } from "@/lib/currency";
import { BillingInvoiceLauncher, InvoiceSource } from "@/components/admin/BillingInvoiceLauncher";

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

export function PendingPaymentsList() {
  const [rows, setRows] = useState<PendingPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"todos" | Source>("todos");
  const [showFacturadas, setShowFacturadas] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);

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
        estado, estado_pago_sena, forma_pago_sena, updated_at, entregada_at,
        alumnos:alumno_id (id, nombre, apellido, documento)
      `)
      .eq("estado_pago_sena", "confirmada")
      .not("estado", "in", "(cancelada,vencida)")
      .gte("updated_at", CUTOFF_DATE)
      .order("updated_at", { ascending: false })
      .limit(500);

    const [subs, reservas, preorders] = await Promise.all([subsPromise, reservasPromise, preordersPromise]);

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
      };
    });

    const tiendaRows: PendingPayment[] = (preorders.data || []).map((p: any) => {
      const alumno = p.alumnos;
      const nombre = `${alumno?.nombre || ""} ${alumno?.apellido || ""}`.trim() || "—";
      // Si fue entregada, facturamos el total; si todavía sólo se pagó la seña, facturamos seña.
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
          referencia_tipo: "pedido",
          referencia_id: p.id,
          segmento: "tienda",
          metodo_pago: p.forma_pago_sena || null,
        },
        factura_estado: null,
        factura_cae: null,
      };
    });

    const allRows = [...subRows, ...evRows, ...tiendaRows];

    // 4) Cruce con facturas existentes
    const refsByType: Record<string, string[]> = {};
    allRows.forEach((r) => {
      const t = r.invoiceSource.referencia_tipo;
      if (!refsByType[t]) refsByType[t] = [];
      refsByType[t].push(r.invoiceSource.referencia_id);
    });

    const facturasMap = new Map<string, { estado: string; cae: string | null }>();
    for (const [tipo, ids] of Object.entries(refsByType)) {
      if (ids.length === 0) continue;
      const { data } = await supabase
        .from("facturas")
        .select("referencia_tipo, referencia_id, estado, cae")
        .eq("referencia_tipo", tipo)
        .in("referencia_id", ids);
      (data || []).forEach((f: any) => {
        facturasMap.set(`${f.referencia_tipo}:${f.referencia_id}`, { estado: f.estado, cae: f.cae });
      });
    }

    const enriched = allRows.map((r) => {
      const f = facturasMap.get(`${r.invoiceSource.referencia_tipo}:${r.invoiceSource.referencia_id}`);
      return { ...r, factura_estado: f?.estado || null, factura_cae: f?.cae || null };
    });

    // Ordenar por fecha desc
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

  const counts = useMemo(() => ({
    total: rows.length,
    sin_facturar: rows.filter((r) => !(r.factura_estado === "emitida" && !!r.factura_cae)).length,
    suscripcion: rows.filter((r) => r.source === "suscripcion").length,
    evento: rows.filter((r) => r.source === "evento").length,
    tienda: rows.filter((r) => r.source === "tienda").length,
  }), [rows]);

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

      <p className="text-xs text-muted-foreground">
        Mostrando pagos confirmados desde el {new Date(CUTOFF_DATE).toLocaleDateString("es-AR")}.
        {" "}{counts.sin_facturar} sin factura emitida.
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

            return (
              <div
                key={r.key}
                className="rounded-xl border border-border bg-card p-4 flex flex-col sm:flex-row sm:items-center gap-3"
              >
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
    </div>
  );
}
