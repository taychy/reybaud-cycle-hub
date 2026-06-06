import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { formatPrice } from "@/lib/currency";
import { getPaymentMethodLabel } from "@/lib/paymentMethods";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Search, Filter, RefreshCw, X, ShoppingBag, Calendar, MapPin,
  CreditCard, Package, Tag, ExternalLink,
} from "lucide-react";

/** Tipos de operación unificada */
type OpTipo = "suscripcion" | "evento" | "tienda" | "preventa" | "turnera";

type OpEstado = "pagado" | "informado" | "pendiente" | "parcial" | "cancelado" | "vencido" | "reembolsado";

type UnifiedOp = {
  key: string;                       // id único: `${tipo}:${id}`
  tipo: OpTipo;
  id: string;                        // id de la fila origen
  alumno_id?: string | null;
  alumno_nombre: string;
  alumno_email?: string | null;
  concepto: string;                  // qué se cobra
  monto: number;
  moneda: string;
  fecha: string;                     // F. operación (created_at o pagado_at)
  fecha_vencimiento?: string | null;
  estado: OpEstado;
  metodo: string;                    // método de pago label
  origen?: string | null;            // origen del registro (mp, alumno, admin)
  ref?: string | null;               // ref ext (mp_payment_id, order_number, etc)
  rawStatus?: string | null;         // estado crudo de la tabla origen
  link?: string | null;              // navegar a detalle
};

const TIPO_LABEL: Record<OpTipo, string> = {
  suscripcion: "Suscripción",
  evento: "Evento/Viaje",
  tienda: "Tienda",
  preventa: "Preventa",
  turnera: "Turnera",
};

const TIPO_ICON: Record<OpTipo, JSX.Element> = {
  suscripcion: <CreditCard className="w-3.5 h-3.5" />,
  evento: <Calendar className="w-3.5 h-3.5" />,
  tienda: <ShoppingBag className="w-3.5 h-3.5" />,
  preventa: <Tag className="w-3.5 h-3.5" />,
  turnera: <MapPin className="w-3.5 h-3.5" />,
};

const TIPO_COLOR: Record<OpTipo, string> = {
  suscripcion: "bg-primary/10 text-primary border-primary/30",
  evento: "bg-cyan-500/15 text-cyan-700 border-cyan-500/30",
  tienda: "bg-violet-500/15 text-violet-700 border-violet-500/30",
  preventa: "bg-pink-500/15 text-pink-700 border-pink-500/30",
  turnera: "bg-amber-500/15 text-amber-700 border-amber-500/30",
};

const ESTADO_BADGE: Record<OpEstado, { label: string; className: string }> = {
  pagado:      { label: "Pagado",      className: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30" },
  informado:   { label: "Informado",   className: "bg-blue-500/15 text-blue-700 border-blue-500/30" },
  pendiente:   { label: "Pendiente",   className: "bg-amber-500/15 text-amber-700 border-amber-500/30" },
  parcial:     { label: "Parcial",     className: "bg-indigo-500/15 text-indigo-700 border-indigo-500/30" },
  vencido:     { label: "Vencido",     className: "bg-red-500/15 text-red-700 border-red-500/30" },
  cancelado:   { label: "Cancelado",   className: "bg-muted text-muted-foreground border-border" },
  reembolsado: { label: "Reembolsado", className: "bg-slate-500/15 text-slate-700 border-slate-500/30" },
};

const formatDate = (d?: string | null) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
};

const currentPeriodKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const inPeriod = (op: UnifiedOp, periodo: string) => {
  if (periodo === "all") return true;
  return (op.fecha || "").substring(0, 7) === periodo;
};

/* =========================== Loaders por origen =========================== */

async function loadSuscripciones(): Promise<UnifiedOp[]> {
  const { data } = await supabase
    .from("suscripciones")
    .select("id, alumno_id, estado, fecha_inicio, fecha_fin, mp_payment_id, metodo_pago, origen_registro, created_at, updated_at, cancelada_at, alumnos(nombre, apellido, email), planes(nombre, precio, moneda)")
    .order("created_at", { ascending: false })
    .limit(2000);

  return (data || []).map((s: any): UnifiedOp => {
    const paid = ["automatico", "cargado_admin"].includes(s.origen_registro);
    const today = new Date().toISOString().slice(0, 10);
    let estado: OpEstado = "pendiente";
    if (s.cancelada_at) estado = "cancelado";
    else if (s.estado === "activa" && paid) estado = "pagado";
    else if (s.estado === "pendiente_verificacion") estado = "informado";
    else if (s.estado === "vencida" || (s.fecha_fin && s.fecha_fin < today && !paid)) estado = "vencido";
    else if (s.estado === "cancelada") estado = "cancelado";

    return {
      key: `suscripcion:${s.id}`,
      tipo: "suscripcion",
      id: s.id,
      alumno_id: s.alumno_id,
      alumno_nombre: [s.alumnos?.nombre, s.alumnos?.apellido].filter(Boolean).join(" ") || "—",
      alumno_email: s.alumnos?.email,
      concepto: s.planes?.nombre || "Suscripción",
      monto: Number(s.planes?.precio || 0),
      moneda: s.planes?.moneda || "ARS",
      fecha: (paid ? s.fecha_inicio : null) || s.updated_at || s.created_at,
      fecha_vencimiento: s.fecha_fin,
      estado,
      metodo: getPaymentMethodLabel(s.metodo_pago),
      origen: s.origen_registro,
      ref: s.mp_payment_id,
      rawStatus: s.estado,
      link: `/admin/pagos?suscripcion=${s.id}`,
    };
  });
}

async function loadEventPayments(): Promise<UnifiedOp[]> {
  const { data } = await supabase
    .from("reservation_payments")
    .select("id, reservation_id, alumno_id, amount, currency, payment_date, payment_method, status, notes, created_at, anulado_at, event_reservations(event_id, alumno_id, alumno_nombre, alumno_email, events(title))")
    .order("created_at", { ascending: false })
    .limit(2000);

  return (data || []).map((p: any): UnifiedOp => {
    let estado: OpEstado = "pendiente";
    if (p.anulado_at) estado = "cancelado";
    else if (p.status === "validado") estado = "pagado";
    else if (p.status === "informado") estado = "informado";
    else if (p.status === "rechazado") estado = "cancelado";

    return {
      key: `evento:${p.id}`,
      tipo: "evento",
      id: p.id,
      alumno_id: p.alumno_id || p.event_reservations?.alumno_id,
      alumno_nombre: p.event_reservations?.alumno_nombre || "—",
      alumno_email: p.event_reservations?.alumno_email,
      concepto: p.event_reservations?.events?.title || "Reserva de evento",
      monto: Number(p.amount || 0),
      moneda: p.currency || "ARS",
      fecha: p.payment_date || p.created_at,
      fecha_vencimiento: null,
      estado,
      metodo: getPaymentMethodLabel(p.payment_method || "otro"),
      origen: p.payment_method,
      ref: p.notes?.slice(0, 40) || null,
      rawStatus: p.status,
      link: p.event_reservations?.event_id ? `/admin/eventos/${p.event_reservations.event_id}/operaciones` : null,
    };
  });
}

async function loadStoreOrders(): Promise<UnifiedOp[]> {
  const { data } = await supabase
    .from("store_orders")
    .select("id, order_number, alumno_id, customer_name, customer_email, total, currency, status, metodo_pago, origen_registro, mp_payment_id, pagado_at, created_at")
    .order("created_at", { ascending: false })
    .limit(2000);

  return (data || []).map((o: any): UnifiedOp => {
    let estado: OpEstado = "pendiente";
    const s = (o.status || "").toLowerCase();
    if (["pagado", "entregado", "enviado", "completado"].includes(s)) estado = "pagado";
    else if (["informado", "pendiente_verificacion"].includes(s)) estado = "informado";
    else if (["cancelado", "anulado"].includes(s)) estado = "cancelado";
    else if (["reembolsado"].includes(s)) estado = "reembolsado";

    return {
      key: `tienda:${o.id}`,
      tipo: "tienda",
      id: o.id,
      alumno_id: o.alumno_id,
      alumno_nombre: o.customer_name || "—",
      alumno_email: o.customer_email,
      concepto: `Orden #${o.order_number ?? o.id.slice(0, 6)}`,
      monto: Number(o.total || 0),
      moneda: o.currency || "ARS",
      fecha: o.pagado_at || o.created_at,
      fecha_vencimiento: null,
      estado,
      metodo: getPaymentMethodLabel(o.metodo_pago || "otro"),
      origen: o.origen_registro,
      ref: o.mp_payment_id || `#${o.order_number ?? ""}`,
      rawStatus: o.status,
      link: `/admin/tienda?orden=${o.id}`,
    };
  });
}

async function loadPreorders(): Promise<UnifiedOp[]> {
  const { data } = await supabase
    .from("store_preorders")
    .select("id, alumno_id, alumno_nombre, alumno_email, producto_nombre, sena_monto, precio_total, moneda, estado, estado_pago_sena, forma_pago_sena, mp_payment_id, sena_pagada_at, created_at, cancelada_at")
    .order("created_at", { ascending: false })
    .limit(2000);

  return (data || []).map((p: any): UnifiedOp => {
    let estado: OpEstado = "pendiente";
    if (p.cancelada_at) estado = "cancelado";
    else if (p.estado_pago_sena === "confirmada") estado = "pagado";
    else if (p.estado_pago_sena === "informada" || p.estado_pago_sena === "pendiente_verificacion") estado = "informado";
    else if (p.estado_pago_sena === "rechazada") estado = "cancelado";

    return {
      key: `preventa:${p.id}`,
      tipo: "preventa",
      id: p.id,
      alumno_id: p.alumno_id,
      alumno_nombre: p.alumno_nombre || "—",
      alumno_email: p.alumno_email,
      concepto: `Preventa: ${p.producto_nombre || "—"}`,
      monto: Number(p.sena_monto || 0),
      moneda: p.moneda || "ARS",
      fecha: p.sena_pagada_at || p.created_at,
      fecha_vencimiento: null,
      estado,
      metodo: getPaymentMethodLabel(p.forma_pago_sena || "otro"),
      origen: p.mp_payment_id ? "automatico" : "informado_alumno",
      ref: p.mp_payment_id,
      rawStatus: p.estado_pago_sena,
      link: `/admin/tienda?preventa=${p.id}`,
    };
  });
}

async function loadTurnera(): Promise<UnifiedOp[]> {
  const { data } = await supabase
    .from("reservas_turnera")
    .select("id, alumno_id, nombre, apellido, email, fecha, hora_inicio, precio_snapshot, moneda_snapshot, estado_operativo, estado_economico, created_at, servicios_turnera(nombre)")
    .order("created_at", { ascending: false })
    .limit(2000);

  return (data || []).map((r: any): UnifiedOp => {
    let estado: OpEstado = "pendiente";
    const eco = (r.estado_economico || "").toLowerCase();
    const op = (r.estado_operativo || "").toLowerCase();
    if (op === "cancelada") estado = "cancelado";
    else if (eco === "pagado") estado = "pagado";
    else if (eco === "informado") estado = "informado";
    else if (eco === "parcial") estado = "parcial";
    else if (eco === "vencido") estado = "vencido";

    return {
      key: `turnera:${r.id}`,
      tipo: "turnera",
      id: r.id,
      alumno_id: r.alumno_id,
      alumno_nombre: [r.nombre, r.apellido].filter(Boolean).join(" ") || r.email || "—",
      alumno_email: r.email,
      concepto: `${r.servicios_turnera?.nombre || "Reserva"} · ${formatDate(r.fecha)}${r.hora_inicio ? " " + r.hora_inicio.slice(0,5) : ""}`,
      monto: Number(r.precio_snapshot || 0),
      moneda: r.moneda_snapshot || "ARS",
      fecha: r.created_at,
      fecha_vencimiento: r.fecha,
      estado,
      metodo: "—",
      origen: null,
      ref: null,
      rawStatus: r.estado_economico,
      link: `/admin/turnera?reserva=${r.id}`,
    };
  });
}

/* =================================== UI =================================== */

export default function AllOperationsTab() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [ops, setOps] = useState<UnifiedOp[]>([]);

  // Filtros
  const [filterTipo, setFilterTipo] = useState<"todos" | OpTipo>("todos");
  const [filterEstado, setFilterEstado] = useState<"todos" | OpEstado>("todos");
  const [filterPeriodo, setFilterPeriodo] = useState<string>(currentPeriodKey());
  const [filterAlumno, setFilterAlumno] = useState("");
  const [filterDesde, setFilterDesde] = useState("");
  const [filterHasta, setFilterHasta] = useState("");

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [a, b, c, d, e] = await Promise.all([
        loadSuscripciones(),
        loadEventPayments(),
        loadStoreOrders(),
        loadPreorders(),
        loadTurnera(),
      ]);
      const all = [...a, ...b, ...c, ...d, ...e].sort((x, y) => (y.fecha || "").localeCompare(x.fecha || ""));
      setOps(all);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const filtered = useMemo(() => {
    return ops.filter((o) => {
      if (filterTipo !== "todos" && o.tipo !== filterTipo) return false;
      if (filterEstado !== "todos" && o.estado !== filterEstado) return false;
      if (!inPeriod(o, filterPeriodo)) return false;
      if (filterAlumno && !o.alumno_nombre.toLowerCase().includes(filterAlumno.toLowerCase())) return false;
      if (filterDesde && (o.fecha || "") < filterDesde) return false;
      if (filterHasta && (o.fecha || "") > filterHasta + "T23:59:59") return false;
      return true;
    });
  }, [ops, filterTipo, filterEstado, filterPeriodo, filterAlumno, filterDesde, filterHasta]);

  // KPIs por estado
  const summary = useMemo(() => {
    const acc: Record<string, { count: number; byCurrency: Record<string, number> }> = {};
    for (const o of filtered) {
      const k = o.estado;
      if (!acc[k]) acc[k] = { count: 0, byCurrency: {} };
      acc[k].count++;
      acc[k].byCurrency[o.moneda] = (acc[k].byCurrency[o.moneda] || 0) + (o.monto || 0);
    }
    return acc;
  }, [filtered]);

  const periodOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [{ value: "all", label: "Todos los períodos" }];
    const monthNames = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      opts.push({ value: key, label: `${monthNames[d.getMonth()]} ${d.getFullYear()}${i === 0 ? " (actual)" : ""}` });
    }
    return opts;
  }, []);

  const clearFilters = () => {
    setFilterTipo("todos");
    setFilterEstado("todos");
    setFilterAlumno("");
    setFilterDesde("");
    setFilterHasta("");
    setFilterPeriodo(currentPeriodKey());
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-muted-foreground">Cargando operaciones…</div>;
  }

  const summaryCards: { key: OpEstado; label: string; color: string }[] = [
    { key: "pagado",    label: "Pagados",    color: "emerald" },
    { key: "informado", label: "Informados", color: "blue" },
    { key: "pendiente", label: "Pendientes", color: "amber" },
    { key: "parcial",   label: "Parciales",  color: "indigo" },
    { key: "vencido",   label: "Vencidos",   color: "red" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">Todas las operaciones</h2>
          <p className="text-xs text-muted-foreground">
            Suscripciones, eventos, tienda, preventas y turnera unificadas · {periodOptions.find(o => o.value === filterPeriodo)?.label}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filterPeriodo} onValueChange={setFilterPeriodo}>
            <SelectTrigger className="h-9 text-sm w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-[300px]">
              {periodOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" onClick={fetchAll}><RefreshCw className="w-4 h-4 mr-1" />Actualizar</Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {summaryCards.map((c) => {
          const s = summary[c.key];
          const totals = s ? Object.entries(s.byCurrency).map(([m, v]) => formatPrice(v, m)).join(" · ") : "—";
          return (
            <Card key={c.key} className={`cursor-pointer hover:border-${c.color}-500/50 transition-colors`} onClick={() => setFilterEstado(c.key)}>
              <CardContent className="p-4">
                <div className={`flex items-center gap-2 text-${c.color}-600`}>
                  <span className="text-xs font-medium">{c.label}</span>
                </div>
                <p className="text-2xl font-bold mt-1">{s?.count || 0}</p>
                <p className="text-[10px] text-muted-foreground truncate" title={totals}>{totals}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2"><Filter className="w-4 h-4" /> Filtros</CardTitle>
            <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs"><X className="w-3 h-3 mr-1" />Limpiar</Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs mb-1 block">Alumno</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar..." value={filterAlumno} onChange={(e) => setFilterAlumno(e.target.value)} className="pl-8 h-9 text-sm" />
              </div>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Tipo de operación</Label>
              <Select value={filterTipo} onValueChange={(v) => setFilterTipo(v as any)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {(Object.keys(TIPO_LABEL) as OpTipo[]).map(t => (
                    <SelectItem key={t} value={t}>{TIPO_LABEL[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Estado</Label>
              <Select value={filterEstado} onValueChange={(v) => setFilterEstado(v as any)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {(Object.keys(ESTADO_BADGE) as OpEstado[]).map(e => (
                    <SelectItem key={e} value={e}>{ESTADO_BADGE[e].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs mb-1 block">Desde</Label>
                <Input type="date" value={filterDesde} onChange={(e) => setFilterDesde(e.target.value)} className="h-9 text-sm" />
              </div>
              <div>
                <Label className="text-xs mb-1 block">Hasta</Label>
                <Input type="date" value={filterHasta} onChange={(e) => setFilterHasta(e.target.value)} className="h-9 text-sm" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabla */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Operaciones ({filtered.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Alumno / Cliente</TableHead>
                  <TableHead>Concepto</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead>F. operación</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Método / Origen</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No hay operaciones con los filtros seleccionados</TableCell></TableRow>
                ) : (
                  filtered.map((o) => (
                    <TableRow key={o.key} className="hover:bg-muted/40">
                      <TableCell>
                        <Badge variant="outline" className={`gap-1 ${TIPO_COLOR[o.tipo]}`}>
                          {TIPO_ICON[o.tipo]}
                          {TIPO_LABEL[o.tipo]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        <div className="font-medium">{o.alumno_nombre}</div>
                        {o.alumno_email && <div className="text-[11px] text-muted-foreground">{o.alumno_email}</div>}
                      </TableCell>
                      <TableCell className="text-sm max-w-[280px]">
                        <div className="truncate" title={o.concepto}>{o.concepto}</div>
                        {o.ref && <div className="text-[11px] text-muted-foreground truncate" title={o.ref}>{o.ref}</div>}
                      </TableCell>
                      <TableCell className="text-right text-sm font-semibold tabular-nums">
                        {formatPrice(o.monto, o.moneda)}
                      </TableCell>
                      <TableCell className="text-sm">{formatDate(o.fecha)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={ESTADO_BADGE[o.estado].className}>
                          {ESTADO_BADGE[o.estado].label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        <div className="leading-tight">
                          <span>{o.metodo}</span>
                          {o.origen && (
                            <span className="block text-[11px] text-muted-foreground capitalize">{o.origen.replace(/_/g, " ")}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {o.link && (
                          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => navigate(o.link!)}>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
