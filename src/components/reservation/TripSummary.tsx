/**
 * Resumen consolidado del viaje de un participante.
 * Muestra: compra (paquete + addons + ajustes), pagos (cuotas + realizados),
 * configuración del viaje (checklist de todos los pasos, incl. los nuevos),
 * comunicación (notificaciones enviadas y historial de estados en admin).
 *
 * Reemplaza la necesidad de saltar entre múltiples pestañas para tener
 * la foto completa de la reserva.
 */
import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatPrice } from "@/lib/currency";
import { TRIP_STEPS, getTripStep } from "@/lib/tripSteps";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Loader2, ChevronDown, CheckCircle2, Clock, Pencil, Receipt,
  CreditCard, Package as PackageIcon, Bell, History, ShoppingBag,
} from "lucide-react";
import TripBikeDrawer from "@/components/reservation/TripBikeDrawer";
import TripPedalsDrawer from "@/components/reservation/TripPedalsDrawer";
import TripTransportDrawer from "@/components/reservation/TripTransportDrawer";
import TripDocumentDrawer from "@/components/reservation/TripDocumentDrawer";
import TripFormDrawer from "@/components/reservation/TripFormDrawer";

interface Props {
  reservationId: string;
  alumnoId: string | null;
  eventCurrency?: string;
  mode?: "admin" | "student";
  defaultOpen?: boolean;
}

interface ChecklistRow {
  id: string; step_key: string; completed: boolean; needs_advice: boolean;
  data: Record<string, any>; file_url: string | null; updated_at: string;
}
interface AddonRow { id: string; addon_id: string; cantidad: number; precio_unitario: number; subtotal: number; currency: string; }
interface AddonMeta { id: string; nombre: string; }
interface AdjRow { id: string; tipo: string; concepto: string | null; amount: number; currency: string; created_at: string; }
interface InstallmentRow { id: string; installment_number: number; label: string | null; amount: number; currency: string; due_date: string; status: string; paid_amount: number; balance_due: number; }
interface PaymentRow { id: string; amount: number; currency: string; payment_date: string; payment_method: string; status: string; notes: string | null; installment_number: number | null; }
interface RoommateRow { id: string; posicion: number; nombre: string | null; email: string | null; telefono: string | null; confirmado: boolean; }
interface NotifRow { id: string; tipo: string; canal: string; asunto: string | null; created_at: string; }
interface ReservationInfo {
  id: string; alumno_id: string | null; package_nombre_snapshot: string | null;
  package_id: string | null; amount_total: number | null; amount_paid: number;
  balance_due: number | null; price_snapshot: number | null; currency_snapshot: string | null;
  moneda: string; reservation_status: string;
}

const fmt = (n: number, c: string) => formatPrice(n, c);

const humanValue = (v: any): string => {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Sí" : "No";
  if (Array.isArray(v)) return v.length ? v.map(humanValue).join(", ") : "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
};

const humanLabel = (k: string) => k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const paymentStatusEs: Record<string, string> = {
  pendiente: "Pendiente", vencida: "Vencida", pagada: "Pagada",
  parcial: "Parcial", condonada: "Condonada", reprogramada: "Reprogramada",
};

export function TripSummary({ reservationId, alumnoId, eventCurrency = "ARS", mode = "admin", defaultOpen = false }: Props) {
  const [loading, setLoading] = useState(true);
  const [reservation, setReservation] = useState<ReservationInfo | null>(null);
  const [checklist, setChecklist] = useState<ChecklistRow[]>([]);
  const [addons, setAddons] = useState<AddonRow[]>([]);
  const [addonsMeta, setAddonsMeta] = useState<Record<string, AddonMeta>>({});
  const [adjustments, setAdjustments] = useState<AdjRow[]>([]);
  const [installments, setInstallments] = useState<InstallmentRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [roommates, setRoommates] = useState<RoommateRow[]>([]);
  const [notifications, setNotifications] = useState<NotifRow[]>([]);

  // Drawer state
  const [bikeOpen, setBikeOpen] = useState(false);
  const [pedalsOpen, setPedalsOpen] = useState(false);
  const [transportOpen, setTransportOpen] = useState(false);
  const [docDrawer, setDocDrawer] = useState<{ open: boolean; stepKey: string; title: string; description: string; helpText: string }>({
    open: false, stepKey: "", title: "", description: "", helpText: "",
  });
  const [formDrawer, setFormDrawer] = useState<{ open: boolean; stepKey: string }>({ open: false, stepKey: "" });

  // Section open state
  const [openCompra, setOpenCompra] = useState(true);
  const [openPagos, setOpenPagos] = useState(true);
  const [openConfig, setOpenConfig] = useState(true);
  const [openComm, setOpenComm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [
      resR, clR, adR, adjR, insR, payR, rmR, ntR,
    ] = await Promise.all([
      supabase.from("event_reservations")
        .select("id, alumno_id, package_nombre_snapshot, package_id, amount_total, amount_paid, balance_due, price_snapshot, currency_snapshot, moneda, reservation_status")
        .eq("id", reservationId).maybeSingle(),
      supabase.from("reservation_checklist_data")
        .select("id, step_key, completed, needs_advice, data, file_url, updated_at")
        .eq("reservation_id", reservationId),
      supabase.from("reservation_addons")
        .select("id, addon_id, cantidad, precio_unitario, subtotal, currency")
        .eq("reservation_id", reservationId),
      supabase.from("reservation_financial_adjustments")
        .select("id, tipo, concepto, amount, currency, created_at")
        .eq("reservation_id", reservationId).order("created_at"),
      supabase.from("reservation_installments")
        .select("id, installment_number, label, amount, currency, due_date, status, paid_amount, balance_due")
        .eq("reservation_id", reservationId).order("installment_number"),
      supabase.from("reservation_payments")
        .select("id, amount, currency, payment_date, payment_method, status, notes, installment_number")
        .eq("reservation_id", reservationId).order("payment_date", { ascending: false }),
      supabase.from("reservation_roommates")
        .select("id, posicion, nombre, email, telefono, confirmado")
        .eq("reservation_id", reservationId).order("posicion"),
      mode === "admin"
        ? supabase.from("reservation_notifications")
            .select("id, tipo, canal, asunto, created_at")
            .eq("reservation_id", reservationId).order("created_at", { ascending: false }).limit(20)
        : Promise.resolve({ data: [] as NotifRow[] }),
    ]);

    setReservation(resR.data as any);
    setChecklist((clR.data || []) as ChecklistRow[]);
    setAddons((adR.data || []) as AddonRow[]);
    setAdjustments((adjR.data || []) as AdjRow[]);
    setInstallments((insR.data || []) as InstallmentRow[]);
    setPayments((payR.data || []) as PaymentRow[]);
    setRoommates((rmR.data || []) as RoommateRow[]);
    setNotifications((ntR.data || []) as NotifRow[]);

    // Cargar nombres de addons
    const addonIds = Array.from(new Set(((adR.data || []) as AddonRow[]).map(a => a.addon_id)));
    if (addonIds.length) {
      const { data } = await supabase.from("event_addons").select("id, nombre").in("id", addonIds);
      const meta: Record<string, AddonMeta> = {};
      (data || []).forEach((r: any) => { meta[r.id] = r; });
      setAddonsMeta(meta);
    }

    setLoading(false);
  }, [reservationId, mode]);

  useEffect(() => { load(); }, [load]);

  const currency = reservation?.currency_snapshot || reservation?.moneda || eventCurrency;
  const total = reservation?.amount_total ?? 0;
  const paid = reservation?.amount_paid ?? 0;
  const balance = reservation?.balance_due ?? Math.max(0, total - paid);

  const checklistByKey = useMemo(() => {
    const map: Record<string, ChecklistRow> = {};
    checklist.forEach(r => { map[r.step_key] = r; });
    return map;
  }, [checklist]);

  const openStep = (key: string) => {
    const step = getTripStep(key);
    if (!step) return;
    if (key === "bici") setBikeOpen(true);
    else if (key === "pedales") setPedalsOpen(true);
    else if (key === "pasaje") setTransportOpen(true);
    else if (key === "seguro") setDocDrawer({ open: true, stepKey: "seguro", title: "Seguro viajero", description: "Póliza vigente", helpText: "Subí imagen o PDF de la póliza." });
    else setFormDrawer({ open: true, stepKey: key });
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-border p-4 flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando resumen del viaje…
      </div>
    );
  }

  const SectionHeader = ({ open, onToggle, icon: Icon, title, badge }: { open: boolean; onToggle: () => void; icon: any; title: string; badge?: React.ReactNode }) => (
    <CollapsibleTrigger onClick={onToggle} className="flex w-full items-center justify-between px-3 py-2 hover:bg-muted/50 rounded-t-xl transition-colors">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-primary" />
        <span className="text-xs font-semibold uppercase tracking-wider">{title}</span>
        {badge}
      </div>
      <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
    </CollapsibleTrigger>
  );

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/[0.02] overflow-hidden">
      <div className="px-3 py-2.5 border-b border-primary/20 bg-primary/5">
        <p className="text-xs font-bold text-primary uppercase tracking-wider">📋 Resumen del viaje</p>
      </div>

      {/* COMPRA */}
      <Collapsible open={openCompra}>
        <SectionHeader open={openCompra} onToggle={() => setOpenCompra(v => !v)} icon={ShoppingBag} title="Compra" />
        <CollapsibleContent className="px-3 pb-3 space-y-2">
          <div className="rounded-lg bg-background border border-border p-3 text-xs space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Paquete</span>
              <span className="font-medium text-right">{reservation?.package_nombre_snapshot || "Sin paquete asignado"}</span>
            </div>
            {reservation?.price_snapshot != null && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Precio base</span>
                <span className="font-medium">{fmt(reservation.price_snapshot, currency)}</span>
              </div>
            )}
            {addons.length > 0 && (
              <div className="pt-2 border-t border-border/50 space-y-1">
                <p className="text-[10px] text-muted-foreground uppercase">Extras contratados</p>
                {addons.map(a => (
                  <div key={a.id} className="flex justify-between text-xs">
                    <span>{addonsMeta[a.addon_id]?.nombre || "Extra"} {a.cantidad > 1 && `×${a.cantidad}`}</span>
                    <span className="font-medium">{fmt(Number(a.subtotal ?? (a.precio_unitario * a.cantidad)), a.currency || currency)}</span>
                  </div>
                ))}
              </div>
            )}
            {adjustments.length > 0 && (
              <div className="pt-2 border-t border-border/50 space-y-1">
                <p className="text-[10px] text-muted-foreground uppercase">Ajustes</p>
                {adjustments.map(a => (
                  <div key={a.id} className="flex justify-between text-xs">
                    <span>{a.concepto || a.tipo}</span>
                    <span className={`font-medium ${Number(a.amount) < 0 ? "text-emerald-500" : "text-amber-500"}`}>
                      {Number(a.amount) < 0 ? "" : "+"}{fmt(Number(a.amount), a.currency || currency)}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border text-center">
              <div>
                <p className="text-[9px] text-muted-foreground uppercase">Total</p>
                <p className="text-sm font-bold">{fmt(total, currency)}</p>
              </div>
              <div>
                <p className="text-[9px] text-muted-foreground uppercase">Abonado</p>
                <p className="text-sm font-bold text-emerald-500">{fmt(paid, currency)}</p>
              </div>
              <div>
                <p className="text-[9px] text-muted-foreground uppercase">Saldo</p>
                <p className={`text-sm font-bold ${balance > 0 ? "text-amber-500" : "text-muted-foreground"}`}>{fmt(balance, currency)}</p>
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* PAGOS */}
      <Collapsible open={openPagos}>
        <SectionHeader
          open={openPagos}
          onToggle={() => setOpenPagos(v => !v)}
          icon={CreditCard}
          title="Pagos"
          badge={<Badge variant="outline" className="text-[9px]">{payments.length} · {installments.length} cuotas</Badge>}
        />
        <CollapsibleContent className="px-3 pb-3 space-y-2">
          {installments.length > 0 && (
            <div className="rounded-lg bg-background border border-border p-3 space-y-1.5">
              <p className="text-[10px] text-muted-foreground uppercase mb-1">Plan de cuotas</p>
              {installments.map(i => (
                <div key={i.id} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant="outline" className={`text-[9px] shrink-0 ${
                      i.status === "pagada" ? "border-emerald-500/40 text-emerald-500"
                      : i.status === "vencida" ? "border-destructive/40 text-destructive"
                      : "border-border"
                    }`}>{paymentStatusEs[i.status] || i.status}</Badge>
                    <span className="truncate">{i.label || `Cuota ${i.installment_number}`}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0">{new Date(i.due_date + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "short" })}</span>
                  </div>
                  <span className="font-medium shrink-0">{fmt(Number(i.amount), i.currency || currency)}</span>
                </div>
              ))}
            </div>
          )}
          {payments.length > 0 ? (
            <div className="rounded-lg bg-background border border-border p-3 space-y-1.5">
              <p className="text-[10px] text-muted-foreground uppercase mb-1">Pagos realizados</p>
              {payments.map(p => (
                <div key={p.id} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <Receipt className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className="truncate capitalize">{p.payment_method?.replace(/_/g, " ")}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0">{new Date(p.payment_date + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "short" })}</span>
                    {p.status !== "validado" && p.status !== "confirmado" && (
                      <Badge variant="outline" className="text-[9px] border-amber-500/40 text-amber-500">{p.status}</Badge>
                    )}
                  </div>
                  <span className="font-medium shrink-0">{fmt(Number(p.amount), p.currency || currency)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic px-1">Sin pagos registrados</p>
          )}
        </CollapsibleContent>
      </Collapsible>

      {/* CONFIGURACIÓN */}
      <Collapsible open={openConfig}>
        <SectionHeader
          open={openConfig}
          onToggle={() => setOpenConfig(v => !v)}
          icon={PackageIcon}
          title="Configuración del viaje"
          badge={<Badge variant="outline" className="text-[9px]">{checklist.filter(c => c.completed).length}/{TRIP_STEPS.length}</Badge>}
        />
        <CollapsibleContent className="px-3 pb-3 space-y-2">
          {TRIP_STEPS.map(step => {
            const row = checklistByKey[step.key];
            const Icon = step.icon;
            const entries = row?.data ? Object.entries(row.data).filter(([, v]) => v !== null && v !== "" && v !== undefined) : [];
            return (
              <div key={step.key} className={`rounded-lg border p-2.5 ${
                row?.completed ? "border-emerald-500/30 bg-emerald-500/5" : "border-border bg-background"
              }`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {row?.completed ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> : <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                    <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="text-xs font-medium truncate">{step.label}</span>
                  </div>
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] gap-1" onClick={() => openStep(step.key)}>
                    <Pencil className="w-3 h-3" />
                    {row ? "Editar" : "Cargar"}
                  </Button>
                </div>
                {entries.length > 0 && (
                  <div className="mt-2 pl-5 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                    {entries.map(([k, v]) => (
                      <div key={k} className="flex flex-col">
                        <span className="text-[9px] text-muted-foreground">{humanLabel(k)}</span>
                        <span className="font-medium whitespace-pre-line">{humanValue(v)}</span>
                      </div>
                    ))}
                  </div>
                )}
                {!row && <p className="text-[10px] text-muted-foreground italic pl-5 mt-1">Sin cargar</p>}
              </div>
            );
          })}
          {roommates.length > 0 && (
            <div className="rounded-lg border border-border bg-background p-3">
              <p className="text-[10px] text-muted-foreground uppercase mb-1.5">Compañeros de habitación asignados</p>
              <div className="space-y-1">
                {roommates.map(r => (
                  <div key={r.id} className="flex items-center justify-between text-xs">
                    <span>{r.nombre || r.email || "—"}</span>
                    {r.confirmado && <Badge variant="outline" className="text-[9px] border-emerald-500/40 text-emerald-500">Confirmado</Badge>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>

      {/* COMUNICACIÓN (solo admin) */}
      {mode === "admin" && (
        <Collapsible open={openComm}>
          <SectionHeader
            open={openComm}
            onToggle={() => setOpenComm(v => !v)}
            icon={Bell}
            title="Comunicación"
            badge={<Badge variant="outline" className="text-[9px]">{notifications.length}</Badge>}
          />
          <CollapsibleContent className="px-3 pb-3">
            {notifications.length ? (
              <div className="rounded-lg bg-background border border-border p-3 space-y-1.5 max-h-56 overflow-y-auto">
                {notifications.map(n => (
                  <div key={n.id} className="flex items-center justify-between text-xs gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{n.asunto || n.tipo}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {n.canal} · {new Date(n.created_at).toLocaleString("es-AR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic px-1">Aún no se enviaron notificaciones</p>
            )}
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Drawers */}
      <TripBikeDrawer open={bikeOpen} onOpenChange={setBikeOpen} reservationId={reservationId} alumnoId={alumnoId} onSaved={load} />
      <TripPedalsDrawer open={pedalsOpen} onOpenChange={setPedalsOpen} reservationId={reservationId} alumnoId={alumnoId} onSaved={load} />
      <TripTransportDrawer open={transportOpen} onOpenChange={setTransportOpen} reservationId={reservationId} alumnoId={alumnoId} onSaved={load} />
      <TripDocumentDrawer
        open={docDrawer.open}
        onOpenChange={(v) => setDocDrawer(p => ({ ...p, open: v }))}
        reservationId={reservationId}
        alumnoId={alumnoId}
        stepKey={docDrawer.stepKey}
        title={docDrawer.title}
        description={docDrawer.description}
        helpText={docDrawer.helpText}
        icon={null}
        onSaved={load}
      />
      <TripFormDrawer
        open={formDrawer.open}
        onOpenChange={(v) => setFormDrawer(p => ({ ...p, open: v }))}
        reservationId={reservationId}
        alumnoId={alumnoId}
        stepKey={formDrawer.stepKey}
        onSaved={load}
      />
    </div>
  );
}

export default TripSummary;
