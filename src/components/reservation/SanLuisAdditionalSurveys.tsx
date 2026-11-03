import { useCallback, useEffect, useState } from "react";
import { CheckCircle, ClipboardList, Loader2, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { formatPrice } from "@/lib/currency";
import { tripTokenGet, tripTokenSaveStep } from "@/lib/tripTokenApi";
import TripAdditionalDayQuestion from "@/components/reservation/TripAdditionalDayQuestion";
import { isNocheExtra } from "@/lib/nocheExtra";
import ExtraMealsSurveyCard from "@/components/reservation/ExtraMealsSurveyCard";

export const SAN_LUIS_EVENT_ID = "67b4e85d-b00b-4b74-9644-99458d948c65";
export const SAN_LUIS_NIGHT_SURVEY_KEY = "encuesta_noches_extra_san_luis";

export type NightSurveyChoice = "antes" | "despues" | "ambas" | "ninguna";
export const NIGHT_SURVEY_OPTIONS: { value: NightSurveyChoice; label: string }[] = [
  { value: "antes", label: "Sí, una noche antes" },
  { value: "despues", label: "Sí, una noche después" },
  { value: "ambas", label: "Sí, ambas noches" },
  { value: "ninguna", label: "No, gracias" },
];

export const nightSurveyChoiceLabel = (value: string | null | undefined) =>
  NIGHT_SURVEY_OPTIONS.find((option) => option.value === value)?.label ?? "Sin responder";

type RecordedNight = {
  id: string;
  nombre: string;
  cantidad: number;
  timing: string | null;
  amount: number | null;
  currency: string;
};

type DayStatus = {
  answer?: "interesado" | "no" | "consulta" | null;
  amount?: number | null;
  currency?: string | null;
  companions_answer?: "si" | "no" | "no_se" | null;
};

const nightTimingLabel = (timing: string | null) => {
  if (timing === "antes") return "Antes del inicio";
  if (timing === "despues") return "Después del cierre";
  if (timing === "ambas") return "Antes y después";
  return "Fecha pendiente de definir";
};

/**
 * Solo lee noches ya cargadas en la reserva. Nunca transforma la encuesta
 * en una compra: los extras contratados se administran en su flujo existente.
 */
export const recordedNightFromExtras = (data: any): RecordedNight[] => {
  const addons = Array.isArray(data?.addons) ? data.addons : [];
  const contracted = Array.isArray(data?.contracted) ? data.contracted : [];
  return contracted.flatMap((row: any) => {
    const addon = addons.find((item: any) => item.id === row.addon_id);
    if (!isNocheExtra(String(addon?.nombre ?? "")) &&
        !["antes", "despues", "ambas"].includes(String(row.noche_timing ?? ""))) {
      return [];
    }
    const quantity = Number(row.cantidad || 0);
    if (!Number.isFinite(quantity) || quantity <= 0) return [];
    const subtotal = Number(row.subtotal);
    return [{
      id: String(row.id ?? row.addon_id),
      nombre: String(addon?.nombre ?? "Noche extra de alojamiento"),
      cantidad: quantity,
      timing: row.noche_timing ?? null,
      amount: Number.isFinite(subtotal) && subtotal > 0 ? subtotal : null,
      currency: String(row.currency ?? addon?.currency ?? "ARS"),
    }];
  });
};

interface Props {
  eventId: string;
  reservationId: string;
  token: string;
  packageName?: string | null;
  lodgingName?: string | null;
  stayLabel?: string | null;
}

export default function SanLuisAdditionalSurveys({
  eventId, reservationId, token, packageName, lodgingName, stayLabel,
}: Props) {
  const [nightAnswer, setNightAnswer] = useState<NightSurveyChoice | null>(null);
  const [day, setDay] = useState<DayStatus | null>(null);
  const [recordedNights, setRecordedNights] = useState<RecordedNight[]>([]);
  const [nightCanBeChecked, setNightCanBeChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    if (!token || eventId !== SAN_LUIS_EVENT_ID) return;
    setLoading(true);
    try {
      const [reservationData, extrasData, dayData, legacyNightData] = await Promise.all([
        tripTokenGet(token),
        (supabase as any).rpc("manage_trip_extras_by_token", {
          p_token: token, p_action: "get", p_selections: [],
        }),
        (supabase as any).rpc("get_trip_additional_day", {
          p_reservation_id: reservationId, p_token: token,
        }),
        (supabase as any).rpc("manage_extra_night_by_token", {
          p_token: token, p_action: "get",
        }),
      ]);
      if (reservationData.reservation.id !== reservationId ||
          reservationData.event?.id !== eventId) {
        throw new Error("La reserva no coincide con el enlace");
      }

      const surveyRow = (reservationData.checklist ?? [])
        .find((row) => row.step_key === SAN_LUIS_NIGHT_SURVEY_KEY);
      const choice = surveyRow?.data?.respuesta;
      setNightAnswer(NIGHT_SURVEY_OPTIONS.some((opt) => opt.value === choice)
        ? choice as NightSurveyChoice : null);
      setDay(dayData.error ? null : (dayData.data as DayStatus | null));

      // Evitar ofrecer otra noche si no podemos comprobar las ya contratadas.
      const validExtras = !extrasData.error &&
        extrasData.data?.ok === true &&
        extrasData.data.event_id === eventId &&
        Array.isArray(extrasData.data.contracted);
      const existingNights = validExtras ? recordedNightFromExtras(extrasData.data) : [];
      // El flujo antiguo conoce extras con fecha aún sin definir o inactivos.
      const legacyActual = !legacyNightData.error && legacyNightData.data?.ok
        ? legacyNightData.data.actual
        : null;
      if (legacyActual && existingNights.length === 0) {
        existingNights.push({
          id: "legacy-night",
          nombre: String(legacyActual.nombre ?? "Noche extra de alojamiento"),
          cantidad: Math.max(1, Number(legacyActual.cantidad || 1)),
          timing: legacyActual.noche_timing ?? null,
          amount: null,
          currency: "ARS",
        });
      }
      setNightCanBeChecked(validExtras || !!legacyActual);
      setRecordedNights(existingNights);
      setError(null);
    } catch {
      setError("No pudimos cargar las encuestas. Volvé a intentar.");
      setNightCanBeChecked(false);
    } finally {
      setLoading(false);
    }
  }, [token, eventId, reservationId]);

  useEffect(() => { void load(); }, [load]);

  if (eventId !== SAN_LUIS_EVENT_ID || !token) return null;

  const hasExistingNight = recordedNights.length > 0;
  const saveNight = async (value: NightSurveyChoice) => {
    if (saving || !nightCanBeChecked || hasExistingNight) return;
    setSaving(true);
    setError(null);
    try {
      await tripTokenSaveStep({
        token,
        step_key: SAN_LUIS_NIGHT_SURVEY_KEY,
        completed: true,
        needs_advice: value !== "ninguna",
        data: {
          respuesta: value,
          tipo: "solicitud_alojamiento",
          estado: value === "ninguna" ? "no_solicitada" : "pendiente_administracion",
          event_id: SAN_LUIS_EVENT_ID,
        },
        file_url: null,
      });
      setNightAnswer(value);
      setSaved(true);
    } catch {
      setError("No pudimos guardar tu respuesta. Probá de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  const dayLabel = day?.answer === "interesado"
    ? "Solicitada · pendiente de Administración"
    : day?.answer === "no"
      ? "No solicitada"
      : day?.answer === "consulta"
        ? "Consulta pendiente"
        : day === null ? "No corresponde a esta modalidad o sin datos" : "Sin responder";

  const goToReservation = () => {
    document.getElementById("reserva-completa")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <section className="space-y-4" aria-labelledby="san-luis-extra-surveys">
      <div className="space-y-1">
        <h2 id="san-luis-extra-surveys" className="font-semibold text-base">
          Encuestas y servicios adicionales
        </h2>
        <p className="text-xs text-muted-foreground">
          Jornada de Training Camp y noches de alojamiento son servicios diferentes.
          Tus respuestas no generan cobros automáticos.
        </p>
      </div>

      <TripAdditionalDayQuestion
        reservationId={reservationId}
        token={token}
        onChanged={() => { setSaved(true); void load(); }}
      />

      <ExtraMealsSurveyCard reservationId={reservationId} token={token} />

      <div className="rounded-xl border border-border p-4 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-primary" />
          Noche extra de alojamiento
        </h3>
        <p className="text-sm">
          ¿Necesitás alojamiento una noche antes o después de las fechas que elegiste?
        </p>
        <p className="text-xs text-muted-foreground">
          Solo alojamiento. No agrega actividades ni jornadas del Training Camp.
          La disponibilidad y el precio se confirman desde Administración.
        </p>

        {loading ? (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Cargando tu alojamiento…
          </p>
        ) : hasExistingNight ? (
          <div className="rounded-md border border-primary/20 bg-primary/5 p-3 space-y-2">
            <p className="text-sm font-medium flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-primary" />
              Ya tenés noche extra registrada en tu reserva
            </p>
            {recordedNights.map((night) => (
              <p key={night.id} className="text-xs text-muted-foreground">
                {night.nombre} · {night.cantidad} noche{night.cantidad !== 1 ? "s" : ""}
                {" · "}{nightTimingLabel(night.timing)}
                {night.amount !== null ? " · " + formatPrice(night.amount, night.currency as any) : ""}
              </p>
            ))}
            <p className="text-xs text-muted-foreground">
              No es necesario volver a solicitarla. Podés revisar o modificar los
              detalles desde «Extras de tu reserva».
            </p>
          </div>
        ) : !nightCanBeChecked ? (
          <p className="text-xs text-amber-400">
            No pudimos comprobar las noches que ya tenés. Para evitar duplicaciones,
            volvé a intentar más tarde o consultá a Administración.
          </p>
        ) : (
          <>
            <div className="grid gap-2">
              {NIGHT_SURVEY_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  variant={nightAnswer === option.value ? "default" : "outline"}
                  className="min-h-11 h-auto whitespace-normal justify-start text-left"
                  aria-pressed={nightAnswer === option.value}
                  disabled={saving}
                  onClick={() => { void saveNight(option.value); }}
                >
                  {option.label}
                </Button>
              ))}
            </div>
            {nightAnswer && (
              <p role="status" className="text-xs text-primary">
                {nightAnswer === "ninguna"
                  ? "Tu respuesta quedó guardada: no necesitás alojamiento extra."
                  : "Solicitud guardada. Administración confirmará disponibilidad, modalidad y valor."}
              </p>
            )}
          </>
        )}
        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      </div>

      <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
        <h3 className="font-semibold text-sm">Tu reserva y tus solicitudes</h3>
        <p className="text-xs text-muted-foreground">
          {packageName || "Paquete"}{stayLabel ? " · " + stayLabel : ""}
          {lodgingName ? " · " + lodgingName : ""}
        </p>
        <div className="space-y-1">
          <p className="text-sm font-medium">Jornada extra de Training Camp</p>
          <p className="text-xs text-muted-foreground">
            {dayLabel}
            {day?.answer === "interesado" && Number(day.amount) > 0
              ? " · " + formatPrice(Number(day.amount), (day.currency || "ARS") as any)
              : ""}
          </p>
          {day?.answer === "interesado" && day.companions_answer && (
            <p className="text-xs text-muted-foreground">
              Compañeros: {day.companions_answer === "si" ? "se quedan" :
                day.companions_answer === "no" ? "no se quedan" : "pendiente de confirmar"}
            </p>
          )}
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium">Noches extras de alojamiento</p>
          {hasExistingNight ? recordedNights.map((night) => (
            <p key={night.id} className="text-xs text-muted-foreground">
              Agregada a tu reserva · {nightTimingLabel(night.timing)} · {night.cantidad} noche{night.cantidad !== 1 ? "s" : ""}
              {night.amount !== null ? " · " + formatPrice(night.amount, night.currency as any) : ""}
            </p>
          )) : (
            <p className="text-xs text-muted-foreground">
              {nightAnswer === "ninguna" ? "No solicitadas" :
                nightAnswer ? nightSurveyChoiceLabel(nightAnswer) + " · solicitud pendiente de Administración"
                  : "Sin responder"}
            </p>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Los importes pendientes de confirmación no significan que se hayan cobrado.
          El resumen de pagos y el alojamiento contratado están en tu reserva completa.
        </p>
        {(saved || day?.answer || nightAnswer || hasExistingNight) && (
          <Button type="button" onClick={goToReservation} className="w-full min-h-11">
            <ArrowUp className="w-4 h-4 mr-2" /> Ver mi reserva completa
          </Button>
        )}
      </div>
    </section>
  );
}
