import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/currency";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useImpersonation } from "@/contexts/ImpersonationContext";
import { ArrowLeft, CreditCard, Clock, CheckCircle2, XCircle, ExternalLink, RefreshCw, ArrowRightLeft, Ban, AlertTriangle, Plus } from "lucide-react";
import { getEffectiveSubStatus } from "@/lib/subscriptionStatus";
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
  estado: string;
  created_at: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  mp_status: string | null;
  auto_renovacion: boolean;
  cancelada_at: string | null;
  descuento_id: string | null;
  precio_base: number | null;
  precio_final: number | null;
  plan: {
    nombre: string;
    precio: number;
    frecuencia: string;
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

const StudentPayments = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isImpersonating, targetAlumno } = useImpersonation();
  const readOnly = isImpersonating;
  const [alumno, setAlumno] = useState<Alumno | null>(null);
  const [subscriptions, setSubscriptions] = useState<SubscriptionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      let alumnoData: Alumno | null = null;

      if (isImpersonating && targetAlumno) {
        alumnoData = targetAlumno;
      } else {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.email) { navigate("/"); return; }
        const { data } = await supabase
          .from("alumnos")
          .select("*")
          .eq("email", session.user.email.toLowerCase().trim())
          .maybeSingle();
        if (!data) { navigate("/"); return; }
        alumnoData = data;
      }

      setAlumno(alumnoData);

      const { data: subs } = await supabase
        .from("suscripciones")
        .select("id, estado, created_at, fecha_inicio, fecha_fin, mp_status, auto_renovacion, cancelada_at, plan_id, descuento_id, precio_base, precio_final, planes(nombre, precio, frecuencia), descuentos(nombre, valor, tipo, categoria)")
        .eq("alumno_id", alumnoData.id)
        .order("created_at", { ascending: false });

      if (subs) {
        const mapped: SubscriptionRecord[] = subs.map((s: any) => ({
          id: s.id,
          estado: s.estado,
          created_at: s.created_at,
          fecha_inicio: s.fecha_inicio,
          fecha_fin: s.fecha_fin,
          mp_status: s.mp_status,
          auto_renovacion: s.auto_renovacion ?? false,
          cancelada_at: s.cancelada_at,
          descuento_id: s.descuento_id,
          precio_base: s.precio_base,
          precio_final: s.precio_final,
          plan: s.planes ? { nombre: s.planes.nombre, precio: s.planes.precio, frecuencia: s.planes.frecuencia } : null,
          descuento: s.descuentos ? { nombre: s.descuentos.nombre, valor: s.descuentos.valor, tipo: s.descuentos.tipo, categoria: s.descuentos.categoria } : null,
        }));
        setSubscriptions(mapped);
      }

      setLoading(false);
    };
    load();
  }, [navigate, isImpersonating, targetAlumno]);

  // Categorize
  const todayStr = (() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  })();

  const activeSubs = subscriptions.filter(s => {
    const eff = getEffectiveStatus(s);
    return eff === "activa" || eff === "pendiente_verificacion" || eff === "pendiente" || eff === "pago_pendiente";
  });
  const historicSubs = subscriptions.filter(s => !activeSubs.includes(s));

  const handleToggleRenovacion = async (sub: SubscriptionRecord) => {
    if (readOnly) return;
    setTogglingId(sub.id);
    const newValue = !sub.auto_renovacion;
    const { error } = await supabase
      .from("suscripciones")
      .update({ auto_renovacion: newValue } as any)
      .eq("id", sub.id);
    setTogglingId(null);
    if (error) {
      toast({ title: "Error", description: "No se pudo actualizar.", variant: "destructive" });
    } else {
      setSubscriptions(prev => prev.map(s => s.id === sub.id ? { ...s, auto_renovacion: newValue } : s));
      toast({
        title: newValue ? "Renovación activada" : "Renovación desactivada",
        description: `${sub.plan?.nombre || "Plan"}: ${newValue ? "se renovará" : "no se renovará"} automáticamente.`,
      });
    }
  };

  const handleCancelSubscription = async (sub: SubscriptionRecord) => {
    if (readOnly) return;
    setCancellingId(sub.id);
    const { error } = await supabase
      .from("suscripciones")
      .update({ cancelada_at: new Date().toISOString(), auto_renovacion: false } as any)
      .eq("id", sub.id);
    setCancellingId(null);
    if (error) {
      toast({ title: "Error", description: "No se pudo cancelar.", variant: "destructive" });
    } else {
      setSubscriptions(prev => prev.map(s => s.id === sub.id ? { ...s, cancelada_at: new Date().toISOString(), auto_renovacion: false } : s));
      toast({
        title: "Suscripción cancelada",
        description: `${sub.plan?.nombre || "Plan"}: acceso disponible hasta ${formatDate(sub.fecha_fin)}.`,
      });
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
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-primary">
                        <CheckCircle2 className="w-5 h-5" />
                        <span className="text-sm font-heading font-semibold uppercase tracking-wider">
                          {sub.plan?.nombre || "Plan"}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {daysRemaining} día{daysRemaining !== 1 ? "s" : ""}
                      </span>
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

                    {/* Auto-renewal */}
                    <div className={`rounded-lg p-3 text-xs ${
                      sub.auto_renovacion
                        ? "bg-primary/5 border border-primary/20 text-primary"
                        : "bg-muted/50 border border-border text-muted-foreground"
                    }`}>
                      {sub.auto_renovacion ? (
                        <>
                          <span className="font-semibold">Renovación automática activada.</span>{" "}
                          Próximo cobro: {formatPrice(sub.plan?.precio || 0)} el {formatDate(sub.fecha_fin)}.
                        </>
                      ) : (
                        <>
                          <span className="font-semibold">Renovación automática desactivada.</span>{" "}
                          Vence el {formatDate(sub.fecha_fin)}.
                        </>
                      )}
                    </div>

                    {/* Per-plan actions */}
                    <div className="rounded-xl border border-border bg-card/80 overflow-hidden">
                      {/* Toggle renewal */}
                      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
                        <div className="flex items-center gap-2">
                          <RefreshCw className="w-4 h-4 text-primary" />
                          <span className="text-xs font-medium text-foreground">Renovación automática</span>
                        </div>
                        <Switch
                          checked={sub.auto_renovacion}
                          onCheckedChange={() => handleToggleRenovacion(sub)}
                          disabled={togglingId === sub.id}
                        />
                      </div>

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
                            <AlertDialogDescription className="space-y-2">
                              <p>Tu acceso a este plan seguirá disponible hasta el {formatDate(sub.fecha_fin)}.</p>
                              <p>Tus otros planes no se verán afectados.</p>
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
                  </div>
                );
              })}

              {/* Total summary */}
              {activeSubs.length > 1 && (
                <div className="rounded-xl border border-border bg-card/80 p-4 flex justify-between items-center">
                  <span className="text-sm font-medium text-muted-foreground">Total mensual</span>
                  <span className="text-lg font-semibold gold-text-gradient">{formatPrice(totalActivo)}</span>
                </div>
              )}

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
      <BottomNav />
    </div>
  );
};

export default StudentPayments;
