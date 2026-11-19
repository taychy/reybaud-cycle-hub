import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2 } from "lucide-react";
import { preselectedOption, voteError, type DatePollOption } from "@/lib/datePoll";

type Poll = { title: string; question: string; options: DatePollOption[]; is_open: boolean; name: string | null; choice: string | null; suggestion: string | null };
const rpc = supabase as unknown as { rpc: (n: string, a: Record<string, unknown>) => Promise<{ data: any; error: { message: string } | null }> };

export default function DatePollVote() {
  const { token = "" } = useParams();
  const [params] = useSearchParams();
  const [poll, setPoll] = useState<Poll | null>(null);
  const [missing, setMissing] = useState(false);
  const [choice, setChoice] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    rpc.rpc("get_date_poll_by_token", { p_token: token }).then(({ data, error }) => {
      if (error || !data) { setMissing(true); return; }
      const p = data as Poll;
      setPoll(p);
      setChoice(preselectedOption(p.options, params.get("opcion")) ?? p.choice);
      setSuggestion(p.suggestion ?? "");
      setSaved(!!p.choice && !params.get("opcion"));
    });
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    if (!poll) return;
    const opt = poll.options.find((o) => o.value === choice);
    const v = voteError(opt, suggestion);
    if (v) { setError(v); return; }
    setBusy(true); setError(null);
    const { data, error } = await rpc.rpc("submit_date_poll_vote", { p_token: token, p_choice: choice, p_suggestion: opt?.needs_text ? suggestion : null });
    setBusy(false);
    if (error || data?.choice !== choice) { setError("No pudimos guardar tu respuesta. Probá de nuevo."); return; }
    setPoll({ ...poll, choice, suggestion: data.suggestion });
    setSaved(true);
    window.scrollTo({ top: 0 });
  };

  if (missing) return <main className="min-h-screen grid place-items-center p-6 text-center text-muted-foreground">Este enlace no es válido.</main>;
  if (!poll) return <main className="min-h-screen grid place-items-center p-6 text-muted-foreground">Cargando…</main>;
  const savedLabel = poll.options.find((o) => o.value === poll.choice)?.label;

  return (
    <main className="min-h-screen bg-background p-4 flex justify-center">
      <Card className="w-full max-w-md mt-8 h-fit">
        <CardContent className="p-6 space-y-5">
          <p className="text-xs uppercase tracking-widest text-primary">{poll.title}</p>
          {saved ? (
            <div role="status" className="space-y-4 text-center">
              <CheckCircle2 className="mx-auto h-16 w-16 text-success" aria-hidden />
              <h1 className="font-display text-2xl">¡Gracias{poll.name ? `, ${poll.name.split(" ")[0]}` : ""}! Guardamos tu voto</h1>
              <p className="text-lg">Elegiste: <strong>{savedLabel}</strong></p>
              {poll.suggestion && <p className="text-muted-foreground">Tu sugerencia: «{poll.suggestion}»</p>}
              {poll.is_open && <Button variant="ghost" onClick={() => setSaved(false)}>Cambiar mi respuesta</Button>}
              <Button asChild variant="outline" className="w-full"><Link to="/">Volver al inicio</Link></Button>
            </div>
          ) : !poll.is_open ? (
            <p>La encuesta ya cerró. ¡Gracias!</p>
          ) : (
            <>
              <h1 className="font-display text-2xl">{poll.question}</h1>
              <div className="space-y-2" role="radiogroup">
                {poll.options.map((o) => (
                  <Button key={o.value} type="button" role="radio" aria-checked={choice === o.value}
                    variant={choice === o.value ? "default" : "outline"} className="w-full h-12 text-base"
                    onClick={() => { setChoice(o.value); setError(null); }}>{o.label}</Button>
                ))}
              </div>
              {poll.options.find((o) => o.value === choice)?.needs_text && (
                <Textarea maxLength={500} placeholder="¿Qué fecha te quedaría bien?" value={suggestion} onChange={(e) => setSuggestion(e.target.value)} />
              )}
              {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
              <Button className="w-full h-12" disabled={!choice || busy} onClick={submit}>{busy ? "Guardando…" : "Confirmar mi voto"}</Button>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
