import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, UtensilsCrossed, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { formatPrice } from "@/lib/currency";
import {
  BLOCKED_LABELS, EXTRA_MEAL_QUERY, MOTIVO_LABELS, allAnswered, formatMealDay, initialChoices,
  referenceTotal, requestedFromChoices, slotKey, statusLabel, type ExtraMealInfo,
} from "@/lib/extraMealSurvey";

interface Props { reservationId: string; token?: string | null }

export default function ExtraMealsSurveyCard({ reservationId, token }: Props) {
  const [info, setInfo] = useState<ExtraMealInfo | null>(null);
  const [choices, setChoices] = useState<Record<string, "si" | "no">>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const ref = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    const { data, error: e } = await (supabase as any).rpc("get_extra_meal_survey", {
      p_reservation_id: reservationId, p_token: token || null,
    });
    if (e || !data) { setInfo(null); return; }
    setInfo(data as ExtraMealInfo);
    setChoices(initialChoices(data as ExtraMealInfo));
  }, [reservationId, token]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!info || info.blocked === "no_habilitada") return;
    const q = new URLSearchParams(window.location.search);
    if (q.get("encuesta") === EXTRA_MEAL_QUERY) ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [info]);

  if (!info || info.blocked === "no_habilitada" || info.blocked === "cancelada" || info.blocked === "no_encontrada") return null;

  const price = Number(info.price ?? 0);
  const currency = (info.currency || "ARS") as any;
  const offered = info.slots.filter((s) => s.status === "ofrecible");
  const requested = requestedFromChoices(info.slots, choices);
  const total = referenceTotal(requested.length, price);
  const answered = !!info.answer;

  const save = async () => {
    if (saving || !allAnswered(info.slots, choices)) return;
    setSaving(true); setError(null); setSavedMsg(null);
    const { data, error: e } = await (supabase as any).rpc("save_extra_meal_survey", {
      p_reservation_id: reservationId, p_token: token || null, p_requested: requested,
    });
    setSaving(false);
    if (e || !data?.ok) { setError("No pudimos guardar tu respuesta. Probá de nuevo."); return; }
    setSavedMsg(requested.length ? "Solicitud guardada. Administración la confirmará." : "Respuesta guardada: no pedís comidas adicionales.");
    void load();
  };

  return (
    <section ref={ref} id="comidas-adicionales" className="rounded-xl border border-border p-4 space-y-3" aria-labelledby="extra-meals-title">
      <div className="flex gap-3">
        <UtensilsCrossed className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div className="space-y-1">
          <h3 id="extra-meals-title" className="font-semibold text-sm">Comidas adicionales</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            El desayuno está incluido para todos. La noche extra incluye el desayuno del día siguiente,
            pero no la cena de esa noche ni el almuerzo del día siguiente.
            {price > 0 && <> Valor de referencia: <strong>{formatPrice(price, currency)}</strong> por comida.</>}
          </p>
        </div>
      </div>

      {info.blocked ? (
        <p role="status" className="text-xs text-amber-500">{BLOCKED_LABELS[info.blocked] ?? "Administración revisará tu caso antes de tomar tu respuesta."}</p>
      ) : (
        <>
          <ul className="space-y-2">
            {info.slots.map((s) => {
              const k = slotKey(s);
              const note = statusLabel(s);
              return (
                <li key={k} className="rounded-lg border border-border/60 p-3 space-y-2">
                  <div>
                    <p className="text-sm font-medium">{MOTIVO_LABELS[s.motivo]}</p>
                    <p className="text-xs text-muted-foreground capitalize">{s.tipo} · {formatMealDay(s.fecha)}</p>
                  </div>
                  {s.status === "ofrecible" ? (
                    <div className="grid grid-cols-2 gap-2" role="group" aria-label={`${MOTIVO_LABELS[s.motivo]} ${formatMealDay(s.fecha)}`}>
                      {(["si", "no"] as const).map((v) => (
                        <Button key={v} type="button" size="sm" className="min-h-10"
                          variant={choices[k] === v ? "default" : "outline"} aria-pressed={choices[k] === v} disabled={saving}
                          onClick={() => setChoices((c) => ({ ...c, [k]: v }))}>
                          {v === "si" ? "Sí, la quiero" : "No"}
                        </Button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-primary flex items-center gap-1.5">
                      <CheckCircle className="w-3.5 h-3.5 shrink-0" />{note}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>

          {offered.length > 0 ? (
            <>
              <Button type="button" variant="ghost" size="sm" className="w-full" disabled={saving}
                onClick={() => setChoices(Object.fromEntries(offered.map((s) => [slotKey(s), "no"])))}>
                No quiero ninguna comida adicional
              </Button>
              <div className="rounded-lg bg-muted/30 p-3 space-y-1">
                <p className="text-xs font-medium">Tu selección</p>
                {requested.length === 0
                  ? <p className="text-xs text-muted-foreground">Ninguna comida seleccionada.</p>
                  : requested.map((r) => (
                    <p key={slotKey(r)} className="text-xs text-muted-foreground capitalize">{r.tipo} · {formatMealDay(r.fecha)}</p>
                  ))}
                {price > 0 && <p className="text-sm font-semibold pt-1">Total de referencia: {formatPrice(total, currency)}</p>}
              </div>
              <Button type="button" className="w-full min-h-11" disabled={saving || !allAnswered(info.slots, choices)} onClick={() => { void save(); }}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : answered ? "Actualizar mi respuesta" : "Guardar mi respuesta"}
              </Button>
              {!allAnswered(info.slots, choices) && <p className="text-xs text-muted-foreground">Respondé Sí o No en cada comida.</p>}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">No hay comidas adicionales para solicitar en tu reserva.</p>
          )}
        </>
      )}

      {savedMsg && <p role="status" className="text-xs text-primary">{savedMsg}</p>}
      {answered && !savedMsg && <p className="text-xs text-muted-foreground">Ya respondiste. Podés cambiar tu respuesta cuando quieras.</p>}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">Solicitud sujeta a confirmación. No genera compra ni cobro.</p>
    </section>
  );
}
