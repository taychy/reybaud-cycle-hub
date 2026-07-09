import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, Loader2 } from "lucide-react";

interface Question {
  id: string;
  tipo: "nps" | "rating" | "texto";
  titulo: string;
  descripcion?: string;
}

interface Survey {
  id: string;
  titulo: string;
  descripcion: string | null;
  preguntas: Question[];
  anonima: boolean;
  activa: boolean;
  event_id: string;
  event_title?: string;
}

interface TokenRow {
  survey_id: string;
  event_id: string;
  alumno_id: string | null;
  external_participant_id: string | null;
  recipient_email: string;
  recipient_name: string | null;
  used_at: string | null;
}

const EventSurvey = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [tokenRow, setTokenRow] = useState<TokenRow | null>(null);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [nps, setNps] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!token) { setError("Link inválido."); setLoading(false); return; }
      const { data: tk } = await supabase
        .from("event_survey_tokens" as any)
        .select("*")
        .eq("token", token)
        .maybeSingle();
      if (!tk) { setError("Este link no es válido o expiró."); setLoading(false); return; }
      setTokenRow(tk as any);
      if ((tk as any).used_at) setSubmitted(true);

      const { data: sv } = await supabase
        .from("event_surveys" as any)
        .select("*, events(title)")
        .eq("id", (tk as any).survey_id)
        .maybeSingle();
      if (!sv || !(sv as any).activa) { setError("Esta encuesta ya no está disponible."); setLoading(false); return; }
      setSurvey({ ...(sv as any), preguntas: (sv as any).preguntas || [], event_title: (sv as any).events?.title });
      setLoading(false);
    })();
  }, [token]);

  const npsPreguntaId = survey?.preguntas.find((q) => q.tipo === "nps")?.id;

  const submit = async () => {
    if (!survey || !tokenRow) return;
    setSubmitting(true);
    const npsValue = npsPreguntaId ? (answers[npsPreguntaId] ?? null) : nps;

    const { error: insErr } = await supabase.from("event_survey_responses" as any).insert({
      survey_id: survey.id,
      event_id: survey.event_id,
      alumno_id: tokenRow.alumno_id,
      external_participant_id: tokenRow.external_participant_id,
      respondent_name: survey.anonima ? null : tokenRow.recipient_name,
      respondent_email: survey.anonima ? null : tokenRow.recipient_email,
      respuestas: answers,
      nps: typeof npsValue === "number" ? npsValue : null,
    } as any);
    if (insErr) {
      setSubmitting(false);
      toast({ title: "Error al enviar", description: insErr.message, variant: "destructive" });
      return;
    }
    await supabase.from("event_survey_tokens" as any).update({ used_at: new Date().toISOString() } as any).eq("token", token);
    setSubmitted(true);
    setSubmitting(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-xl font-heading uppercase">No se pudo abrir la encuesta</h1>
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" onClick={() => navigate("/")}>Volver</Button>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md text-center space-y-4">
          <CheckCircle2 className="w-16 h-16 text-primary mx-auto" />
          <h1 className="text-2xl font-heading uppercase">¡Gracias!</h1>
          <p className="text-sm text-muted-foreground">
            Tu opinión ya está en nuestras manos. Nos ayuda a hacer que los próximos camps sean todavía mejores.
          </p>
          <Button variant="outline" onClick={() => navigate("/")}>Cerrar</Button>
        </div>
      </div>
    );
  }

  if (!survey) return null;

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="max-w-2xl mx-auto p-4 sm:p-8 space-y-6">
        <div className="border-l-4 border-primary pl-4">
          <p className="text-xs uppercase tracking-widest text-cyan-500">{survey.event_title}</p>
          <h1 className="text-2xl sm:text-3xl font-heading font-bold mt-1">{survey.titulo}</h1>
        </div>

        {survey.descripcion && (
          <p className="text-sm text-muted-foreground leading-relaxed">{survey.descripcion}</p>
        )}

        {!survey.anonima && tokenRow?.recipient_name && (
          <p className="text-xs text-muted-foreground">Respondiendo como: <span className="text-foreground font-medium">{tokenRow.recipient_name}</span></p>
        )}

        <div className="space-y-6">
          {survey.preguntas.map((q, idx) => (
            <div key={q.id} className="rounded-lg border p-4 space-y-3">
              <div>
                <p className="text-sm font-medium">
                  <span className="text-muted-foreground mr-2">{idx + 1}.</span>{q.titulo}
                </p>
                {q.descripcion && <p className="text-xs text-muted-foreground mt-1">{q.descripcion}</p>}
              </div>

              {q.tipo === "nps" && (
                <div className="grid grid-cols-11 gap-1">
                  {Array.from({ length: 11 }, (_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setAnswers({ ...answers, [q.id]: i })}
                      className={`h-10 rounded text-sm font-medium border transition ${answers[q.id] === i ? "bg-primary text-primary-foreground border-primary" : "bg-muted/40 hover:bg-muted"}`}
                    >
                      {i}
                    </button>
                  ))}
                </div>
              )}

              {q.tipo === "rating" && (
                <div className="grid grid-cols-5 gap-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setAnswers({ ...answers, [q.id]: n })}
                      className={`h-12 rounded font-semibold border transition ${answers[q.id] === n ? "bg-primary text-primary-foreground border-primary" : "bg-muted/40 hover:bg-muted"}`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              )}

              {q.tipo === "texto" && (
                <Textarea
                  rows={3}
                  value={answers[q.id] || ""}
                  onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                  placeholder="Escribí tu respuesta..."
                />
              )}
            </div>
          ))}
        </div>

        <Button size="lg" className="w-full" variant="gold" onClick={submit} disabled={submitting}>
          {submitting ? "Enviando..." : "Enviar respuestas"}
        </Button>
      </div>
    </div>
  );
};

export default EventSurvey;
