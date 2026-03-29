import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { formatPrice } from "@/lib/currency";
import {
  Search, Filter, ChevronDown, CheckCircle, XCircle, Clock,
  AlertCircle, Eye, CreditCard, Users, CalendarDays, Banknote,
  ArrowUpDown, RefreshCw, Loader2,
} from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

interface EventReservation {
  id: string;
  event_id: string;
  alumno_id: string;
  reservation_status: string;
  payment_status: string;
  amount_total: number | null;
  amount_paid: number;
  balance_due: number | null;
  moneda: string;
  currency_snapshot: string | null;
  metodo_pago: string;
  notas: string | null;
  admin_notes: string | null;
  participant_notes: string | null;
  created_at: string;
  updated_at: string;
  confirmed_at: string | null;
  alumno?: { nombre: string; apellido: string | null; email: string; telefono: string | null };
}

interface Payment {
  id: string;
  amount: number;
  currency: string;
  payment_date: string;
  payment_method: string;
  payment_reference: string | null;
  notes: string | null;
  status: string;
  created_at: string;
}

const reservationStatusLabels: Record<string, string> = {
  solicitud_enviada: "Solicitud enviada",
  reserva_pendiente: "Reserva pendiente",
  reserva_confirmada: "Confirmada",
  cancelada: "Cancelada",
  rechazada: "Rechazada",
  lista_espera: "Lista de espera",
};

const paymentStatusLabels: Record<string, string> = {
  no_informado: "No informado",
  no_aplica: "N/A",
  pago_pendiente: "Pendiente",
  pago_informado: "Informado",
  pago_validado: "Validado",
  pago_rechazado: "Rechazado",
  parcial: "Parcial",
};

const reservationStatusColors: Record<string, string> = {
  solicitud_enviada: "bg-sky-500/15 text-sky-400",
  reserva_pendiente: "bg-amber-500/15 text-amber-400",
  reserva_confirmada: "bg-emerald-500/15 text-emerald-400",
  cancelada: "bg-muted text-muted-foreground",
  rechazada: "bg-destructive/15 text-destructive",
  lista_espera: "bg-violet-500/15 text-violet-400",
};

const paymentStatusColors: Record<string, string> = {
  no_informado: "bg-muted text-muted-foreground",
  no_aplica: "bg-muted text-muted-foreground",
  pago_pendiente: "bg-amber-500/15 text-amber-400",
  pago_informado: "bg-amber-500/15 text-amber-400",
  pago_validado: "bg-emerald-500/15 text-emerald-400",
  pago_rechazado: "bg-destructive/15 text-destructive",
  parcial: "bg-sky-500/15 text-sky-400",
};

interface AdminEventReservationsProps {
  eventId: string;
  eventTitle: string;
  eventCurrency: string;
}

const AdminEventReservations = ({ eventId, eventTitle, eventCurrency }: AdminEventReservationsProps) => {
  const { toast } = useToast();
  const [reservations, setReservations] = useState<EventReservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterResStatus, setFilterResStatus] = useState("all");
  const [filterPayStatus, setFilterPayStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedRes, setSelectedRes] = useState<EventReservation | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadReservations = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("event_reservations" as any)
      .select("*, alumno:alumnos!event_reservations_alumno_id_fkey(nombre, apellido, email, telefono)")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false });
    if (data) setReservations(data as unknown as EventReservation[]);
    setLoading(false);
  };

  useEffect(() => { loadReservations(); }, [eventId]);

  const loadPayments = async (reservationId: string) => {
    const { data } = await supabase
      .from("reservation_payments" as any)
      .select("*")
      .eq("reservation_id", reservationId)
      .order("created_at", { ascending: false });
    if (data) setPayments(data as unknown as Payment[]);
  };

  const updateReservationStatus = async (resId: string, field: string, value: string) => {
    setUpdatingId(resId);
    const res = reservations.find(r => r.id === resId);
    if (!res) return;

    const updatePayload: any = { [field]: value };

    // Sync legacy estado field
    if (field === "reservation_status") {
      if (value === "reserva_confirmada") updatePayload.estado = "pago_confirmado";
      else if (value === "cancelada") updatePayload.estado = "cancelada";
    }
    if (field === "payment_status") {
      if (value === "pago_validado") {
        updatePayload.estado = "pago_confirmado";
        // Calculate new amount_paid from payments
      } else if (value === "pago_informado") {
        updatePayload.estado = "pendiente_verificacion";
      }
    }

    if (value === "reserva_confirmada") updatePayload.confirmed_at = new Date().toISOString();
    if (value === "cancelada") updatePayload.cancelled_at = new Date().toISOString();

    const { error } = await supabase
      .from("event_reservations" as any)
      .update(updatePayload)
      .eq("id", resId);

    if (error) {
      toast({ title: "Error al actualizar", variant: "destructive" });
    } else {
      // Log history
      await supabase.from("reservation_status_history" as any).insert({
        reservation_id: resId,
        old_reservation_status: field === "reservation_status" ? res.reservation_status : undefined,
        new_reservation_status: field === "reservation_status" ? value : undefined,
        old_payment_status: field === "payment_status" ? res.payment_status : undefined,
        new_payment_status: field === "payment_status" ? value : undefined,
        changed_by_role: "admin",
        note: `Admin cambió ${field} a ${value}`,
      } as any);

      toast({ title: "Estado actualizado" });
      loadReservations();
    }
    setUpdatingId(null);
  };

  const updateAdminNotes = async (resId: string, notes: string) => {
    await supabase
      .from("event_reservations" as any)
      .update({ admin_notes: notes, notas: notes } as any)
      .eq("id", resId);
    toast({ title: "Notas guardadas" });
    loadReservations();
  };

  const validatePayment = async (paymentId: string, status: "validado" | "rechazado") => {
    await supabase
      .from("reservation_payments" as any)
      .update({
        status,
        reviewed_at: new Date().toISOString(),
      } as any)
      .eq("id", paymentId);

    if (selectedRes && status === "validado") {
      // Sum all validated payments
      const { data: allPayments } = await supabase
        .from("reservation_payments" as any)
        .select("amount, status")
        .eq("reservation_id", selectedRes.id);

      const totalPaid = (allPayments as any[] || [])
        .filter((p: any) => p.status === "validado" || p.status === "informado")
        .reduce((sum: number, p: any) => sum + Number(p.amount), 0) + (status === "validado" ? 0 : 0);

      // Recalculate after this validation
      const validatedTotal = (allPayments as any[] || [])
        .filter((p: any) => p.status === "validado")
        .reduce((sum: number, p: any) => sum + Number(p.amount), 0);

      const currentPayment = payments.find(p => p.id === paymentId);
      const newValidatedTotal = validatedTotal + (currentPayment ? Number(currentPayment.amount) : 0);
      const balance = (selectedRes.amount_total || 0) - newValidatedTotal;

      await supabase
        .from("event_reservations" as any)
        .update({
          amount_paid: newValidatedTotal,
          balance_due: balance > 0 ? balance : 0,
          payment_status: balance <= 0 ? "pago_validado" : "parcial",
        } as any)
        .eq("id", selectedRes.id);
    }

    toast({ title: `Pago ${status === "validado" ? "validado" : "rechazado"}` });
    if (selectedRes) loadPayments(selectedRes.id);
    loadReservations();
  };

  const filtered = reservations.filter(r => {
    if (filterResStatus !== "all" && r.reservation_status !== filterResStatus) return false;
    if (filterPayStatus !== "all" && r.payment_status !== filterPayStatus) return false;
    if (search) {
      const s = search.toLowerCase();
      const name = `${r.alumno?.nombre || ""} ${r.alumno?.apellido || ""}`.toLowerCase();
      const email = (r.alumno?.email || "").toLowerCase();
      if (!name.includes(s) && !email.includes(s)) return false;
    }
    return true;
  });

  const stats = {
    total: reservations.length,
    confirmed: reservations.filter(r => r.reservation_status === "reserva_confirmada").length,
    pending: reservations.filter(r => ["solicitud_enviada", "reserva_pendiente"].includes(r.reservation_status)).length,
    paymentPending: reservations.filter(r => r.payment_status === "pago_informado").length,
  };

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="glass-card rounded-xl p-3 text-center">
          <p className="text-2xl font-heading font-bold text-foreground">{stats.total}</p>
          <p className="text-xs text-muted-foreground">Total reservas</p>
        </div>
        <div className="glass-card rounded-xl p-3 text-center">
          <p className="text-2xl font-heading font-bold text-emerald-400">{stats.confirmed}</p>
          <p className="text-xs text-muted-foreground">Confirmadas</p>
        </div>
        <div className="glass-card rounded-xl p-3 text-center">
          <p className="text-2xl font-heading font-bold text-amber-400">{stats.pending}</p>
          <p className="text-xs text-muted-foreground">Pendientes</p>
        </div>
        <div className="glass-card rounded-xl p-3 text-center">
          <p className="text-2xl font-heading font-bold text-sky-400">{stats.paymentPending}</p>
          <p className="text-xs text-muted-foreground">Pagos a validar</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex-1 min-w-[200px]">
          <Input
            placeholder="Buscar alumno..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9"
          />
        </div>
        <Select value={filterResStatus} onValueChange={setFilterResStatus}>
          <SelectTrigger className="w-[160px] h-9">
            <SelectValue placeholder="Estado reserva" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {Object.entries(reservationStatusLabels).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterPayStatus} onValueChange={setFilterPayStatus}>
          <SelectTrigger className="w-[160px] h-9">
            <SelectValue placeholder="Estado pago" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {Object.entries(paymentStatusLabels).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={loadReservations}>
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-8 text-muted-foreground animate-pulse">Cargando reservas...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">No hay reservas que coincidan.</div>
      ) : (
        <div className="rounded-xl border border-border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Alumno</TableHead>
                <TableHead>Estado reserva</TableHead>
                <TableHead>Estado pago</TableHead>
                <TableHead>Monto</TableHead>
                <TableHead>Abonado</TableHead>
                <TableHead>Saldo</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium text-sm">{r.alumno?.nombre} {r.alumno?.apellido || ""}</p>
                      <p className="text-xs text-muted-foreground">{r.alumno?.email}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={r.reservation_status}
                      onValueChange={(v) => updateReservationStatus(r.id, "reservation_status", v)}
                    >
                      <SelectTrigger className="h-7 text-xs w-[140px]">
                        <Badge className={`text-[10px] ${reservationStatusColors[r.reservation_status] || ""}`}>
                          {reservationStatusLabels[r.reservation_status] || r.reservation_status}
                        </Badge>
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(reservationStatusLabels).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={r.payment_status}
                      onValueChange={(v) => updateReservationStatus(r.id, "payment_status", v)}
                    >
                      <SelectTrigger className="h-7 text-xs w-[130px]">
                        <Badge className={`text-[10px] ${paymentStatusColors[r.payment_status] || ""}`}>
                          {paymentStatusLabels[r.payment_status] || r.payment_status}
                        </Badge>
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(paymentStatusLabels).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-sm">
                    {r.amount_total != null ? formatPrice(r.amount_total, r.currency_snapshot || r.moneda || eventCurrency) : "-"}
                  </TableCell>
                  <TableCell className="text-sm text-emerald-400">
                    {r.amount_paid > 0 ? formatPrice(r.amount_paid, r.currency_snapshot || r.moneda || eventCurrency) : "-"}
                  </TableCell>
                  <TableCell className="text-sm text-amber-400">
                    {r.balance_due != null && r.balance_due > 0 ? formatPrice(r.balance_due, r.currency_snapshot || r.moneda || eventCurrency) : "-"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleDateString("es-AR", { day: "numeric", month: "short" })}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedRes(r);
                        loadPayments(r.id);
                      }}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!selectedRes} onOpenChange={(open) => !open && setSelectedRes(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalle de reserva</DialogTitle>
            <DialogDescription>
              {selectedRes?.alumno?.nombre} {selectedRes?.alumno?.apellido || ""} — {selectedRes?.alumno?.email}
            </DialogDescription>
          </DialogHeader>
          {selectedRes && (
            <div className="space-y-4">
              {/* Contact */}
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Teléfono</p>
                  <p>{selectedRes.alumno?.telefono || "No informado"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Método</p>
                  <p className="capitalize">{selectedRes.metodo_pago}</p>
                </div>
              </div>

              {/* Notes */}
              {selectedRes.participant_notes && (
                <div className="p-3 rounded-lg bg-muted/40 text-sm">
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Observaciones del alumno:</p>
                  <p>{selectedRes.participant_notes}</p>
                </div>
              )}

              {/* Admin notes */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">Notas del equipo:</p>
                <Textarea
                  defaultValue={selectedRes.admin_notes || selectedRes.notas || ""}
                  placeholder="Agregar notas internas..."
                  rows={2}
                  onBlur={(e) => updateAdminNotes(selectedRes.id, e.target.value)}
                />
              </div>

              {/* Payments */}
              <div className="space-y-2">
                <h4 className="font-heading font-semibold text-sm">Pagos informados</h4>
                {payments.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sin pagos registrados.</p>
                ) : (
                  <div className="space-y-2">
                    {payments.map((p) => (
                      <div key={p.id} className="glass-card rounded-lg p-3 space-y-2">
                        <div className="flex justify-between items-center">
                          <div>
                            <p className="text-sm font-semibold">
                              {formatPrice(p.amount, p.currency)} — <span className="capitalize">{p.payment_method}</span>
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(p.payment_date + "T12:00:00").toLocaleDateString("es-AR")}
                              {p.payment_reference && ` · Ref: ${p.payment_reference}`}
                            </p>
                          </div>
                          <Badge className={`text-[10px] ${paymentStatusColors[p.status] || ""}`}>
                            {p.status}
                          </Badge>
                        </div>
                        {p.notes && <p className="text-xs text-muted-foreground">{p.notes}</p>}
                        {p.status === "informado" && (
                          <div className="flex gap-2">
                            <Button size="sm" variant="default" className="text-xs h-7" onClick={() => validatePayment(p.id, "validado")}>
                              <CheckCircle className="w-3 h-3 mr-1" /> Validar
                            </Button>
                            <Button size="sm" variant="destructive" className="text-xs h-7" onClick={() => validatePayment(p.id, "rechazado")}>
                              <XCircle className="w-3 h-3 mr-1" /> Rechazar
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminEventReservations;
