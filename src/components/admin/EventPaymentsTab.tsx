import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatPrice } from "@/lib/currency";
import { getPaymentMethodLabel } from "@/lib/paymentMethods";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PeriodBadge } from "@/components/admin/PeriodBadge";
import { toast } from "sonner";
import { Search, ExternalLink, RefreshCw, CheckCheck, CheckCircle, Clock, Ticket } from "lucide-react";
import { useNavigate } from "react-router-dom";

type Payment = {
  id: string;
  reservation_id: string;
  alumno_id: string | null;
  amount: number;
  currency: string;
  payment_date: string;
  payment_method: string;
  status: string;
  notes: string | null;
  created_at: string;
  reviewed_at: string | null;
  anulado_at: string | null;
  mp_payment_id: string | null;
  alumnos?: { nombre: string; apellido: string | null; email: string } | null;
  event_reservations?: {
    id: string;
    event_id: string;
    events?: { title: string } | null;
  } | null;
};

const AUTO_METODOS = ["mercadopago", "mp", "tarjeta"];

function isVerificable(p: Payment) {
  return !p.anulado_at && p.status === "validado" && !AUTO_METODOS.includes((p.payment_method || "").toLowerCase());
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  const p = d.substring(0, 10).split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
}

export default function EventPaymentsTab() {
  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [pendientePorMoneda, setPendientePorMoneda] = useState<Record<string, number>>({});
  const [estadoFilter, setEstadoFilter] = useState<string>("all");
  const [methodFilter, setMethodFilter] = useState<string>("all");
  const [monedaFilter, setMonedaFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    const [payRes, resRes] = await Promise.all([
      supabase
        .from("reservation_payments")
        .select(`
          id, reservation_id, alumno_id, amount, currency, payment_date, payment_method,
          status, notes, created_at, reviewed_at, anulado_at, mp_payment_id,
          alumnos:alumnos!alumno_id ( nombre, apellido, email ),
          event_reservations:event_reservations!reservation_id (
            id, event_id, events:events!event_id ( title )
          )
        `)
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("event_reservations")
        .select("balance_due, currency_snapshot, moneda, reservation_status")
        .limit(2000),
    ]);

    if (payRes.error) toast.error(payRes.error.message);
    else setPayments((payRes.data as any) ?? []);

    const pend: Record<string, number> = {};
    for (const r of ((resRes.data as any[]) || [])) {
      if (["cancelada", "cancelled", "rechazada"].includes(r.reservation_status || "")) continue;
      const saldo = Number(r.balance_due) || 0;
      if (saldo > 0.01) {
        const cur = r.currency_snapshot || r.moneda || "ARS";
        pend[cur] = (pend[cur] || 0) + saldo;
      }
    }
    setPendientePorMoneda(pend);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const monedas = useMemo(() => Array.from(new Set(payments.map((p) => p.currency))).sort(), [payments]);

  const filtered = useMemo(() => {
    return payments.filter((p) => {
      if (estadoFilter === "anulado" && !p.anulado_at) return false;
      if (estadoFilter === "por_verificar" && !(isVerificable(p) && !p.reviewed_at)) return false;
      if (estadoFilter === "cobrado" && !(p.status === "validado" && !p.anulado_at)) return false;
      if (estadoFilter === "informado" && !(p.status !== "validado" && !p.anulado_at)) return false;
      if (monedaFilter !== "all" && p.currency !== monedaFilter) return false;
      if (methodFilter !== "all" && p.payment_method !== methodFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        const hay = [
          p.mp_payment_id, p.notes,
          p.alumnos?.nombre, p.alumnos?.apellido, p.alumnos?.email,
          p.event_reservations?.events?.title,
        ].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [payments, estadoFilter, methodFilter, monedaFilter, search]);

  const kpis = useMemo(() => {
    const cobrado: Record<string, number> = {};
    let porVerificar = 0;
    payments.forEach((p) => {
      if (p.anulado_at) return;
      if (p.status === "validado") cobrado[p.currency] = (cobrado[p.currency] || 0) + Number(p.amount);
      if (isVerificable(p) && !p.reviewed_at) porVerificar++;
    });
    return { cobrado, porVerificar };
  }, [payments]);

  const marcarVerificado = async (p: Payment) => {
    const { error } = await supabase.rpc("marcar_pago_verificado", {
      _fuente: "evento",
      _registro_id: p.id,
      _verificado: true,
      _nota: null,
    } as any);
    if (error) {
      console.error(error);
      toast.error("No se pudo marcar como verificado");
      return;
    }
    toast.success("Pago verificado");
    setPayments((prev) => prev.map((x) => (x.id === p.id ? { ...x, reviewed_at: new Date().toISOString() } : x)));
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
            {Object.entries(pendientePorMoneda).length === 0
              ? <p className="text-2xl font-bold mt-1">—</p>
              : Object.entries(pendientePorMoneda).map(([m, v]) => (
                <p key={m} className="text-lg font-bold font-mono text-destructive leading-tight mt-1">{formatPrice(v, m)}</p>
              ))}
            <p className="text-[10px] text-muted-foreground">Saldo de reservas activas</p>
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
            placeholder="Buscar alumno, evento o MP id…"
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
            <SelectItem value="informado">Informados / pendientes</SelectItem>
            <SelectItem value="cobrado">Cobrados</SelectItem>
            <SelectItem value="anulado">Anulados</SelectItem>
          </SelectContent>
        </Select>
        <Select value={methodFilter} onValueChange={setMethodFilter}>
          <SelectTrigger className="h-9 w-40 text-xs"><SelectValue placeholder="Método" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los métodos</SelectItem>
            <SelectItem value="efectivo">Efectivo</SelectItem>
            <SelectItem value="transferencia">Transferencia</SelectItem>
            <SelectItem value="mercadopago">Mercado Pago</SelectItem>
            <SelectItem value="tarjeta">Tarjeta</SelectItem>
            <SelectItem value="otro">Otro</SelectItem>
          </SelectContent>
        </Select>
        <Select value={monedaFilter} onValueChange={setMonedaFilter}>
          <SelectTrigger className="h-9 w-32 text-xs"><SelectValue placeholder="Moneda" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas monedas</SelectItem>
            {monedas.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Actualizar
        </Button>
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} operaciones</span>
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-secondary/40">
              <TableHead className="text-xs">Alumno</TableHead>
              <TableHead className="text-xs">Concepto</TableHead>
              <TableHead className="text-xs w-28">Método</TableHead>
              <TableHead className="text-xs text-right w-28">Monto</TableHead>
              <TableHead className="text-xs w-24">Fecha</TableHead>
              <TableHead className="text-xs w-44 text-right">Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-10">
                  {loading ? "Cargando…" : "No hay pagos de eventos con estos filtros."}
                </TableCell>
              </TableRow>
            ) : filtered.map((p) => {
              const anulado = !!p.anulado_at;
              const cobrado = p.status === "validado" && !anulado;
              const verificar = isVerificable(p) && !p.reviewed_at;
              return (
                <TableRow key={p.id} className="border-border hover:bg-muted/30">
                  <TableCell>
                    <div className="font-medium text-sm flex items-center gap-1.5">
                      <Ticket className="w-3.5 h-3.5 text-muted-foreground" />
                      {p.alumnos ? `${p.alumnos.nombre} ${p.alumnos.apellido ?? ""}`.trim() : "—"}
                    </div>
                    <div className="text-[10px] text-muted-foreground">{p.alumnos?.email || "—"}</div>
                  </TableCell>
                  <TableCell className="text-xs">
                    <Badge variant="outline" className="text-[10px] mr-1.5">Evento</Badge>
                    {p.event_reservations?.events?.title ?? "—"}
                    {p.mp_payment_id && (
                      <span className="block text-[10px] text-muted-foreground font-mono">MP {p.mp_payment_id}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {p.payment_method ? getPaymentMethodLabel(p.payment_method) : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs whitespace-nowrap">
                    {formatPrice(Number(p.amount), p.currency)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{fmtDate(p.payment_date)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center gap-1 justify-end">
                      {verificar ? (
                        <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => marcarVerificado(p)}>
                          <CheckCheck className="w-3 h-3 mr-1" /> Verificar
                        </Button>
                      ) : anulado ? (
                        <Badge variant="outline" className="text-[10px] bg-muted text-muted-foreground">Anulado</Badge>
                      ) : cobrado ? (
                        <Badge variant="outline" className="text-[10px] bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
                          Cobrado
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] bg-amber-500/15 text-amber-400 border-amber-500/30">
                          Pendiente
                        </Badge>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        title="Ver reserva"
                        onClick={() => navigate(`/admin/eventos?reserva=${p.reservation_id}`)}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
