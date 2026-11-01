import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { CalendarPlus, Loader2 } from "lucide-react";
import { formatPrice } from "@/lib/currency";
import { ADDITIONAL_DAY_COMPANION_OPTIONS, ADDITIONAL_DAY_OPTIONS, ADDITIONAL_DAY_SHARED_NOTE, additionalDayReference, additionalDaySelectedStay, askAdditionalDayCompanions, type AdditionalDayAnswer, type AdditionalDayCompanions, type AdditionalDayContext, type AdditionalDayReference } from "@/lib/tripAdditionalDay";

type CardContext = Pick<AdditionalDayContext, "answer" | "existing_night" | "status" | "start" | "end" | "original_nights" | "original_days" | "selected_nights"> & { shared?: boolean | null; companions_answer?: AdditionalDayCompanions | null };

export const AdditionalDayQuestionCard = ({ context, saving, onAnswer, onCompanions, reference }: { context: CardContext; saving: boolean; onAnswer: (a: AdditionalDayAnswer) => void; onCompanions?: (a: AdditionalDayCompanions) => void; reference?: AdditionalDayReference | null }) => {
  const stay = additionalDaySelectedStay(context);
  if (!stay) return null;
  const askCompanions = askAdditionalDayCompanions(context) && !!onCompanions;
  return (
  <section className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3" aria-labelledby="additional-day-title">
    <div className="flex gap-3"><CalendarPlus className="w-5 h-5 text-primary shrink-0 mt-0.5" /><div>
      <h3 id="additional-day-title" className="font-heading font-semibold text-sm uppercase tracking-wide">Jornada extra de Training Camp</h3>
      <p className="text-sm mt-2 leading-relaxed">Tu paquete contempla la posibilidad de sumar una jornada extra dentro de las fechas que elegiste.{reference ? <> Su valor es <strong>{formatPrice(reference.amount, reference.currency)}</strong>.</> : " Valor pendiente de confirmación."}</p>
      {context.shared && <p className="text-xs mt-2 text-muted-foreground leading-relaxed">{ADDITIONAL_DAY_SHARED_NOTE}</p>}
    </div></div>
    <p className="text-sm font-semibold">¿Querés contratarla?</p>
    <div className="grid gap-2">{ADDITIONAL_DAY_OPTIONS.map((o) => (
      <Button key={o.value} type="button" variant={context.answer === o.value ? "default" : "outline"} className="h-auto min-h-11 whitespace-normal justify-start text-left" disabled={saving} aria-pressed={context.answer === o.value} onClick={() => onAnswer(o.value)}>{o.label}</Button>
    ))}</div>
    {askCompanions && <div className="space-y-2" role="group" aria-labelledby="additional-day-companions">
      <p id="additional-day-companions" className="text-sm font-semibold">¿Tus compañeros también se quedan?</p>
      <div className="grid grid-cols-3 gap-2">{ADDITIONAL_DAY_COMPANION_OPTIONS.map((o) => (
        <Button key={o.value} type="button" size="sm" variant={context.companions_answer === o.value ? "default" : "outline"} className="h-auto min-h-10 whitespace-normal" disabled={saving} aria-pressed={context.companions_answer === o.value} onClick={() => onCompanions!(o.value)}>{o.label}</Button>
      ))}</div>
      {context.companions_answer && context.companions_answer !== "si" && <p className="text-xs text-muted-foreground">Administración revisará tu habitación con vos. No cambiamos tu habitación ni tu precio automáticamente.</p>}
    </div>}
    {saving && <p className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />Guardando…</p>}
    {context.answer && <p role="status" className="text-xs text-primary">{context.answer === "interesado" ? "Solicitud pendiente de confirmación por administración." : context.answer === "consulta" ? "Consulta previa registrada." : "Respuesta registrada."}</p>}
    <p className="text-xs text-muted-foreground">Es una solicitud: no compra, cobra ni cambia tu reserva. No es una noche extra de alojamiento.</p>
  </section>
);
};

export default function TripAdditionalDayQuestion({ reservationId, token }: { reservationId: string; token?: string }) {
  const [context, setContext] = useState<(AdditionalDayContext & { shared?: boolean; amount?: number; currency?: string; companions_answer?: AdditionalDayCompanions | null }) | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setContext(null); setError(null);
    (supabase as any).rpc("get_trip_additional_day", { p_reservation_id: reservationId, p_token: token ?? null })
      .then(({ data }: any) => { if (active) setContext(data ?? null); });
    return () => { active = false; };
  }, [reservationId, token]);
  if (!context) return null;
  const run = async (fn: string, answer: string) => {
    if (saving) return;
    setSaving(true); setError(null);
    const { error: e } = await (supabase as any).rpc(fn, { p_reservation_id: reservationId, p_answer: answer, p_token: token ?? null });
    if (e) { setSaving(false); return setError("No pudimos guardar tu respuesta. Intentá nuevamente."); }
    const { data } = await (supabase as any).rpc("get_trip_additional_day", { p_reservation_id: reservationId, p_token: token ?? null });
    setSaving(false); setContext(data ?? null);
  };
  return <div className="space-y-2"><AdditionalDayQuestionCard context={context} reference={additionalDayReference(Number(context.amount), context.currency)} saving={saving} onAnswer={(a) => run("save_trip_additional_day", a)} onCompanions={(a) => run("save_trip_additional_day_companions", a)} />{error && <p role="alert" className="text-xs text-destructive">{error}</p>}</div>;
}
