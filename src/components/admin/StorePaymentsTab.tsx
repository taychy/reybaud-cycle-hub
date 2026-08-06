import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Search, RefreshCw, CheckCheck, ShoppingBag, Clock, CheckCircle } from "lucide-react";
import { formatPrice } from "@/lib/currency";
import { getPaymentMethodLabel } from "@/lib/paymentMethods";
import { PeriodBadge } from "@/components/admin/PeriodBadge";
import { toast } from "sonner";

interface StoreRow {
  id: string;
  tipo: "orden" | "preventa";
  referencia: string;
  cliente: string;
  contacto: string;
  concepto: string;
  moneda: string;
  total: number;
  pendiente: number;
  metodo: string | null;
  pagado: boolean;
  fecha: string;
  verificado: boolean;
  verificable: boolean;
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  const p = d.substring(0, 10).split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
}

const AUTO_METODOS = ["mercadopago", "mp", "tarjeta"];

export default function StorePaymentsTab() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<StoreRow[]>([]);
  const [search, setSearch] = useState("");
  const [estadoFilter, setEstadoFilter] = useState("all");
  const [monedaFilter, setMonedaFilter] = useState("all");

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [ordersRes, preRes] = await Promise.all([
      supabase
        .from("store_orders")
        .select("id, order_number, customer_name, customer_email, customer_phone, total, currency, status, metodo_pago, pagado_at, created_at, verificado_admin, cancelled_at")
        .is("cancelled_at", null)
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("store_preorders")
        .select("id, alumno_nombre, alumno_email, alumno_telefono, producto_nombre, precio_total, sena_monto, saldo_pendiente, moneda, estado, estado_pago_sena, forma_pago_sena, sena_pagada_at, created_at, cancelada_at")
        .is("cancelada_at", null)
        .order("created_at", { ascending: false })
        .limit(500),
    ]);

    if (ordersRes.error || preRes.error) {
      console.error(ordersRes.error || preRes.error);
      toast.error("No se pudieron cargar los pagos de tienda");
      setLoading(false);
      return;
    }

    const list: StoreRow[] = [];

    for (const o of (ordersRes.data || []) as any[]) {
      const pagado = !!o.pagado_at || ["pagada", "pagado", "completada", "entregada"].includes(o.status || "");
      const metodo = (o.metodo_pago || "").toLowerCase();
      list.push({
        id: o.id,
        tipo: "orden",
        referencia: `#${o.order_number ?? o.id.slice(0, 6)}`,
        cliente: o.customer_name || "—",
        contacto: o.customer_phone || o.customer_email || "—",
        concepto: `Orden de tienda (${o.status || "—"})`,
        moneda: o.currency || "ARS",
        total: Number(o.total) || 0,
        pendiente: pagado ? 0 : Number(o.total) || 0,
        metodo: o.metodo_pago || null,
        pagado,
        fecha: o.pagado_at || o.created_at,
        verificado: !!o.verificado_admin,
        verificable: pagado && !AUTO_METODOS.includes(metodo),
      });
    }

    for (const p of (preRes.data || []) as any[]) {
      const senaPagada = ["pagado", "pagada", "aprobado", "confirmada"].includes(p.estado_pago_sena || "");
      const saldo = Number(p.saldo_pendiente) || 0;
      list.push({
        id: p.id,
        tipo: "preventa",
        referencia: "Preventa",
        cliente: p.alumno_nombre || "—",
        contacto: p.alumno_telefono || p.alumno_email || "—",
        concepto: `${p.producto_nombre || "Producto"}${senaPagada ? " · seña pagada" : " · seña pendiente"}`,
        moneda: p.moneda || "ARS",
        total: Number(p.precio_total) || 0,
        pendiente: senaPagada ? saldo : Number(p.precio_total) || 0,
        metodo: p.forma_pago_sena || null,
        pagado: senaPagada && saldo <= 0.01,
        fecha: p.sena_pagada_at || p.created_at,
        verificado: true,
        verificable: false,
      });
    }

    setRows(list);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const monedas = useMemo(() => Array.from(new Set(rows.map((r) => r.moneda))).sort(), [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (monedaFilter !== "all" && r.moneda !== monedaFilter) return false;
      if (estadoFilter === "pagado" && !r.pagado) return false;
      if (estadoFilter === "pendiente" && r.pagado) return false;
      if (estadoFilter === "por_verificar" && !(r.verificable && !r.verificado)) return false;
      if (q && !`${r.cliente} ${r.contacto} ${r.concepto} ${r.referencia}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, search, estadoFilter, monedaFilter]);

  const kpis = useMemo(() => {
    const cobrado: Record<string, number> = {};
    const pendiente: Record<string, number> = {};
    let porVerificar = 0;
    rows.forEach((r) => {
      if (r.pagado) cobrado[r.moneda] = (cobrado[r.moneda] || 0) + r.total;
      if (r.pendiente > 0.01) pendiente[r.moneda] = (pendiente[r.moneda] || 0) + r.pendiente;
      if (r.verificable && !r.verificado) porVerificar++;
    });
    return { cobrado, pendiente, porVerificar };
  }, [rows]);

  const marcarVerificado = async (row: StoreRow) => {
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("store_orders")
      .update({
        verificado_admin: true,
        verificado_admin_at: new Date().toISOString(),
        verificado_admin_by: userData?.user?.id || null,
      } as any)
      .eq("id", row.id);
    if (error) {
      console.error(error);
      toast.error("No se pudo marcar como verificado");
      return;
    }
    toast.success("Pago verificado");
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, verificado: true } : r)));
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> Cobrado
              </span>
              <PeriodBadge scope="acumulado" label="Histórico" />
            </div>
            {Object.entries(kpis.cobrado).length === 0
              ? <p className="text-2xl font-bold mt-1">—</p>
              : Object.entries(kpis.cobrado).map(([m, v]) => (
                <p key={m} className="text-lg font-bold font-mono text-emerald-500 leading-tight mt-1">{formatPrice(v, m)}</p>
              ))}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <span className="text-xs text-muted-foreground font-medium flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-destructive" /> Pendiente de cobro
            </span>
            {Object.entries(kpis.pendiente).length === 0
              ? <p className="text-2xl font-bold mt-1">—</p>
              : Object.entries(kpis.pendiente).map(([m, v]) => (
                <p key={m} className="text-lg font-bold font-mono text-destructive leading-tight mt-1">{formatPrice(v, m)}</p>
              ))}
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-amber-500/50" onClick={() => setEstadoFilter("por_verificar")}>
          <CardContent className="p-4">
            <span className="text-xs text-muted-foreground font-medium flex items-center gap-1">
              <CheckCheck className="w-3.5 h-3.5 text-amber-500" /> Por verificar
            </span>
            <p className="text-2xl font-bold mt-1 text-amber-500">{kpis.porVerificar}</p>
            <p className="text-[10px] text-muted-foreground">Efectivo y transferencia</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar cliente, producto u orden…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <Select value={estadoFilter} onValueChange={setEstadoFilter}>
          <SelectTrigger className="h-9 w-44 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="por_verificar">Por verificar</SelectItem>
            <SelectItem value="pendiente">Pendientes de cobro</SelectItem>
            <SelectItem value="pagado">Cobrados</SelectItem>
          </SelectContent>
        </Select>
        <Select value={monedaFilter} onValueChange={setMonedaFilter}>
          <SelectTrigger className="h-9 w-32 text-xs"><SelectValue placeholder="Moneda" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas monedas</SelectItem>
            {monedas.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Actualizar
        </Button>
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} operaciones</span>
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-secondary/40">
              <TableHead className="text-xs">Cliente</TableHead>
              <TableHead className="text-xs">Concepto</TableHead>
              <TableHead className="text-xs w-24">Método</TableHead>
              <TableHead className="text-xs text-right w-28">Total</TableHead>
              <TableHead className="text-xs text-right w-28">Pendiente</TableHead>
              <TableHead className="text-xs w-24">Fecha</TableHead>
              <TableHead className="text-xs w-36 text-right">Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-10">
                  {loading ? "Cargando…" : "No hay operaciones de tienda con estos filtros."}
                </TableCell>
              </TableRow>
            ) : filtered.map((r) => (
              <TableRow key={`${r.tipo}-${r.id}`} className="border-border hover:bg-muted/30">
                <TableCell>
                  <div className="font-medium text-sm flex items-center gap-1.5">
                    <ShoppingBag className="w-3.5 h-3.5 text-muted-foreground" />
                    {r.cliente}
                  </div>
                  <div className="text-[10px] text-muted-foreground">{r.contacto}</div>
                </TableCell>
                <TableCell className="text-xs">
                  <Badge variant="outline" className="text-[10px] mr-1.5">{r.referencia}</Badge>
                  {r.concepto}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {r.metodo ? getPaymentMethodLabel(r.metodo) : "—"}
                </TableCell>
                <TableCell className="text-right font-mono text-xs whitespace-nowrap">
                  {formatPrice(r.total, r.moneda)}
                </TableCell>
                <TableCell className="text-right font-mono text-xs text-destructive whitespace-nowrap">
                  {r.pendiente > 0.01 ? formatPrice(r.pendiente, r.moneda) : "—"}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{fmtDate(r.fecha)}</TableCell>
                <TableCell className="text-right">
                  {r.verificable && !r.verificado ? (
                    <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => marcarVerificado(r)}>
                      <CheckCheck className="w-3 h-3 mr-1" /> Verificar
                    </Button>
                  ) : r.pagado ? (
                    <Badge variant="outline" className="text-[10px] bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
                      Cobrado
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] bg-amber-500/15 text-amber-400 border-amber-500/30">
                      Pendiente
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
