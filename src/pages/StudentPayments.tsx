import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/currency";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, CreditCard, Clock, CheckCircle2, XCircle, ExternalLink, RefreshCw, ArrowRightLeft, Ban, AlertTriangle } from "lucide-react";
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
  plan: {
    nombre: string;
    precio: number;
    frecuencia: string;
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
    label: "Confirmado",
    message: "Tu pago fue confirmado.",
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

// formatPrice imported from @/lib/currency

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
  if (sub.cancelada_at) return "cancelada";
  if (sub.estado === "activa" && sub.fecha_fin) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const fin = new Date(sub.fecha_fin + "T23:59:59");
    if (fin < today) return "vencida";
  }
  return sub.estado;
};

const StudentPayments = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [alumno, setAlumno] = useState<Alumno | null>(null);
  const [subscriptions, setSubscriptions] = useState<SubscriptionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSub, setActiveSub] = useState<SubscriptionRecord | null>(null);
  const [togglingRenovacion, setTogglingRenovacion] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.email) { navigate("/"); return; }

      const { data: alumnoData } = await supabase
        .from("alumnos")
        .select("*")
        .eq("email", session.user.email.toLowerCase().trim())
        .maybeSingle();

      if (!alumnoData) { navigate("/"); return; }
      setAlumno(alumnoData);

      const { data: subs } = await supabase
        .from("suscripciones")
        .select("id, estado, created_at, fecha_inicio, fecha_fin, mp_status, auto_renovacion, cancelada_at, plan_id, planes(nombre, precio, frecuencia)")
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
          plan: s.planes ? { nombre: s.planes.nombre, precio: s.planes.precio, frecuencia: s.planes.frecuencia } : null,
        }));
        setSubscriptions(mapped);

        const now = new Date();
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
        const active = mapped.find(
          (s) => s.estado === "activa" && !s.cancelada_at && s.fecha_fin && s.fecha_fin >= todayStr
        );
        setActiveSub(active || null);
      }

      setLoading(false);
    };
    load();
  }, [navigate]);

  const handleToggleRenovacion = async () => {
    if (!activeSub) return;
    setTogglingRenovacion(true);
    const newValue = !activeSub.auto_renovacion;

    const { error } = await supabase
      .from("suscripciones")
      .update({ auto_renovacion: newValue } as any)
      .eq("id", activeSub.id);

    setTogglingRenovacion(false);
    if (error) {
      toast({ title: "Error", description: "No se pudo actualizar la configuración.", variant: "destructive" });
    } else {
      setActiveSub({ ...activeSub, auto_renovacion: newValue });
      setSubscriptions(prev => prev.map(s => s.id === activeSub.id ? { ...s, auto_renovacion: newValue } : s));
      toast({
        title: newValue ? "Renovación activada" : "Renovación desactivada",
        description: newValue
          ? `Tu plan se renovará automáticamente el ${formatDate(activeSub.fecha_fin)}.`
          : `Tu plan no se renovará al vencer el ${formatDate(activeSub.fecha_fin)}.`,
      });
    }
  };

  const handleCancelSubscription = async () => {
    if (!activeSub) return;
    setCancelling(true);

    const { error } = await supabase
      .from("suscripciones")
      .update({ cancelada_at: new Date().toISOString(), auto_renovacion: false } as any)
      .eq("id", activeSub.id);

    setCancelling(false);
    if (error) {
      toast({ title: "Error", description: "No se pudo cancelar. Intentá de nuevo.", variant: "destructive" });
    } else {
      const updated = { ...activeSub, cancelada_at: new Date().toISOString(), auto_renovacion: false };
      setActiveSub(null);
      setSubscriptions(prev => prev.map(s => s.id === activeSub.id ? updated : s));
      toast({
        title: "Suscripción cancelada",
        description: `Tu acceso sigue disponible hasta el ${formatDate(activeSub.fecha_fin)}.`,
      });
    }
  };

  const handleChangePlan = () => {
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

  const activeStatus = activeSub ? getEffectiveStatus(activeSub) : null;
  const daysRemaining = activeSub?.fecha_fin
    ? Math.max(0, Math.ceil((new Date(activeSub.fecha_fin + "T23:59:59").getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="flex items-center gap-3 px-5 pt-5 pb-2">
        <Button variant="ghost" size="icon" onClick={() => navigate("/alumno")} className="text-muted-foreground">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <img src={logo} alt="Ciclismo Reybaud" className="w-8 h-8" />
        <h1 className="text-lg font-heading font-semibold text-foreground uppercase tracking-wider">
          Suscripción y pagos
        </h1>
      </header>

      <main className="flex-1 px-4 pb-8">
        <div className="w-full max-w-md mx-auto space-y-6 animate-fade-in">

          {/* Subtitle */}
          <p className="text-sm text-muted-foreground text-center">
            Gestioná tu plan de forma simple
          </p>

          {/* ──────── Active Plan Card ──────── */}
          {activeSub ? (
            <div className="rounded-xl border border-primary/30 bg-card/80 backdrop-blur-sm p-5 space-y-4 shadow-lg shadow-black/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-primary">
                  <CheckCircle2 className="w-5 h-5" />
                  <span className="text-sm font-heading font-semibold uppercase tracking-wider">Plan activo</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {daysRemaining} día{daysRemaining !== 1 ? "s" : ""} restante{daysRemaining !== 1 ? "s" : ""}
                </span>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Plan</span>
                  <span className="font-semibold text-foreground">{activeSub.plan?.nombre || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Monto</span>
                  <span className="font-semibold gold-text-gradient">{activeSub.plan ? formatPrice(activeSub.plan.precio) : "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Vencimiento</span>
                  <span className="font-medium text-foreground">{formatDate(activeSub.fecha_fin)}</span>
                </div>
              </div>

              {/* Auto-renewal status message */}
              <div className={`rounded-lg p-3 text-xs ${
                activeSub.auto_renovacion
                  ? "bg-primary/5 border border-primary/20 text-primary"
                  : "bg-muted/50 border border-border text-muted-foreground"
              }`}>
                {activeSub.auto_renovacion ? (
                  <>
                    <span className="font-semibold">Renovación automática activada.</span>{" "}
                    Próximo cobro estimado: {formatPrice(activeSub.plan?.precio || 0)} el {formatDate(activeSub.fecha_fin)}.
                  </>
                ) : (
                  <>
                    <span className="font-semibold">Renovación automática desactivada.</span>{" "}
                    Tu plan vencerá el {formatDate(activeSub.fecha_fin)} y no se renovará automáticamente.
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card/80 backdrop-blur-sm p-6 text-center space-y-3 shadow-lg shadow-black/20">
              <CreditCard className="w-10 h-10 text-muted-foreground mx-auto" />
              <p className="text-sm text-muted-foreground">No tenés un plan activo.</p>
              <p className="text-xs text-muted-foreground">Elegí un plan para acceder a tus entrenamientos.</p>
              <Button variant="gold" size="sm" onClick={handleChangePlan}>
                Ver planes disponibles
              </Button>
            </div>
          )}

          {/* ──────── Actions Block ──────── */}
          {activeSub && (
            <div className="space-y-3">
              <h2 className="text-sm font-heading font-semibold uppercase tracking-wider text-muted-foreground">
                Gestión de suscripción
              </h2>
              <p className="text-xs text-muted-foreground">
                Podés cambiar de plan, cancelar tu suscripción o activar la renovación automática.
              </p>

              <div className="rounded-xl border border-border bg-card/80 backdrop-blur-sm overflow-hidden shadow-lg shadow-black/20">
                {/* Auto renewal toggle */}
                <div className="flex items-center justify-between px-4 py-4 border-b border-border/50">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <RefreshCw className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">Renovación automática</p>
                      <p className="text-xs text-muted-foreground">
                        {activeSub.auto_renovacion ? "Activada" : "Desactivada"}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={activeSub.auto_renovacion}
                    onCheckedChange={handleToggleRenovacion}
                    disabled={togglingRenovacion}
                  />
                </div>

                {/* Change plan */}
                <button
                  onClick={handleChangePlan}
                  className="w-full flex items-center gap-3 px-4 py-4 hover:bg-accent/30 transition-colors border-b border-border/50"
                >
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <ArrowRightLeft className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-sm font-medium text-foreground">Cambiar plan</p>
                    <p className="text-xs text-muted-foreground">Elegí otro plan según tus objetivos</p>
                  </div>
                </button>

                {/* Cancel subscription */}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      className="w-full flex items-center gap-3 px-4 py-4 hover:bg-accent/30 transition-colors"
                    >
                      <div className="w-9 h-9 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
                        <Ban className="w-4 h-4 text-destructive" />
                      </div>
                      <div className="flex-1 text-left">
                        <p className="text-sm font-medium text-destructive">Cancelar suscripción</p>
                        <p className="text-xs text-muted-foreground">Mantener acceso hasta el fin del período</p>
                      </div>
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="bg-card border-border">
                    <AlertDialogHeader>
                      <AlertDialogTitle className="text-foreground">¿Cancelar tu suscripción?</AlertDialogTitle>
                      <AlertDialogDescription className="space-y-3">
                        <p>Tu acceso estará disponible hasta el final del período abonado ({formatDate(activeSub.fecha_fin)}).</p>
                        <p>Después de esa fecha, no podrás acceder a los entrenamientos hasta que actives un nuevo plan.</p>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel className="border-border">Volver</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleCancelSubscription}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        disabled={cancelling}
                      >
                        {cancelling ? "Cancelando..." : "Sí, cancelar"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          )}

          {/* ──────── Payment History ──────── */}
          <div className="space-y-3">
            <h2 className="text-sm font-heading font-semibold uppercase tracking-wider text-muted-foreground">
              Historial de pagos
            </h2>

            {subscriptions.length === 0 ? (
              <div className="rounded-xl border border-border bg-card/80 p-6 text-center">
                <p className="text-sm text-muted-foreground">No hay pagos registrados.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {subscriptions.map((sub) => {
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
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Monto</span>
                          <span className="text-foreground">{sub.plan ? formatPrice(sub.plan.precio) : "—"}</span>
                        </div>
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
