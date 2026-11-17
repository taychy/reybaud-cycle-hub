import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CalendarDays, CheckCircle2, Loader2, Mail, Phone } from "lucide-react";

const compactPhone = (raw: string) => raw.trim().replace(/[\s().-]/g, "");
const validPhone = (phone: string) => /^\+[1-9][0-9]{7,14}$/.test(phone);
const isUUID = (value: string | undefined | null): value is string =>
  !!value && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);

export default function PublicEventRsvpEntry() {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    const updateUser = (next: User | null) => {
      if (!active) return;
      setUser(next);
      setChecking(false);
    };
    void supabase.auth.getUser().then(({ data, error: authError }) =>
      updateUser(authError ? null : data.user)
    ).catch(() => updateUser(null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) =>
      updateUser(session?.user || null)
    );
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!user) return;
    let active = true;
    void supabase.from("alumnos").select("nombre,apellido,telefono")
      .eq("user_id", user.id).maybeSingle().then(({ data }) => {
        if (!active || !data) return;
        setFirstName(old => old || data.nombre || "");
        setLastName(old => old || data.apellido || "");
        setWhatsapp(old => old || data.telefono || "");
      });
    return () => { active = false; };
  }, [user?.id]);

  const sendCode = async (e: FormEvent) => {
    e.preventDefault();
    if (!isUUID(eventId)) return;
    const cleanEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError("Ingresá un correo electrónico válido."); return;
    }
    setError(""); setMessage(""); setBusy(true);
    try {
      const { error: failure } = await supabase.auth.signInWithOtp({
        email: cleanEmail,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: `${window.location.origin}/eventos/${eventId}/confirmar`,
        },
      });
      if (failure) throw failure;
      setOtpSent(true);
      setMessage("Te enviamos un código al correo. Ingresalo para continuar.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos enviar el código.");
    } finally { setBusy(false); }
  };

  const verifyCode = async (e: FormEvent) => {
    e.preventDefault();
    const code = otp.replace(/\D/g, "");
    if (code.length !== 8) { setError("Ingresá el código de 8 dígitos."); return; }
    setBusy(true); setError(""); setMessage("");
    try {
      const { data, error: failure } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(), token: code, type: "email",
      });
      if (failure || !data.user) throw failure || new Error("No se pudo verificar el correo.");
      setUser(data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Código incorrecto o vencido.");
    } finally { setBusy(false); }
  };

  const continueToSurvey = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !isUUID(eventId)) return;
    const phone = compactPhone(whatsapp);
    if (firstName.trim().length < 2 || lastName.trim().length < 2) {
      setError("Completá tu nombre y apellido."); return;
    }
    if (!validPhone(phone)) {
      setError("Ingresá tu WhatsApp con código de país, por ejemplo +54 9 11 1234 5678."); return;
    }
    setBusy(true); setError("");
    try {
      const client = supabase as unknown as {
        rpc: (name: string, args: Record<string, unknown>) => Promise<{
          data: string | null; error: { message: string } | null;
        }>;
      };
      const result = await client.rpc("create_or_resume_public_rsvp", {
        p_event_id: eventId,
        p_first_name: firstName.trim(),
        p_last_name: lastName.trim(),
        p_whatsapp: phone,
      });
      if (result.error || !isUUID(result.data)) {
        throw new Error(result.error?.message || "No se pudo generar tu enlace personal.");
      }
      navigate(`/confirmar-asistencia/${result.data}?opcion=voy`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos abrir tu encuesta.");
      setBusy(false);
    }
  };

  if (!isUUID(eventId)) return <p className="p-8 text-center">Evento no disponible.</p>;

  return <main className="min-h-screen bg-background px-4 py-8 sm:py-12 text-foreground">
    <Card className="w-full max-w-lg mx-auto border-primary/30 shadow-xl">
      <CardContent className="p-5 sm:p-8 space-y-6">
        <div className="space-y-2 border-l-4 border-primary pl-4">
          <p className="text-sm font-heading tracking-widest text-primary">CICLISMO REYBAUD</p>
          <h1 className="font-heading text-3xl font-bold uppercase">Fondazo de fin de año</h1>
          <p className="flex items-center gap-2 text-accent text-sm">
            <CalendarDays className="w-4 h-4" /> Domingo 29/11/2026 · Capilla del Señor
          </p>
        </div>
        <div className="rounded-lg border border-primary/25 bg-primary/5 p-4 space-y-1">
          <p className="font-semibold">Confirmá tu asistencia</p>
          <p className="text-sm text-muted-foreground">
            Primero registrá tu nombre, apellido y WhatsApp. Después elegí si venís al fondo,
            a la parrilla o a ambos, y agregá a tus acompañantes.
          </p>
          <p className="text-xs text-muted-foreground">
            No se realizan pagos en esta pantalla. El fondo es gratis para alumnos activos;
            los amigos ciclistas deben tener aprobación previa de Claudio.
          </p>
        </div>

        {checking ? <p className="flex justify-center gap-2 items-center text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Comprobando tu acceso...
        </p> : user ? <form onSubmit={continueToSurvey} className="space-y-4">
          <div className="rounded-md bg-muted/30 p-3 text-sm">
            <p className="font-semibold flex items-center gap-2"><Mail className="w-4 h-4 text-primary" /> Tu email verificado</p>
            <p className="break-all text-muted-foreground">{user.email}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="fondazo-first-name">Nombre</Label>
              <Input id="fondazo-first-name" autoComplete="given-name" required maxLength={70}
                value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Tu nombre" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fondazo-last-name">Apellido</Label>
              <Input id="fondazo-last-name" autoComplete="family-name" required maxLength={70}
                value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Tu apellido" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="fondazo-phone"><Phone className="inline mr-1 w-4 h-4" /> WhatsApp</Label>
            <Input id="fondazo-phone" type="tel" autoComplete="tel" required maxLength={25}
              value={whatsapp} onChange={e => setWhatsapp(e.target.value)}
              placeholder="+54 9 11 1234-5678" />
            <p className="text-xs text-muted-foreground">Se utiliza para coordinar este evento. Los acompañantes no necesitan una cuenta.</p>
          </div>
          <Button type="submit" variant="gold" size="lg" className="w-full" disabled={busy}>
            {busy ? <Loader2 className="mr-2 w-4 h-4 animate-spin" /> : <CheckCircle2 className="mr-2 w-4 h-4" />}
            Continuar a la encuesta
          </Button>
        </form> : !otpSent ? <form onSubmit={sendCode} className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Para guardar tu respuesta a tu nombre, verificá tu email. No hace falta
            ser alumno de la escuela para acompañar en el almuerzo.
          </p>
          <div className="space-y-2">
            <Label htmlFor="fondazo-email">Correo electrónico</Label>
            <Input id="fondazo-email" type="email" required autoComplete="email"
              value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@email.com" />
          </div>
          <Button type="submit" className="w-full" variant="gold" disabled={busy}>
            {busy ? "Enviando..." : "Recibir código por email"}
          </Button>
        </form> : <form onSubmit={verifyCode} className="space-y-4">
          <p className="text-sm text-muted-foreground">Ingresá el código que enviamos a <strong>{email}</strong>.</p>
          <div className="space-y-2">
            <Label htmlFor="fondazo-code">Código de verificación</Label>
            <Input id="fondazo-code" inputMode="numeric" autoComplete="one-time-code" required
              value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, "").slice(0,8))}
              maxLength={8} placeholder="8 dígitos" />
          </div>
          <Button type="submit" variant="gold" className="w-full" disabled={busy}>
            {busy ? "Verificando..." : "Verificar correo"}
          </Button>
          <Button type="button" variant="ghost" className="w-full" onClick={() => { setOtpSent(false); setOtp(""); setError(""); }}>
            Usar otro correo
          </Button>
        </form>}

        {!!message && <p role="status" className="rounded-lg bg-accent/10 px-4 py-3 text-sm text-accent">{message}</p>}
        {!!error && <div role="alert" className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive">{error}</div>}
        <p className="text-xs text-muted-foreground text-center">
          Cada participante confirma con su propio email. Los invitados ciclistas se solicitan dentro de la encuesta.
        </p>
      </CardContent>
    </Card>
  </main>;
}
