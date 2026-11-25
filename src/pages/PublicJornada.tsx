import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Bike, CalendarDays, CheckCircle2, Clock3, MapPin, Wrench } from "lucide-react";
import { createJornadaToken, jornadaError, jornadaFormSchema, SCOTT_JORNADA_SLUG, type JornadaOwn, type JornadaStatus } from "@/lib/publicJornada";

const storageKey = `jornada-access:${SCOTT_JORNADA_SLUG}`;
const emptyForm: JornadaOwn = { first_name: "", last_name: "", phone: "", response: "voy" };

export default function PublicJornada() {
  const [status, setStatus] = useState<JornadaStatus | null>(null);
  const [form, setForm] = useState<JornadaOwn>(emptyForm);
  const [token, setToken] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const errorNotice = useRef<HTMLParagraphElement>(null);
  const inFlight = useRef(false);
  const readId = useRef(0);
  const hydrated = useRef(false);

  useEffect(() => {
    if (error) { errorNotice.current?.focus(); errorNotice.current?.scrollIntoView?.({ block: "nearest" }); }
  }, [error]);

  useEffect(() => {
    let active = true;
    const hashToken = new URLSearchParams(window.location.hash.slice(1)).get("acceso");
    let personalToken = hashToken && /^[a-f0-9]{64}$/.test(hashToken) ? hashToken : "";
    try { personalToken ||= localStorage.getItem(storageKey) || ""; } catch { /* URL remains available without storage. */ }
    if (!/^[a-f0-9]{64}$/.test(personalToken)) personalToken = createJornadaToken();
    setToken(personalToken);
    const load = async () => {
      if (inFlight.current) return;
      const requestId = ++readId.current;
      try {
        const { data, error: failure } = await supabase.rpc("get_public_jornada", { p_slug: SCOTT_JORNADA_SLUG, p_token: personalToken });
        if (!active || requestId !== readId.current || inFlight.current) return;
        if (failure || !data) { setError("No pudimos consultar los lugares. Intentá nuevamente en unos momentos."); return; }
        const next = data as unknown as JornadaStatus;
        setStatus(next);
        if (next.own && !hydrated.current) { setForm(next.own); hydrated.current = true; }
      } catch { if (active) setError("No pudimos consultar los lugares. Revisá tu conexión."); }
    };
    void load();
    void supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: student } = await supabase.from("alumnos").select("nombre,apellido,telefono").eq("user_id", data.user.id).maybeSingle();
      if (active && student) setForm(old => ({ ...old, first_name: old.first_name || student.nombre || "", last_name: old.last_name || student.apellido || "", phone: old.phone || student.telefono || "" }));
    }).catch(() => { /* Public attendance does not require a session. */ });
    const interval = window.setInterval(load, 15000);
    const focus = () => { void load(); };
    window.addEventListener("focus", focus);
    return () => { active = false; window.clearInterval(interval); window.removeEventListener("focus", focus); };
  }, []);

  const save = async (response: JornadaOwn["response"]) => {
    if (inFlight.current || !status || !token) return;
    const validation = jornadaFormSchema.safeParse({ ...form, response });
    if (!validation.success) { setError(validation.error.issues[0]?.message || "Revisá tus datos"); return; }
    inFlight.current = true; readId.current++; setBusy(true); setError("");
    // Persist the private capability BEFORE writing, allowing recovery after a lost response.
    try { localStorage.setItem(storageKey, token); } catch { /* Hash is the fallback. */ }
    const url = new URL(window.location.href);
    const hash = new URLSearchParams(url.hash.slice(1)); hash.set("acceso", token); url.hash = hash.toString();
    window.history.replaceState(window.history.state, "", url);
    try {
      const { data, error: failure } = await supabase.rpc("submit_public_jornada", {
        p_slug: SCOTT_JORNADA_SLUG, p_token: token, p_first_name: validation.data.first_name,
        p_last_name: validation.data.last_name, p_phone: validation.data.phone, p_response: response,
      });
      if (failure) { setError(jornadaError(failure.message)); return; }
      const next = data as unknown as JornadaStatus | null;
      if (!next?.own || next.own.response !== response) { setError("No pudimos comprobar tu respuesta. Volvé a consultar antes de intentar nuevamente."); return; }
      setStatus(next); setForm(next.own); hydrated.current = true; setEditing(false);
      window.scrollTo({ top: 0, behavior: "auto" });
      window.setTimeout(() => heading.current?.focus(), 0);
    } catch { setError("No pudimos guardar tu respuesta. Comprobá tu conexión e intentá nuevamente."); }
    finally { inFlight.current = false; setBusy(false); }
  };
  const submit = (event: FormEvent) => { event.preventDefault(); void save(form.response); };
  const saved = !!status?.own && !editing;
  const full = !!status && status.confirmed >= status.capacity;
  const closed = !!status && !status.is_open;

  return <main className="min-h-screen bg-background text-foreground pb-10">
    <header className="border-b border-border px-5 py-4 flex items-center justify-between max-w-xl mx-auto">
      <Button asChild variant="ghost" size="sm"><Link to="/eventos"><ArrowLeft className="h-4 w-4 mr-2" />Reybaud</Link></Button>
      <span className="text-xs uppercase tracking-widest text-primary">Formación inicial</span>
    </header>
    <div className="max-w-xl mx-auto px-5 pt-5 space-y-5">
      {saved ? <section aria-live="polite" className="text-center space-y-5 py-5">
        <CheckCircle2 className="w-20 h-20 mx-auto text-success" aria-hidden />
        <h1 ref={heading} tabIndex={-1} className="font-display text-3xl outline-none">{status?.own?.response === "voy" ? "¡Tu lugar está confirmado!" : "Guardamos tu respuesta: No voy"}</h1>
        <p className="text-xl font-semibold break-words">{status?.own?.first_name} {status?.own?.last_name}</p>
        <p className="font-display text-2xl">Jornada Scott · 28/11</p>
        <p>Sábado 28/11/2026 · 9:00–13:00</p>
        <p className="text-muted-foreground">Salida 9:00 desde Parque Sarmiento. Regreso máximo 13:00.</p>
        {status?.own?.response === "no_voy" && <p className="text-muted-foreground">No ocupás un lugar.</p>}
        <div className="flex flex-col gap-2">
          <Button variant="outline" onClick={async () => {
            try { await navigator.clipboard.writeText(window.location.href); setCopied(true); }
            catch { setError("No pudimos copiar el enlace. Podés guardarlo desde la barra de direcciones."); }
          }}>{copied ? "Enlace personal copiado" : "Copiar mi enlace personal"}</Button>
          <Button variant="ghost" disabled={busy} onClick={() => { setEditing(true); setError(""); }}>Modificar mi respuesta</Button>
          {status?.own?.response === "voy" && <Button variant="ghost" disabled={busy} onClick={() => { if (window.confirm("¿Querés cancelar tu lugar en la Jornada Scott?")) void save("no_voy"); }}>{busy ? "Guardando…" : "Cancelar mi lugar"}</Button>}
          <Button asChild variant="ghost"><Link to="/eventos">Volver a eventos</Link></Button>
        </div>
      </section> : <>
        <section className="space-y-3">
          <div className="flex items-center gap-3"><img src="/pwa-192x192.png" alt="Reybaud" className="w-12 h-12 rounded-lg" /><span className="text-primary text-sm font-semibold">Jornada especial · Gratuita</span></div>
          <h1 className="font-display text-3xl">Jornada Scott · 28/11</h1>
          <p className="text-lg">Pedaleo, limpieza, mantenimiento y accesorios</p>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p className="flex items-center gap-2"><CalendarDays className="w-4 h-4 shrink-0" />Sábado 28 de noviembre de 2026</p>
            <p className="flex items-center gap-2"><Clock3 className="w-4 h-4 shrink-0" />9:00–13:00 · regreso máximo</p>
            <p className="flex items-center gap-2"><MapPin className="w-4 h-4 shrink-0" />Salida y regreso: Parque Sarmiento</p>
          </div>
        </section>
      </>}
      <p className="text-center font-semibold text-primary" aria-live="polite">{status ? `${status.confirmed} de ${status.capacity} lugares confirmados` : "Consultando lugares…"}</p>
      {!status && error && <Button variant="outline" className="w-full" onClick={() => window.location.reload()}>Volver a consultar</Button>}
      {!saved && status && <form onSubmit={submit} className="space-y-4">
        {(full || closed) && <p role="status" className="font-semibold text-center">{closed ? "Inscripción cerrada" : "Cupos completos"}</p>}
        {editing && status.own ? <p className="font-semibold">{status.own.first_name} {status.own.last_name}</p> : <>
          <div><Label htmlFor="jornada-nombre">Nombre</Label><Input id="jornada-nombre" autoComplete="given-name" maxLength={100} required value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} /></div>
          <div><Label htmlFor="jornada-apellido">Apellido</Label><Input id="jornada-apellido" autoComplete="family-name" maxLength={100} required value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} /></div>
          <div><Label htmlFor="jornada-phone">WhatsApp</Label><Input id="jornada-phone" type="tel" autoComplete="tel" maxLength={40} required placeholder="+54 9 11…" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
        </>}
        <div role="radiogroup" aria-label="Asistencia" className="grid grid-cols-2 gap-3">
          <Button type="button" role="radio" aria-checked={form.response === "voy"} variant={form.response === "voy" ? "default" : "outline"} disabled={busy || ((full || closed) && status.own?.response !== "voy")} onClick={() => setForm({ ...form, response: "voy" })}>Sí voy</Button>
          <Button type="button" role="radio" aria-checked={form.response === "no_voy"} variant={form.response === "no_voy" ? "default" : "outline"} disabled={busy} onClick={() => setForm({ ...form, response: "no_voy" })}>No voy</Button>
        </div>
        <Button type="submit" className="w-full h-14 text-lg" disabled={busy || (form.response === "voy" && (full || closed) && status.own?.response !== "voy")}>{busy ? "Guardando…" : form.response === "voy" ? "Confirmar mi lugar" : "Confirmar que no voy"}</Button>
        {editing && <Button type="button" variant="ghost" className="w-full" onClick={() => { if (status.own) setForm(status.own); setEditing(false); }}>Volver sin cambiar</Button>}
        <p className="text-xs text-muted-foreground text-center">Una persona por lugar. Tus datos solo los ve la organización. No se enviarán mensajes automáticos.</p>
      </form>}
      {error && <p ref={errorNotice} tabIndex={-1} role="alert" className="text-destructive text-center outline-none">{error}</p>}
      {!saved && <details className="border-y border-border py-4">
        <summary className="cursor-pointer font-semibold text-primary">Programa de la jornada</summary>
        <div className="pt-5 space-y-4">
          <div className="flex gap-3"><Bike className="w-5 h-5 text-primary shrink-0 mt-1" /><div><p className="font-semibold">9:00 · Pedaleo a Scott San Isidro</p><p className="text-sm text-muted-foreground">Desde Parque Sarmiento, practicando circulación.</p></div></div>
          <div className="flex gap-3"><Wrench className="w-5 h-5 text-primary shrink-0 mt-1" /><div><p className="font-semibold">10:15–11:30 · Taller</p><p className="text-sm text-muted-foreground">Limpieza de transmisión, aplicación y dilución de productos y lubricación.</p></div></div>
          <p><strong>11:30–12:00 · SALE</strong><br /><span className="text-sm text-muted-foreground">Accesorios, productos e indumentaria seleccionada.</span></p>
          <p><strong>12:00–13:00 · Regreso pedaleando</strong><br /><span className="text-sm text-muted-foreground">A Parque Sarmiento.</span></p>
          <p className="text-sm text-muted-foreground">Scott ofrece agua, turrones, barritas, bananas y maní. Abierto también a personas sin cuenta.</p>
        </div>
      </details>}
    </div>
  </main>;
}