import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Camera, CheckCircle2, ImagePlus, Loader2, X } from "lucide-react";
import { z } from "zod";
import {
  CONSENT_TEXT, EVENT_PHOTO_CONSENT_VERSION, EVENT_PHOTO_MAX_FILES, EVENT_PHOTO_OWNERSHIP_VERSION,
  OWNERSHIP_TEXT, resolvePhotoType, validatePhotoSelection,
} from "@/lib/eventPhotos";

type EventInfo = { event: { id: string; title: string; date: string | null; location: string | null }; limits: { max_files: number } };
type Picked = { id: string; file: File; type: string; preview: string | null };

const formSchema = z.object({
  name: z.string().trim().min(2, "Ingresá tu nombre completo").max(120),
  email: z.string().trim().email("Ingresá un email válido").max(254),
});

const formatDate = (d: string | null) => {
  if (!d) return "";
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" });
};

async function callFn<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("event-photo-upload", { body });
  if (error) {
    let msg = "No pudimos completar la operación. Intentá de nuevo.";
    try { const j = await (error as { context?: Response }).context?.json(); if (j?.error) msg = j.error; } catch { /* keep default */ }
    throw new Error(msg);
  }
  return data as T;
}

function putWithProgress(url: string, file: File, type: string, onProgress: (n: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", type);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded); };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(String(xhr.status))));
    xhr.onerror = () => reject(new Error("network"));
    xhr.send(file);
  });
}

export default function EventPhotosUpload() {
  const { eventId = "" } = useParams();
  const info = useQuery({
    queryKey: ["event-photos-info", eventId],
    queryFn: () => callFn<EventInfo>({ action: "info", event_id: eventId }),
    retry: false,
    enabled: /^[0-9a-f-]{36}$/i.test(eventId),
  });
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [ownership, setOwnership] = useState(false);
  const [consent, setConsent] = useState(false);
  const [files, setFiles] = useState<Picked[]>([]);
  const [notices, setNotices] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ stored: number; failed: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const max = info.data?.limits.max_files ?? EVENT_PHOTO_MAX_FILES;

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      setEmail((e) => e || data.user!.email || "");
      const { data: a } = await supabase.from("alumnos").select("nombre,apellido").eq("user_id", data.user.id).maybeSingle();
      if (a) setName((n) => n || [a.nombre, a.apellido].filter(Boolean).join(" "));
    }).catch(() => { /* sin sesión: formulario vacío */ });
  }, []);

  useEffect(() => () => files.forEach((f) => f.preview && URL.revokeObjectURL(f.preview)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const totalBytes = useMemo(() => files.reduce((a, f) => a + f.file.size, 0), [files]);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const arr = Array.from(list);
    const { accepted, errors } = validatePhotoSelection(files.length, arr, max);
    setNotices(errors);
    const next = accepted.map((i) => {
      const f = arr[i];
      const type = resolvePhotoType(f)!;
      const previewable = type !== "image/heic" && type !== "image/heif";
      return { id: crypto.randomUUID(), file: f, type, preview: previewable ? URL.createObjectURL(f) : null };
    });
    setFiles((old) => [...old, ...next]);
    if (inputRef.current) inputRef.current.value = "";
  };

  const removeFile = (id: string) => setFiles((old) => {
    const f = old.find((x) => x.id === id);
    if (f?.preview) URL.revokeObjectURL(f.preview);
    return old.filter((x) => x.id !== id);
  });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError("");
    const parsed = formSchema.safeParse({ name, email });
    const fe: Record<string, string> = {};
    if (!parsed.success) parsed.error.issues.forEach((i) => { fe[String(i.path[0])] = i.message; });
    if (!ownership) fe.ownership = "Necesitamos esta declaración para recibir las fotos.";
    if (!files.length) fe.files = "Elegí al menos una foto.";
    setFieldErrors(fe);
    if (Object.keys(fe).length) return;

    setBusy(true); setProgress(0);
    try {
      const start = await callFn<{ submission_id: string; token: string; uploads: { index: number; signed_url: string }[] }>({
        action: "start", event_id: eventId, name: name.trim(), email: email.trim().toLowerCase(),
        ownership_declared: true, ownership_text_version: EVENT_PHOTO_OWNERSHIP_VERSION,
        publication_consent: consent, publication_consent_text_version: consent ? EVENT_PHOTO_CONSENT_VERSION : undefined,
        files: files.map((f) => ({ name: f.file.name, type: f.type, size: f.file.size })),
      });
      const loaded = new Array(files.length).fill(0);
      await Promise.allSettled(start.uploads.map((u) => {
        const f = files[u.index];
        return putWithProgress(u.signed_url, f.file, f.type, (n) => {
          loaded[u.index] = n;
          setProgress(Math.round((loaded.reduce((a, b) => a + b, 0) / totalBytes) * 100));
        });
      }));
      const fin = await callFn<{ status: string; stored: number; failed: number }>({ action: "finalize", submission_id: start.submission_id, token: start.token });
      if (fin.status !== "complete" || fin.stored < 1) throw new Error("No pudimos guardar tus fotos. Revisá tu conexión e intentá de nuevo.");
      files.forEach((f) => f.preview && URL.revokeObjectURL(f.preview));
      setFiles([]);
      setDone({ stored: fin.stored, failed: fin.failed ?? 0 });
      window.scrollTo({ top: 0 });
    } catch (err) {
      setError((err as Error).message || "No pudimos enviar las fotos.");
    } finally { setBusy(false); }
  };

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen bg-background text-foreground pb-[env(safe-area-inset-bottom)]">
      <div className="max-w-xl mx-auto px-4 py-6 space-y-5">
        <Button asChild variant="ghost" size="sm"><Link to="/eventos"><ArrowLeft className="h-4 w-4 mr-2" />Reybaud</Link></Button>
        {children}
      </div>
    </div>
  );

  if (info.isLoading) return shell(<div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>);
  if (info.isError || !info.data) return shell(
    <div className="rounded-2xl border border-border bg-card p-6 text-center space-y-2">
      <Camera className="h-8 w-8 mx-auto text-muted-foreground" />
      <h1 className="font-display text-2xl uppercase">Recepción de fotos no disponible</h1>
      <p className="text-muted-foreground text-sm">Este enlace no está habilitado en este momento.</p>
    </div>,
  );

  const ev = info.data.event;
  const header = (
    <header className="rounded-2xl border border-border bg-card p-5 space-y-3">
      <div className="flex items-center gap-3">
        <img src="/pwa-192x192.png" alt="Reybaud" className="w-12 h-12 rounded-lg" />
        <span className="text-primary text-sm font-semibold uppercase tracking-wide">Fotos del evento</span>
      </div>
      <h1 className="font-display text-3xl uppercase leading-tight">{ev.title}</h1>
      <p className="text-sm text-muted-foreground">{[formatDate(ev.date), ev.location].filter(Boolean).join(" · ")}</p>
    </header>
  );

  if (done) return shell(<>
    {header}
    <div className="rounded-2xl border border-primary/40 bg-card p-6 text-center space-y-3" role="status">
      <CheckCircle2 className="h-12 w-12 mx-auto text-primary" />
      <h2 className="font-display text-2xl uppercase">¡Gracias por compartir!</h2>
      <p className="text-sm">Recibimos {done.stored} {done.stored === 1 ? "foto" : "fotos"}. El equipo de Reybaud las va a revisar.</p>
      {done.failed > 0 && <p className="text-sm text-destructive">{done.failed} no se pudieron guardar. Si querés, volvé a intentarlo con esas.</p>}
      <p className="text-xs text-muted-foreground">{consent ? "Nos diste permiso para difundirlas; igual las revisamos antes de publicar cualquiera." : "No nos diste permiso para difundirlas: solo las vamos a usar internamente."}</p>
      <Button variant="outline" onClick={() => { setDone(null); setConsent(false); setOwnership(false); }}>Enviar más fotos</Button>
    </div>
  </>);

  return shell(<>
    {header}
    <p className="text-sm leading-relaxed">¿Sacaste fotos durante el evento? Compartilas con nosotros. Podés enviar hasta {max} fotos por vez y repetir si tenés más. Nadie más va a ver tus fotos en esta página.</p>
    <form onSubmit={submit} className="space-y-5" noValidate>
      <div className="space-y-2">
        <Label htmlFor="name">Nombre completo</Label>
        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={120} disabled={busy} />
        {fieldErrors.name && <p className="text-xs text-destructive">{fieldErrors.name}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" maxLength={254} disabled={busy} />
        {fieldErrors.email && <p className="text-xs text-destructive">{fieldErrors.email}</p>}
      </div>

      <div className="space-y-3">
        <Label>Fotos ({files.length}/{max})</Label>
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
        <Button type="button" variant="outline" className="w-full h-14" onClick={() => inputRef.current?.click()} disabled={busy || files.length >= max}>
          <ImagePlus className="h-5 w-5 mr-2" />Elegir fotos
        </Button>
        <p className="text-xs text-muted-foreground">JPG, PNG, WebP o HEIC (iPhone). Hasta 15 MB cada una. No se reciben videos.</p>
        {notices.map((n) => <p key={n} className="text-xs text-destructive">{n}</p>)}
        {fieldErrors.files && <p className="text-xs text-destructive">{fieldErrors.files}</p>}
        {files.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {files.map((f) => (
              <div key={f.id} className="relative aspect-square rounded-lg overflow-hidden border border-border bg-muted">
                {f.preview ? <img src={f.preview} alt={f.file.name} className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex flex-col items-center justify-center p-1 text-center"><Camera className="h-5 w-5 text-muted-foreground" /><span className="text-[10px] break-all line-clamp-2">{f.file.name}</span></div>}
                {!busy && <button type="button" onClick={() => removeFile(f.id)} aria-label={`Quitar ${f.file.name}`} className="absolute top-1 right-1 rounded-full bg-background/80 p-1"><X className="h-3.5 w-3.5" /></button>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-3 rounded-xl border border-border p-4">
        <label className="flex gap-3 items-start text-sm">
          <Checkbox checked={ownership} onCheckedChange={(v) => setOwnership(v === true)} disabled={busy} className="mt-0.5" />
          <span>{OWNERSHIP_TEXT} <span className="text-destructive">*</span></span>
        </label>
        {fieldErrors.ownership && <p className="text-xs text-destructive">{fieldErrors.ownership}</p>}
        <label className="flex gap-3 items-start text-sm">
          <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} disabled={busy} className="mt-0.5" />
          <span>{CONSENT_TEXT} <span className="text-muted-foreground">(opcional)</span></span>
        </label>
        <p className="text-xs text-muted-foreground">Si no marcás esta segunda casilla, igual recibimos tus fotos, pero no las publicamos. Nunca difundimos fotos de menores sin el consentimiento de su responsable.</p>
      </div>

      {busy && <div className="space-y-1"><Progress value={progress} /><p className="text-xs text-muted-foreground text-center">Subiendo… {progress}%</p></div>}
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <Button type="submit" className="w-full h-12" disabled={busy}>
        {busy ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Enviando…</> : "Enviar fotos"}
      </Button>
    </form>
  </>);
}
