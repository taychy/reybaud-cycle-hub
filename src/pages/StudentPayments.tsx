import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, CreditCard, Clock, CheckCircle2, XCircle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import logo from "@/assets/logo.png";
import type { Tables } from "@/integrations/supabase/types";

type Alumno = Tables<"alumnos">;

interface SubscriptionRecord {
  id: string;
  estado: string;
  created_at: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  mp_status: string | null;
  plan: {
    nombre: string;
    precio: number;
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
    message: "Tu pago fue confirmado. Ya podés usar la app normalmente.",
    badgeClass: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30",
  },
  rechazada: {
    icon: <XCircle className="w-4 h-4" />,
    label: "Rechazado",
    message: "Hubo un problema con el pago informado. Revisalo o contactá a administración.",
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
    message: "Tu suscripción venció. Renovála para seguir usando la app.",
    badgeClass: "bg-muted text-muted-foreground border-border",
  },
};

const formatPrice = (precio: number) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(precio);

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
};

const getEffectiveStatus = (sub: SubscriptionRecord): string => {
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
  const [alumno, setAlumno] = useState<Alumno | null>(null);
  const [subscriptions, setSubscriptions] = useState<SubscriptionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSub, setActiveSub] = useState<SubscriptionRecord | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.email) {
        navigate("/");
        return;
      }

      const { data: alumnoData } = await supabase
        .from("alumnos")
        .select("*")
        .eq("email", session.user.email.toLowerCase().trim())
        .maybeSingle();

      if (!alumnoData) {
        navigate("/");
        return;
      }
      setAlumno(alumnoData);

      const { data: subs } = await supabase
        .from("suscripciones")
        .select("id, estado, created_at, fecha_inicio, fecha_fin, mp_status, plan_id, planes(nombre, precio)")
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
          plan: s.planes ? { nombre: s.planes.nombre, precio: s.planes.precio } : null,
        }));
        setSubscriptions(mapped);

        // Find current active subscription
        const now = new Date();
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
        const active = mapped.find(
          (s) => s.estado === "activa" && s.fecha_fin && s.fecha_fin >= todayStr
        );
        setActiveSub(active || null);
      }

      setLoading(false);
    };
    load();
  }, [navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Cargando...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="flex items-center gap-3 px-5 pt-5 pb-2">
        <Button variant="ghost" size="icon" onClick={() => navigate("/alumno")} className="text-muted-foreground">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <img src={logo} alt="Ciclismo Reybaud" className="w-8 h-8" />
        <h1 className="text-lg font-heading font-semibold text-foreground uppercase tracking-wider">Pagos</h1>
      </header>

      <main className="flex-1 px-4 pb-8">
        <div className="w-full max-w-md mx-auto space-y-6 animate-fade-in">

          {/* Active subscription highlight */}
          {activeSub && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5 space-y-3">
              <div className="flex items-center gap-2 text-emerald-500">
                <CheckCircle2 className="w-5 h-5" />
                <span className="text-sm font-heading font-semibold uppercase tracking-wider">Plan activo</span>
              </div>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Plan</span>
                  <span className="font-medium text-foreground">{activeSub.plan?.nombre || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Vence</span>
                  <span className="font-medium text-foreground">{formatDate(activeSub.fecha_fin)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Monto</span>
                  <span className="font-medium text-foreground">{activeSub.plan ? formatPrice(activeSub.plan.precio) : "—"}</span>
                </div>
              </div>
            </div>
          )}

          {!activeSub && (
            <div className="rounded-xl border border-border bg-card/80 p-5 text-center space-y-3">
              <CreditCard className="w-8 h-8 text-muted-foreground mx-auto" />
              <p className="text-sm text-muted-foreground">No tenés un plan activo.</p>
              <Button variant="gold" size="sm" onClick={() => navigate("/planes")}>
                Ver planes
              </Button>
            </div>
          )}

          {/* History */}
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

                      {/* Status message */}
                      <p className="text-xs text-muted-foreground">{config.message}</p>

                      {effectiveStatus === "rechazada" && (
                        <a href="https://wa.me/5491100000000" target="_blank" rel="noopener noreferrer">
                          <Button variant="gold-outline" size="sm" className="w-full mt-1">
                            <ExternalLink className="w-3.5 h-3.5" />
                            Contactar administración
                          </Button>
                        </a>
                      )}

                      {effectiveStatus === "vencida" && (
                        <Button variant="gold" size="sm" className="w-full mt-1" onClick={() => navigate("/planes")}>
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
    </div>
  );
};

export default StudentPayments;
