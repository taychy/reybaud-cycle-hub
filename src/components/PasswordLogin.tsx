import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { clearPendingOtpState } from "@/lib/pendingOtp";

/** Uses normal Supabase authentication; grants no roles or access exemptions. */
export default function PasswordLogin() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);

  const signIn = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (authError || !data.session) {
        setError("No pudimos iniciar sesión. Revisá el email y la contraseña. / Check your email and password.");
        return;
      }
      clearPendingOtpState();
      setPassword("");
      // Login's existing session listener applies all normal account checks.
    } catch {
      setError("No pudimos conectarnos. Intentá nuevamente. / Please try again.");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Button
        type="button"
        variant="ghost"
        className="w-full text-xs"
        aria-expanded={open}
        aria-controls="password-login-form"
        disabled={busy}
        onClick={() => {
          setOpen(!open);
          setPassword("");
          setError(null);
        }}
      >
        {open ? "Cerrar / Close" : "Ingresar con contraseña / Sign in with password"}
      </Button>
      {open && (
        <form id="password-login-form" onSubmit={signIn} className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Para cuentas con contraseña configurada, incluida la cuenta de revisión. / For accounts with a configured password, including the review account.
          </p>
          <label htmlFor="password-login-email" className="block text-sm">Email</label>
          <Input id="password-login-email" type="email" name="username" autoComplete="username"
            required value={email} disabled={busy} onChange={(event) => setEmail(event.target.value)} />
          <label htmlFor="password-login-password" className="block text-sm">Contraseña / Password</label>
          <Input id="password-login-password" type="password" name="password" autoComplete="current-password"
            required value={password} disabled={busy} onChange={(event) => setPassword(event.target.value)} />
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" variant="outline" disabled={busy} className="w-full h-12 rounded-xl">
            {busy ? "Ingresando… / Signing in…" : "Ingresar / Sign in"}
          </Button>
        </form>
      )}
    </div>
  );
}
