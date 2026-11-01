import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AdditionalDayQuestionCard } from "@/components/reservation/TripAdditionalDayQuestion";
import type { AdditionalDayAnswer } from "@/lib/tripAdditionalDay";

type QaRow = { case_key: "sin_noche_previa" | "con_noche_previa"; answer: AdditionalDayAnswer | null };
export default function AdditionalDayQa() {
  const [params] = useSearchParams();
  const eventId = params.get("evento") ?? "";
  const [rows, setRows] = useState<QaRow[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => (supabase as any).from("trip_additional_day_qa").select("case_key,answer").eq("event_id", eventId).order("case_key", { ascending: false }).then(({ data }: any) => setRows(data ?? []));
  useEffect(() => { load(); }, [eventId]);
  const save = async (caseKey: string, answer: AdditionalDayAnswer) => {
    if (saving) return;
    setSaving(caseKey);
    setError(null);
    const { error: e } = await (supabase as any).rpc("save_trip_additional_day_qa", { p_event_id: eventId, p_case_key: caseKey, p_answer: answer });
    if (e) setError("No pudimos guardar la respuesta de prueba.");
    setSaving(null); load();
  };
  return <main className="min-h-screen bg-background p-4 pt-14"><div className="max-w-xl mx-auto space-y-4">
    <p className="text-xs uppercase tracking-widest text-primary">Prueba privada · respuestas simuladas</p>
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    {rows.map((r) => <div key={r.case_key} className="space-y-1"><h2 className="text-sm font-semibold">{r.case_key === "con_noche_previa" ? "Caso con noche extra previa" : "Caso sin noche extra previa"}</h2>
      <AdditionalDayQuestionCard context={{ answer: r.answer, existing_night: r.case_key === "con_noche_previa", status: r.answer ?? "sin_respuesta", start: "2026-11-05", end: "2026-11-09", original_nights: 3, original_days: 4, selected_nights: 4 }} saving={saving === r.case_key} onAnswer={(a) => save(r.case_key, a)} /></div>)}
  </div></main>;
}