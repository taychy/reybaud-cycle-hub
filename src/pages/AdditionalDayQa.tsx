import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AdditionalDayQuestionCard } from "@/components/reservation/TripAdditionalDayQuestion";
import { additionalDayReference, type AdditionalDayAnswer, type AdditionalDayCompanions, type AdditionalDayReference } from "@/lib/tripAdditionalDay";
import { Button } from "@/components/ui/button";

type QaRow = { case_key: "sin_noche_previa" | "con_noche_previa"; answer: AdditionalDayAnswer | null; companions_answer: AdditionalDayCompanions | null };
export default function AdditionalDayQa() {
  const [params] = useSearchParams();
  const eventId = params.get("evento") ?? "";
  const [rows, setRows] = useState<QaRow[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [references, setReferences] = useState<{ package: string; reference: AdditionalDayReference }[]>([]);
  const [packageIndex, setPackageIndex] = useState(0);
  const load = () => (supabase as any).from("trip_additional_day_qa").select("case_key,answer,companions_answer").eq("event_id", eventId).order("case_key", { ascending: false }).then(({ data }: any) => setRows(data ?? []));
  useEffect(() => { load(); }, [eventId]);
  useEffect(() => {
    let active = true;
    setReferences([]); setPackageIndex(0);
    // Existing admin read path only. QA coaches without permission see value pending.
    (supabase as any).rpc("admin_trip_additional_day_report", { p_event_id: eventId }).then(({ data }: any) => {
      if (!active || !Array.isArray(data)) return;
      const unique = new Map<string, AdditionalDayReference>();
      for (const row of data) {
        const reference = additionalDayReference(Number(row.estimated_amount), row.currency);
        if (reference && typeof row.package === "string") unique.set(row.package, reference);
      }
      setReferences(Array.from(unique, ([pkg, reference]) => ({ package: pkg, reference })));
    });
    return () => { active = false; };
  }, [eventId]);
  const save = async (caseKey: string, answer: AdditionalDayAnswer) => {
    if (saving) return;
    setSaving(caseKey);
    setError(null);
    const { error: e } = await (supabase as any).rpc("save_trip_additional_day_qa", { p_event_id: eventId, p_case_key: caseKey, p_answer: answer });
    if (e) setError("No pudimos guardar la respuesta de prueba.");
    setSaving(null); load();
  };
  const saveCompanions = async (caseKey: string, answer: AdditionalDayCompanions) => {
    if (saving) return;
    setSaving(caseKey); setError(null);
    const { error: e } = await (supabase as any).rpc("save_trip_additional_day_qa_companions", { p_event_id: eventId, p_case_key: caseKey, p_answer: answer });
    if (e) setError("No pudimos guardar la respuesta de prueba.");
    setSaving(null); load();
  };
  const shared = !/individual/i.test(references[packageIndex]?.package ?? "");
  return <main className="min-h-screen bg-background p-4 pt-14"><div className="max-w-xl mx-auto space-y-4">
    <p className="text-xs uppercase tracking-widest text-primary">Prueba privada · respuestas simuladas</p>
    {references.length > 0 && <div className="flex flex-wrap gap-2">{references.map((r, index) => <Button key={r.package} variant={packageIndex === index ? "default" : "outline"} onClick={() => setPackageIndex(index)} className="h-auto whitespace-normal" aria-pressed={packageIndex === index}>{r.package}</Button>)}</div>}
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    {rows.map((r) => <div key={r.case_key} className="space-y-1"><h2 className="text-sm font-semibold">{r.case_key === "con_noche_previa" ? "Caso con noche extra previa" : "Caso sin noche extra previa"}</h2>
      <AdditionalDayQuestionCard reference={references[packageIndex]?.reference} onCompanions={(a) => saveCompanions(r.case_key, a)} context={{ answer: r.answer, shared, companions_answer: r.companions_answer, existing_night: r.case_key === "con_noche_previa", status: r.answer ?? "sin_respuesta", start: "2026-11-05", end: "2026-11-09", original_nights: 3, original_days: 4, selected_nights: 4 }} saving={saving === r.case_key} onAnswer={(a) => save(r.case_key, a)} /></div>)}
  </div></main>;
}