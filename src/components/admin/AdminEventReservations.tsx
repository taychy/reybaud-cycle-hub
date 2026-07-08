import { useEffect, useState, useMemo } from "react";
import { fetchPriceStages, resolveActivePrice, formatCountdown, type PriceStage } from "@/lib/priceStages";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { formatPrice } from "@/lib/currency";
import { getShareOrigin } from "@/lib/eventLinks";
import {
  Search, CheckCircle, XCircle, Clock, AlertCircle, Eye,
  CreditCard, Users, CalendarDays, Banknote, ArrowUpDown,
  RefreshCw, Loader2, UserPlus, MessageCircle, Mail,
  ChevronRight, DollarSign, FileText, MoreHorizontal,
  Send, Bell, History, Copy, Pencil, Ban, Trash2, Package,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

import TripSummary from "@/components/reservation/TripSummary";
import EventTripReports from "@/components/admin/EventTripReports";
import ValidatePaymentDrawer from "@/components/admin/ValidatePaymentDrawer";
import ReservationInstallmentsPanel from "@/components/admin/ReservationInstallmentsPanel";
import AdminChangePackageDialog from "@/components/admin/AdminChangePackageDialog";
import ReservationAddonsPanel from "@/components/admin/ReservationAddonsPanel";
import ReservationBasePriceEditor from "@/components/admin/ReservationBasePriceEditor";
import EditPaymentDrawer from "@/components/admin/EditPaymentDrawer";

/* ─── Types ─── */

interface EventReservation {
  id: string;
  event_id: string;
  alumno_id: string | null;
  external_participant_id: string | null;
  reservation_status: string;
  payment_status: string;
  amount_total: number | null;
  amount_paid: number;
  balance_due: number | null;
  moneda: string;
  price_snapshot: number | null;
  currency_snapshot: string | null;
  metodo_pago: string;
  notas: string | null;
  admin_notes: string | null;
  participant_notes: string | null;
  created_at: string;
  updated_at: string;
  confirmed_at: string | null;
  cancelled_at: string | null;
  access_token?: string;
  package_id?: string | null;
  alumno?: { nombre: string; apellido: string | null; email: string; telefono: string | null } | null;
  external_participant?: { id: string; nombre: string; apellido: string | null; email: string; telefono: string | null } | null;
}

interface Payment {
  id: string;
  reservation_id: string;
  amount: number;
  currency: string;
  original_amount: number | null;
  original_currency: string | null;
  event_currency: string | null;
  exchange_rate_to_event_currency: number | null;
  equivalent_amount_event_currency: number | null;
  manual_override: boolean;
  review_action: string | null;
  review_notes: string | null;
  payment_date: string;
  payment_method: string;
  payment_reference: string | null;
  notes: string | null;
  proof_url: string | null;
  status: string;
  created_at: string;
  installment_id: string | null;
  installment_number: number | null;
  anulado_at: string | null;
  anulado_por: string | null;
  anulado_motivo: string | null;
}

interface AlumnoOption {
  id: string;
  nombre: string;
  apellido: string | null;
  email: string;
}

interface Notification {
  id: string;
  tipo: string;
  canal: string;
  asunto: string;
  contenido: string;
  enviado_por_email: string | null;
  metadata: Record<string, any>;
  created_at: string;
}

type NotifTemplateKey = "pago_registrado" | "plan_pagos" | "cuota_pendiente" | "cuota_proxima" | "cuota_pago_mp" | "novedad" | "recordatorio_checklist";

/** Construye texto + HTML con el plan de pagos a partir de las cuotas materializadas. */
const buildPlanPagos = (
  insts: any[],
  currency: string,
): { text: string; html: string; hasPlan: boolean } => {
  if (!Array.isArray(insts) || insts.length === 0) {
    return { text: "", html: "", hasPlan: false };
  }
  const fmtDate = (d: string | null | undefined) =>
    d ? new Date(d + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "a coordinar";
  const statusLabel: Record<string, string> = {
    pagada: "Pagada", pagado: "Pagada",
    parcial: "Parcial",
    pendiente: "Pendiente",
    vencida: "Vencida",
    condonada: "Condonada",
  };
  const statusColor: Record<string, string> = {
    pagada: "#059669", pagado: "#059669",
    parcial: "#2563eb",
    pendiente: "#6b7280",
    vencida: "#dc2626",
    condonada: "#9ca3af",
  };
  const lines = insts.map((i: any) => {
    const label = i.label || `Cuota ${i.installment_number || ""}`.trim();
    const amount = formatPrice(parseFloat(i.amount || 0), currency);
    const venc = fmtDate(i.due_date);
    const est = statusLabel[i.status] || i.status || "Pendiente";
    const saldo = i.balance_due != null && i.balance_due > 0 && i.status !== "pagada" && i.status !== "pagado"
      ? ` — saldo ${formatPrice(parseFloat(i.balance_due), currency)}`
      : "";
    return `• ${label}: ${amount} — vence ${venc} — ${est}${saldo}`;
  });
  const text = `\n\nPlan de pagos:\n${lines.join("\n")}`;
  const rows = insts.map((i: any) => {
    const label = i.label || `Cuota ${i.installment_number || ""}`.trim();
    const amount = formatPrice(parseFloat(i.amount || 0), currency);
    const venc = fmtDate(i.due_date);
    const est = statusLabel[i.status] || i.status || "Pendiente";
    const color = statusColor[i.status] || "#6b7280";
    const saldoCell = i.balance_due != null && i.balance_due > 0 && i.status !== "pagada" && i.status !== "pagado"
      ? formatPrice(parseFloat(i.balance_due), currency)
      : "—";
    return `<tr><td style="padding:6px 8px;border:1px solid #e5e7eb">${label}</td><td style="padding:6px 8px;border:1px solid #e5e7eb;text-align:right">${amount}</td><td style="padding:6px 8px;border:1px solid #e5e7eb">${venc}</td><td style="padding:6px 8px;border:1px solid #e5e7eb;color:${color};font-weight:bold">${est}</td><td style="padding:6px 8px;border:1px solid #e5e7eb;text-align:right">${saldoCell}</td></tr>`;
  }).join("");
  const html = `<h3 style="color:#1a1a2e;margin:18px 0 8px;font-size:15px">Plan de pagos</h3><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="background:#f9fafb"><th style="padding:6px 8px;border:1px solid #e5e7eb;text-align:left">Cuota</th><th style="padding:6px 8px;border:1px solid #e5e7eb;text-align:right">Monto</th><th style="padding:6px 8px;border:1px solid #e5e7eb;text-align:left">Vence</th><th style="padding:6px 8px;border:1px solid #e5e7eb;text-align:left">Estado</th><th style="padding:6px 8px;border:1px solid #e5e7eb;text-align:right">Saldo</th></tr></thead><tbody>${rows}</tbody></table>`;
  return { text, html, hasPlan: true };
};

const notifTemplates: Record<NotifTemplateKey, { label: string; asunto: string; contenido: (ctx: any) => string; html: (ctx: any) => string }> = {
  pago_registrado: {
    label: "Pago registrado",
    asunto: "Tu pago fue registrado — {{evento}}",
    contenido: (ctx) => `Hola ${ctx.nombre},\n\nTe confirmamos que registramos tu pago de ${ctx.monto} para ${ctx.evento}.\n\nAbonado hasta ahora: ${ctx.abonado}\nSaldo pendiente: ${ctx.saldo}${ctx.plan_text || ""}\n\n¡Gracias!`,
    html: (ctx) => `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px"><h2 style="color:#1a1a2e">Pago registrado</h2><p>Hola <strong>${ctx.nombre}</strong>,</p><p>Te confirmamos que registramos tu pago de <strong>${ctx.monto}</strong> para <strong>${ctx.evento}</strong>.</p><table style="width:100%;border-collapse:collapse;margin:16px 0"><tr><td style="padding:8px;border:1px solid #e5e7eb">Abonado</td><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;color:#059669">${ctx.abonado}</td></tr><tr><td style="padding:8px;border:1px solid #e5e7eb">Saldo pendiente</td><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;color:#d97706">${ctx.saldo}</td></tr></table>${ctx.plan_html || ""}<p>¡Gracias!</p><p style="color:#6b7280;font-size:12px">Reybaud Ciclismo</p></div>`,
  },
  plan_pagos: {
    label: "Plan de pagos",
    asunto: "Tu plan de pagos — {{evento}}",
    contenido: (ctx) => `Hola ${ctx.nombre},\n\nTe compartimos el detalle de tu plan de pagos para ${ctx.evento}.\n\nTotal: ${ctx.total || ctx.monto}\nAbonado: ${ctx.abonado}\nSaldo pendiente: ${ctx.saldo}${ctx.plan_text || "\n\n(Sin cuotas configuradas)"}\n\nCualquier duda, escribinos.\n\nReybaud Ciclismo`,
    html: (ctx) => `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px"><h2 style="color:#1a1a2e">Tu plan de pagos</h2><p>Hola <strong>${ctx.nombre}</strong>,</p><p>Te compartimos el detalle de tu plan de pagos para <strong>${ctx.evento}</strong>.</p><table style="width:100%;border-collapse:collapse;margin:16px 0"><tr><td style="padding:8px;border:1px solid #e5e7eb">Total</td><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold">${ctx.total || ctx.monto}</td></tr><tr><td style="padding:8px;border:1px solid #e5e7eb">Abonado</td><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;color:#059669">${ctx.abonado}</td></tr><tr><td style="padding:8px;border:1px solid #e5e7eb">Saldo pendiente</td><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;color:#d97706">${ctx.saldo}</td></tr></table>${ctx.plan_html || "<p style=\"color:#6b7280;font-style:italic\">Aún no hay cuotas configuradas.</p>"}<p style="margin-top:18px">Cualquier duda, escribinos.</p><p style="color:#6b7280;font-size:12px">Reybaud Ciclismo</p></div>`,
  },
  cuota_pago_mp: {
    label: "Cuota con link de pago (MP)",
    asunto: "Pagá tu cuota — {{evento}}",
    contenido: (ctx) => `Hola ${ctx.nombre},\n\nTe recordamos que tenés ${ctx.cuota_label || "una cuota"} pendiente${ctx.monto_cuota ? ` de ${ctx.monto_cuota}` : ""} para ${ctx.evento}.\nVencimiento: ${ctx.vencimiento || "a coordinar"}\n\nPodés abonarla directamente por Mercado Pago desde este link:\n${ctx.mp_link || "(link no disponible)"}\n\nResumen de tu reserva:\n• Total: ${ctx.total || ctx.monto}\n• Abonado: ${ctx.abonado}\n• Saldo pendiente: ${ctx.saldo}${ctx.plan_text || ""}\n\nTambién podés ver el detalle completo y el estado de todos tus pagos desde tu reserva:\n${ctx.reserva_link || ""}\n\nCualquier duda, escribinos.\n\nReybaud Ciclismo`,
    html: (ctx) => `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px"><h2 style="color:#d97706">Pagá tu cuota</h2><p>Hola <strong>${ctx.nombre}</strong>,</p><p>Te recordamos que tenés <strong>${ctx.cuota_label || "una cuota"}</strong> pendiente${ctx.monto_cuota ? ` de <strong>${ctx.monto_cuota}</strong>` : ""} para <strong>${ctx.evento}</strong>.</p><p>Vencimiento: <strong>${ctx.vencimiento || "a coordinar"}</strong></p>${ctx.mp_link ? `<div style="text-align:center;margin:24px 0"><a href="${ctx.mp_link}" style="display:inline-block;padding:14px 32px;background-color:#009ee3;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:bold;font-size:15px">Pagar con Mercado Pago</a></div><p style="text-align:center;font-size:12px;color:#6b7280">o copiá este link: <a href="${ctx.mp_link}" style="color:#6b7280">${ctx.mp_link}</a></p>` : `<p style="color:#dc2626">Link de pago no disponible.</p>`}<h3 style="color:#1a1a2e;margin:24px 0 8px;font-size:15px">Resumen de tu reserva</h3><table style="width:100%;border-collapse:collapse;margin:8px 0"><tr><td style="padding:8px;border:1px solid #e5e7eb">Total</td><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;text-align:right">${ctx.total || ctx.monto}</td></tr><tr><td style="padding:8px;border:1px solid #e5e7eb">Abonado</td><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;color:#059669;text-align:right">${ctx.abonado}</td></tr><tr><td style="padding:8px;border:1px solid #e5e7eb">Saldo pendiente</td><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;color:#d97706;text-align:right">${ctx.saldo}</td></tr></table>${ctx.plan_html || ""}${ctx.reserva_link ? `<div style="text-align:center;margin:24px 0 8px"><a href="${ctx.reserva_link}" style="display:inline-block;padding:12px 28px;background-color:#1a1a2e;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:bold;font-size:14px">Ver estado de mi reserva</a></div>` : ""}<p style="color:#6b7280;font-size:12px;margin-top:24px">Reybaud Ciclismo</p></div>`,
  },


  novedad: {
    label: "Novedad / comunicado",
    asunto: "Novedad sobre {{evento}}",
    contenido: (ctx) => `Hola ${ctx.nombre},\n\n${ctx.mensaje || "Te compartimos una novedad sobre " + ctx.evento + "."}\n\nSaludos,\nReybaud Ciclismo`,
    html: (ctx) => `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px"><h2 style="color:#1a1a2e">Novedad</h2><p>Hola <strong>${ctx.nombre}</strong>,</p><p>${(ctx.mensaje || "Te compartimos una novedad sobre " + ctx.evento + ".").replace(/\n/g, "<br/>")}</p><p style="color:#6b7280;font-size:12px">Reybaud Ciclismo</p></div>`,
  },
  recordatorio_checklist: {
    label: "Recordatorio preparación del viaje",
    asunto: "Falta cargar tu información para {{evento}}",
    contenido: (ctx) => `Hola ${ctx.nombre},\n\nTe escribimos para recordarte que todavía hay información pendiente en la sección "Preparación del viaje" para ${ctx.evento}.\n\nPor favor cargá lo antes posible:\n• Talle de bici y/o fitting\n• Tipo de pedales y calas\n• Pasaje o transporte\n• Seguro viajero\n\nEntrá desde el link de tu reserva y completá lo que te falte. Cualquier duda, escribinos por WhatsApp.\n\n¡Gracias!\nReybaud Ciclismo`,
    html: (ctx) => `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px"><h2 style="color:#d97706">Falta tu información del viaje</h2><p>Hola <strong>${ctx.nombre}</strong>,</p><p>Todavía tenés información pendiente en la sección <strong>Preparación del viaje</strong> para <strong>${ctx.evento}</strong>.</p><ul style="line-height:1.7"><li>Talle de bici y/o fitting</li><li>Tipo de pedales y calas</li><li>Pasaje o transporte</li><li>Seguro viajero</li></ul><p>Entrá desde el link de tu reserva y completá lo que te falte. Cualquier duda, escribinos por WhatsApp.</p><p style="color:#6b7280;font-size:12px">Reybaud Ciclismo</p></div>`,
  },
};

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
  no_aplica: "No aplica",
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
  anulado: "bg-muted text-muted-foreground border-border line-through",
};

/* ─── Props ─── */

interface AdminEventReservationsProps {
  eventId: string;
  eventTitle: string;
  eventCurrency: string;
  eventPrice?: number | null;
  eventNature?: string;
  eventType?: string;
  eventMetadata?: Record<string, any>;
  eventDate?: string;
  eventLocation?: string | null;
  eventMaxCapacity?: number | null;
  eventStatus?: string;
  eventPaymentMode?: "cuotas" | "simple";
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
  eventId, eventTitle, eventCurrency, eventPrice, eventNature, eventType, eventMetadata,
  eventDate, eventLocation, eventMaxCapacity, eventStatus, eventPaymentMode = "cuotas",
}: AdminEventReservationsProps) => {
  const isSimplePayment = eventPaymentMode === "simple";
  // Trip-like events show full onboarding (checklist + installments).
  // School events (record_hora, carrera, otro) show simplified flow.
  const isTripLike = eventType === "camp" || eventType === "viaje";
  const isSchoolEvent = eventType === "record_hora" || eventType === "carrera" || eventType === "escuela";
  const isPaymentFree = eventNature === "propio_solo_inscripcion" || (eventPrice != null && eventPrice <= 0);
  // For school events use "inscripción" terminology instead of "reserva"
  const termReserva = isSchoolEvent ? "inscripción" : "reserva";
  const termReservas = isSchoolEvent ? "inscripciones" : "reservas";
  const termReservaCreada = isSchoolEvent ? "Inscripción creada" : "Reserva creada";
  const { toast } = useToast();
  const [reservations, setReservations] = useState<EventReservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [filterResStatus, setFilterResStatus] = useState("all");
  const [filterPayStatus, setFilterPayStatus] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortAsc, setSortAsc] = useState(false);
  const [showTripReports, setShowTripReports] = useState(false);


  // Detail drawer
  const [selectedRes, setSelectedRes] = useState<EventReservation | null>(null);
  const [changePackageFor, setChangePackageFor] = useState<EventReservation | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [paymentToReview, setPaymentToReview] = useState<Payment | null>(null);
  const [paymentToEdit, setPaymentToEdit] = useState<Payment | null>(null);
  const [editPaymentMode, setEditPaymentMode] = useState<"edit" | "annul">("edit");

  // Add student
  const [showAddStudent, setShowAddStudent] = useState(false);
  const [studentSearch, setStudentSearch] = useState("");
  const [studentResults, setStudentResults] = useState<AlumnoOption[]>([]);
  const [searchingStudents, setSearchingStudents] = useState(false);
  const [addingStudent, setAddingStudent] = useState<string | null>(null);
  const [addExternalMode, setAddExternalMode] = useState(false);
  const [extName, setExtName] = useState("");
  const [extLastName, setExtLastName] = useState("");
  const [extEmail, setExtEmail] = useState("");
  const [extPhone, setExtPhone] = useState("");
  const [extDoc, setExtDoc] = useState("");
  const [addingExternal, setAddingExternal] = useState(false);

  // Admin payment
  const [showAdminPayment, setShowAdminPayment] = useState(false);
  const [adminPayAmount, setAdminPayAmount] = useState("");
  const [adminPayDate, setAdminPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [adminPayMethod, setAdminPayMethod] = useState("efectivo");
  const [adminPayRef, setAdminPayRef] = useState("");
  const [adminPayNotes, setAdminPayNotes] = useState("");
  const [submittingAdminPay, setSubmittingAdminPay] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [notifyOnPayment, setNotifyOnPayment] = useState(true);
  const [adminPayCurrency, setAdminPayCurrency] = useState("EUR");
  const [adminPayRate, setAdminPayRate] = useState("1");
  const [adminPayEquivalent, setAdminPayEquivalent] = useState("");
  const [adminPayOverride, setAdminPayOverride] = useState(false);
  const [adminPayOverrideReason, setAdminPayOverrideReason] = useState("");
  const [adminPayInstallmentId, setAdminPayInstallmentId] = useState<string | null>(null);
  const [adminPayGeneralReason, setAdminPayGeneralReason] = useState("");
  const [matInstallments, setMatInstallments] = useState<any[]>([]);

  // Notifications
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [viewNotif, setViewNotif] = useState<Notification | null>(null);
  const [showNotifyDialog, setShowNotifyDialog] = useState(false);
  const [notifyTemplate, setNotifyTemplate] = useState<NotifTemplateKey>("novedad");
  const [notifySubject, setNotifySubject] = useState("");
  const [notifyBody, setNotifyBody] = useState("");
  const [notifyHtml, setNotifyHtml] = useState("");
  const [sendingNotif, setSendingNotif] = useState(false);
  const [notifyCustomMessage, setNotifyCustomMessage] = useState("");
  const [mpPayUrl, setMpPayUrl] = useState<string>("");
  const [preparingMpLink, setPreparingMpLink] = useState(false);
  const [detailTab, setDetailTab] = useState("info");
  const [participantResult, setParticipantResult] = useState<any | null>(null);

  const installments = eventMetadata?.installments_enabled ? (eventMetadata?.installments || []) : [];

  // Precios vigentes (packages + stages)
  const [eventPackages, setEventPackages] = useState<Array<{ id: string; nombre: string; precio: number; currency: string; activo: boolean; sort_order: number | null; }>>([]);
  const [priceStagesByPkg, setPriceStagesByPkg] = useState<Record<string, PriceStage[]>>({});
  const [showPricesTable, setShowPricesTable] = useState(false);


  /* ─── Participant helper ─── */
  const getParticipant = (r: EventReservation) => {
    if (r.alumno) return { nombre: r.alumno.nombre, apellido: r.alumno.apellido, email: r.alumno.email, telefono: r.alumno.telefono, isExternal: false };
    if (r.external_participant) return { nombre: r.external_participant.nombre, apellido: r.external_participant.apellido, email: r.external_participant.email, telefono: r.external_participant.telefono, isExternal: true };
    return { nombre: "Sin datos", apellido: null, email: "", telefono: null, isExternal: false };
  };

  const participantName = (r: EventReservation) => {
    const p = getParticipant(r);
    return `${p.nombre} ${p.apellido || ""}`.trim();
  };

  /* ─── Data loading ─── */

  const loadReservations = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("event_reservations" as any)
      .select("*, access_token, alumno:alumnos!event_reservations_alumno_id_fkey(nombre, apellido, email, telefono), external_participant:event_external_participants!event_reservations_external_participant_id_fkey(id, nombre, apellido, email, telefono)")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false });
    if (data) setReservations(data as unknown as EventReservation[]);
    setLoading(false);
  };

  useEffect(() => { loadReservations(); }, [eventId]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("event_packages" as any)
        .select("id, nombre, precio, currency, activo, sort_order")
        .eq("event_id", eventId)
        .eq("activo", true)
        .order("sort_order", { ascending: true });
      const pkgs = ((data as any[]) || []).map((p) => ({
        id: p.id, nombre: p.nombre, precio: Number(p.precio), currency: p.currency || eventCurrency,
        activo: !!p.activo, sort_order: p.sort_order ?? 0,
      }));
      setEventPackages(pkgs);
      if (pkgs.length > 0) {
        const stagesMap = await fetchPriceStages(pkgs.map((p) => p.id));
        setPriceStagesByPkg(stagesMap);
      } else {
        setPriceStagesByPkg({});
      }
    })();
  }, [eventId, eventCurrency]);


  const loadPayments = async (reservationId: string) => {
    const { data } = await supabase
      .from("reservation_payments" as any)
      .select("*")
      .eq("reservation_id", reservationId)
      .order("created_at", { ascending: false });
    if (data) setPayments(data as unknown as Payment[]);
  };

  const loadNotifications = async (reservationId: string) => {
    const { data } = await supabase
      .from("reservation_notifications" as any)
      .select("*")
      .eq("reservation_id", reservationId)
      .order("created_at", { ascending: false });
    if (data) setNotifications(data as unknown as Notification[]);
  };

  const getNotifContext = (res: EventReservation, extra: Record<string, any> = {}) => {
    const c = res.currency_snapshot || res.moneda || eventCurrency;
    const bal = res.balance_due ?? ((res.amount_total || 0) - (res.amount_paid || 0));
    const p = getParticipant(res);
    return {
      nombre: `${p.nombre} ${p.apellido || ""}`.trim(),
      evento: eventTitle,
      monto: formatPrice(extra.monto || 0, c),
      abonado: formatPrice(res.amount_paid || 0, c),
      saldo: formatPrice(bal, c),
      monto_cuota: extra.monto_cuota ? formatPrice(extra.monto_cuota, c) : "",
      vencimiento: extra.vencimiento || "",
      mensaje: extra.mensaje || "",
      ...extra,
    };
  };

  const prepareTemplate = (key: NotifTemplateKey, res: EventReservation, extra: Record<string, any> = {}) => {
    const tpl = notifTemplates[key];
    const ctx = getNotifContext(res, extra);
    setNotifyTemplate(key);
    setNotifySubject(tpl.asunto.replace("{{evento}}", eventTitle));
    setNotifyBody(tpl.contenido(ctx));
    setNotifyHtml(tpl.html(ctx));
  };

  const getReservaLink = (res: EventReservation): string => {
    const origin = getShareOrigin();
    if (isTripLike && res.access_token) {
      return `${origin}/viaje/mi-reserva?token=${res.access_token}`;
    }
    return `${origin}/eventos/${eventId}`;
  };

  const buildCtaButton = (reservaLink?: string): string => {
    if (!reservaLink) return "";
    return `<div style="text-align:center;margin:24px 0 8px"><a href="${reservaLink}" style="display:inline-block;padding:12px 28px;background-color:#1a1a2e;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:bold;font-size:14px">Ver mi reserva</a></div>`;
  };

  const buildHtmlFromText = (text: string, tipo: string, reservaLink?: string) => {
    const colorMap: Record<string, string> = {
      pago_registrado: "#059669",
      plan_pagos: "#1a1a2e",
      cuota_pendiente: "#d97706",
      cuota_proxima: "#2563eb",
      cuota_pago_mp: "#009ee3",
      novedad: "#1a1a2e",
      recordatorio_checklist: "#d97706",
    };
    const titleMap: Record<string, string> = {
      pago_registrado: "Pago registrado",
      plan_pagos: "Tu plan de pagos",
      cuota_pendiente: "Cuota pendiente",
      cuota_proxima: "Próximo vencimiento",
      cuota_pago_mp: "Pagá tu cuota",
      novedad: "Novedad",
      recordatorio_checklist: "Falta tu información del viaje",
    };
    const color = colorMap[tipo] || "#1a1a2e";
    const title = titleMap[tipo] || "Notificación";
    const htmlBody = text.replace(/\n/g, "<br/>");
    const mpBtn = (tipo === "cuota_pago_mp" && mpPayUrl)
      ? `<div style="text-align:center;margin:24px 0"><a href="${mpPayUrl}" style="display:inline-block;padding:14px 32px;background-color:#009ee3;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:bold;font-size:15px">Pagar con Mercado Pago</a></div>`
      : "";
    const cta = buildCtaButton(reservaLink);
    const ctaLabel = tipo === "cuota_pago_mp" ? cta.replace("Ver mi reserva", "Ver estado de mi reserva") : cta;
    return `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px"><h2 style="color:${color}">${title}</h2>${htmlBody}${mpBtn}${ctaLabel}<p style="color:#6b7280;font-size:12px;margin-top:24px">Reybaud Ciclismo</p></div>`;
  };

  const sendNotification = async (tipo: string, asunto: string, contenidoTexto: string, _contenidoHtml: string, meta: Record<string, any> = {}, idempKey?: string) => {
    if (!selectedRes) return false;
    setSendingNotif(true);

    // Always rebuild HTML from the (potentially edited) text to keep them in sync
    const reservaLink = getReservaLink(selectedRes);
    const finalHtml = buildHtmlFromText(contenidoTexto, tipo, reservaLink);

    const { data: sessionData } = await supabase.auth.getSession();
    const adminEmail = sessionData?.session?.user?.email || "admin";
    const adminId = sessionData?.session?.user?.id;

    const { data, error } = await supabase.functions.invoke("notify-reservation", {
      body: {
        reservation_id: selectedRes.id,
        alumno_id: selectedRes.alumno_id,
        tipo,
        asunto,
        contenido_html: finalHtml,
        contenido_texto: contenidoTexto,
        enviado_por: adminId,
        enviado_por_email: adminEmail,
        metadata: meta,
        idempotency_key: idempKey || undefined,
        canal: "email",
      },
    });

    setSendingNotif(false);

    if (error) {
      toast({ title: "Error al enviar notificación", description: "No se pudo conectar con el servicio de notificaciones. Intentá de nuevo.", variant: "destructive" });
      return false;
    }
    if (data?.duplicate) {
      toast({ title: "Notificación ya enviada previamente", description: "Se evitó el duplicado." });
      return true;
    }
    if (data?.error_code === "email_send_failed") {
      toast({
        title: "Email no enviado",
        description: `La notificación quedó registrada pero el email no pudo enviarse. ${data.notification_logged ? "Se guardó en el historial." : ""}`,
        variant: "destructive",
      });
      loadNotifications(selectedRes.id);
      return false;
    }
    toast({ title: "Notificación enviada", description: `Email enviado a ${getParticipant(selectedRes).email}` });
    loadNotifications(selectedRes.id);
    return true;
  };

  const logWhatsAppAction = async (res: EventReservation, tipo: string, mensaje: string) => {
    const { data: sessionData } = await supabase.auth.getSession();
    await supabase.from("reservation_notifications" as any).insert({
      reservation_id: res.id,
      alumno_id: res.alumno_id,
      tipo,
      canal: "whatsapp_manual",
      asunto: `WhatsApp: ${tipo}`,
      contenido: mensaje,
      enviado_por: sessionData?.session?.user?.id || null,
      enviado_por_email: sessionData?.session?.user?.email || null,
      metadata: { external_participant_id: res.external_participant_id },
    } as any);
    if (selectedRes?.id === res.id) loadNotifications(res.id);
  };
  const [sendingBulkReminder, setSendingBulkReminder] = useState(false);
  const sendBulkChecklistReminder = async () => {
    const targets = reservations.filter(r => r.reservation_status === "reserva_confirmada");
    if (targets.length === 0) {
      toast({ title: "Sin destinatarios", description: "No hay reservas confirmadas." });
      return;
    }
    if (!confirm(`Enviar recordatorio de preparación del viaje a ${targets.length} participante${targets.length > 1 ? "s" : ""} confirmado${targets.length > 1 ? "s" : ""}?`)) return;
    setSendingBulkReminder(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const adminEmail = sessionData?.session?.user?.email || "admin";
    const adminId = sessionData?.session?.user?.id;

    // Cargar plantilla editable desde `email_templates`; si no existe o está inactiva,
    // caemos al template hardcodeado (compatibilidad hacia atrás).
    const { data: tplRow } = await supabase
      .from("email_templates")
      .select("subject, html_body, text_body, is_active")
      .eq("key", "reservation_checklist_reminder")
      .maybeSingle();
    const fallback = notifTemplates.recordatorio_checklist;
    const useDb = !!tplRow && tplRow.is_active !== false;

    const applyVars = (s: string, vars: Record<string, string>) =>
      s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);

    let ok = 0, fail = 0;
    for (const res of targets) {
      const ctx = getNotifContext(res);
      const reservaLink = getReservaLink(res);
      const vars = { nombre: ctx.nombre, evento: eventTitle, reserva_link: reservaLink };

      const subject = useDb
        ? applyVars(tplRow!.subject, vars)
        : fallback.asunto.replace("{{evento}}", eventTitle);
      const body = useDb && tplRow!.text_body
        ? applyVars(tplRow!.text_body, vars)
        : fallback.contenido(ctx);
      const html = useDb && tplRow!.html_body
        ? applyVars(tplRow!.html_body, vars)
        : buildHtmlFromText(body, "recordatorio_checklist", reservaLink);

      const { error } = await supabase.functions.invoke("notify-reservation", {
        body: {
          reservation_id: res.id,
          alumno_id: res.alumno_id,
          tipo: "recordatorio_checklist",
          asunto: subject,
          contenido_html: html,
          contenido_texto: body,
          enviado_por: adminId,
          enviado_por_email: adminEmail,
          metadata: { bulk: true, template_key: useDb ? "reservation_checklist_reminder" : "hardcoded_fallback" },
          idempotency_key: `bulk-checklist-${res.id}-${new Date().toISOString().slice(0, 10)}`,
          canal: "email",
        },
      });
      if (error) fail++; else ok++;
    }
    setSendingBulkReminder(false);
    toast({
      title: "Recordatorios enviados",
      description: `${ok} OK${fail > 0 ? ` · ${fail} con error` : ""}`,
      variant: fail > 0 ? "destructive" : "default",
    });
  };

  const getWhatsAppMsgForTemplate = (key: NotifTemplateKey, res: EventReservation, extra: Record<string, any> = {}) => {
    const ctx = getNotifContext(res, extra);
    return notifTemplates[key].contenido(ctx);
  };



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
        const p = getParticipant(r);
        const name = `${p.nombre} ${p.apellido || ""}`.toLowerCase();
        const email = (p.email || "").toLowerCase();
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
          cmp = participantName(a).localeCompare(participantName(b));
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
    const existingIds = new Set(reservations.filter(r => r.alumno_id).map(r => r.alumno_id));
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

  const addExternalToEvent = async () => {
    if (!extName || !extEmail) { toast({ title: "Nombre y email son obligatorios", variant: "destructive" }); return; }
    setAddingExternal(true);

    const { data: extP, error: extErr } = await supabase
      .from("event_external_participants" as any)
      .insert({ nombre: extName, apellido: extLastName || null, email: extEmail, telefono: extPhone || null, documento: extDoc || null } as any)
      .select("id")
      .single();

    if (extErr || !extP) {
      toast({ title: "Error al crear participante", description: extErr?.message, variant: "destructive" });
      setAddingExternal(false);
      return;
    }

    const isInscriptionOnly = eventNature === "propio_solo_inscripcion";
    const isPaid = eventPrice != null && eventPrice > 0;
    const paymentStatus = isInscriptionOnly || !isPaid ? "no_aplica" : "no_informado";

    const { error } = await supabase
      .from("event_reservations" as any)
      .insert({
        event_id: eventId,
        alumno_id: null,
        external_participant_id: (extP as any).id,
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
      toast({ title: "Error al agregar reserva", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `${extName} ${extLastName} agregado como participante externo` });
      loadReservations();
      setShowAddStudent(false);
      setExtName(""); setExtLastName(""); setExtEmail(""); setExtPhone(""); setExtDoc("");
    }
    setAddingExternal(false);
  };

  const deleteReservation = async (resId: string, participantName: string) => {
    const ok = window.confirm(
      `¿Eliminar la reserva de ${participantName}?\n\nSe eliminarán también pagos, cuotas, notificaciones e historial asociados. Esta acción no se puede deshacer.`
    );
    if (!ok) return;
    setUpdatingId(resId);
    const { error } = await supabase
      .from("event_reservations" as any)
      .delete()
      .eq("id", resId);
    setUpdatingId(null);
    if (error) {
      toast({ title: "Error al eliminar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Reserva eliminada", description: `Se eliminó la reserva de ${participantName}.` });
      setReservations(prev => prev.filter(r => r.id !== resId));
    }
  };


  const updateReservationStatus = async (resId: string, field: string, value: string) => {
    setUpdatingId(resId);
    const res = reservations.find(r => r.id === resId);
    if (!res) return;

    // ── Confirmación de reserva: usar RPC atómico que encola email + crea notif admin
    if (field === "reservation_status" && value === "reserva_confirmada"
        && res.reservation_status !== "reserva_confirmada") {
      const { data, error: rpcErr } = await supabase.rpc("confirm_reservation", { _reservation_id: resId });
      setUpdatingId(null);
      if (rpcErr) {
        toast({ title: "Error al confirmar", description: rpcErr.message, variant: "destructive" });
        return;
      }
      const alreadyConfirmed = (data as any)?.already_confirmed;
      // Disparar envío inmediato del email de cobranza (idempotente vía sent_at)
      if (!alreadyConfirmed) {
        supabase.functions
          .invoke("send-reservation-confirmed-with-payment", { body: { reservation_id: resId } })
          .catch((e) => console.error("send-reservation-confirmed-with-payment error", e));
      }
      toast({
        title: "Reserva confirmada",
        description: alreadyConfirmed
          ? "Ya estaba confirmada."
          : "Email de cobranza enviado al cliente.",
      });
      loadReservations();
      if (selectedRes?.id === resId) {
        setSelectedRes(prev => prev ? { ...prev, reservation_status: "reserva_confirmada" } : null);
      }
      return;
    }

    const updatePayload: any = { [field]: value };
    if (field === "reservation_status") {
      if (value === "cancelada") updatePayload.estado = "cancelada";
    }
    if (field === "payment_status") {
      if (value === "pago_validado") updatePayload.estado = "pago_confirmado";
      else if (value === "pago_informado") updatePayload.estado = "pendiente_verificacion";
    }
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

  const resendConfirmationEmail = async (resId: string) => {
    setUpdatingId(resId);
    try {
      const { error } = await supabase.functions.invoke("send-reservation-confirmed-with-payment", {
        body: { reservation_id: resId, force: true },
      });
      if (error) throw error;
      toast({ title: "Email reenviado", description: "Encolado nuevamente para el cliente." });
      loadReservations();
    } catch (e: any) {
      toast({ title: "Error al reenviar", description: e.message, variant: "destructive" });
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

  // Load materialized installments for the selected reservation
  const loadMatInstallments = async (resId: string) => {
    const { data } = await supabase
      .from("reservation_installments" as any)
      .select("*")
      .eq("reservation_id", resId)
      .order("sort_order", { ascending: true });
    setMatInstallments((data as any[]) || []);
  };

  const ensureMatInstallments = async (resId: string) => {
    const fetchRows = async () => {
      const { data } = await supabase
        .from("reservation_installments" as any)
        .select("*")
        .eq("reservation_id", resId)
        .order("sort_order", { ascending: true });
      return (data as any[]) || [];
    };

    let rows = await fetchRows();
    if (rows.length === 0) {
      await supabase.rpc("materialize_reservation_installments" as any, { p_reservation_id: resId });
      rows = await fetchRows();
    }
    setMatInstallments(rows);
    return rows;
  };

  const registerAdminPayment = async () => {
    if (!selectedRes || !adminPayAmount || parseFloat(adminPayAmount) <= 0) {
      toast({ title: "Ingresá un monto válido.", variant: "destructive" });
      return;
    }

    const evCurr = selectedRes.currency_snapshot || selectedRes.moneda || eventCurrency;
    const origAmt = parseFloat(adminPayAmount);
    const rate = parseFloat(adminPayRate) || 1;
    const sameCurrency = adminPayCurrency === evCurr;

    // Equivalent: use adminPayEquivalent if set, otherwise compute
    const parsedEq = parseFloat(adminPayEquivalent);
    let eqAmt = sameCurrency ? origAmt : (parsedEq > 0 ? parsedEq : origAmt * rate);

    if (!eqAmt || eqAmt <= 0) {
      toast({ title: "No se pudo determinar el equivalente reconocido. Completá al menos 2 de los 3 campos (monto, cotización, equivalente).", variant: "destructive" });
      return;
    }

    // Override = equivalent differs from amount × rate
    const computedEqCheck = sameCurrency ? origAmt : origAmt * rate;
    const isOverride = !sameCurrency && Math.abs(eqAmt - computedEqCheck) > 0.005;
    if (isOverride && !adminPayOverrideReason.trim()) {
      toast({ title: "Ingresá un motivo para el override de equivalente.", variant: "destructive" });
      return;
    }

    // If no installment selected but there are pending installments, require reason
    const hasPendingInstallments = matInstallments.some((i: any) => i.status === "pendiente" || i.status === "parcial");
    if (!adminPayInstallmentId && hasPendingInstallments && !adminPayGeneralReason.trim()) {
      toast({ title: "Indicá un motivo para registrar como pago general con cuotas pendientes.", variant: "destructive" });
      return;
    }

    setSubmittingAdminPay(true);

    const { data: session } = await supabase.auth.getSession();
    const adminUid = session?.session?.user?.id || null;

    const { error: payErr } = await supabase
      .from("reservation_payments" as any)
      .insert({
        reservation_id: selectedRes.id,
        alumno_id: selectedRes.alumno_id,
        amount: eqAmt,
        currency: evCurr,
        original_amount: origAmt,
        original_currency: adminPayCurrency,
        event_currency: evCurr,
        exchange_rate_to_event_currency: sameCurrency ? 1 : rate,
        equivalent_amount_event_currency: eqAmt,
        manual_override: !!isOverride,
        payment_date: adminPayDate,
        payment_method: adminPayMethod,
        payment_reference: adminPayRef.trim() || null,
        notes: adminPayNotes.trim() || null,
        status: "validado",
        review_action: "validado",
        reviewed_at: new Date().toISOString(),
        reviewed_by: adminUid,
        review_notes: isOverride ? adminPayOverrideReason.trim() : (adminPayGeneralReason.trim() || null),
        installment_id: adminPayInstallmentId || null,
      } as any);

    if (payErr) {
      toast({ title: "Error al registrar pago", description: payErr.message, variant: "destructive" });
      setSubmittingAdminPay(false);
      return;
    }

    // Use RPC to recalculate totals
    await supabase.rpc("recalculate_reservation_payment_totals" as any, { p_reservation_id: selectedRes.id });

    await supabase.from("reservation_status_history" as any).insert({
      reservation_id: selectedRes.id,
      old_payment_status: selectedRes.payment_status,
      new_payment_status: "recalculado",
      changed_by_role: "admin",
      note: `Pago manual validado: ${formatPrice(origAmt, adminPayCurrency)}${!sameCurrency ? ` (≈ ${formatPrice(eqAmt, evCurr)})` : ""} via ${adminPayMethod}`,
    } as any);

    setSubmittingAdminPay(false);
    setShowAdminPayment(false);
    setAdminPayAmount("");
    setAdminPayRef("");
    setAdminPayNotes("");
    setAdminPayCurrency(evCurr);
    setAdminPayRate("1");
    setAdminPayEquivalent("");
    setAdminPayOverride(false);
    setAdminPayOverrideReason("");
    setAdminPayInstallmentId(null);
    setAdminPayGeneralReason("");
    toast({ title: "Pago registrado y validado" });
    loadPayments(selectedRes.id);
    loadReservations();
    loadMatInstallments(selectedRes.id);

    // Auto-facturar (segmento viajes) — solo si hay alumno_id
    if (selectedRes.alumno_id) {
      const mp = String(adminPayMethod || "").toLowerCase();
      const metodoNormalizado =
        mp.includes("mercado") || mp === "mp" ? "mercadopago"
          : mp.includes("transfer") ? "transferencia"
          : mp.includes("efectivo") || mp.includes("cash") ? "efectivo"
          : (adminPayMethod || "otro");
      supabase.functions.invoke("auto-facturar", {
        body: {
          alumno_id: selectedRes.alumno_id,
          concepto: `Reserva ${eventTitle} — pago ${formatPrice(eqAmt, evCurr)}`,
          monto: eqAmt,
          referencia_tipo: "evento",
          referencia_id: selectedRes.id,
          segmento: "viajes",
          metodo_pago: metodoNormalizado,
          origen_registro: "cargado_admin",
        },
      }).then(({ data }) => {
        if (data?.emitted) {
          toast({ title: "Factura AFIP emitida", description: `N° ${data.numero_comprobante}` });
        }
      }).catch(() => {});
    }

    // Send unified "Pago registrado" email (same template for MP, manual, cash, transfer)
    if (notifyOnPayment) {
      const { data: sessionData } = await supabase.auth.getSession();
      try {
        const { error: notifErr } = await supabase.functions.invoke("send-reservation-payment-recorded", {
          body: {
            reservation_id: selectedRes.id,
            amount: eqAmt,
            payment_method: adminPayMethod,
            payment_reference: adminPayRef || `manual-${Date.now()}`,
            installment_number: adminPayInstallmentId ? null : null, // installment_number resolved from id if needed elsewhere
            enviado_por: sessionData?.session?.user?.id || null,
            enviado_por_email: sessionData?.session?.user?.email || "admin",
          },
        });
        if (notifErr) {
          toast({ title: "Email no enviado", description: notifErr.message, variant: "destructive" });
        }
      } catch (e: any) {
        console.error("send-reservation-payment-recorded error", e);
      }
      loadNotifications(selectedRes.id);
    }

  };

  // Abre el drawer de validación. Tanto validar como rechazar pasan por ahí
  // (cotización, equivalente, motivo). El recálculo de amount_paid lo hace
  // la RPC public.recalculate_reservation_payment_totals (idempotente).
  const openReviewPayment = (payment: Payment) => {
    setPaymentToReview(payment);
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

  const loadParticipantResult = async (r: EventReservation) => {
    setParticipantResult(null);
    if (!isSchoolEvent) return;
    const p = getParticipant(r);
    const { data } = await supabase
      .from("event_participants")
      .select("*")
      .eq("event_id", eventId)
      .eq("email", p.email)
      .maybeSingle();
    setParticipantResult(data);
  };

  const openDetail = (r: EventReservation) => {
    setSelectedRes(r);
    setShowAdminPayment(false);
    setShowNotifyDialog(false);
    setDetailTab("info");
    loadPayments(r.id);
    loadNotifications(r.id);
    loadParticipantResult(r);
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
        <StatCard label={isSchoolEvent ? "Total inscriptos" : "Total reservas"} value={stats.total} icon={<Users className="w-4 h-4" />} />
        <StatCard label="Confirmadas" value={stats.confirmed} color="text-emerald-500" icon={<CheckCircle className="w-4 h-4" />} />
        <StatCard label="Pendientes" value={stats.pending} color="text-amber-500" icon={<Clock className="w-4 h-4" />} />
        {!isPaymentFree && (
          <>
            <StatCard label="Total cobrado" value={formatPrice(stats.totalCobrado, eventCurrency)} color="text-emerald-500" icon={<DollarSign className="w-4 h-4" />} />
            <StatCard label="Saldo pendiente" value={formatPrice(stats.saldoPendiente, eventCurrency)} color="text-amber-500" icon={<Banknote className="w-4 h-4" />} />
          </>
        )}
      </div>

      {/* ─── Precios vigentes ─── */}
      {!isPaymentFree && eventPackages.length > 0 && (
        <div className="rounded-lg border border-border/60 bg-muted/10">
          <button
            type="button"
            onClick={() => setShowPricesTable((s) => !s)}
            className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-sm font-medium hover:bg-muted/20 transition-colors"
          >
            <span className="flex items-center gap-2">
              <Package className="w-4 h-4 text-primary" />
              Precios vigentes
              <Badge variant="outline" className="text-[10px]">{eventPackages.length}</Badge>
            </span>
            <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${showPricesTable ? "rotate-90" : ""}`} />
          </button>
          {showPricesTable && (
            <div className="px-4 pb-3 pt-1 space-y-1.5 border-t border-border/40">
              {eventPackages.map((p) => {
                const stages = priceStagesByPkg[p.id];
                const active = resolveActivePrice(p.precio, p.currency, stages);
                return (
                  <div key={p.id} className="flex items-center justify-between gap-3 py-1.5 text-sm border-b border-border/20 last:border-0">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">{p.nombre}</div>
                      {active.activeStage && (
                        <div className="text-[11px] text-emerald-500">
                          Etapa vigente: {active.activeStage.nombre}
                          {active.nextStage && (
                            <span className="text-muted-foreground"> · próxima: {active.nextStage.nombre} ({formatCountdown(active.nextStage.vigente_desde)})</span>
                          )}
                        </div>
                      )}
                      {!active.activeStage && active.nextStage && (
                        <div className="text-[11px] text-muted-foreground">
                          Próxima etapa: {active.nextStage.nombre} ({formatCountdown(active.nextStage.vigente_desde)})
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-primary">{formatPrice(active.precio, active.currency as any)}</div>
                      {active.activeStage && Number(active.activeStage.precio) !== Number(p.precio) && (
                        <div className="text-[10px] text-muted-foreground line-through">{formatPrice(p.precio, p.currency as any)}</div>
                      )}
                    </div>
                  </div>
                );
              })}
              <p className="text-[10px] text-muted-foreground pt-1">
                Precio actual según etapas configuradas. Se aplica automáticamente a nuevas reservas.
              </p>
            </div>
          )}
        </div>
      )}

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
            placeholder="Buscar por nombre o email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-10"
          />
        </div>
        <Select value={filterResStatus} onValueChange={setFilterResStatus}>
          <SelectTrigger className="w-[150px] h-10">
            <SelectValue placeholder={isSchoolEvent ? "Inscripción" : "Reserva"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{isSchoolEvent ? "Todas las inscripciones" : "Todas las reservas"}</SelectItem>
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
        {isTripLike && (
          <Button
            variant="outline"
            size="sm"
            className="h-10"
            onClick={sendBulkChecklistReminder}
            disabled={sendingBulkReminder}
            title="Enviar recordatorio de preparación del viaje a participantes confirmados"
          >
            {sendingBulkReminder ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Bell className="w-4 h-4 mr-1.5" />}
            Recordar preparación
          </Button>
        )}
        {isTripLike && (
          <Button variant="outline" size="sm" className="h-10" onClick={() => setShowTripReports(true)}>
            <FileText className="w-4 h-4 mr-1.5" /> Reportes
          </Button>
        )}
        <Button variant="outline" size="sm" className="h-10" onClick={() => { setShowAddStudent(true); setStudentSearch(""); setStudentResults([]); setAddExternalMode(false); }}>
          <UserPlus className="w-4 h-4 mr-1.5" /> Agregar
        </Button>
      </div>

      {/* ─── Add Participant Dialog ─── */}
      <Dialog open={showAddStudent} onOpenChange={setShowAddStudent}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Agregar participante</DialogTitle>
            <DialogDescription>Inscribí un alumno existente o un participante externo.</DialogDescription>
          </DialogHeader>
          <Tabs value={addExternalMode ? "external" : "student"} onValueChange={(v) => setAddExternalMode(v === "external")}>
            <TabsList className="w-full">
              <TabsTrigger value="student" className="flex-1">Alumno</TabsTrigger>
              <TabsTrigger value="external" className="flex-1">Participante externo</TabsTrigger>
            </TabsList>
            <TabsContent value="student" className="space-y-3 mt-3">
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
            </TabsContent>
            <TabsContent value="external" className="space-y-3 mt-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Nombre *</Label>
                  <Input value={extName} onChange={(e) => setExtName(e.target.value)} placeholder="Nombre" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Apellido</Label>
                  <Input value={extLastName} onChange={(e) => setExtLastName(e.target.value)} placeholder="Apellido" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Email *</Label>
                <Input type="email" value={extEmail} onChange={(e) => setExtEmail(e.target.value)} placeholder="email@ejemplo.com" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Teléfono</Label>
                  <Input value={extPhone} onChange={(e) => setExtPhone(e.target.value)} placeholder="+54 9 11..." />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Documento</Label>
                  <Input value={extDoc} onChange={(e) => setExtDoc(e.target.value)} placeholder="DNI" />
                </div>
              </div>
              <Button className="w-full" disabled={addingExternal || !extName || !extEmail} onClick={addExternalToEvent}>
                {addingExternal ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <UserPlus className="w-4 h-4 mr-1.5" />}
                Agregar participante externo
              </Button>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* ─── Reservations List ─── */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground animate-pulse">
          <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin" />
          Cargando {termReservas}...
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No hay {termReservas} que coincidan.</p>
        </div>
      ) : (
        <div className="space-y-0">
          {/* Column headers */}
          <div className={`hidden md:grid ${isPaymentFree ? "md:grid-cols-[1fr_130px_130px_80px_44px]" : "md:grid-cols-[1fr_130px_130px_90px_90px_80px_44px]"} gap-2 px-4 py-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wider border-b border-border`}>
            <button className="flex items-center gap-1 hover:text-foreground text-left" onClick={() => toggleSort("name")}>
              Alumno <ArrowUpDown className="w-3 h-3" />
            </button>
            <span>{isSchoolEvent ? "Inscripción" : "Reserva"}</span>
            <span>Pago</span>
            {!isPaymentFree && (
              <>
                <button className="flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort("balance")}>
                  Abonado <ArrowUpDown className="w-3 h-3" />
                </button>
                <span>Saldo</span>
              </>
            )}
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
              const p = getParticipant(r);
              const waUrl = getWhatsAppUrl(p.telefono, p.nombre);
              return (
                <div
                  key={r.id}
                  className={`group px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer ${getRowPriority(r)}`}
                  onClick={() => openDetail(r)}
                >
                  {/* Desktop row */}
                  <div className={`hidden md:grid ${isPaymentFree ? "md:grid-cols-[1fr_130px_130px_80px_44px]" : "md:grid-cols-[1fr_130px_130px_90px_90px_80px_44px]"} gap-2 items-center`}>
                    {/* Participant */}
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {p.nombre} {p.apellido || ""}
                        {p.isExternal && <Badge variant="outline" className="ml-1.5 text-[9px] border-violet-500/30 text-violet-500">Externo</Badge>}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{p.email}</p>
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
                        {isPaymentFree ? "Sin pago requerido" : (paymentStatusLabels[r.payment_status] || r.payment_status)}
                      </Badge>
                    </div>
                    {/* Abonado + Saldo — only when payment required */}
                    {!isPaymentFree && (
                      <>
                        <p className="text-sm text-emerald-500 font-medium">{fmtMoney(r.amount_paid, c)}</p>
                        <p className={`text-sm font-medium ${bal > 0 ? "text-amber-500" : "text-muted-foreground"}`}>
                          {fmtMoney(bal, c)}
                        </p>
                      </>
                    )}
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
                          {!isPaymentFree && (
                            <DropdownMenuItem onClick={() => { openDetail(r); setTimeout(() => setShowAdminPayment(true), 100); }}>
                              <Banknote className="w-3.5 h-3.5 mr-2" /> Registrar pago
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => setChangePackageFor(r)}>
                            <Package className="w-3.5 h-3.5 mr-2" /> Cambiar paquete
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {waUrl && (
                            <DropdownMenuItem asChild>
                              <a href={waUrl} target="_blank" rel="noopener noreferrer">
                                <MessageCircle className="w-3.5 h-3.5 mr-2" /> WhatsApp
                              </a>
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => { openDetail(r); setTimeout(() => { document.getElementById("comunicaciones-section")?.scrollIntoView({ behavior: "smooth", block: "start" }); }, 250); }}>
                              <Mail className="w-3.5 h-3.5 mr-2" /> Enviar email
                          </DropdownMenuItem>
                          {isTripLike && r.access_token && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => {
                                const url = `${getShareOrigin()}/viaje/mi-reserva?token=${r.access_token}`;
                                navigator.clipboard.writeText(url);
                                toast({ title: "Link copiado", description: "Se copió el enlace de acceso al portapapeles" });
                              }}>
                                <Copy className="w-3.5 h-3.5 mr-2" /> Copiar link de acceso
                              </DropdownMenuItem>
                            </>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => deleteReservation(r.id, `${p.nombre} ${p.apellido || ""}`.trim())}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="w-3.5 h-3.5 mr-2" /> Eliminar participante
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>

                    </div>
                  </div>

                  {/* Mobile card */}
                  <div className="md:hidden space-y-2">
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">
                          {p.nombre} {p.apellido || ""}
                          {p.isExternal && <Badge variant="outline" className="ml-1 text-[9px] border-violet-500/30 text-violet-500">Ext</Badge>}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{p.email}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="outline" className={`text-[10px] border ${reservationStatusColors[r.reservation_status] || ""}`}>
                        {reservationStatusLabels[r.reservation_status] || r.reservation_status}
                      </Badge>
                      <Badge variant="outline" className={`text-[10px] border ${paymentStatusColors[r.payment_status] || ""}`}>
                        {isPaymentFree ? "Sin pago requerido" : (paymentStatusLabels[r.payment_status] || r.payment_status)}
                      </Badge>
                    </div>
                    {!isPaymentFree && (
                      <div className="flex items-center gap-4 text-xs">
                        <span className="text-emerald-500">Abonado: {fmtMoney(r.amount_paid, c)}</span>
                        {bal > 0 && <span className="text-amber-500">Saldo: {fmtMoney(bal, c)}</span>}
                      </div>
                    )}
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
            <SheetTitle className="text-lg flex items-center gap-2">
              {selectedRes && (() => { const sp = getParticipant(selectedRes); return <>{sp.nombre} {sp.apellido || ""}{sp.isExternal && <Badge variant="outline" className="text-[10px] border-violet-500/30 text-violet-500">Externo</Badge>}</>; })()}
            </SheetTitle>
            <SheetDescription>{selectedRes && getParticipant(selectedRes).email}</SheetDescription>
          </SheetHeader>

          {selectedRes && (
            <div className="space-y-6 pb-8">
              {/* Quick actions */}
              <div className="flex flex-wrap gap-2">
                {(() => {
                  const sp = getParticipant(selectedRes);
                  const waUrl = getWhatsAppUrl(sp.telefono, sp.nombre);
                  return waUrl ? (
                    <Button variant="outline" size="sm" asChild>
                      <a href={waUrl} target="_blank" rel="noopener noreferrer">
                        <MessageCircle className="w-3.5 h-3.5 mr-1.5" /> WhatsApp
                      </a>
                    </Button>
                  ) : null;
                })()}
                <Button variant="outline" size="sm" onClick={() => {
                  prepareTemplate("novedad", selectedRes);
                  setShowNotifyDialog(true);
                }}>
                  <Mail className="w-3.5 h-3.5 mr-1.5" /> Email
                </Button>
                {isTripLike && selectedRes.access_token && (
                  <Button variant="outline" size="sm" onClick={() => {
                    const url = `${getShareOrigin()}/viaje/mi-reserva?token=${selectedRes.access_token}`;
                    navigator.clipboard.writeText(url);
                    toast({ title: "Link copiado", description: "Se copió el enlace de acceso al portapapeles" });
                  }}>
                    <Copy className="w-3.5 h-3.5 mr-1.5" /> Link de acceso
                  </Button>
                )}
              </div>

              {/* Status controls */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">{isSchoolEvent ? "Estado de inscripción" : "Estado reserva"}</Label>
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
              {isPaymentFree ? (
                <div className="rounded-xl border border-border p-4">
                  <p className="text-xs text-muted-foreground">Este evento no requiere pago desde la app.</p>
                </div>
              ) : (
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
                    Método: <span className="capitalize">{selectedRes.metodo_pago?.replace(/_/g, " ")}</span>
                  </p>
                </div>
              )}

              {/* Dates / timeline */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Cronología</h4>
                <div className="space-y-1.5 text-xs">
                  <TimelineItem label={termReservaCreada} date={selectedRes.created_at} />
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

              {/* Result section for school events (record_hora, carrera, etc.) */}
              {isSchoolEvent && (
                <div className="rounded-xl border border-border p-4 space-y-3">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Resultado del participante</h4>
                  {participantResult ? (
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-[10px] text-muted-foreground">Check-in</p>
                        <p className="font-medium">{participantResult.checked_in_at ? "Sí" : "No"}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground">Resultado cargado</p>
                        <p className="font-medium">{participantResult.time_value != null ? "Sí" : "No"}</p>
                      </div>
                      {participantResult.time_value != null && (
                        <>
                          <div>
                            <p className="text-[10px] text-muted-foreground">Distancia</p>
                            <p className="font-medium">{participantResult.time_value} km</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-muted-foreground">Posición</p>
                            <p className="font-medium">{participantResult.position ?? "—"}</p>
                          </div>
                        </>
                      )}
                      {participantResult.time_result && (
                        <div className="col-span-2">
                          <p className="text-[10px] text-muted-foreground">Detalle</p>
                          <p className="font-medium">{participantResult.time_result}</p>
                        </div>
                      )}
                      {participantResult.staff_feedback && (
                        <div className="col-span-2">
                          <p className="text-[10px] text-muted-foreground">Feedback del staff</p>
                          <p className="font-medium">{participantResult.staff_feedback}</p>
                        </div>
                      )}
                      {participantResult.results_updated_at && (
                        <div className="col-span-2">
                          <p className="text-[10px] text-muted-foreground">Última actualización</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(participantResult.results_updated_at).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Sin registro de participación (check-in) para este evento.</p>
                  )}
                </div>
              )}

              {/* Trip preparation checklist — only for camp/viaje */}
              {/* Resumen consolidado del viaje (compra + pagos + configuración + comunicación) */}
              {isTripLike && (
                <TripSummary
                  reservationId={selectedRes.id}
                  alumnoId={selectedRes.alumno_id}
                  eventCurrency={curr(selectedRes)}
                  mode="admin"
                />
              )}
              {/* Precio base del viaje (override por participante) */}
              {!isPaymentFree && (
                <ReservationBasePriceEditor
                  reservationId={selectedRes.id}
                  eventPrice={eventPrice ?? 0}
                  eventCurrency={curr(selectedRes)}
                  currentPriceSnapshot={selectedRes.price_snapshot ?? null}
                  onChanged={() => {
                    loadReservations();
                    loadPayments(selectedRes.id);
                  }}
                />
              )}
              {/* Extras contratados (siempre disponible si el evento tiene addons) */}
              {!isPaymentFree && (
                <ReservationAddonsPanel
                  reservationId={selectedRes.id}
                  eventId={eventId}
                  onChanged={() => {
                    loadReservations();
                    loadPayments(selectedRes.id);
                  }}
                />
              )}

              {/* Installments — solo en modo cuotas y con pago requerido */}
              {!isPaymentFree && !isSimplePayment && (
                <ReservationInstallmentsPanel
                  reservationId={selectedRes.id}
                  reservationCurrency={curr(selectedRes)}
                  reservationAmountTotal={selectedRes.amount_total || 0}
                  reservationAmountPaid={selectedRes.amount_paid || 0}
                  hasEventInstallments={installments.length > 0}
                  reservationPackageId={(selectedRes as any).package_id ?? null}
                  reservationHasPaymentPlan={!!(selectedRes as any).payment_plan_id}
                  onChanged={() => {
                    loadReservations();
                    loadPayments(selectedRes.id);
                  }}
                />
              )}


              {/* Payments section */}
              {isPaymentFree ? (
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pagos</h4>
                  <p className="text-xs text-muted-foreground py-2">Este evento no requiere pagos registrados.</p>
                </div>
              ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pagos registrados</h4>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => {
                      const toggling = !showAdminPayment;
                      setShowAdminPayment(toggling);
                      if (toggling && selectedRes) {
                        const evCurr = curr(selectedRes);
                        setAdminPayCurrency(evCurr);
                        setAdminPayRate("1");
                        setAdminPayEquivalent("");
                        setAdminPayOverride(false);
                        setAdminPayOverrideReason("");
                        setAdminPayInstallmentId(null);
                        setAdminPayGeneralReason("");
                        setAdminPayAmount(selectedRes.balance_due?.toString() || "");
                        loadMatInstallments(selectedRes.id);
                      }
                    }}
                  >
                    <Banknote className="w-3.5 h-3.5 mr-1" /> Registrar pago manual validado
                  </Button>
                </div>

                {/* Admin payment form */}
                 {showAdminPayment && (() => {
                   const evCurr = selectedRes ? curr(selectedRes) : eventCurrency;
                   const sameCurrency = adminPayCurrency === evCurr;

                   // Tri-directional calc helpers
                   const amt = parseFloat(adminPayAmount) || 0;
                   const rateVal = parseFloat(adminPayRate) || 0;
                   const eqVal = parseFloat(adminPayEquivalent) || 0;
                   const computedEq = sameCurrency ? amt : (amt && rateVal ? amt * rateVal : 0);
                   // Override = admin manually set equivalent that differs from computed
                   const hasRealOverride = !sameCurrency && adminPayOverride && eqVal > 0 && Math.abs(eqVal - computedEq) > 0.005;

                   // Field change handlers with auto-calc
                   const onAmountChange = (v: string) => {
                     setAdminPayAmount(v);
                     const a = parseFloat(v) || 0;
                     if (sameCurrency) {
                       setAdminPayEquivalent(a ? a.toFixed(2) : "");
                       setAdminPayRate("1");
                       setAdminPayOverride(false);
                       return;
                     }
                     const r = parseFloat(adminPayRate) || 0;
                     if (a && r) {
                       setAdminPayEquivalent((a * r).toFixed(2));
                       setAdminPayOverride(false);
                     } else if (a && eqVal) {
                       // Have amount + equivalent → calc rate
                       setAdminPayRate((eqVal / a).toFixed(4));
                       setAdminPayOverride(false);
                     }
                   };

                   const onRateChange = (v: string) => {
                     setAdminPayRate(v);
                     const r = parseFloat(v) || 0;
                     if (amt && r) {
                       setAdminPayEquivalent((amt * r).toFixed(2));
                       setAdminPayOverride(false);
                     } else if (r && eqVal) {
                       // Have rate + equivalent → calc amount
                       setAdminPayAmount((eqVal / r).toFixed(2));
                       setAdminPayOverride(false);
                     }
                   };

                   const onEquivalentChange = (v: string) => {
                     setAdminPayEquivalent(v);
                     const eq = parseFloat(v) || 0;
                     if (amt && rateVal && eq) {
                       // All three present — check if it's a manual override
                       const expected = amt * rateVal;
                       if (Math.abs(eq - expected) > 0.005) {
                         setAdminPayOverride(true);
                       } else {
                         setAdminPayOverride(false);
                       }
                     } else if (eq && amt && !rateVal) {
                       // Have equivalent + amount → calc rate
                       setAdminPayRate((eq / amt).toFixed(4));
                       setAdminPayOverride(false);
                     } else if (eq && rateVal && !amt) {
                       // Have equivalent + rate → calc amount
                       setAdminPayAmount((eq / rateVal).toFixed(2));
                       setAdminPayOverride(false);
                     } else {
                       setAdminPayOverride(false);
                     }
                   };
                   const hasPendingInst = matInstallments.some((i: any) => i.status === "pendiente" || i.status === "parcial");

                   return (
                   <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 space-y-3">
                     <p className="text-xs font-semibold text-primary">Registrar pago manual validado</p>

                     {/* Currency + Amount */}
                     <div className="grid grid-cols-3 gap-3">
                       <div className="space-y-1">
                         <Label className="text-[11px] text-muted-foreground">Moneda *</Label>
                         <Select value={adminPayCurrency} onValueChange={(v) => {
                           setAdminPayCurrency(v);
                           const sc = v === evCurr;
                           setAdminPayRate(sc ? "1" : "");
                           setAdminPayOverride(false);
                           setAdminPayOverrideReason("");
                           if (sc && adminPayAmount) {
                             setAdminPayEquivalent((parseFloat(adminPayAmount) || 0).toFixed(2));
                           } else {
                             setAdminPayEquivalent("");
                           }
                         }}>
                           <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                           <SelectContent>
                             <SelectItem value="EUR">€ EUR</SelectItem>
                             <SelectItem value="USD">US$ USD</SelectItem>
                             <SelectItem value="ARS">$ ARS</SelectItem>
                           </SelectContent>
                         </Select>
                       </div>
                       <div className="space-y-1">
                         <Label className="text-[11px] text-muted-foreground">Monto en {adminPayCurrency} *</Label>
                         <Input type="number" step="0.01" min="0" value={adminPayAmount} onChange={(e) => onAmountChange(e.target.value)} className="h-9" placeholder="Ej: 600" />
                       </div>
                       <div className="space-y-1">
                         <Label className="text-[11px] text-muted-foreground">Fecha</Label>
                         <Input type="date" value={adminPayDate} onChange={(e) => setAdminPayDate(e.target.value)} className="h-9" />
                       </div>
                     </div>

                     {/* Exchange rate (only if different currency) */}
                     {!sameCurrency && (
                       <div className="grid grid-cols-2 gap-3">
                         <div className="space-y-1">
                           <Label className="text-[11px] text-muted-foreground">Cotización a {evCurr} *</Label>
                           <Input type="number" step="0.0001" min="0" value={adminPayRate} onChange={(e) => onRateChange(e.target.value)} className="h-9" placeholder={`1 ${adminPayCurrency} = ? ${evCurr}`} />
                           <p className="text-[10px] text-muted-foreground">1 {adminPayCurrency} = {adminPayRate || "?"} {evCurr}</p>
                         </div>
                         <div className="space-y-1">
                           <Label className="text-[11px] text-muted-foreground">Equivalente reconocido ({evCurr})</Label>
                           <Input
                             type="number"
                             step="0.01"
                             value={adminPayEquivalent}
                             onChange={(e) => onEquivalentChange(e.target.value)}
                             className="h-9"
                           />
                           {!hasRealOverride && eqVal > 0 && (
                             <p className="text-[10px] text-emerald-400">= {formatPrice(eqVal, evCurr)}</p>
                           )}
                           {hasRealOverride && (
                             <p className="text-[10px] text-amber-400">Override manual (esperado: {formatPrice(computedEq, evCurr)})</p>
                           )}
                         </div>
                       </div>
                     )}

                     {/* Override reason — only when there's a real override */}
                     {hasRealOverride && (
                       <div className="space-y-1">
                         <Label className="text-[11px] text-muted-foreground">Motivo del override *</Label>
                         <Input value={adminPayOverrideReason} onChange={(e) => setAdminPayOverrideReason(e.target.value)} className="h-9" placeholder="Ej: Cotización especial pactada..." />
                       </div>
                     )}

                    {/* Installment selector */}
                    {matInstallments.length > 0 && (
                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">Imputar a cuota</Label>
                        <Select value={adminPayInstallmentId || "__general__"} onValueChange={(v) => {
                          const newId = v === "__general__" ? null : v;
                          setAdminPayInstallmentId(newId);
                          setAdminPayGeneralReason("");
                          if (newId) {
                            const inst = matInstallments.find((i: any) => i.id === newId);
                            const pending = inst ? parseFloat(inst.balance_due ?? inst.amount ?? 0) : 0;
                            if (pending > 0) onAmountChange(String(pending));
                          }
                        }}>

                          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__general__">Pago general</SelectItem>
                            {matInstallments.map((inst: any) => (
                              <SelectItem key={inst.id} value={inst.id}>
                                {inst.label || `Cuota ${inst.installment_number}`} — {formatPrice(inst.balance_due, evCurr)} pendiente
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {/* General payment reason when installments exist */}
                    {!adminPayInstallmentId && hasPendingInst && (
                      <div className="space-y-1">
                        <Label className="text-[11px] text-amber-400">Motivo de pago general (obligatorio con cuotas pendientes) *</Label>
                        <Input value={adminPayGeneralReason} onChange={(e) => setAdminPayGeneralReason(e.target.value)} className="h-9" placeholder="Ej: Anticipo sin cuota específica..." />
                      </div>
                    )}

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

                    {/* Summary */}
                    {parseFloat(adminPayAmount) > 0 && (
                      <div className="p-2 rounded-lg bg-secondary/30 text-xs space-y-1">
                        <p><strong>Resumen:</strong> {formatPrice(parseFloat(adminPayAmount), adminPayCurrency)}
                          {!sameCurrency && ` × ${adminPayRate || "?"} = ${formatPrice(adminPayOverride ? parseFloat(adminPayEquivalent) || 0 : computedEq, evCurr)} reconocidos`}
                        </p>
                        {adminPayInstallmentId && (() => {
                          const inst = matInstallments.find((i: any) => i.id === adminPayInstallmentId);
                          return inst ? <p>→ Imputado a: <strong>{inst.label || `Cuota ${inst.installment_number}`}</strong></p> : null;
                        })()}
                        {!adminPayInstallmentId && <p>→ Pago general (sin cuota específica)</p>}
                      </div>
                    )}

                    <div className="flex items-center gap-2 pt-1">
                      <Switch checked={notifyOnPayment} onCheckedChange={setNotifyOnPayment} id="notify-pay" />
                      <Label htmlFor="notify-pay" className="text-[11px] text-muted-foreground cursor-pointer">
                        Notificar al alumno por email
                      </Label>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setShowAdminPayment(false)}>Cancelar</Button>
                      <Button variant="default" size="sm" disabled={submittingAdminPay} onClick={registerAdminPayment}>
                        {submittingAdminPay ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <CheckCircle className="w-3.5 h-3.5 mr-1" />}
                        {notifyOnPayment ? "Registrar y notificar" : "Registrar sin notificar"}
                      </Button>
                    </div>
                  </div>
                  );
                })()}

                {payments.length === 0 && !showAdminPayment ? (
                  <p className="text-xs text-muted-foreground py-2">Sin pagos registrados.</p>
                ) : (
                  <div className="space-y-2">
                    {payments.map((p) => {
                      const origAmt = p.original_amount ?? p.amount;
                      const origCurr = p.original_currency ?? p.currency;
                      const evCurr = p.event_currency || (selectedRes ? curr(selectedRes) : eventCurrency);
                      const sameCurr = origCurr === evCurr;
                      const eq = p.equivalent_amount_event_currency;
                      const rate = p.exchange_rate_to_event_currency;
                      const isAnulado = p.status === "anulado";
                      return (
                        <div key={p.id} className={`rounded-lg border p-3 space-y-2 ${isAnulado ? "border-border/50 opacity-60" : "border-border"}`}>
                          <div className="flex justify-between items-start gap-2">
                            <div className="min-w-0">
                              <p className={`text-sm font-semibold ${isAnulado ? "line-through" : ""}`}>
                                {formatPrice(origAmt, origCurr)} — <span className="capitalize">{p.payment_method}</span>
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {new Date(p.payment_date + "T12:00:00").toLocaleDateString("es-AR")}
                                {p.payment_reference && ` · Ref: ${p.payment_reference}`}
                              </p>
                              {!sameCurr && p.status === "validado" && eq != null && rate != null && (
                                <p className="text-[11px] text-emerald-400 mt-1">
                                  Cotización {rate} → reconocido <strong>{formatPrice(eq, evCurr)}</strong>
                                  {p.manual_override && <span className="ml-1 text-amber-400">(override)</span>}
                                </p>
                              )}
                              {sameCurr && p.status === "validado" && eq != null && (
                                <p className="text-[11px] text-emerald-400 mt-1">Reconocido {formatPrice(eq, evCurr)}</p>
                              )}
                              {!sameCurr && p.status === "informado" && (
                                <p className="text-[11px] text-amber-400 mt-1">Pendiente de cotización a {evCurr}</p>
                              )}
                              {p.status === "rechazado" && p.review_notes && (
                                <p className="text-[11px] text-red-400 mt-1">Motivo: {p.review_notes}</p>
                              )}
                              {isAnulado && p.anulado_motivo && (
                                <p className="text-[11px] text-red-400 mt-1">Anulado: {p.anulado_motivo}</p>
                              )}
                            </div>
                            <Badge variant="outline" className={`text-[10px] border shrink-0 ${paymentStatusColors[p.status] || ""}`}>
                              {p.status}
                            </Badge>
                          </div>
                          {p.notes && <p className="text-xs text-muted-foreground">{p.notes}</p>}
                          {p.proof_url && <p className="text-[11px] text-muted-foreground">📎 Comprobante adjunto</p>}
                          {/* Action buttons */}
                          <div className="flex gap-2 flex-wrap">
                            {p.status === "informado" && (
                              <Button size="sm" variant="default" className="text-xs h-7" onClick={() => openReviewPayment(p)}>
                                <CheckCircle className="w-3 h-3 mr-1" /> Revisar y validar
                              </Button>
                            )}
                            {!isAnulado && (
                              <>
                                <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => { setPaymentToEdit(p); setEditPaymentMode("edit"); }}>
                                  <Pencil className="w-3 h-3 mr-1" /> Editar
                                </Button>
                                <Button size="sm" variant="ghost" className="text-xs h-7 text-destructive hover:text-destructive" onClick={() => { setPaymentToEdit(p); setEditPaymentMode("annul"); }}>
                                  <Ban className="w-3 h-3 mr-1" /> Anular
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              )}
              {/* Notifications section */}
              <div className="space-y-3" id="comunicaciones-section">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Bell className="w-3.5 h-3.5" /> Comunicaciones
                  </h4>
                  <div className="flex gap-1.5">
                    {installments.length > 0 && (() => {
                      const accPaid = selectedRes.amount_paid || 0;
                      let acc = 0;
                      const nextInst = installments.find((inst: any) => {
                        acc += parseFloat(inst.amount || "0");
                        return acc > accPaid;
                      });
                      if (nextInst) {
                        const isOverdue = nextInst.due_date && new Date(nextInst.due_date) < new Date();
                        return (
                          <Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={() => {
                            prepareTemplate(isOverdue ? "cuota_pendiente" : "cuota_proxima", selectedRes, {
                              monto_cuota: parseFloat(nextInst.amount || "0"),
                              vencimiento: nextInst.due_date ? new Date(nextInst.due_date + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "long" }) : "N/A",
                            });
                            setShowNotifyDialog(true);
                          }}>
                            <Bell className="w-3 h-3 mr-1" /> {isOverdue ? "Recordar cuota vencida" : "Avisar próx. vencimiento"}
                          </Button>
                        );
                      }
                      return null;
                    })()}
                    <Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={() => {
                      prepareTemplate("novedad", selectedRes);
                      setShowNotifyDialog(true);
                    }}>
                      <Send className="w-3 h-3 mr-1" /> Enviar novedad
                    </Button>
                  </div>
                </div>

                {notifications.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">Sin comunicaciones enviadas.</p>
                ) : (
                  <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                    {notifications.map((n) => (
                      <button
                        type="button"
                        key={n.id}
                        onClick={() => setViewNotif(n)}
                        className="w-full text-left rounded-lg border border-border p-2.5 space-y-1 hover:bg-secondary/40 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {n.canal === "email" ? <Mail className="w-3 h-3 text-muted-foreground shrink-0" /> : <MessageCircle className="w-3 h-3 text-muted-foreground shrink-0" />}
                            <span className="text-xs font-medium truncate">{n.asunto}</span>
                            {n.metadata?.email_sent === false && (
                              <Badge variant="outline" className="text-[9px] border-destructive/30 text-destructive">No enviado</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Badge variant="outline" className="text-[9px]">{n.tipo.replace(/_/g, " ")}</Badge>
                            <Eye className="w-3 h-3 text-muted-foreground" />
                          </div>
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(n.created_at).toLocaleDateString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                          {n.enviado_por_email && ` · por ${n.enviado_por_email}`}
                          {" · "}{n.canal}
                        </p>
                        {n.metadata?.email_error && (
                          <p className="text-[10px] text-destructive">{n.metadata.email_error}</p>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Ver contenido de la comunicación */}
              <Dialog open={!!viewNotif} onOpenChange={(o) => !o && setViewNotif(null)}>
                <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="text-base">{viewNotif?.asunto || "Comunicación"}</DialogTitle>
                    <DialogDescription className="text-xs">
                      {viewNotif && (
                        <>
                          {new Date(viewNotif.created_at).toLocaleString("es-AR", { dateStyle: "medium", timeStyle: "short" })}
                          {" · "}{viewNotif.canal}
                          {viewNotif.enviado_por_email && ` · por ${viewNotif.enviado_por_email}`}
                          {" · "}<span className="uppercase">{viewNotif.tipo.replace(/_/g, " ")}</span>
                        </>
                      )}
                    </DialogDescription>
                  </DialogHeader>
                  {viewNotif && (
                    <div className="space-y-3">
                      {viewNotif.metadata?.email_error && (
                        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                          Error de envío: {String(viewNotif.metadata.email_error)}
                        </div>
                      )}
                      {viewNotif.metadata?.html || (viewNotif.contenido && /<[a-z][\s\S]*>/i.test(viewNotif.contenido)) ? (
                        <div
                          className="rounded-md border border-border bg-white text-black p-4 text-sm overflow-x-auto"
                          dangerouslySetInnerHTML={{ __html: (viewNotif.metadata?.html as string) || viewNotif.contenido || "" }}
                        />
                      ) : (
                        <pre className="rounded-md border border-border bg-secondary/30 p-3 text-xs whitespace-pre-wrap font-sans">
                          {viewNotif.contenido || "(sin contenido guardado)"}
                        </pre>
                      )}
                    </div>
                  )}
                </DialogContent>
              </Dialog>


              {/* Send notification dialog */}
              {showNotifyDialog && (
                <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-primary flex items-center gap-1.5">
                      <Send className="w-3.5 h-3.5" /> Enviar notificación por email
                    </p>
                    <Select value={notifyTemplate} onValueChange={async (v) => {
                      const key = v as NotifTemplateKey;
                      let extra: Record<string, any> = {};
                      const evCurr = selectedRes.currency_snapshot || selectedRes.moneda || eventCurrency;
                      if ((key === "cuota_pendiente" || key === "cuota_proxima") && installments.length > 0) {
                        const accPaid = selectedRes.amount_paid || 0;
                        let acc = 0;
                        const nextInst: any = installments.find((inst: any) => {
                          acc += parseFloat(inst.amount || "0");
                          return acc > accPaid;
                        });
                        if (nextInst) {
                          extra = {
                            monto_cuota: parseFloat(nextInst.amount || "0"),
                            vencimiento: nextInst.due_date
                              ? new Date(nextInst.due_date + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" })
                              : "Sin fecha definida",
                            cuota_label: nextInst.label || `Cuota ${nextInst.installment_number || ""}`.trim(),
                          };
                        }
                      }
                      if (key === "pago_registrado" || key === "plan_pagos") {
                        const instsList = await ensureMatInstallments(selectedRes.id);
                        const plan = buildPlanPagos(instsList, evCurr);
                        extra = {
                          ...extra,
                          plan_text: plan.text,
                          plan_html: plan.html,
                          total: formatPrice(selectedRes.amount_total || 0, evCurr),
                        };
                      }
                      // Reset MP link for any template switch
                      setMpPayUrl("");
                      if (key === "cuota_pago_mp") {
                        setPreparingMpLink(true);
                        try {
                          const instsList = await ensureMatInstallments(selectedRes.id);
                          const nextInst: any = instsList.find((i: any) =>
                            (i.status === "pendiente" || i.status === "parcial" || i.status === "vencida") &&
                            Number(i.balance_due ?? i.amount ?? 0) > 0
                          );
                          if (!nextInst) {
                            toast({ title: "No hay cuotas pendientes", variant: "destructive" });
                            setPreparingMpLink(false);
                            return;
                          }
                          const { data: mpData, error: mpErr } = await supabase.functions.invoke("create-event-mp-preference", {
                            body: {
                              reservation_id: selectedRes.id,
                              installment_number: nextInst.installment_number,
                            },
                          });
                          if (mpErr || !mpData?.init_point) {
                            toast({ title: "No se pudo generar el link de Mercado Pago", description: mpErr?.message || mpData?.error || "", variant: "destructive" });
                            setPreparingMpLink(false);
                            return;
                          }
                          setMpPayUrl(mpData.init_point);
                          const plan = buildPlanPagos(instsList, evCurr);
                          extra = {
                            monto_cuota: Number(nextInst.balance_due ?? nextInst.amount ?? 0),
                            vencimiento: nextInst.due_date
                              ? new Date(nextInst.due_date + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" })
                              : "a coordinar",
                            cuota_label: nextInst.label || `Cuota ${nextInst.installment_number || ""}`.trim(),
                            mp_link: mpData.init_point,
                            reserva_link: getReservaLink(selectedRes),
                            total: formatPrice(selectedRes.amount_total || 0, evCurr),
                            plan_text: plan.text,
                            plan_html: plan.html,
                          };
                        } finally {
                          setPreparingMpLink(false);
                        }
                      }
                      prepareTemplate(key, selectedRes, extra);
                    }}>

                      <SelectTrigger className="h-7 w-[180px] text-[10px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(notifTemplates).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Asunto</Label>
                    <Input value={notifySubject} onChange={(e) => setNotifySubject(e.target.value)} className="h-9" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Mensaje (texto plano, editable)</Label>
                    <Textarea value={notifyBody} onChange={(e) => setNotifyBody(e.target.value)} rows={5} className="text-xs" />
                  </div>
                  <div className="flex items-center gap-2">
                    {(() => {
                      const waUrl = getWhatsAppUrl(selectedRes.alumno?.telefono, selectedRes.alumno?.nombre || "");
                      if (!waUrl) return null;
                      return (
                        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => {
                          const msg = encodeURIComponent(notifyBody);
                          let num = (selectedRes.alumno?.telefono || "").replace(/[\s\-\(\)\.]/g, "");
                          if (num.startsWith("+")) num = num.slice(1);
                          if (!num.startsWith("549")) { if (num.startsWith("0")) num = num.slice(1); if (num.startsWith("15")) num = num.slice(2); num = "549" + num; }
                          window.open(`https://wa.me/${num}?text=${msg}`, "_blank");
                          logWhatsAppAction(selectedRes, notifyTemplate, notifyBody);
                        }}>
                          <MessageCircle className="w-3.5 h-3.5 mr-1" /> Enviar por WhatsApp
                        </Button>
                      );
                    })()}
                    <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => {
                      navigator.clipboard.writeText(notifyBody);
                      toast({ title: "Mensaje copiado al portapapeles" });
                    }}>
                      <Copy className="w-3.5 h-3.5 mr-1" /> Copiar
                    </Button>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button variant="ghost" size="sm" onClick={() => setShowNotifyDialog(false)}>Cancelar</Button>
                    <Button variant="default" size="sm" disabled={sendingNotif} onClick={async () => {
                      let bodyToSend = notifyBody;
                      let htmlToSend = notifyHtml;
                      if ((notifyTemplate === "plan_pagos" || notifyTemplate === "pago_registrado") && notifyBody.includes("Sin cuotas configuradas")) {
                        const evCurr = selectedRes.currency_snapshot || selectedRes.moneda || eventCurrency;
                        const instsList = await ensureMatInstallments(selectedRes.id);
                        const plan = buildPlanPagos(instsList, evCurr);
                        const tpl = notifTemplates[notifyTemplate];
                        const ctx = getNotifContext(selectedRes, {
                          plan_text: plan.text,
                          plan_html: plan.html,
                          total: formatPrice(selectedRes.amount_total || 0, evCurr),
                        });
                        bodyToSend = tpl.contenido(ctx);
                        htmlToSend = tpl.html(ctx);
                        setNotifyBody(bodyToSend);
                        setNotifyHtml(htmlToSend);
                      }
                      const ok = await sendNotification(notifyTemplate, notifySubject, bodyToSend, htmlToSend, {}, `notif-${selectedRes.id}-${notifyTemplate}-${Date.now()}`);
                      if (ok) setShowNotifyDialog(false);
                    }}>
                      {sendingNotif ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Send className="w-3.5 h-3.5 mr-1" />}
                      Enviar email
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      <ValidatePaymentDrawer
        open={!!paymentToReview}
        onOpenChange={(o) => { if (!o) setPaymentToReview(null); }}
        payment={paymentToReview}
        eventCurrency={selectedRes ? curr(selectedRes) : eventCurrency}
        onDone={() => {
          if (selectedRes) loadPayments(selectedRes.id);
          loadReservations();
        }}
      />

      <EditPaymentDrawer
        open={!!paymentToEdit}
        onOpenChange={(o) => { if (!o) setPaymentToEdit(null); }}
        payment={paymentToEdit}
        mode={editPaymentMode}
        onDone={() => {
          if (selectedRes) loadPayments(selectedRes.id);
          loadReservations();
        }}
      />

      {changePackageFor && (
        <AdminChangePackageDialog
          open={!!changePackageFor}
          onOpenChange={(o) => !o && setChangePackageFor(null)}
          reservationId={changePackageFor.id}
          eventId={changePackageFor.event_id}
          currentPackageId={changePackageFor.package_id || null}
          reservationHasPaymentPlan={!!(changePackageFor as any).payment_plan_id}
          onDone={() => { setChangePackageFor(null); loadReservations(); }}
        />
      )}

      <EventTripReports
        open={showTripReports}
        onOpenChange={setShowTripReports}
        eventId={eventId}
        eventTitle={eventTitle}
      />
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
