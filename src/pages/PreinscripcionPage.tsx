import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, CheckCircle2, Users } from "lucide-react";
import logo from "@/assets/logo.png";
import WaitlistAnswerInput from "@/components/waitlist/WaitlistAnswerInput";
import { WaitlistQuestion } from "@/lib/waitlistTypes";

interface PublicTemplate {
  id: string;
  slug: string;
  titulo_publico: string;
  descripcion_publica: string | null;
  mensaje_confirmacion: string | null;
  cupos_informados: number | null;
  preguntas: WaitlistQuestion[];
}

type Status = "loading" | "ready" | "not_found" | "error" | "done";

// Definido fuera del componente: si se define dentro, cada keystroke crea un
// tipo de componente nuevo y React remonta todo el árbol, perdiendo foco/scroll.
const Shell = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-screen bg-background flex flex-col">
    <header className="flex items-center gap-3 px-5 pt-6 pb-2">
      <img src={logo} alt="Ciclismo Reybaud" className="w-9 h-9" />
      <span className="text-sm font-heading uppercase tracking-wider text-muted-foreground">
        Ciclismo Reybaud
      </span>
    </header>
    <main className="flex-1 w-full max-w-lg mx-auto px-4 py-6">{children}</main>
  </div>
);

export default function PreinscripcionPage() {
  const { slug } = useParams<{ slug: string }>();
  const [status, setStatus] = useState<Status>("loading");
  const [meta, setMeta] = useState<PublicTemplate | null>(null);
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [consent, setConsent] = useState(false);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmMsg, setConfirmMsg] = useState<string>("");

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    supabase
      .rpc("get_waitlist_template_public" as any, { p_slug: slug })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setStatus("error");
          return;
        }
        if (!data) {
          setStatus("not_found");
          return;
        }
        const d = data as any;
        setMeta({
          ...d,
          preguntas: Array.isArray(d.preguntas)
            ? [...d.preguntas].sort((a: any, b: any) => (a.orden ?? 0) - (b.orden ?? 0))
            : [],
        });
        setStatus("ready");
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    if (meta) document.title = `${meta.titulo_publico} · Ciclismo Reybaud`;
  }, [meta]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (nombre.trim().length < 3) e.nombre = "Ingresá tu nombre y apellido.";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) e.email = "Ingresá un email válido.";
    if (telefono.replace(/\D/g, "").length < 8) e.telefono = "Ingresá un WhatsApp válido.";
    if (!consent) e.consent = "Necesitamos tu autorización para contactarte.";
    (meta?.preguntas || []).forEach((q) => {
      if (!q.requerida) return;
      const v = answers[q.id];
      const empty =
        v == null ||
        (Array.isArray(v) ? v.length === 0 : String(v).trim() === "");
      if (empty) e[q.id] = "Esta pregunta es obligatoria.";
    });
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async () => {
    setFormError(null);
    if (!validate()) {
      const first = document.querySelector<HTMLElement>("[data-field-error='true']");
      first?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc("submit_waitlist_template_entry" as any, {
        p_slug: slug,
        p_nombre: nombre.trim(),
        p_email: email.trim(),
        p_telefono: telefono.trim(),
        p_respuestas: answers,
        p_user_agent: navigator.userAgent.slice(0, 300),
      });
      if (error) throw error;
      const res = data as any;
      if (!res?.ok) {
        setFormError(
          res?.error === "no_disponible"
            ? "Este formulario ya no está disponible."
            : "Revisá los datos ingresados e intentá de nuevo."
        );
        return;
      }
      setConfirmMsg(res.mensaje || meta?.mensaje_confirmacion || "¡Gracias por completar la preinscripción!");
      setStatus("done");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err: any) {
      setFormError("No pudimos enviar tu preinscripción. Intentá nuevamente en unos minutos.");
    } finally {
      setSubmitting(false);
    }
  };


  if (status === "loading") {
    return (
      <Shell>
        <div className="py-24 text-center">
          <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
        </div>
      </Shell>
    );
  }

  if (status === "not_found") {
    return (
      <Shell>
        <Card>
          <CardContent className="py-10 text-center space-y-2">
            <h1 className="text-lg font-heading font-bold">Formulario no disponible</h1>
            <p className="text-sm text-muted-foreground">
              Este formulario de preinscripción no existe o todavía no está publicado.
            </p>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  if (status === "error") {
    return (
      <Shell>
        <Card>
          <CardContent className="py-10 text-center space-y-3">
            <p className="text-sm text-muted-foreground">
              No pudimos cargar el formulario en este momento.
            </p>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Reintentar
            </Button>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  if (status === "done") {
    return (
      <Shell>
        <Card>
          <CardContent className="py-10 text-center space-y-3">
            <CheckCircle2 className="w-10 h-10 text-primary mx-auto" />
            <h1 className="text-lg font-heading font-bold">Preinscripción enviada</h1>
            <p className="text-sm text-muted-foreground whitespace-pre-line">{confirmMsg}</p>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-heading font-bold leading-tight">{meta?.titulo_publico}</h1>
          {meta?.cupos_informados != null && (
            <div className="inline-flex items-center gap-1.5 px-2 py-1 mt-2 rounded-full bg-primary/15 text-primary text-[11px] font-medium">
              <Users className="w-3 h-3" /> Solo {meta.cupos_informados} cupos
            </div>
          )}
          {meta?.descripcion_publica && (
            <p className="text-sm text-muted-foreground mt-3 whitespace-pre-line">
              {meta.descripcion_publica}
            </p>
          )}
        </div>

        <Card>
          <CardContent className="py-5 space-y-5">
            <div className="space-y-1.5" data-field-error={errors.nombre ? "true" : undefined}>
              <Label htmlFor="pi-nombre" className="text-sm">
                Nombre y apellido <span className="text-primary">*</span>
              </Label>
              <Input
                id="pi-nombre"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                maxLength={120}
                autoComplete="name"
                aria-invalid={!!errors.nombre}
                aria-describedby={errors.nombre ? "pi-nombre-err" : undefined}
              />
              {errors.nombre && (
                <p id="pi-nombre-err" role="alert" className="text-xs text-destructive">
                  {errors.nombre}
                </p>
              )}
            </div>

            <div className="space-y-1.5" data-field-error={errors.email ? "true" : undefined}>
              <Label htmlFor="pi-email" className="text-sm">
                Email <span className="text-primary">*</span>
              </Label>
              <Input
                id="pi-email"
                type="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={160}
                autoComplete="email"
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? "pi-email-err" : undefined}
              />
              {errors.email && (
                <p id="pi-email-err" role="alert" className="text-xs text-destructive">
                  {errors.email}
                </p>
              )}
            </div>

            <div className="space-y-1.5" data-field-error={errors.telefono ? "true" : undefined}>
              <Label htmlFor="pi-tel" className="text-sm">
                WhatsApp <span className="text-primary">*</span>
              </Label>
              <Input
                id="pi-tel"
                type="tel"
                inputMode="tel"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                maxLength={40}
                autoComplete="tel"
                placeholder="11 5555 5555"
                aria-invalid={!!errors.telefono}
                aria-describedby={errors.telefono ? "pi-tel-err" : undefined}
              />
              {errors.telefono && (
                <p id="pi-tel-err" role="alert" className="text-xs text-destructive">
                  {errors.telefono}
                </p>
              )}
            </div>

            {(meta?.preguntas || []).map((q) => (
              <div key={q.id} data-field-error={errors[q.id] ? "true" : undefined}>
                <WaitlistAnswerInput
                  question={q}
                  value={answers[q.id]}
                  onChange={(v) => {
                    setAnswers((prev) => ({ ...prev, [q.id]: v }));
                    setErrors((prev) => {
                      const n = { ...prev };
                      delete n[q.id];
                      return n;
                    });
                  }}
                />
                {errors[q.id] && (
                  <p role="alert" className="text-xs text-destructive mt-1">
                    {errors[q.id]}
                  </p>
                )}
              </div>
            ))}

            <div className="pt-2 border-t border-border space-y-1.5" data-field-error={errors.consent ? "true" : undefined}>
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={consent}
                  onCheckedChange={(v) => setConsent(!!v)}
                  aria-invalid={!!errors.consent}
                  className="mt-0.5"
                />
                <span>
                  Acepto que Ciclismo Reybaud me contacte por WhatsApp o email en relación con esta
                  preinscripción. <span className="text-primary">*</span>
                </span>
              </label>
              {errors.consent && (
                <p role="alert" className="text-xs text-destructive">
                  {errors.consent}
                </p>
              )}
            </div>

            {formError && (
              <p role="alert" className="text-sm text-destructive">
                {formError}
              </p>
            )}

            <Button className="w-full" onClick={submit} disabled={submitting}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Enviar preinscripción"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </Shell>
  );
}
