import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/currency";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useImpersonation } from "@/contexts/ImpersonationContext";
import { ArrowLeft, CreditCard, Clock, CheckCircle2, XCircle, ExternalLink, RefreshCw, ArrowRightLeft, Ban, AlertTriangle, Plus, FileText, Download } from "lucide-react";
import ChangePlanDrawer from "@/components/ChangePlanDrawer";
import { getEffectiveSubStatus } from "@/lib/subscriptionStatus";
import { daysUntil, setEarlyRenewal, EARLY_RENEWAL_WINDOW_DAYS } from "@/lib/earlyRenewal";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import logo from "@/assets/logo.png";
import BottomNav from "@/components/BottomNav";
import type { Tables } from "@/integrations/supabase/types";

type Alumno = Tables<"alumnos">;

interface SubscriptionRecord {
  id: string;
  plan_id: string;
  estado: string;
  created_at: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  mp_status: string | null;
  auto_renovacion: boolean;
  auto_cobro_activo: boolean;
  mp_preapproval_id: string | null;
  mp_preapproval_status: string | null;
  cancelada_at: string | null;
  descuento_id: string | null;
  precio_base: number | null;
  precio_final: number | null;
  plan: {
    nombre: string;
    precio: number;
    frecuencia: string;
    permite_auto_cobro?: boolean;
  } | null;
  descuento: {
    nombre: string;
    valor: number;
    tipo: string;
    categoria: string;
  } | null;
}

const statusConfig: Record<string, {
  icon: React.ReactNode;
  label: string;
  message: string;
  badgeClass: string;
}> = {
  pendiente_verificacion: {
    icon: <Clock className="w-4 h-4" />,
    label: "Pendiente de validación",
    message: "Tu pago está siendo revisado por administración.",
    badgeClass: "bg-yellow-500/10 text-yellow-500 border-yellow-500/30",
  },
  activa: {
    icon: <CheckCircle2 className="w-4 h-4" />,
    label: "Activo",
    message: "Tu plan está vigente.",
    badgeClass: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30",
  },
  rechazada: {
    icon: <XCircle className="w-4 h-4" />,
    label: "Rechazado",
    message: "Hubo un problema con el pago informado.",
    badgeClass: "bg-destructive/10 text-destructive border-destructive/30",
  },
  pendiente: {
    icon: <Clock className="w-4 h-4" />,
    label: "Pendiente",
    message: "Suscripción pendiente de pago.",
    badgeClass: "bg-yellow-500/10 text-yellow-500 border-yellow-500/30",
  },
  pago_pendiente: {
    icon: <AlertTriangle className="w-4 h-4" />,
    label: "Pago pendiente",
    message: "Tu plan venció. Regularizá tu pago antes del día 5 para mantener tu acceso completo.",
    badgeClass: "bg-amber-500/10 text-amber-500 border-amber-500/30",
  },
  acceso_pausado: {
    icon: <XCircle className="w-4 h-4" />,
    label: "Acceso pausado",
    message: "Tu acceso está pausado por pago pendiente. Cuando regularices tu mensualidad, reactivamos tu plan.",
    badgeClass: "bg-destructive/10 text-destructive border-destructive/30",
  },
  vencida: {
    icon: <XCircle className="w-4 h-4" />,
    label: "Vencida",
    message: "Tu suscripción venció.",
    badgeClass: "bg-muted text-muted-foreground border-border",
  },
  cancelada: {
    icon: <Ban className="w-4 h-4" />,
    label: "Cancelada",
    message: "Tu suscripción fue cancelada.",
    badgeClass: "bg-muted text-muted-foreground border-border",
  },
};

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr + (dateStr.includes("T") ? "" : "T12:00:00")).toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
};

const getEffectiveStatus = (sub: SubscriptionRecord): string => {
  return getEffectiveSubStatus({
    estado: sub.estado,
    fecha_fin: sub.fecha_fin,
    cancelada_at: sub.cancelada_at,
  });
};

const hasRealAutoCharge = (sub: SubscriptionRecord): boolean =>
  Boolean(sub.auto_cobro_activo && sub.mp_preapproval_id);

const hasPendingAutoChargeAuth = (sub: SubscriptionRecord): boolean =>
  Boolean(
    sub.mp_preapproval_id &&
    !sub.auto_cobro_activo &&
    sub.mp_preapproval_status &&
    !["cancelled", "paused", "rejected"].includes(sub.mp_preapproval_status)
  );

const StudentPayments = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isImpersonating, targetAlumno } = useImpersonation();
  const readOnly = isImpersonating;
  const [alumno, setAlumno] = useState<Alumno | null>(null);
  const [subscriptions, setSubscriptions] = useState<SubscriptionRecord[]>([]);
  const [facturasBySub, setFacturasBySub] = useState<Record<string, { id: string; numero_comprobante: string | null; estado: string }>>({});
  const [downloadingFacturaId, setDownloadingFacturaId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [changePlanSub, setChangePlanSub] = useState<SubscriptionRecord | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async (session: { user: { email?: string; id: string } } | null) => {
      if (cancelled) return;
      let alumnoData: Alumno | null = null;

      if (isImpersonating && targetAlumno) {
        alumnoData = targetAlumno;
      } else {
        if (!session?.user?.email) { navigate("/"); return; }
        const { data } = await supabase
          .from("alumnos")
          .select("*")
          .eq("email", (session.user.email || "").toLowerCase().trim())
          .maybeSingle();
        if (!data) { navigate("/"); return; }
        alumnoData = data;
      }

      if (cancelled) return;
      setAlumno(alumnoData);

      const { data: subs } = await supabase
        .from("suscripciones")
        .select("id, estado, created_at, fecha_inicio, fecha_fin, mp_status, auto_renovacion, auto_cobro_activo, mp_preapproval_id, mp_preapproval_status, cancelada_at, plan_id, descuento_id, precio_base, precio_final, planes(nombre, precio, frecuencia, permite_auto_cobro), descuentos(nombre, valor, tipo, categoria)")
        .eq("alumno_id", alumnoData.id)
        .order("created_at", { ascending: false });

      if (cancelled) return;
      if (subs) {
        const mapped: SubscriptionRecord[] = subs.map((s: any) => ({
          id: s.id,
          plan_id: s.plan_id,
          estado: s.estado,
          created_at: s.created_at,
          fecha_inicio: s.fecha_inicio,
          fecha_fin: s.fecha_fin,
          mp_status: s.mp_status,
          auto_renovacion: s.auto_renovacion ?? false,
          auto_cobro_activo: s.auto_cobro_activo ?? false,
          mp_preapproval_id: s.mp_preapproval_id ?? null,
          mp_preapproval_status: s.mp_preapproval_status ?? null,
          cancelada_at: s.cancelada_at,
          descuento_id: s.descuento_id,
          precio_base: s.precio_base,
          precio_final: s.precio_final,
          plan: s.planes ? { nombre: s.planes.nombre, precio: s.planes.precio, frecuencia: s.planes.frecuencia, permite_auto_cobro: s.planes.permite_auto_cobro ?? false } : null,
          descuento: s.descuentos ? { nombre: s.descuentos.nombre, valor: s.descuentos.valor, tipo: s.descuentos.tipo, categoria: s.descuentos.categoria } : null,
        }));
        setSubscriptions(mapped);
      }

      // Cargar facturas aprobadas del alumno para mostrar botón "Descargar factura"
      const { data: facts } = await supabase
        .from("facturas")
        .select("id, referencia_id, numero_comprobante, estado")
        .eq("alumno_id", alumnoData.id)
        .eq("referencia_tipo", "suscripcion")
        .eq("estado", "emitida");
      if (!cancelled && facts) {
        const map: Record<string, { id: string; numero_comprobante: string | null; estado: string }> = {};
        for (const f of facts as any[]) {
          if (f.referencia_id) map[f.referencia_id] = { id: f.id, numero_comprobante: f.numero_comprobante, estado: f.estado };
        }
        setFacturasBySub(map);
      }

      setLoading(false);
    };

    // Listen for auth changes (token refresh on app reopen, session restore)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled) load(session);
    });

    // Also check current session immediately
    supabase.auth.getSession().then(({ data: { session } }) => {
      load(session);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [navigate, isImpersonating, targetAlumno]);

  // Categorize
  const todayStr = (() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  })();

  const activeSubsRaw = subscriptions.filter(s => {
    const eff = getEffectiveStatus(s);
    return eff === "activa" || eff === "pendiente_verificacion" || eff === "pendiente" || eff === "pago_pendiente";
  });

  // Capa 3 — Dedup defensivo en frontend.
  // Si hay varias suscripciones activas para el mismo plan_id + fecha_fin,
  // mostramos una sola fila para no duplicar el "Total mensual" mientras
  // se audita la base. Prioridad de "ganadora":
  //   1) mp_status === 'approved' con mp_payment_id
  //   2) la más antigua por created_at
  // No se modifica la base; solo se oculta visualmente la duplicada.
  const dedupKey = (s: SubscriptionRecord) => `${s.plan_id || "noplan"}__${s.fecha_fin || "nofin"}`;
  const groups = new Map<string, SubscriptionRecord[]>();
  for (const s of activeSubsRaw) {
    const k = dedupKey(s);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(s);
  }
  const activeSubs: SubscriptionRecord[] = [];
  const hiddenDuplicateIds = new Set<string>();
  for (const list of groups.values()) {
    if (list.length === 1) {
      activeSubs.push(list[0]);
      continue;
    }
    const sorted = [...list].sort((a, b) => {
      const aMp = a.mp_status === "approved" ? 0 : 1;
      const bMp = b.mp_status === "approved" ? 0 : 1;
      if (aMp !== bMp) return aMp - bMp;
      // misma prioridad MP → más antigua gana
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
    const winner = sorted[0];
    activeSubs.push(winner);
    for (const loser of sorted.slice(1)) hiddenDuplicateIds.add(loser.id);
    console.warn(
      "[StudentPayments] Duplicado detectado y ocultado en UI",
      { plan_id: winner.plan_id, fecha_fin: winner.fecha_fin, winner: winner.id, hidden: sorted.slice(1).map(s => s.id) }
    );
  }
  const historicSubs = subscriptions.filter(s => !activeSubs.includes(s) && !hiddenDuplicateIds.has(s.id));

  const handleToggleRenovacion = async (sub: SubscriptionRecord) => {
    if (readOnly) return;
    setTogglingId(sub.id);
    try {
      if (hasRealAutoCharge(sub) || hasPendingAutoChargeAuth(sub)) {
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cancel-mp-preapproval`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ suscripcion_id: sub.id }),
        });
        if (!res.ok) throw new Error("cancel failed");
        setSubscriptions(prev => prev.map(s => s.id === sub.id ? {
          ...s,
          auto_renovacion: false,
          auto_cobro_activo: false,
          mp_preapproval_status: "cancelled",
        } : s));
        toast({ title: "Renovación desactivada", description: "No se cobrará automáticamente el próximo período." });
        return;
      }

      const amount = sub.precio_final ?? sub.precio_base ?? sub.plan?.precio ?? 0;
      if (!alumno?.email || !amount) throw new Error("missing data");
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-mp-preapproval`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          payer_email: alumno.email,
          suscripcion_id: sub.id,
          alumno_id: alumno.id,
          plan_id: sub.plan_id,
          transaction_amount: amount,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "No se pudo crear la autorización");
      if (data?.init_point) {
        toast({ title: "Autorización requerida", description: "Te llevamos a Mercado Pago para autorizar el cobro automático." });
        window.location.href = data.init_point;
        return;
      }
      setSubscriptions(prev => prev.map(s => s.id === sub.id ? {
        ...s,
        auto_renovacion: true,
        auto_cobro_activo: data?.status === "authorized",
        mp_preapproval_id: data?.preapproval_id ?? s.mp_preapproval_id,
        mp_preapproval_status: data?.status ?? s.mp_preapproval_status,
      } : s));
      toast({ title: "Renovación autorizada", description: "Mercado Pago quedó habilitado para cobrar el próximo período." });
    } catch (err: any) {
      toast({ title: "No se pudo activar", description: err?.message || "No se pudo actualizar la renovación automática.", variant: "destructive" });
    } finally {
      setTogglingId(null);
    }
  };

  const handleCancelSubscription = async (sub: SubscriptionRecord) => {
    if (readOnly) return;
    setCancellingId(sub.id);
    const cancelledAt = new Date().toISOString();
    if (hasRealAutoCharge(sub) || hasPendingAutoChargeAuth(sub)) {
      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cancel-mp-preapproval`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ suscripcion_id: sub.id }),
      }).catch(() => null);
    }
    const { error } = await supabase
      .from("suscripciones")
      .update({
        estado: "cancelada",
        cancelada_at: cancelledAt,
        cancelada_motivo: "Cancelada por el alumno",
        auto_renovacion: false,
        auto_cobro_activo: false,
        mp_preapproval_status: sub.mp_preapproval_id ? "cancelled" : sub.mp_preapproval_status,
      } as any)
      .eq("id", sub.id);
    setCancellingId(null);
    if (error) {
      toast({ title: "Error", description: "No se pudo cancelar.", variant: "destructive" });
    } else {
      setSubscriptions(prev => prev.map(s => s.id === sub.id ? { ...s, estado: "cancelada", cancelada_at: cancelledAt, auto_renovacion: false, auto_cobro_activo: false, mp_preapproval_status: s.mp_preapproval_id ? "cancelled" : s.mp_preapproval_status } : s));
      toast({
        title: "Suscripción cancelada",
        description: `${sub.plan?.nombre || "Plan"}: acceso disponible hasta ${formatDate(sub.fecha_fin)}.`,
      });
    }
  };

  const handleDownloadFactura = async (facturaId: string) => {
    setDownloadingFacturaId(facturaId);
    try {
      const { data, error } = await supabase.functions.invoke("generate-factura-pdf", { body: { factura_id: facturaId } });
      if (error) throw error;
      const url = (data as any)?.signed_url;
      if (!url) throw new Error("No se pudo generar el enlace de descarga");
      window.open(url, "_blank");
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "No se pudo descargar la factura", variant: "destructive" });
    } finally {
      setDownloadingFacturaId(null);
    }
  };


  const handleChangePlan = () => {
    if (readOnly) return;
    if (alumno) {
      localStorage.setItem("registro_alumno_id", alumno.id);
      localStorage.setItem("alumno_renewal", "1");
    }
    navigate("/planes");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Cargando...</div>
      </div>
    );
  }

  // Total monthly summary
  const totalActivo = activeSubs.reduce((sum, s) => {
    const price = s.precio_final ?? s.precio_base ?? s.plan?.precio ?? 0;
    return sum + price;
  }, 0);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {isImpersonating && (
        <div className="fixed top-0 left-0 right-0 z-[100] bg-amber-500 text-amber-950 px-4 py-2 flex items-center justify-center gap-2 text-sm font-semibold shadow-lg">
          <span>Vista de solo lectura — {targetAlumno?.nombre}</span>
        </div>
      )}
      <header className={`flex items-center gap-3 px-5 pt-5 pb-2 ${isImpersonating ? "mt-10" : ""}`}>
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-muted-foreground">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <img src={logo} alt="Ciclismo Reybaud" className="w-8 h-8" />
        <h1 className="text-lg font-heading font-semibold text-foreground uppercase tracking-wider">
          Mis planes y pagos
        </h1>
      </header>

      <main className="flex-1 px-4 pb-8">
        <div className="w-full max-w-md mx-auto space-y-6 animate-fade-in">

          <p className="text-sm text-muted-foreground text-center">
            Gestioná tus planes de forma simple
          </p>

          {/* ──────── Active Plans ──────── */}
          {activeSubs.length > 0 ? (
            <div className="space-y-4">
              <h2 className="text-sm font-heading font-semibold uppercase tracking-wider text-muted-foreground">
                Planes activos ({activeSubs.length})
              </h2>

              {activeSubs.map((sub) => {
                const effectiveStatus = getEffectiveStatus(sub);
                const config = statusConfig[effectiveStatus] || statusConfig.pendiente;
                const daysRemaining = sub.fecha_fin
                  ? Math.max(0, Math.ceil((new Date(sub.fecha_fin + "T23:59:59").getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
                  : 0;

                return (
                  <div key={sub.id} className="rounded-xl border border-primary/30 bg-card/80 backdrop-blur-sm p-5 space-y-4 shadow-lg shadow-black/20">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2 text-primary min-w-0">
                        <CheckCircle2 className="w-5 h-5 shrink-0" />
                        <span className="text-sm font-heading font-semibold uppercase tracking-wider truncate">
                          {sub.plan?.nombre || "Plan"}
                        </span>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className="text-xs text-muted-foreground">
                          {daysRemaining} día{daysRemaining !== 1 ? "s" : ""}
                        </span>
                        {hasRealAutoCharge(sub) && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-primary bg-primary/10 border border-primary/20 rounded-full px-2 py-0.5">
                            <RefreshCw className="w-2.5 h-2.5" />
                            Auto-renueva
                          </span>
                        )}
                        {hasPendingAutoChargeAuth(sub) && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-yellow-500 bg-yellow-500/10 border border-yellow-500/30 rounded-full px-2 py-0.5">
                            <AlertTriangle className="w-2.5 h-2.5" />
                            Autorización pendiente
                          </span>
                        )}
                      </div>
                    </div>


                    <div className="space-y-2 text-sm">
                      {/* Discount breakdown */}
                      {sub.descuento && sub.precio_base != null ? (
                        <>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Valor original</span>
                            <span className="font-mono text-muted-foreground line-through">{formatPrice(sub.precio_base)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-emerald-400 text-xs">
                              {sub.descuento.nombre} ({sub.descuento.tipo === "fijo" ? `$${sub.descuento.valor}` : `${sub.descuento.valor}%`})
                            </span>
                            <span className="text-emerald-400 font-mono text-xs">
                              -{formatPrice(sub.precio_base - (sub.precio_final ?? sub.precio_base))}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground font-medium">Total</span>
                            <span className="font-semibold gold-text-gradient">{formatPrice(sub.precio_final ?? sub.precio_base)}</span>
                          </div>
                        </>
                      ) : (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Monto</span>
                          <span className="font-semibold gold-text-gradient">{sub.plan ? formatPrice(sub.plan.precio) : "—"}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Vencimiento</span>
                        <span className="font-medium text-foreground">{formatDate(sub.fecha_fin)}</span>
                      </div>
                    </div>

                    {/* (status compacto va como pill en el header; sin banner redundante) */}



                    {/* Pago / renovación CTA */}
                    {(() => {
                      const goToCheckout = () => {
                        if (sub.fecha_fin) {
                          setEarlyRenewal({
                            subId: sub.id,
                            planId: sub.plan_id,
                            fechaFin: sub.fecha_fin,
                            autoRenovacion: hasRealAutoCharge(sub),
                          });
                        }
                        if (alumno?.id) localStorage.setItem("registro_alumno_id", alumno.id);
                        localStorage.setItem("alumno_preselect_plan_id", sub.plan_id);
                        navigate("/planes");
                      };

                      // Estados rotos: alumno necesita regularizar / pagar este plan
                      if (
                        effectiveStatus === "pendiente" ||
                        effectiveStatus === "pago_pendiente" ||
                        effectiveStatus === "acceso_pausado" ||
                        effectiveStatus === "vencida"
                      ) {
                        const msg =
                          effectiveStatus === "pago_pendiente"
                            ? "Tu plan venció. Regularizá tu pago para mantener el acceso completo."
                            : effectiveStatus === "acceso_pausado"
                              ? "Tu acceso está pausado por falta de pago. Pagá ahora para reactivarlo."
                              : effectiveStatus === "vencida"
                                ? "Este plan venció. Renovalo para volver a entrenar."
                                : "Este plan está pendiente de pago. Completalo para activarlo.";
                        return (
                          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
                            <p className="text-xs text-foreground"><strong>{msg}</strong></p>
                            <Button variant="gold" size="sm" className="w-full" onClick={goToCheckout}>
                              Pagar este plan
                            </Button>
                          </div>
                        );
                      }

                      // Informativo: pago en verificación
                      if (effectiveStatus === "pendiente_verificacion") {
                        return (
                          <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3">
                            <p className="text-xs text-foreground">
                              <strong>Tu pago está siendo verificado.</strong>{" "}
                              No necesitás volver a pagar. Te avisamos por email cuando quede acreditado.
                            </p>
                          </div>
                        );
                      }

                      // Renovación anticipada: plan activo con ≤20 días para vencer
                      if (effectiveStatus !== "activa" || !sub.fecha_fin) return null;
                      const dLeft = daysUntil(sub.fecha_fin);
                      if (dLeft === null || dLeft < 0 || dLeft > EARLY_RENEWAL_WINDOW_DAYS) return null;
                      const startEarlyRenewal = goToCheckout;
                      return (
                        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
                          <p className="text-xs text-foreground">
                            <strong>Tu plan vence en {dLeft === 0 ? "menos de un día" : `${dLeft} día${dLeft !== 1 ? "s" : ""}`}.</strong>
                            {" "}Podés renovar el próximo período ahora (mismo plan o cambiarlo).
                          </p>
                          {hasRealAutoCharge(sub) ? (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="gold" size="sm" className="w-full">Renovar próximo período</Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent className="bg-card border-border">
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Desactivar renovación automática</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Tenés la renovación automática activada. Si pagás ahora, vamos a desactivarla
                                    para evitar un doble cobro. Si querés que vuelva a renovarse sola, podés
                                    reactivarla más adelante desde acá.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction onClick={startEarlyRenewal}>
                                    Entendido, renovar
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          ) : (
                            <Button variant="gold" size="sm" className="w-full" onClick={startEarlyRenewal}>
                              Renovar próximo período
                            </Button>
                          )}
                        </div>
                      );
                    })()}

                    {/* Per-plan actions */}
                    <div className="rounded-xl border border-border bg-card/80 overflow-hidden">
                      {(() => {
                        const autoEligible = !!sub.plan?.permite_auto_cobro && sub.plan?.frecuencia === "mensual";
                        const subtitleEligible = hasRealAutoCharge(sub)
                          ? `Próximo cobro ${formatPrice(sub.precio_final ?? sub.precio_base ?? sub.plan?.precio ?? 0)} el ${formatDate(sub.fecha_fin)}`
                          : hasPendingAutoChargeAuth(sub)
                            ? "Falta completar la autorización en Mercado Pago"
                            : "Activala para que Mercado Pago renueve sola cada período";
                        const subtitle = autoEligible
                          ? subtitleEligible
                          : "Este plan no admite renovación automática";
                        return (
                          <div className={`flex items-center justify-between px-4 py-3 border-b border-border/50 ${hasRealAutoCharge(sub) ? "bg-primary/5" : ""}`}>
                            <div className="flex items-center gap-2 min-w-0">
                              <RefreshCw className={`w-4 h-4 shrink-0 ${hasRealAutoCharge(sub) ? "text-primary" : "text-muted-foreground"}`} />
                              <div className="flex flex-col min-w-0">
                                <span className="text-xs font-medium text-foreground">Renovación automática</span>
                                <span className="text-[10px] text-muted-foreground truncate">{subtitle}</span>
                              </div>
                            </div>
                            {hasRealAutoCharge(sub) ? (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <button
                                    type="button"
                                    disabled={togglingId === sub.id || readOnly}
                                    className="shrink-0"
                                    aria-label="Desactivar renovación automática"
                                  >
                                    <Switch checked onCheckedChange={() => {}} className="pointer-events-none" />
                                  </button>
                                </AlertDialogTrigger>
                                <AlertDialogContent className="bg-card border-border">
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>¿Desactivar la renovación automática?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Tu plan sigue activo hasta el {formatDate(sub.fecha_fin)}, pero no se renovará solo.
                                      Vas a tener que pagar manualmente la próxima cuota.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Volver</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => handleToggleRenovacion(sub)}>
                                      Sí, desactivar
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            ) : (
                              <Switch
                                checked={false}
                                onCheckedChange={() => handleToggleRenovacion(sub)}
                                disabled={!autoEligible || togglingId === sub.id || readOnly}
                              />
                            )}
                          </div>
                        );
                      })()}




                      {/* Change plan — disponible para planes activos o con pago pendiente de validación */}
                      {(effectiveStatus === "activa" || effectiveStatus === "pendiente_verificacion") && sub.fecha_inicio && sub.fecha_fin && (
                        <button
                          className="w-full flex items-center gap-2 px-4 py-3 hover:bg-accent/30 transition-colors text-left border-b border-border/50"
                          onClick={() => setChangePlanSub(sub)}
                        >
                          <ArrowRightLeft className="w-4 h-4 text-primary" />
                          <span className="text-xs font-medium text-foreground">Cambiar de plan</span>
                        </button>
                      )}

                      {/* Cancel */}
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <button className="w-full flex items-center gap-2 px-4 py-3 hover:bg-accent/30 transition-colors text-left">
                            <Ban className="w-4 h-4 text-destructive" />
                            <span className="text-xs font-medium text-destructive">Cancelar este plan</span>
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="bg-card border-border">
                          <AlertDialogHeader>
                            <AlertDialogTitle className="text-foreground">¿Cancelar "{sub.plan?.nombre}"?</AlertDialogTitle>
                            <AlertDialogDescription asChild>
                              <div className="space-y-3 text-sm">
                                <p className="text-foreground">
                                  Tu acceso a este plan continuará disponible hasta el <span className="font-semibold">{formatDate(sub.fecha_fin)}</span>.
                                </p>
                                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 space-y-1.5">
                                  <p className="text-xs font-semibold text-amber-500 uppercase tracking-wider">Importante</p>
                                  <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
                                    <li>El pago realizado no se reintegra ni se acredita como saldo.</li>
                                    <li>Se desactiva la renovación automática.</li>
                                    <li>Podés volver a contratar este u otro plan cuando quieras.</li>
                                  </ul>
                                </div>
                                {activeSubs.length > 1 && (
                                  <p className="text-xs text-muted-foreground">Tus otros planes activos no se verán afectados.</p>
                                )}
                              </div>
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel className="border-border">Volver</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleCancelSubscription(sub)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              disabled={cancellingId === sub.id}
                            >
                              {cancellingId === sub.id ? "Cancelando..." : "Sí, cancelar"}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>

                    {facturasBySub[sub.id] && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        disabled={downloadingFacturaId === facturasBySub[sub.id].id}
                        onClick={() => handleDownloadFactura(facturasBySub[sub.id].id)}
                      >
                        {downloadingFacturaId === facturasBySub[sub.id].id ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Download className="w-3.5 h-3.5" />
                        )}
                        Descargar factura{facturasBySub[sub.id].numero_comprobante ? ` ${facturasBySub[sub.id].numero_comprobante}` : ""}
                      </Button>
                    )}
                  </div>

                );
              })}




              {/* Add another plan */}
              {!readOnly && (
                <Button variant="gold-outline" className="w-full" onClick={handleChangePlan}>
                  <Plus className="w-4 h-4 mr-2" />
                  Contratar otro plan o servicio
                </Button>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card/80 backdrop-blur-sm p-6 text-center space-y-3 shadow-lg shadow-black/20">
              <CreditCard className="w-10 h-10 text-muted-foreground mx-auto" />
              <p className="text-sm text-muted-foreground">No tenés planes activos.</p>
              <p className="text-xs text-muted-foreground">Elegí un plan para acceder a tus entrenamientos.</p>
              <Button variant="gold" size="sm" onClick={handleChangePlan}>
                Ver planes disponibles
              </Button>
            </div>
          )}

          {/* ──────── Payment History ──────── */}
          <div className="space-y-3">
            <h2 className="text-sm font-heading font-semibold uppercase tracking-wider text-muted-foreground">
              Historial de pagos
            </h2>

            {historicSubs.length === 0 && activeSubs.length === 0 ? (
              <div className="rounded-xl border border-border bg-card/80 p-6 text-center">
                <p className="text-sm text-muted-foreground">No hay pagos registrados.</p>
              </div>
            ) : historicSubs.length === 0 ? null : (
              <div className="space-y-3">
                {historicSubs.map((sub) => {
                  const effectiveStatus = getEffectiveStatus(sub);
                  const config = statusConfig[effectiveStatus] || statusConfig.pendiente;

                  return (
                    <div key={sub.id} className="rounded-xl border border-border bg-card/80 backdrop-blur-sm p-4 space-y-3 shadow-lg shadow-black/10">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-foreground">
                          {sub.plan?.nombre || "Plan"}
                        </span>
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${config.badgeClass}`}>
                          {config.icon}
                          {config.label}
                        </span>
                      </div>

                      <div className="space-y-1 text-xs">
                        {sub.descuento && sub.precio_base != null ? (
                          <>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Valor original</span>
                              <span className="text-muted-foreground line-through">{formatPrice(sub.precio_base)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-emerald-400">
                                {sub.descuento.nombre} ({sub.descuento.tipo === "fijo" ? `$${sub.descuento.valor}` : `${sub.descuento.valor}%`})
                              </span>
                              <span className="text-emerald-400">
                                -{formatPrice(sub.precio_base - (sub.precio_final ?? sub.precio_base))}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground font-medium">Total final</span>
                              <span className="text-foreground font-medium">{formatPrice(sub.precio_final ?? sub.precio_base)}</span>
                            </div>
                          </>
                        ) : (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Monto</span>
                            <span className="text-foreground">{sub.plan ? formatPrice(sub.plan.precio) : "—"}</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Fecha</span>
                          <span className="text-foreground">{formatDate(sub.created_at)}</span>
                        </div>
                        {sub.fecha_inicio && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Período</span>
                            <span className="text-foreground">
                              {formatDate(sub.fecha_inicio)} — {formatDate(sub.fecha_fin)}
                            </span>
                          </div>
                        )}
                      </div>

                      <p className="text-xs text-muted-foreground">{config.message}</p>

                      {facturasBySub[sub.id] && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          disabled={downloadingFacturaId === facturasBySub[sub.id].id}
                          onClick={() => handleDownloadFactura(facturasBySub[sub.id].id)}
                        >
                          {downloadingFacturaId === facturasBySub[sub.id].id ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Download className="w-3.5 h-3.5" />
                          )}
                          Descargar factura{facturasBySub[sub.id].numero_comprobante ? ` ${facturasBySub[sub.id].numero_comprobante}` : ""}
                        </Button>
                      )}


                      {effectiveStatus === "rechazada" && (
                        <a href="https://wa.me/5491140312299?text=Hola%2C%20tengo%20un%20problema%20con%20mi%20pago" target="_blank" rel="noopener noreferrer">
                          <Button variant="gold-outline" size="sm" className="w-full mt-1">
                            <ExternalLink className="w-3.5 h-3.5" />
                            Contactar administración
                          </Button>
                        </a>
                      )}

                      {effectiveStatus === "vencida" && (
                        <Button variant="gold" size="sm" className="w-full mt-1" onClick={handleChangePlan}>
                          Renovar plan
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Change plan drawer */}
      {changePlanSub && alumno && (
        <ChangePlanDrawer
          open={!!changePlanSub}
          onOpenChange={(open) => { if (!open) setChangePlanSub(null); }}
          currentSubscription={{
            id: changePlanSub.id,
            plan_id: changePlanSub.plan_id,
            plan_nombre: changePlanSub.plan?.nombre || "Plan",
            plan_precio: changePlanSub.plan?.precio || 0,
            fecha_inicio: changePlanSub.fecha_inicio,
            fecha_fin: changePlanSub.fecha_fin,
            precio_final: changePlanSub.precio_final,
            precio_base: changePlanSub.precio_base,
          }}
          alumnoId={alumno.id}
          onPlanChanged={() => window.location.reload()}
        />
      )}

      <BottomNav />
    </div>
  );
};

export default StudentPayments;
