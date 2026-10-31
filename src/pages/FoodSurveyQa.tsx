import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import TripFoodSurveyDrawer from "@/components/reservation/TripFoodSurveyDrawer";
import { Button } from "@/components/ui/button";
import { describeFoodSurvey, type FoodSurveyData } from "@/lib/foodSurvey";
import { parseQaParticipantView, QA_PACKAGE_LABEL, type QaCaseKey } from "@/lib/foodSurveyQa";
import { useSearchParams } from "react-router-dom";
import { Utensils, Coffee, CalendarDays, MapPin } from "lucide-react";

type QaRow = { id: string; case_key: string; response: unknown; updated_at: string | null };

function ParticipantView({ row, caseKey, onSaved }: { row: QaRow | null; caseKey: QaCaseKey; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [fresh, setFresh] = useState(false);
  const [autoOpened, setAutoOpened] = useState(false);
  const answered = !!row?.response;
  useEffect(() => {
    if (row && !autoOpened) { setAutoOpened(true); setFresh(false); setOpen(true); }
  }, [row, autoOpened]);
  const pension = caseKey === "con_pension";
  const openWith = (f: boolean) => { setFresh(f); setOpen(true); };
  return <main className="min-h-screen bg-background text-foreground pb-[env(safe-area-inset-bottom)]">
    <header className="border-b border-border px-5 py-4"><p className="font-display text-lg tracking-widest text-primary">REYBAUD</p></header>
    <div className="mx-auto max-w-xl space-y-6 px-5 py-6">
      <section className="space-y-2">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Mi viaje</p>
        <h1 className="font-display text-3xl font-semibold leading-tight">Training Camp San Luis</h1>
        <p className="flex items-center gap-2 text-sm"><CalendarDays className="h-4 w-4 text-primary" />5 al 9 de noviembre de 2026 · reprogramado</p>
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><MapPin className="h-4 w-4" />Potrero de los Funes, San Luis</p>
      </section>
      <section className="rounded-xl border border-border bg-card p-4 space-y-2">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Tu paquete</p>
        <p className="text-lg font-semibold">{QA_PACKAGE_LABEL[caseKey]}</p>
        <p className="flex items-center gap-2 text-sm"><Coffee className="h-4 w-4 text-primary" />Tu estadía incluye desayuno.</p>
        <p className="text-sm text-muted-foreground">{pension ? "Tu paquete incluye pensión completa: almuerzos y cenas." : "Tu paquete no incluye almuerzos y cenas."}</p>
      </section>
      <section className="rounded-xl border border-primary/40 bg-primary/5 p-4 space-y-3">
        <p className="flex items-center gap-2 text-lg font-semibold"><Utensils className="h-5 w-5 text-primary" />Tu alimentación</p>
        <p className="text-sm text-muted-foreground">Contanos tu tipo de alimentación, alergias e intolerancias para que la cocina prepare todo a tu medida.</p>
        {!row ? <p role="alert" className="text-sm text-destructive">Esta prueba no está habilitada para tu cuenta.</p> : <>
          <Button size="lg" className="w-full min-h-12 text-base" onClick={() => openWith(false)}>{answered ? "Editar mis respuestas" : "Completar encuesta"}</Button>
          {answered && <Button variant="outline" className="w-full" onClick={() => openWith(true)}>Comenzar de cero</Button>}
        </>}
      </section>
      <p className="text-center text-[11px] text-muted-foreground">TEST · sin cargos ni efectos sobre reservas</p>
    </div>
    {row && open && <TripFoodSurveyDrawer key={`${row.id}-${fresh}`} open onOpenChange={setOpen} reservationId="" alumnoId={null} qaId={row.id} qaParticipant qaFresh={fresh} onSaved={onSaved} />}
  </main>;
}

export default function FoodSurveyQa() {
  const [params] = useSearchParams();
  const eventId = params.get("evento");
  const participantCase = parseQaParticipantView(params);
  const [rows, setRows] = useState<QaRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = async () => {
    if (!eventId) { setError("Falta el evento de prueba."); setLoading(false); return; }
    // RLS limits rows to the signed-in owner's own QA cases.
    const { data: { user } } = await supabase.auth.getUser();
    let q = supabase.from("trip_food_survey_qa").select("id,case_key,response,updated_at").eq("event_id", eventId).order("case_key");
    if (user) q = q.eq("owner_id", user.id);
    const { data, error: e } = await q;
    setRows(data ?? []);
    setError(e ? "No pudimos recuperar tus pruebas." : "");
    setLoading(false);
  };
  useEffect(() => { void load(); }, [eventId]);
  if (participantCase) {
    if (loading) return <main className="min-h-screen bg-background text-foreground p-8">Cargando…</main>;
    if (error) return <main className="min-h-screen bg-background p-8"><p role="alert" className="text-destructive">{error}</p></main>;
    return <ParticipantView row={rows.find(r => r.case_key === participantCase) ?? null} caseKey={participantCase} onSaved={() => { void load(); }} />;
  }
  return <main className="min-h-screen bg-background text-foreground px-4 py-8">
    <div className="mx-auto max-w-xl space-y-6">
      <header className="space-y-2"><p className="text-primary font-semibold">PRUEBA PRIVADA · NO ES UNA RESERVA</p><h1 className="text-2xl font-semibold">Encuesta gastronómica · San Luis</h1><p className="text-muted-foreground">Reprogramado: 5–9 noviembre 2026. Alternativas: 5–8 y 6–9 noviembre.</p><p className="text-sm text-muted-foreground">Programa de almuerzos y cenas: a configurar. Sin compras ni cobros.</p></header>
      {loading ? <p>Cargando…</p> : error ? <p role="alert" className="text-destructive">{error}</p> : rows.length === 0 ? <p>No hay pruebas habilitadas para esta cuenta.</p> : rows.map(r => <section key={r.id} className="border-t border-border py-4 space-y-3">
        <h2 className="text-lg font-semibold">{r.case_key === "con_pension" ? "Caso 1 · Con pensión completa" : "Caso 2 · Sin pensión completa"}</h2>
        <p className="text-sm text-muted-foreground">{r.response ? describeFoodSurvey(r.response as FoodSurveyData) : "Sin respuesta guardada"}</p>
        {r.updated_at && <p className="text-sm text-primary">Respuesta recuperada y guardada</p>}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setSelected(r.id)}>{r.response ? "Revisar respuestas" : "Abrir encuesta"}</Button>
          <Button variant="ghost" asChild><a href={`?evento=${eventId}&vista=participante&caso=${r.case_key}`}>Ver como participante</a></Button>
        </div>
      </section>)}
      {selected && <TripFoodSurveyDrawer open onOpenChange={open => { if (!open) setSelected(null); }} reservationId="" alumnoId={null} qaId={selected} onSaved={() => { void load(); }} />}
    </div>
  </main>;
}
