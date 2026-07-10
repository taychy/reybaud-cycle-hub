import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatPrice } from "@/lib/currency";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { Search, ExternalLink } from "lucide-react";
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

const STATUS_COLORS: Record<string, string> = {
  validado: "bg-green-500/20 text-green-400 border-green-500/30",
  informado: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  pendiente_verificacion: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  rechazado: "bg-red-500/20 text-red-400 border-red-500/30",
  anulado: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

export default function EventPaymentsTab() {
  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [methodFilter, setMethodFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("reservation_payments")
      .select(`
        id, reservation_id, alumno_id, amount, currency, payment_date, payment_method,
        status, notes, created_at, reviewed_at, anulado_at, mp_payment_id,
        alumnos:alumnos!alumno_id ( nombre, apellido, email ),
        event_reservations:event_reservations!reservation_id (
          id, event_id, events:events!event_id ( nombre )
        )
      `)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else setPayments((data as any) ?? []);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    return payments.filter((p) => {
      if (statusFilter !== "all") {
        if (statusFilter === "anulado" && !p.anulado_at) return false;
        if (statusFilter !== "anulado" && (p.status !== statusFilter || p.anulado_at)) return false;
      }
      if (methodFilter !== "all" && p.payment_method !== methodFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        const hay = [
          p.mp_payment_id, p.notes,
          p.alumnos?.nombre, p.alumnos?.apellido, p.alumnos?.email,
          p.event_reservations?.events?.nombre,
        ].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [payments, statusFilter, methodFilter, search]);

  const totals = useMemo(() => {
    const validated = filtered.filter((p) => p.status === "validado" && !p.anulado_at);
    const byCurrency = validated.reduce<Record<string, number>>((acc, p) => {
      acc[p.currency] = (acc[p.currency] ?? 0) + Number(p.amount);
      return acc;
    }, {});
    return {
      total: filtered.length,
      validated: validated.length,
      byCurrency,
    };
  }, [filtered]);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Pagos de eventos</h3>
        <p className="text-sm text-muted-foreground">
          Cobros vinculados a reservas de eventos (efectivo, transferencia, MP). Los validados se envían a facturación automáticamente.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Pagos</div><div className="text-2xl font-bold">{totals.total}</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Validados</div><div className="text-2xl font-bold text-green-500">{totals.validated}</div></CardContent></Card>
        <Card><CardContent className="pt-4">
          <div className="text-xs text-muted-foreground">Total validado</div>
          <div className="text-sm font-bold">
            {Object.entries(totals.byCurrency).map(([cur, val]) => <div key={cur}>{formatPrice(val, cur)}</div>)}
            {Object.keys(totals.byCurrency).length === 0 && "—"}
          </div>
        </CardContent></Card>
      </div>

      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <div className="flex-1 min-w-[200px] relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar alumno, evento, MP id..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Estado" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="validado">Validado</SelectItem>
                <SelectItem value="informado">Informado</SelectItem>
                <SelectItem value="rechazado">Rechazado</SelectItem>
                <SelectItem value="anulado">Anulado</SelectItem>
              </SelectContent>
            </Select>
            <Select value={methodFilter} onValueChange={setMethodFilter}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Método" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los métodos</SelectItem>
                <SelectItem value="efectivo">Efectivo</SelectItem>
                <SelectItem value="transferencia">Transferencia</SelectItem>
                <SelectItem value="mercadopago">Mercado Pago</SelectItem>
                <SelectItem value="tarjeta">Tarjeta</SelectItem>
                <SelectItem value="otro">Otro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Alumno</TableHead>
                  <TableHead>Evento</TableHead>
                  <TableHead>Monto</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>MP ID</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Cargando...</TableCell></TableRow>}
                {!loading && filtered.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Sin pagos de eventos con esos filtros.</TableCell></TableRow>
                )}
                {filtered.map((p) => {
                  const displayStatus = p.anulado_at ? "anulado" : p.status;
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="text-xs">{new Date(p.payment_date).toLocaleDateString("es-AR")}</TableCell>
                      <TableCell className="text-xs">
                        {p.alumnos ? (
                          <div>
                            <div>{p.alumnos.nombre} {p.alumnos.apellido ?? ""}</div>
                            <div className="text-muted-foreground">{p.alumnos.email}</div>
                          </div>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-xs">{p.event_reservations?.events?.nombre ?? "—"}</TableCell>
                      <TableCell className="font-mono font-semibold">{formatPrice(Number(p.amount), p.currency)}</TableCell>
                      <TableCell className="text-xs capitalize">{p.payment_method}</TableCell>
                      <TableCell>
                        <Badge className={STATUS_COLORS[displayStatus] ?? ""} variant="outline">{displayStatus}</Badge>
                      </TableCell>
                      <TableCell className="text-xs font-mono">{p.mp_payment_id ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => navigate(`/admin/eventos?reserva=${p.reservation_id}`)}>
                          <ExternalLink className="h-3 w-3 mr-1" /> Ver reserva
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
