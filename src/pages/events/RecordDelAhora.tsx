import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import logo from "@/assets/logo.png";
import { MapPin, Clock, CalendarDays, Users, AlertTriangle } from "lucide-react";

const RecordDelAhora = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"choose" | "register" | "login">("choose");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginError, setLoginError] = useState("");
  const [activeEvent, setActiveEvent] = useState<{ id: string; date: string; title: string } | null>(null);
  const [stages, setStages] = useState<Array<{ id: string; date: string; title: string; location: string | null; metadata: any }>>([]);
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    team_name: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Load all record_hora stages + pick active event
  useEffect(() => {
    (async () => {
      const { data: all } = await supabase
        .from("events")
        .select("id, date, title, location, metadata")
        .eq("type", "record_hora" as any)
        .eq("is_active", true)
        .order("date", { ascending: true });
      const list = (all || []) as any[];
      setStages(list);

      const today = new Date().toISOString().slice(0, 10);
      const upcoming = list.find((e) => e.date >= today);
      const chosen = upcoming || list[list.length - 1];
      if (chosen) setActiveEvent(chosen);
    })();
  }, []);

  const validate = () => {
    const e: Record<string, string> = {};
    if (form.first_name.trim().length < 2) e.first_name = "Mínimo 2 caracteres";
    if (form.last_name.trim().length < 2) e.last_name = "Mínimo 2 caracteres";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) e.email = "Email inválido";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    const email = loginEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setLoginError("Email inválido");
      return;
    }
    setLoading(true);
    if (!activeEvent) {
      setLoginError("No hay eventos activos.");
      setLoading(false);
      return;
    }

    const { data, error } = await supabase.functions.invoke("lookup-record-participant", {
      body: { email, event_id: activeEvent.id },
    });

    if (error || !data?.found) {
      setLoginError("No se encontró un registro con ese email. Registrate primero.");
      setLoading(false);
      return;
    }

    navigate(`/eventos/record-de-la-hora/mi-resultados?token=${data.token}`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    if (!activeEvent) {
      toast({ title: "Error", description: "No hay eventos activos.", variant: "destructive" });
      return;
    }
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("register-record-participant", {
        body: {
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          email: form.email.trim().toLowerCase(),
          team_name: form.team_name.trim(),
          event_id: activeEvent.id,
        },
      });

      if (error || !data?.ok) {
        console.error("register error", error, data);
        throw new Error(data?.error || error?.message || "register_failed");
      }

      toast({ title: "¡Inscripción confirmada!", description: "Te enviamos un email con el link a tu resultado." });
      navigate(`/eventos/record-de-la-hora/mi-resultados?token=${data.token}`);
    } catch (err: any) {
      console.error(err);
      toast({ title: "Error", description: "No se pudo registrar. Intentá de nuevo.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center px-4 py-8">
      {/* Header */}
      <div className="flex flex-col items-center gap-4 mb-8">
        <img src={logo} alt="Reybaud" className="w-16 h-16 rounded-full" />
        <h1 className="text-3xl md:text-4xl font-heading font-bold uppercase tracking-wider text-foreground text-center">
          Record de la Hora
        </h1>
        <p className="text-muted-foreground text-center text-sm md:text-base">
          Competencia interna
        </p>
        {stages.length > 0 && (
          <div className="w-full max-w-md flex flex-col gap-2 mt-2">
            {stages.map((s, idx) => {
              const [y, m, d] = s.date.split("-");
              const dateStr = `${d}/${m}/${y}`;
              const opensAt = s.metadata?.checkin_opens_at as string | undefined;
              let timeStr = "08:00";
              if (opensAt) {
                const dt = new Date(opensAt);
                if (!isNaN(dt.getTime())) {
                  timeStr = dt.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });
                }
              }
              const loc = s.location || s.metadata?.location_name || "KDT, Palermo";
              const isActive = activeEvent?.id === s.id;
              return (
                <div
                  key={s.id}
                  className={`rounded-lg px-3 py-2 border ${isActive ? "border-primary/50 bg-primary/5" : "border-border/50 bg-muted/20 opacity-70"}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs font-semibold uppercase tracking-wider ${isActive ? "text-primary" : "text-muted-foreground"}`}>
                      Etapa {idx + 1}{isActive ? " · Actual" : ""}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5 text-primary" /> {dateStr}</span>
                    <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-primary" /> {timeStr}</span>
                    <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-primary" /> {loc}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Beta banner */}
      <div className="w-full max-w-md bg-primary/10 border border-primary/30 rounded-lg px-4 py-3 flex items-start gap-3 mb-2">
        <AlertTriangle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-primary">BETA</span> — Esta función está en fase de prueba. Puede presentar fallas o comportamientos inesperados.
        </p>
      </div>


      {/* Choose mode */}
      {mode === "choose" && (
        <div className="w-full max-w-md glass-card rounded-xl p-6 space-y-4">
          <Button
            variant="gold"
            size="lg"
            className="w-full text-base"
            onClick={() => setMode("register")}
          >
            👋 Primera vez — Registrarme
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="w-full text-base"
            onClick={() => setMode("login")}
          >
            🔑 Ya me registré — Ingresar con email
          </Button>
        </div>
      )}

      {/* Login by email */}
      {mode === "login" && (
        <div className="w-full max-w-md glass-card rounded-xl p-6 space-y-5">
          <h2 className="font-heading text-lg font-semibold uppercase tracking-wide text-foreground">
            Ingresar con email
          </h2>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="login_email">Email</Label>
              <Input
                id="login_email"
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="tu@email.com"
              />
              {loginError && <p className="text-xs text-destructive">{loginError}</p>}
            </div>
            <Button type="submit" variant="gold" size="lg" className="w-full text-base" disabled={loading}>
              {loading ? "Buscando..." : "Ingresar"}
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={() => setMode("choose")}>
              ← Volver
            </Button>
          </form>
        </div>
      )}

      {/* Registration form */}
      {mode === "register" && (
        <div className="w-full max-w-md glass-card rounded-xl p-6 space-y-5">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-5 h-5 text-primary" />
            <h2 className="font-heading text-lg font-semibold uppercase tracking-wide text-foreground">
              Registro de presencia
            </h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="first_name">Nombre</Label>
              <Input
                id="first_name"
                value={form.first_name}
                onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                placeholder="Tu nombre"
              />
              {errors.first_name && <p className="text-xs text-destructive">{errors.first_name}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="last_name">Apellido</Label>
              <Input
                id="last_name"
                value={form.last_name}
                onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                placeholder="Tu apellido"
              />
              {errors.last_name && <p className="text-xs text-destructive">{errors.last_name}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="tu@email.com"
              />
              {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="team_name">Equipo <span className="text-muted-foreground text-xs">(opcional)</span></Label>
              <Input
                id="team_name"
                value={form.team_name}
                onChange={(e) => setForm({ ...form, team_name: e.target.value })}
                placeholder="Nombre del equipo"
              />
            </div>

            <Button
              type="submit"
              variant="gold"
              size="lg"
              className="w-full text-base"
              disabled={loading}
            >
              {loading ? "Registrando..." : "👉 Estoy presente"}
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={() => setMode("choose")}>
              ← Volver
            </Button>
          </form>
        </div>
      )}
    </div>
  );
};

export default RecordDelAhora;
