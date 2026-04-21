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
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    team_name: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

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
    const { data: existing } = await supabase
      .from("event_participants")
      .select("public_access_token")
      .eq("event_slug", "record-de-la-hora")
      .eq("email", email)
      .maybeSingle();

    if (existing) {
      navigate(`/eventos/record-de-la-hora/mi-resultados?token=${existing.public_access_token}`);
    } else {
      setLoginError("No se encontró un registro con ese email. Registrate primero.");
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);

    try {
      const normalizedEmail = form.email.trim().toLowerCase();

      // Check if already registered
      const { data: existing } = await supabase
        .from("event_participants")
        .select("public_access_token")
        .eq("event_slug", "record-de-la-hora")
        .eq("email", normalizedEmail)
        .maybeSingle();

      if (existing) {
        navigate(`/eventos/record-de-la-hora/mi-resultados?token=${existing.public_access_token}`);
        return;
      }

      // Insert new participant
      const { data: inserted, error: insertError } = await supabase
        .from("event_participants")
        .insert({
          event_slug: "record-de-la-hora",
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          email: normalizedEmail,
          team_name: form.team_name.trim() || "Sin equipo",
        })
        .select("public_access_token")
        .single();

      if (insertError) throw insertError;

      // Send email with results link (fire & forget)
      supabase.functions.invoke("send-event-checkin-email", {
        body: {
          email: normalizedEmail,
          first_name: form.first_name.trim(),
          token: inserted.public_access_token,
        },
      });

      toast({ title: "¡Check-in exitoso!", description: "Te registraste correctamente." });
      navigate(`/eventos/record-de-la-hora/mi-resultados?token=${inserted.public_access_token}`);
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
        <div className="flex flex-wrap justify-center gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <CalendarDays className="w-4 h-4 text-primary" /> 01/03/2026
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-primary" /> 08:00
          </span>
          <span className="flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-primary" /> KDT, Palermo
          </span>
        </div>
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
