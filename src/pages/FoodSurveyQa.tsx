import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import TripFoodSurveyDrawer from "@/components/reservation/TripFoodSurveyDrawer";
import { Button } from "@/components/ui/button";
import { describeFoodSurvey, type FoodSurveyData } from "@/lib/foodSurvey";
import { useSearchParams } from "react-router-dom";

type QaRow = { id: string; case_key: string; response: unknown; updated_at: string | null };
export default function FoodSurveyQa() {
  const [params] = useSearchParams();
  const eventId = params.get("evento");
  const [rows, setRows] = useState<QaRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = async () => {
    if (!eventId) { setError("Falta el evento de prueba."); setLoading(false); return; }
    const { data, error: e } = await supabase.from("trip_food_survey_qa").select("id,case_key,response,updated_at").eq("event_id", eventId).order("case_key");
    setRows(data ?? []);
    setError(e ? "No pudimos recuperar tus pruebas." : "");
    setLoading(false);
  };
  useEffect(() => { void load(); }, [eventId]);
  return <main className="min-h-screen bg-background text-foreground px-4 py-8">
    <div className="mx-auto max-w-xl space-y-6">
      <header className="space-y-2"><p className="text-primary font-semibold">PRUEBA PRIVADA · NO ES UNA RESERVA</p><h1 className="text-2xl font-semibold">Encuesta gastronómica · San Luis</h1><p className="text-muted-foreground">Reprogramado: 5–9 noviembre 2026. Alternativas: 5–8 y 6–9 noviembre.</p><p className="text-sm text-muted-foreground">Programa de almuerzos y cenas: a configurar. Sin compras ni cobros.</p></header>
      {loading ? <p>Cargando…</p> : error ? <p role="alert" className="text-destructive">{error}</p> : rows.length === 0 ? <p>No hay pruebas habilitadas para esta cuenta.</p> : rows.map(r => <section key={r.id} className="border-t border-border py-4 space-y-3">
        <h2 className="text-lg font-semibold">{r.case_key === "con_pension" ? "Caso 1 · Con pensión completa" : "Caso 2 · Sin pensión completa"}</h2>
        <p className="text-sm text-muted-foreground">{r.response ? describeFoodSurvey(r.response as FoodSurveyData) : "Sin respuesta guardada"}</p>
        {r.updated_at && <p className="text-sm text-primary">Respuesta recuperada y guardada</p>}
        <Button variant="outline" onClick={() => setSelected(r.id)}>{r.response ? "Revisar respuestas" : "Abrir encuesta"}</Button>
      </section>)}
      {selected && <TripFoodSurveyDrawer open onOpenChange={open => { if (!open) setSelected(null); }} reservationId="" alumnoId={null} qaId={selected} onSaved={() => { void load(); }} />}
    </div>
  </main>;
}