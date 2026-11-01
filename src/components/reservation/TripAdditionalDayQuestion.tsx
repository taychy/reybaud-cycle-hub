import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { CalendarPlus, Loader2 } from "lucide-react";
import { ADDITIONAL_DAY_OPTIONS, type AdditionalDayAnswer, type AdditionalDayContext } from "@/lib/tripAdditionalDay";

const literalDate = (value: string) => {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-AR", { day: "numeric", month: "long" });
};
export const AdditionalDayQuestionCard = ({ context, saving, onAnswer }: { context: Pick<AdditionalDayContext, "answer" | "existing_night" | "status" | "start" | "end" | "original_nights" | "original_days">; saving: boolean; onAnswer: (a: AdditionalDayAnswer) => void }) => (
  <section className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3" aria-labelledby="additional-day-title">
    <div className="flex gap-3"><CalendarPlus className="w-5 h-5 text-primary shrink-0 mt-0.5" /><div>
      <h3 id="additional-day-title" className="font-heading font-semibold text-sm uppercase tracking-wide">Extender mi participación en el Training Camp</h3>
      <p className="text-sm mt-2 leading-relaxed">Elegiste participar del {literalDate(context.start)} al {literalDate(context.end)}. ¿Querés sumar un día más de Training Camp respecto de tu paquete original de {context.original_nights} noches?</p>
      <p className="text-xs mt-2 text-muted-foreground">Es una extensión del programa: una jornada más de actividades y servicios, con la noche correspondiente según tu paquete. Los servicios concretos se confirmarán antes de contratar. No es una noche de alojamiento antes o después del camp.</p>
      <p className="text-xs mt-2 text-muted-foreground">«Quiero pedalear un día más» es extender el camp. «Solo necesito dormir una noche antes o después» es alojamiento extra.</p>
    </div></div>
    <div className="grid gap-2">{ADDITIONAL_DAY_OPTIONS.map((o) => (
      <Button key={o.value} type="button" variant={context.answer === o.value ? "default" : "outline"} className="h-auto min-h-11 whitespace-normal justify-start text-left" disabled={saving} aria-pressed={context.answer === o.value} onClick={() => onAnswer(o.value)}>{o.label}</Button>
    ))}</div>
    {saving && <p className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />Guardando…</p>}
    {context.answer && <p role="status" className="text-xs text-primary">Respuesta registrada. Podés cambiarla mientras la administración la revisa.</p>}
    <p className="text-xs text-muted-foreground">El valor final se confirmará antes de contratar. Tu respuesta no genera un cargo ni modifica tu reserva.</p>
    {context.existing_night && <p className="text-xs text-muted-foreground">Tenés una noche extra de alojamiento registrada por separado. Eso no implica un conflicto ni amplía automáticamente tu participación en el camp.</p>}
  </section>
);

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