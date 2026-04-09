import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { formatPrice } from "@/lib/currency";
import {
  Search, CheckCircle, XCircle, Clock, AlertCircle, Eye,
  CreditCard, Users, CalendarDays, Banknote, ArrowUpDown,
  RefreshCw, Loader2, UserPlus, MessageCircle, Mail,
  ChevronRight, DollarSign, FileText, MoreHorizontal,
} from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

/* ─── Types ─── */

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
  cancelled_at: string | null;
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

interface AlumnoOption {
  id: string;
  nombre: string;
  apellido: string | null;
  email: string;
}

/* ─── Status mappings ─── */

const reservationStatusLabels: Record<string, string> = {
  solicitud_enviada: "Pre reserva",
  reserva_pendiente: "Pre reserva",
  reserva_confirmada: "Confirmada",
  cancelada: "Cancelada",
  rechazada: "Cancelada",
  lista_espera: "Lista de espera",
};

const paymentStatusLabels: Record<string, string> = {
  no_informado: "No informado",
  no_aplica: "N/A",
  pago_pendiente: "Pendiente",
  pago_informado: "Informado - Revisar",
  pago_validado: "Pagado",
  pago_rechazado: "Rechazado",
  parcial: "Parcial",
};

const reservationStatusColors: Record<string, string> = {
  solicitud_enviada: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  reserva_pendiente: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  reserva_confirmada: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  cancelada: "bg-muted text-muted-foreground border-border",
  rechazada: "bg-destructive/15 text-destructive border-destructive/30",
  lista_espera: "bg-violet-500/15 text-violet-500 border-violet-500/30",
};

const paymentStatusColors: Record<string, string> = {
  no_informado: "bg-muted text-muted-foreground border-border",
  no_aplica: "bg-muted text-muted-foreground border-border",
  pago_pendiente: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  pago_informado: "bg-orange-500/15 text-orange-500 border-orange-500/30",
  pago_validado: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  pago_rechazado: "bg-destructive/15 text-destructive border-destructive/30",
  parcial: "bg-sky-500/15 text-sky-500 border-sky-500/30",
};

/* ─── Props ─── */

interface AdminEventReservationsProps {
  eventId: string;
  eventTitle: string;
  eventCurrency: string;
  eventPrice?: number | null;
  eventNature?: string;
  eventMetadata?: Record<string, any>;
  eventDate?: string;
  eventLocation?: string | null;
  eventMaxCapacity?: number | null;
  eventStatus?: string;
}

/* ─── Sort ─── */
type SortKey = "name" | "date" | "balance" | "payment_status";

/* ─── Quick filters ─── */
type QuickFilter = "all" | "con_deuda" | "pago_informado" | "sin_revisar" | "confirmados" | "pendientes";

const quickFilters: { key: QuickFilter; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "con_deuda", label: "Con deuda" },
  { key: "pago_informado", label: "Pago informado" },
  { key: "pendientes", label: "Pendientes" },
  { key: "confirmados", label: "Confirmados" },
];

/* ─── Component ─── */

const AdminEventReservations = ({
  eventId, eventTitle, eventCurrency, eventPrice, eventNature, eventMetadata,
  eventDate, eventLocation, eventMaxCapacity, eventStatus,
}: AdminEventReservationsProps) => {
  const { toast } = useToast();
  const [reservations, setReservations] = useState<EventReservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [filterResStatus, setFilterResStatus] = useState("all");
  const [filterPayStatus, setFilterPayStatus] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortAsc, setSortAsc] = useState(false);

  // Detail drawer
  const [selectedRes, setSelectedRes] = useState<EventReservation | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);

  // Add student
  const [showAddStudent, setShowAddStudent] = useState(false);
  const [studentSearch, setStudentSearch] = useState("");
  const [studentResults, setStudentResults] = useState<AlumnoOption[]>([]);
  const [searchingStudents, setSearchingStudents] = useState(false);
  const [addingStudent, setAddingStudent] = useState<string | null>(null);

  // Admin payment
  const [showAdminPayment, setShowAdminPayment] = useState(false);
  const [adminPayAmount, setAdminPayAmount] = useState("");
  const [adminPayDate, setAdminPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [adminPayMethod, setAdminPayMethod] = useState("efectivo");
  const [adminPayRef, setAdminPayRef] = useState("");
  const [adminPayNotes, setAdminPayNotes] = useState("");
  const [submittingAdminPay, setSubmittingAdminPay] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const installments = eventMetadata?.installments_enabled ? (eventMetadata?.installments || []) : [];

  /* ─── Data loading ─── */

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

  /* ─── Stats ─── */

  const stats = useMemo(() => {
    const active = reservations.filter(r => r.reservation_status !== "cancelada" && r.reservation_status !== "rechazada");
    return {
      total: reservations.length,
      confirmed: reservations.filter(r => r.reservation_status === "reserva_confirmada").length,
      pending: reservations.filter(r => ["solicitud_enviada", "reserva_pendiente", "lista_espera"].includes(r.reservation_status)).length,
      totalCobrado: active.reduce((s, r) => s + (r.amount_paid || 0), 0),
      saldoPendiente: active.reduce((s, r) => s + Math.max(0, (r.balance_due ?? ((r.amount_total || 0) - (r.amount_paid || 0)))), 0),
      pagosARevisar: reservations.filter(r => r.payment_status === "pago_informado").length,
    };
  }, [reservations]);

  /* ─── Filtering + Sorting ─── */

  const filtered = useMemo(() => {
    let list = reservations.filter(r => {
      if (filterResStatus !== "all" && r.reservation_status !== filterResStatus) return false;
      if (filterPayStatus !== "all" && r.payment_status !== filterPayStatus) return false;
      if (search) {
        const s = search.toLowerCase();
        const name = `${r.alumno?.nombre || ""} ${r.alumno?.apellido || ""}`.toLowerCase();
        const email = (r.alumno?.email || "").toLowerCase();
        if (!name.includes(s) && !email.includes(s)) return false;
      }
      // Quick filters
      if (quickFilter === "con_deuda") {
        const bal = r.balance_due ?? ((r.amount_total || 0) - (r.amount_paid || 0));
        if (bal <= 0) return false;
      }
      if (quickFilter === "pago_informado" && r.payment_status !== "pago_informado") return false;
      if (quickFilter === "sin_revisar" && r.payment_status !== "pago_informado") return false;
      if (quickFilter === "confirmados" && r.reservation_status !== "reserva_confirmada") return false;
      if (quickFilter === "pendientes" && !["solicitud_enviada", "reserva_pendiente"].includes(r.reservation_status)) return false;
      return true;
    });

    // Sort
    list.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name":
          cmp = `${a.alumno?.nombre || ""} ${a.alumno?.apellido || ""}`.localeCompare(`${b.alumno?.nombre || ""} ${b.alumno?.apellido || ""}`);
          break;
        case "date":
          cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
        case "balance": {
          const balA = a.balance_due ?? ((a.amount_total || 0) - (a.amount_paid || 0));
          const balB = b.balance_due ?? ((b.amount_total || 0) - (b.amount_paid || 0));
          cmp = balA - balB;
          break;
        }
        case "payment_status":
          cmp = (a.payment_status || "").localeCompare(b.payment_status || "");
          break;
      }
      return sortAsc ? cmp : -cmp;
    });

    return list;
  }, [reservations, filterResStatus, filterPayStatus, search, quickFilter, sortKey, sortAsc]);

  /* ─── Actions ─── */

  const searchStudents = async (q: string) => {
    if (q.length < 2) { setStudentResults([]); return; }
    setSearchingStudents(true);
    const { data } = await supabase
      .from("alumnos")
      .select("id, nombre, apellido, email")
      .or(`nombre.ilike.%${q}%,apellido.ilike.%${q}%,email.ilike.%${q}%`)
      .limit(10);
    const existingIds = new Set(reservations.map(r => r.alumno_id));
    setStudentResults((data || []).filter(a => !existingIds.has(a.id)) as AlumnoOption[]);
    setSearchingStudents(false);
  };

  const addStudentToEvent = async (alumno: AlumnoOption) => {
    setAddingStudent(alumno.id);
    const isInscriptionOnly = eventNature === "propio_solo_inscripcion";
    const isPaid = eventPrice != null && eventPrice > 0;
    const paymentStatus = isInscriptionOnly || !isPaid ? "no_aplica" : "no_informado";

    const { error } = await supabase
      .from("event_reservations" as any)
      .insert({
        event_id: eventId,
        alumno_id: alumno.id,
        reservation_status: "reserva_confirmada",
        payment_status: paymentStatus,
        estado: "reserva_confirmada",
        metodo_pago: isInscriptionOnly ? "no_aplica" : "pendiente",
        amount_total: eventPrice,
        price_snapshot: eventPrice,
        currency_snapshot: eventCurrency,
        moneda: eventCurrency,
        monto: eventPrice,
        balance_due: isInscriptionOnly || !isPaid ? 0 : eventPrice,
        created_by: "admin",
        confirmed_at: new Date().toISOString(),
      } as any);

    if (error) {
      if (error.code === "23505") {
        toast({ title: "Este alumno ya tiene una reserva en este evento.", variant: "destructive" });
      } else {
        toast({ title: "Error al agregar", description: error.message, variant: "destructive" });
      }
    } else {
      toast({ title: `${alumno.nombre} ${alumno.apellido || ""} agregado al evento` });
      loadReservations();
      setStudentResults(prev => prev.filter(s => s.id !== alumno.id));
    }
    setAddingStudent(null);
  };

  const updateReservationStatus = async (resId: string, field: string, value: string) => {
    setUpdatingId(resId);
    const res = reservations.find(r => r.id === resId);
    if (!res) return;

    const updatePayload: any = { [field]: value };
    if (field === "reservation_status") {
      if (value === "reserva_confirmada") updatePayload.estado = "pago_confirmado";
      else if (value === "cancelada") updatePayload.estado = "cancelada";
    }
    if (field === "payment_status") {
      if (value === "pago_validado") updatePayload.estado = "pago_confirmado";
      else if (value === "pago_informado") updatePayload.estado = "pendiente_verificacion";
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
      if (selectedRes?.id === resId) {
        setSelectedRes(prev => prev ? { ...prev, [field]: value } : null);
      }
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

  const registerAdminPayment = async () => {
    if (!selectedRes || !adminPayAmount || parseFloat(adminPayAmount) <= 0) {
      toast({ title: "Ingresá un monto válido.", variant: "destructive" });
      return;
    }
    setSubmittingAdminPay(true);
    const amt = parseFloat(adminPayAmount);
    const curr = selectedRes.currency_snapshot || selectedRes.moneda || eventCurrency;

    const { error: payErr } = await supabase
      .from("reservation_payments" as any)
      .insert({
        reservation_id: selectedRes.id,
        alumno_id: selectedRes.alumno_id,
        amount: amt,
        currency: curr,
        payment_date: adminPayDate,
        payment_method: adminPayMethod,
        payment_reference: adminPayRef.trim() || null,
        notes: adminPayNotes.trim() || null,
        status: "validado",
        reviewed_at: new Date().toISOString(),
      } as any);

    if (payErr) {
      toast({ title: "Error al registrar pago", description: payErr.message, variant: "destructive" });
      setSubmittingAdminPay(false);
      return;
    }

    const newPaid = (selectedRes.amount_paid || 0) + amt;
    const newBalance = Math.max(0, (selectedRes.amount_total || 0) - newPaid);
    const newPaymentStatus = newBalance <= 0 ? "pago_validado" : "parcial";

    let nextDue: string | null = null;
    if (installments.length > 0 && newBalance > 0) {
      let accumulated = 0;
      for (const inst of installments) {
        accumulated += parseFloat(inst.amount || "0");
        if (accumulated > newPaid && inst.due_date) { nextDue = inst.due_date; break; }
      }
    }

    await supabase
      .from("event_reservations" as any)
      .update({
        amount_paid: newPaid,
        balance_due: newBalance,
        payment_status: newPaymentStatus,
        estado: newPaymentStatus === "pago_validado" ? "pago_confirmado" : "pendiente_verificacion",
        next_due_date: nextDue,
      } as any)
      .eq("id", selectedRes.id);

    await supabase.from("reservation_status_history" as any).insert({
      reservation_id: selectedRes.id,
      old_payment_status: selectedRes.payment_status,
      new_payment_status: newPaymentStatus,
      changed_by_role: "admin",
      note: `Pago registrado por admin: ${formatPrice(amt, curr)} via ${adminPayMethod}`,
    } as any);

    setSubmittingAdminPay(false);
    setShowAdminPayment(false);
    setAdminPayAmount("");
    setAdminPayRef("");
    setAdminPayNotes("");
    toast({ title: "Pago registrado y validado" });
    loadPayments(selectedRes.id);
    loadReservations();
  };

  const validatePayment = async (paymentId: string, status: "validado" | "rechazado") => {
    await supabase
      .from("reservation_payments" as any)
      .update({ status, reviewed_at: new Date().toISOString() } as any)
      .eq("id", paymentId);

    if (selectedRes && status === "validado") {
      const { data: allPayments } = await supabase
        .from("reservation_payments" as any)
        .select("amount, status")
        .eq("reservation_id", selectedRes.id);

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

  /* ─── Helpers ─── */

  const curr = (r: EventReservation) => r.currency_snapshot || r.moneda || eventCurrency;
  const fmtMoney = (amount: number | null | undefined, currency: string) => {
    if (amount == null || amount === 0) return formatPrice(0, currency);
    return formatPrice(amount, currency);
  };

  const getWhatsAppUrl = (telefono: string | null | undefined, nombre: string) => {
    if (!telefono) return null;
    let num = telefono.replace(/[\s\-\(\)\.]/g, "");
    if (num.startsWith("+")) num = num.slice(1);
    if (!num.startsWith("549")) {
      if (num.startsWith("0")) num = num.slice(1);
      if (num.startsWith("15")) num = num.slice(2);
      num = "549" + num;
    }
    const msg = encodeURIComponent(`Hola ${nombre}, te contactamos desde Reybaud Ciclismo`);
    return `https://wa.me/${num}?text=${msg}`;
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  };

  const openDetail = (r: EventReservation) => {
    setSelectedRes(r);
    setShowAdminPayment(false);
    loadPayments(r.id);
  };

  /* ─── Priority indicators ─── */
  const getRowPriority = (r: EventReservation) => {
    if (r.payment_status === "pago_informado") return "border-l-4 border-l-orange-500";
    const bal = r.balance_due ?? ((r.amount_total || 0) - (r.amount_paid || 0));
    if (bal > 0 && r.reservation_status === "reserva_confirmada") return "border-l-4 border-l-amber-500";
    if (r.reservation_status === "cancelada" || r.reservation_status === "rechazada") return "opacity-60";
    return "";
  };

  return (
    <div className="space-y-5">
      {/* ─── Event Summary ─── */}
      {(eventDate || eventLocation || eventMaxCapacity != null) && (
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground px-1">
          {eventDate && (
            <span className="flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5" />
              {new Date(eventDate + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" })}
            </span>
          )}
          {eventLocation && <span>{eventLocation}</span>}
          {eventMaxCapacity != null && (
            <span className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" />
              {reservations.length}/{eventMaxCapacity} cupos
            </span>
          )}
          {eventStatus && (
            <Badge variant="outline" className="text-[10px]">{eventStatus}</Badge>
          )}
        </div>
      )}

      {/* ─── Stats Cards ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard label="Total reservas" value={stats.total} icon={<Users className="w-4 h-4" />} />
        <StatCard label="Confirmadas" value={stats.confirmed} color="text-emerald-500" icon={<CheckCircle className="w-4 h-4" />} />
        <StatCard label="Pendientes" value={stats.pending} color="text-amber-500" icon={<Clock className="w-4 h-4" />} />
        <StatCard label="Total cobrado" value={formatPrice(stats.totalCobrado, eventCurrency)} color="text-emerald-500" icon={<DollarSign className="w-4 h-4" />} />
        <StatCard label="Saldo pendiente" value={formatPrice(stats.saldoPendiente, eventCurrency)} color="text-amber-500" icon={<Banknote className="w-4 h-4" />} />
      </div>

      {/* ─── Quick Filter Chips ─── */}
      <div className="flex flex-wrap items-center gap-2">
        {quickFilters.map(f => (
          <button
            key={f.key}
            onClick={() => setQuickFilter(f.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              quickFilter === f.key
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted/60 text-muted-foreground hover:bg-muted"
            }`}
          >
            {f.label}
            {f.key !== "all" && (
              <span className="ml-1.5 opacity-70">
                {f.key === "con_deuda" ? reservations.filter(r => { const b = r.balance_due ?? ((r.amount_total||0)-(r.amount_paid||0)); return b > 0; }).length
                  : f.key === "pago_informado" ? stats.pagosARevisar
                  : f.key === "pendientes" ? stats.pending
                  : f.key === "confirmados" ? stats.confirmed
                  : ""}
              </span>
            )}
          </button>
        ))}
        {stats.pagosARevisar > 0 && (
          <span className="ml-auto text-xs text-orange-500 font-medium flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5" /> {stats.pagosARevisar} pagos por revisar
          </span>
        )}
      </div>

      {/* ─── Search + Filters Bar ─── */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar alumno por nombre o email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-10"
          />
        </div>
        <Select value={filterResStatus} onValueChange={setFilterResStatus}>
          <SelectTrigger className="w-[150px] h-10">
            <SelectValue placeholder="Reserva" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las reservas</SelectItem>
            {Object.entries(reservationStatusLabels).filter(([k], i, arr) => arr.findIndex(([k2]) => reservationStatusLabels[k2] === reservationStatusLabels[k]) === i).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterPayStatus} onValueChange={setFilterPayStatus}>
          <SelectTrigger className="w-[150px] h-10">
            <SelectValue placeholder="Pago" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los pagos</SelectItem>
            {Object.entries(paymentStatusLabels).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="ghost" size="icon" onClick={loadReservations} className="h-10 w-10">
          <RefreshCw className="w-4 h-4" />
        </Button>
        <Button variant="outline" size="sm" className="h-10" onClick={() => { setShowAddStudent(true); setStudentSearch(""); setStudentResults([]); }}>
          <UserPlus className="w-4 h-4 mr-1.5" /> Agregar
        </Button>
      </div>

      {/* ─── Add Student Dialog ─── */}
      <Dialog open={showAddStudent} onOpenChange={setShowAddStudent}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Agregar alumno al evento</DialogTitle>
            <DialogDescription>Buscá un alumno por nombre o email para inscribirlo.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Buscar por nombre o email..."
              value={studentSearch}
              onChange={(e) => { setStudentSearch(e.target.value); searchStudents(e.target.value); }}
              autoFocus
            />
            {searchingStudents && <p className="text-xs text-muted-foreground animate-pulse">Buscando...</p>}
            {studentResults.length > 0 && (
              <div className="max-h-[250px] overflow-y-auto space-y-1">
                {studentResults.map((a) => (
                  <div key={a.id} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-muted/50">
                    <div>
                      <p className="text-sm font-medium">{a.nombre} {a.apellido || ""}</p>
                      <p className="text-xs text-muted-foreground">{a.email}</p>
                    </div>
                    <Button size="sm" variant="outline" disabled={addingStudent === a.id} onClick={() => addStudentToEvent(a)}>
                      {addingStudent === a.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserPlus className="w-3 h-3" />}
                    </Button>
                  </div>
                ))}
              </div>
            )}
            {studentSearch.length >= 2 && !searchingStudents && studentResults.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-3">No se encontraron alumnos.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Reservations List ─── */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground animate-pulse">
          <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin" />
          Cargando reservas...
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No hay reservas que coincidan.</p>
        </div>
      ) : (
        <div className="space-y-0">
          {/* Column headers */}
          <div className="hidden md:grid md:grid-cols-[1fr_130px_130px_90px_90px_80px_44px] gap-2 px-4 py-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wider border-b border-border">
            <button className="flex items-center gap-1 hover:text-foreground text-left" onClick={() => toggleSort("name")}>
              Alumno <ArrowUpDown className="w-3 h-3" />
            </button>
            <span>Reserva</span>
            <span>Pago</span>
            <button className="flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort("balance")}>
              Abonado <ArrowUpDown className="w-3 h-3" />
            </button>
            <span>Saldo</span>
            <button className="flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort("date")}>
              Fecha <ArrowUpDown className="w-3 h-3" />
            </button>
            <span></span>
          </div>

          {/* Rows */}
          <div className="divide-y divide-border">
            {filtered.map((r) => {
              const bal = r.balance_due ?? ((r.amount_total || 0) - (r.amount_paid || 0));
              const c = curr(r);
              const waUrl = getWhatsAppUrl(r.alumno?.telefono, r.alumno?.nombre || "");
              return (
                <div
                  key={r.id}
                  className={`group px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer ${getRowPriority(r)}`}
                  onClick={() => openDetail(r)}
                >
                  {/* Desktop row */}
                  <div className="hidden md:grid md:grid-cols-[1fr_130px_130px_90px_90px_80px_44px] gap-2 items-center">
                    {/* Alumno */}
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{r.alumno?.nombre} {r.alumno?.apellido || ""}</p>
                      <p className="text-xs text-muted-foreground truncate">{r.alumno?.email}</p>
                    </div>
                    {/* Estado reserva */}
                    <div>
                      <Badge variant="outline" className={`text-[10px] border ${reservationStatusColors[r.reservation_status] || ""}`}>
                        {reservationStatusLabels[r.reservation_status] || r.reservation_status}
                      </Badge>
                    </div>
                    {/* Estado pago */}
                    <div>
                      <Badge variant="outline" className={`text-[10px] border ${paymentStatusColors[r.payment_status] || ""}`}>
                        {paymentStatusLabels[r.payment_status] || r.payment_status}
                      </Badge>
                    </div>
                    {/* Abonado */}
                    <p className="text-sm text-emerald-500 font-medium">{fmtMoney(r.amount_paid, c)}</p>
                    {/* Saldo */}
                    <p className={`text-sm font-medium ${bal > 0 ? "text-amber-500" : "text-muted-foreground"}`}>
                      {fmtMoney(bal, c)}
                    </p>
                    {/* Fecha */}
                    <p className="text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString("es-AR", { day: "numeric", month: "short" })}
                    </p>
                    {/* Actions */}
                    <div onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openDetail(r)}>
                            <Eye className="w-3.5 h-3.5 mr-2" /> Ver detalle
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => { openDetail(r); setTimeout(() => setShowAdminPayment(true), 100); }}>
                            <Banknote className="w-3.5 h-3.5 mr-2" /> Registrar pago
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {waUrl && (
                            <DropdownMenuItem asChild>
                              <a href={waUrl} target="_blank" rel="noopener noreferrer">
                                <MessageCircle className="w-3.5 h-3.5 mr-2" /> WhatsApp
                              </a>
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem asChild>
                            <a href={`mailto:${r.alumno?.email}`}>
                              <Mail className="w-3.5 h-3.5 mr-2" /> Enviar email
                            </a>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  {/* Mobile card */}
                  <div className="md:hidden space-y-2">
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{r.alumno?.nombre} {r.alumno?.apellido || ""}</p>
                        <p className="text-xs text-muted-foreground truncate">{r.alumno?.email}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="outline" className={`text-[10px] border ${reservationStatusColors[r.reservation_status] || ""}`}>
                        {reservationStatusLabels[r.reservation_status] || r.reservation_status}
                      </Badge>
                      <Badge variant="outline" className={`text-[10px] border ${paymentStatusColors[r.payment_status] || ""}`}>
                        {paymentStatusLabels[r.payment_status] || r.payment_status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-xs">
                      <span className="text-emerald-500">Abonado: {fmtMoney(r.amount_paid, c)}</span>
                      {bal > 0 && <span className="text-amber-500">Saldo: {fmtMoney(bal, c)}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Detail Drawer ─── */}
      <Sheet open={!!selectedRes} onOpenChange={(open) => { if (!open) { setSelectedRes(null); setShowAdminPayment(false); } }}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader className="pb-4">
            <SheetTitle className="text-lg">
              {selectedRes?.alumno?.nombre} {selectedRes?.alumno?.apellido || ""}
            </SheetTitle>
            <SheetDescription>{selectedRes?.alumno?.email}</SheetDescription>
          </SheetHeader>

          {selectedRes && (
            <div className="space-y-6 pb-8">
              {/* Quick actions */}
              <div className="flex flex-wrap gap-2">
                {(() => {
                  const waUrl = getWhatsAppUrl(selectedRes.alumno?.telefono, selectedRes.alumno?.nombre || "");
                  return waUrl ? (
                    <Button variant="outline" size="sm" asChild>
                      <a href={waUrl} target="_blank" rel="noopener noreferrer">
                        <MessageCircle className="w-3.5 h-3.5 mr-1.5" /> WhatsApp
                      </a>
                    </Button>
                  ) : null;
                })()}
                <Button variant="outline" size="sm" asChild>
                  <a href={`mailto:${selectedRes.alumno?.email}`}>
                    <Mail className="w-3.5 h-3.5 mr-1.5" /> Email
                  </a>
                </Button>
              </div>

              {/* Status controls */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Estado reserva</Label>
                  <Select
                    value={selectedRes.reservation_status}
                    onValueChange={(v) => updateReservationStatus(selectedRes.id, "reservation_status", v)}
                  >
                    <SelectTrigger className="h-9">
                      <Badge variant="outline" className={`text-[10px] border ${reservationStatusColors[selectedRes.reservation_status] || ""}`}>
                        {reservationStatusLabels[selectedRes.reservation_status] || selectedRes.reservation_status}
                      </Badge>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="solicitud_enviada">Pre reserva</SelectItem>
                      <SelectItem value="reserva_confirmada">Confirmada</SelectItem>
                      <SelectItem value="lista_espera">Lista de espera</SelectItem>
                      <SelectItem value="cancelada">Cancelada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Estado pago</Label>
                  <Select
                    value={selectedRes.payment_status}
                    onValueChange={(v) => updateReservationStatus(selectedRes.id, "payment_status", v)}
                  >
                    <SelectTrigger className="h-9">
                      <Badge variant="outline" className={`text-[10px] border ${paymentStatusColors[selectedRes.payment_status] || ""}`}>
                        {paymentStatusLabels[selectedRes.payment_status] || selectedRes.payment_status}
                      </Badge>
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(paymentStatusLabels).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Financial summary */}
              <div className="rounded-xl border border-border p-4 space-y-3">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Resumen financiero</h4>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-lg font-bold text-foreground">{fmtMoney(selectedRes.amount_total, curr(selectedRes))}</p>
                    <p className="text-[10px] text-muted-foreground">Total</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-emerald-500">{fmtMoney(selectedRes.amount_paid, curr(selectedRes))}</p>
                    <p className="text-[10px] text-muted-foreground">Abonado</p>
                  </div>
                  <div>
                    <p className={`text-lg font-bold ${(selectedRes.balance_due ?? 0) > 0 ? "text-amber-500" : "text-muted-foreground"}`}>
                      {fmtMoney(selectedRes.balance_due ?? ((selectedRes.amount_total || 0) - (selectedRes.amount_paid || 0)), curr(selectedRes))}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Saldo</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Método: <span className="capitalize">{selectedRes.metodo_pago}</span>
                </p>
              </div>

              {/* Dates / timeline */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Cronología</h4>
                <div className="space-y-1.5 text-xs">
                  <TimelineItem label="Reserva creada" date={selectedRes.created_at} />
                  {selectedRes.confirmed_at && <TimelineItem label="Confirmada" date={selectedRes.confirmed_at} color="text-emerald-500" />}
                  {selectedRes.cancelled_at && <TimelineItem label="Cancelada" date={selectedRes.cancelled_at} color="text-destructive" />}
                  <TimelineItem label="Última actualización" date={selectedRes.updated_at} />
                </div>
              </div>

              {/* Participant notes */}
              {selectedRes.participant_notes && (
                <div className="rounded-lg bg-muted/40 p-3 space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground">Observaciones del alumno</p>
                  <p className="text-sm">{selectedRes.participant_notes}</p>
                </div>
              )}

              {/* Admin notes */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Notas internas del equipo</Label>
                <Textarea
                  defaultValue={selectedRes.admin_notes || selectedRes.notas || ""}
                  placeholder="Agregar notas internas..."
                  rows={2}
                  onBlur={(e) => updateAdminNotes(selectedRes.id, e.target.value)}
                />
              </div>

              {/* Installments */}
              {installments.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Plan de cuotas</h4>
                  <div className="space-y-1.5">
                    {installments.map((inst: any, idx: number) => {
                      const instAmount = parseFloat(inst.amount || "0");
                      const accBefore = installments.slice(0, idx).reduce((s: number, c: any) => s + (parseFloat(c.amount) || 0), 0);
                      const isPaid = (selectedRes.amount_paid || 0) >= accBefore + instAmount;
                      const isPartial = !isPaid && (selectedRes.amount_paid || 0) > accBefore;
                      const isOverdue = inst.due_date && new Date(inst.due_date) < new Date() && !isPaid;
                      return (
                        <div key={idx} className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-xs border ${
                          isPaid ? "bg-emerald-500/10 border-emerald-500/20" : isOverdue ? "bg-destructive/10 border-destructive/20" : "bg-muted/40 border-border/30"
                        }`}>
                          <div className="flex items-center gap-2">
                            {isPaid ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> : isOverdue ? <AlertCircle className="w-3.5 h-3.5 text-destructive" /> : <Clock className="w-3.5 h-3.5 text-muted-foreground" />}
                            <span className="font-medium">{inst.label || `Cuota ${idx + 1}`}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-semibold">{formatPrice(instAmount, eventCurrency)}</span>
                            {inst.due_date && (
                              <span className={isOverdue ? "text-destructive" : "text-muted-foreground"}>
                                Vence {new Date(inst.due_date + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "short" })}
                              </span>
                            )}
                            {isPaid && <span className="text-emerald-500 font-medium">Pagada</span>}
                            {isPartial && <span className="text-sky-500 font-medium">Parcial</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Payments section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pagos registrados</h4>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => {
                      setShowAdminPayment(!showAdminPayment);
                      setAdminPayAmount(selectedRes.balance_due?.toString() || "");
                    }}
                  >
                    <Banknote className="w-3.5 h-3.5 mr-1" /> Registrar pago
                  </Button>
                </div>

                {/* Admin payment form */}
                {showAdminPayment && (
                  <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 space-y-3">
                    <p className="text-xs font-semibold text-primary">Registrar pago (se valida automáticamente)</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">Monto *</Label>
                        <Input type="number" step="0.01" min="0" value={adminPayAmount} onChange={(e) => setAdminPayAmount(e.target.value)} className="h-9" placeholder="Ej: 50000" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">Fecha</Label>
                        <Input type="date" value={adminPayDate} onChange={(e) => setAdminPayDate(e.target.value)} className="h-9" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">Método</Label>
                        <Select value={adminPayMethod} onValueChange={setAdminPayMethod}>
                          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="efectivo">Efectivo</SelectItem>
                            <SelectItem value="transferencia">Transferencia</SelectItem>
                            <SelectItem value="mercadopago">MercadoPago</SelectItem>
                            <SelectItem value="tarjeta">Tarjeta</SelectItem>
                            <SelectItem value="plataforma_externa">Plataforma ext.</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">Referencia</Label>
                        <Input value={adminPayRef} onChange={(e) => setAdminPayRef(e.target.value)} className="h-9" placeholder="Nro transferencia..." />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Nota (opcional)</Label>
                      <Input value={adminPayNotes} onChange={(e) => setAdminPayNotes(e.target.value)} className="h-9" placeholder="Observaciones..." />
                    </div>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setShowAdminPayment(false)}>Cancelar</Button>
                      <Button variant="default" size="sm" disabled={submittingAdminPay} onClick={registerAdminPayment}>
                        {submittingAdminPay ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <CheckCircle className="w-3.5 h-3.5 mr-1" />}
                        Registrar y validar
                      </Button>
                    </div>
                  </div>
                )}

                {payments.length === 0 && !showAdminPayment ? (
                  <p className="text-xs text-muted-foreground py-2">Sin pagos registrados.</p>
                ) : (
                  <div className="space-y-2">
                    {payments.map((p) => (
                      <div key={p.id} className="rounded-lg border border-border p-3 space-y-2">
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
                          <Badge variant="outline" className={`text-[10px] border ${paymentStatusColors[p.status] || ""}`}>
                            {p.status}
                          </Badge>
                        </div>
                        {p.notes && <p className="text-xs text-muted-foreground">{p.notes}</p>}
                        {p.status === "informado" && (
                          <div className="flex gap-2">
                            <Button size="sm" variant="default" className="text-xs h-8" onClick={() => validatePayment(p.id, "validado")}>
                              <CheckCircle className="w-3 h-3 mr-1" /> Validar
                            </Button>
                            <Button size="sm" variant="destructive" className="text-xs h-8" onClick={() => validatePayment(p.id, "rechazado")}>
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
        </SheetContent>
      </Sheet>
    </div>
  );
};

/* ─── Sub-components ─── */

const StatCard = ({ label, value, color, icon }: { label: string; value: string | number; color?: string; icon?: React.ReactNode }) => (
  <div className="rounded-xl border border-border bg-card p-4 text-center space-y-1">
    <div className={`flex items-center justify-center gap-1.5 ${color || "text-foreground"}`}>
      {icon}
      <p className="text-xl font-bold font-heading">{value}</p>
    </div>
    <p className="text-[11px] text-muted-foreground">{label}</p>
  </div>
);

const TimelineItem = ({ label, date, color }: { label: string; date: string; color?: string }) => (
  <div className="flex items-center gap-2">
    <div className={`w-1.5 h-1.5 rounded-full ${color ? color.replace("text-", "bg-") : "bg-muted-foreground"}`} />
    <span className={color || "text-muted-foreground"}>{label}</span>
    <span className="text-muted-foreground ml-auto">
      {new Date(date).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" })}
      {" "}
      {new Date(date).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
    </span>
  </div>
);

export default AdminEventReservations;
