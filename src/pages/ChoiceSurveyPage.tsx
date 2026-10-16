/**
 * Enlace universal de encuestas operativas (/encuesta-talles/:slug).
 * Resuelve la reserva propia en el servidor (función `choice-survey`) a partir de:
 *  - ?token= personal, o
 *  - sesión verificada (alumno con Google/código, o externo con código al email de su reserva).
 * Nunca busca reservas por un email escrito sin verificar.
 */
import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Shirt, CheckCircle2, Mail } from "lucide-react";

type Opt = { value: string; label: string; needs_follow_up: boolean };
type Survey = { key: string; title: string; subtitle: string | null; intro: string | null; question: string; options: Opt[] };
type Res = { reservation_id: string; participante: string; paquete: string | null; answer: { respuesta?: string; actualizado_at?: string } | null };

const call = async (body: Record<string, unknown>) => {
  const { data, error } = await supabase.functions.invoke("choice-survey", { body });
  if (error) {
    let code = "error";
    try { code = (await (error as any).context?.json())?.error ?? code; } catch { /* noop */ }
    throw new Error(code);
  }
  return data as any;
};

const ChoiceSurveyPage = () => {
  const { slug = "" } = useParams();
  const [params] = useSearchParams();
  const token = params.get("token");
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [phase, setPhase] = useState<"loading" | "notfound" | "auth" | "list" | "error">("loading");
  const [list, setList] = useState<Res[]>([]);
  const [hadInactive, setHadInactive] = useState(false);
  const [sel, setSel] = useState<Record<string, string | null>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<Record<string, string>>({});
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [authErr, setAuthErr] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const resolve = useCallback(async () => {
    setPhase("loading");
    try {
      const r = await call({ action: "resolve", slug, token: token ?? undefined });
      setList(r.reservations ?? []);
      setHadInactive(!!r.had_inactive);
      setSel(Object.fromEntries((r.reservations ?? []).map((x: Res) => [x.reservation_id, x.answer?.respuesta ?? null])));
      setPhase("list");
    } catch (e: any) {
      if (e.message === "auth_required") setPhase("auth");
      else if (e.message === "not_found" || e.message === "invalid_token") setPhase(token ? "error" : "notfound");
      else setPhase("error");
    }
  }, [slug, token]);

  useEffect(() => {
    (async () => {
      try {
        const c = await call({ action: "config", slug });
        setSurvey(c.survey);
      } catch { setPhase("notfound"); return; }
      if (token) return resolve();
      const { data: { session } } = await supabase.auth.getSession();
      setUserEmail(session?.user?.email ?? null);
      if (session) resolve(); else setPhase("auth");
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((ev, s) => {
      if (ev === "SIGNED_IN" && !token) { setUserEmail(s?.user?.email ?? null); setTimeout(resolve, 0); }
    });
    return () => sub.subscription.unsubscribe();
  }, [slug, token, resolve]);

  const sendCode = async () => {
    const e = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) { setAuthErr("Revisá el email."); return; }
    setBusy(true); setAuthErr(null);
    const { error } = await supabase.auth.signInWithOtp({ email: e, options: { shouldCreateUser: true, emailRedirectTo: window.location.href } });
    setBusy(false);
    if (error) setAuthErr("No pudimos enviar el código. Probá de nuevo en unos minutos.");
    else setCodeSent(true);
  };
  const verify = async () => {
    setBusy(true); setAuthErr(null);
    const { error } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.replace(/\D/g, ""), type: "email" });
    setBusy(false);
    if (error) setAuthErr("El código no es válido o venció.");
  };
  const google = async () => {
    setAuthErr(null);
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: `${window.location.origin}${window.location.pathname}` });
    if (r.error) setAuthErr("No se pudo ingresar con Google.");
  };
  const signOut = async () => { await supabase.auth.signOut(); setList([]); setCodeSent(false); setCode(""); setPhase("auth"); };

  const save = async (rid: string) => {
    const v = sel[rid];
    if (!v) return;
    setSaving(rid);
    try {
      const r = await call({ action: "save", slug, token: token ?? undefined, reservation_id: rid, respuesta: v });
      setList((l) => l.map((x) => x.reservation_id === rid ? { ...x, answer: r.answer } : x));
      const label = survey?.options.find((o) => o.value === v)?.label ?? v;
      setSavedMsg((m) => ({ ...m, [rid]: `¡Listo! Guardamos tu respuesta: ${label}.` }));
    } catch (e: any) {
      setSavedMsg((m) => ({ ...m, [rid]: e.message === "reserva_no_disponible" ? "Esta reserva ya no está activa." : "No se pudo guardar. Probá de nuevo." }));
    } finally { setSaving(null); }
  };

  return (
    <div className="min-h-screen bg-background px-4 py-8 safe-area-inset">
      <div className="mx-auto max-w-md space-y-5">
        <header className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center shrink-0"><Shirt className="w-6 h-6 text-primary" /></div>
          <div>
            <h1 className="text-xl font-semibold">{survey?.title ?? "Encuesta"}</h1>
            {survey?.subtitle && <p className="text-sm text-muted-foreground">{survey.subtitle}</p>}
          </div>
        </header>
        {survey?.intro && <p className="text-sm text-muted-foreground">{survey.intro}</p>}

        {phase === "loading" && <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}
        {phase === "notfound" && <p className="text-sm">Esta encuesta no está disponible.</p>}
        {phase === "error" && <p className="text-sm">No pudimos abrir tu encuesta{token ? " con este enlace" : ""}. Probá de nuevo más tarde o escribinos.</p>}

        {phase === "auth" && (
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <p className="text-sm">Para ver tu reserva, confirmá tu identidad con el email con el que te inscribiste.</p>
            {!codeSent ? (
              <>
                <Input type="email" inputMode="email" autoComplete="email" placeholder="tu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                <Button className="w-full h-11" onClick={sendCode} disabled={busy}>{busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Mail className="w-4 h-4 mr-2" />}Recibir código por email</Button>
                <Button variant="outline" className="w-full h-11" onClick={google}>Ingresar con Google</Button>
              </>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">Te enviamos un código a {email.trim().toLowerCase()}. Ingresalo acá.</p>
                <Input inputMode="numeric" autoComplete="one-time-code" placeholder="Código" value={code} onChange={(e) => setCode(e.target.value)} maxLength={10} />
                <Button className="w-full h-11" onClick={verify} disabled={busy || code.replace(/\D/g, "").length < 6}>{busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Confirmar</Button>
                <button type="button" className="text-xs underline text-muted-foreground" onClick={() => { setCodeSent(false); setCode(""); }}>Usar otro email</button>
              </>
            )}
            {authErr && <p className="text-xs text-destructive">{authErr}</p>}
          </div>
        )}

        {phase === "list" && survey && (
          <>
            {list.length === 0 && (
              <div className="rounded-xl border border-border bg-card p-4 space-y-2 text-sm">
                <p>{hadInactive ? "Tu reserva para este viaje no está activa." : `No encontramos una reserva activa para ${userEmail ?? "este acceso"}.`}</p>
                {!token && <p className="text-muted-foreground text-xs">Si te inscribiste con otro email, ingresá con ese.</p>}
                {!token && <Button variant="outline" size="sm" onClick={signOut}>Usar otro email</Button>}
              </div>
            )}
            {list.map((r) => {
              const v = sel[r.reservation_id] ?? null;
              return (
                <div key={r.reservation_id} className="rounded-xl border border-border bg-card p-4 space-y-3">
                  {list.length > 1 && <p className="text-sm font-medium">{r.participante}{r.paquete ? ` · ${r.paquete}` : ""}</p>}
                  <p className="text-sm font-medium">{survey.question}</p>
                  <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label={survey.question}>
                    {survey.options.map((o) => (
                      <button key={o.value} type="button" role="radio" aria-checked={v === o.value}
                        onClick={() => setSel((s) => ({ ...s, [r.reservation_id]: o.value }))}
                        className={`h-12 rounded-lg border text-sm font-semibold transition ${o.needs_follow_up ? "col-span-4" : ""} ${v === o.value ? "bg-primary text-primary-foreground border-primary" : "bg-muted/40 hover:bg-muted border-border"}`}>
                        {o.label}
                      </button>
                    ))}
                  </div>
                  {!v && <p className="text-xs text-muted-foreground">Elegí una opción para poder guardar.</p>}
                  <Button className="w-full h-12" disabled={!v || saving === r.reservation_id} onClick={() => save(r.reservation_id)}>
                    {saving === r.reservation_id && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    {r.answer?.respuesta ? "Actualizar respuesta" : "Guardar"}
                  </Button>
                  {savedMsg[r.reservation_id] && (
                    <p className="text-sm flex items-center gap-2" role="status"><CheckCircle2 className="w-4 h-4 text-primary" />{savedMsg[r.reservation_id]}</p>
                  )}
                </div>
              );
            })}
            {!token && list.length > 0 && <button type="button" className="text-xs underline text-muted-foreground" onClick={signOut}>No soy yo / usar otro email</button>}
          </>
        )}
      </div>
    </div>
  );
};

export default ChoiceSurveyPage;
