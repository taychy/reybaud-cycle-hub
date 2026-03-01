import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import logo from "@/assets/logo.png";
import { MapPin, Clock, CalendarDays, Users } from "lucide-react";

const RecordDelAhora = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
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
    if (form.team_name.trim().length === 0) e.team_name = "Campo obligatorio";
    setErrors(e);
    return Object.keys(e).length === 0;
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
        .eq("event_slug", "record-del-ahora")
        .eq("email", normalizedEmail)
        .maybeSingle();

      if (existing) {
        navigate(`/eventos/record-del-ahora/mi-resultados?token=${existing.public_access_token}`);
        return;
      }

      // Insert new participant
      const { data: inserted, error: insertError } = await supabase
        .from("event_participants")
        .insert({
          event_slug: "record-del-ahora",
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          email: normalizedEmail,
          team_name: form.team_name.trim(),
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
      navigate(`/eventos/record-del-ahora/mi-resultados?token=${inserted.public_access_token}`);
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
            <CalendarDays className="w-4 h-4 text-primary" /> 29/02/2026
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-primary" /> 08:00
          </span>
          <span className="flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-primary" /> KDT, Palermo
          </span>
        </div>
      </div>

      {/* Check-in form */}
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
            <Label htmlFor="team_name">Equipo</Label>
            <Input
              id="team_name"
              value={form.team_name}
              onChange={(e) => setForm({ ...form, team_name: e.target.value })}
              placeholder="Nombre del equipo"
            />
            {errors.team_name && <p className="text-xs text-destructive">{errors.team_name}</p>}
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
        </form>
      </div>
    </div>
  );
};

export default RecordDelAhora;
