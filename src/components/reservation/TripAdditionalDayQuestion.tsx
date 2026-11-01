import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { CalendarPlus, Loader2 } from "lucide-react";
import { formatPrice } from "@/lib/currency";
import { ADDITIONAL_DAY_OPTIONS, additionalDaySelectedStay, type AdditionalDayAnswer, type AdditionalDayContext, type AdditionalDayReference } from "@/lib/tripAdditionalDay";

export const AdditionalDayQuestionCard = ({ context, saving, onAnswer, reference }: { context: Pick<AdditionalDayContext, "answer" | "existing_night" | "status" | "start" | "end" | "original_nights" | "original_days" | "selected_nights">; saving: boolean; onAnswer: (a: AdditionalDayAnswer) => void; reference?: AdditionalDayReference | null }) => {
  const stay = additionalDaySelectedStay(context);
  if (!stay) return null;
  return (
  <section className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3" aria-labelledby="additional-day-title">
    <div className="flex gap-3"><CalendarPlus className="w-5 h-5 text-primary shrink-0 mt-0.5" /><div>
      <h3 id="additional-day-title" className="font-heading font-semibold text-sm uppercase tracking-wide">Jornada extra de Training Camp</h3>
      <p className="text-sm mt-2 leading-relaxed">Tu paquete contempla la posibilidad de sumar una jornada extra dentro de las fechas que elegiste.</p>
      <p className="text-sm mt-2 font-medium">{reference ? `Valor de referencia: ${formatPrice(reference.amount, reference.currency)} · a confirmar` : "Valor pendiente de confirmación"}</p>
    </div></div>
    <p className="text-sm font-semibold">¿Querés contratarla?</p>
    <div className="grid gap-2">{ADDITIONAL_DAY_OPTIONS.map((o) => (
      <Button key={o.value} type="button" variant={context.answer === o.value ? "default" : "outline"} className="h-auto min-h-11 whitespace-normal justify-start text-left" disabled={saving} aria-pressed={context.answer === o.value} onClick={() => onAnswer(o.value)}>{o.label}</Button>
    ))}</div>
    {saving && <p className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />Guardando…</p>}
    {context.answer && <p role="status" className="text-xs text-primary">{context.answer === "interesado" ? "Solicitud pendiente de confirmación por administración." : context.answer === "consulta" ? "Consulta previa registrada." : "Respuesta registrada."}</p>}
    <p className="text-xs text-muted-foreground">Es una solicitud: no compra, cobra ni cambia tu reserva.</p>
    <p className="text-xs text-muted-foreground">No es una noche extra de alojamiento.</p>
  </section>
);
};

export default function TripAdditionalDayQuestion({ reservationId, token }: { reservationId: string; token?: string }) {
  const [context, setContext] = useState<AdditionalDayContext | null>(null);
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
  const save = async (answer: AdditionalDayAnswer) => {
    if (saving) return;
    setSaving(true); setError(null);
    const { data, error: e } = await (supabase as any).rpc("save_trip_additional_day", { p_reservation_id: reservationId, p_answer: answer, p_token: token ?? null });
    setSaving(false);
    if (e) setError("No pudimos guardar tu respuesta. Intentá nuevamente."); else setContext(data);
  };
  return <div className="space-y-2"><AdditionalDayQuestionCard context={context} saving={saving} onAnswer={save} />{error && <p role="alert" className="text-xs text-destructive">{error}</p>}</div>;
}