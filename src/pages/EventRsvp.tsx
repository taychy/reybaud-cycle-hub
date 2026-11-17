import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Bike, CalendarDays, CheckCircle2, MapPin, XCircle, UtensilsCrossed } from "lucide-react";
import {
  PARTICIPATION_LABELS,
  LUNCH_POLICY_TEXT,
  LUNCH_POLICY_VERSION,
  lunchAmount,
  lunchDinerTotal,
  type LunchCounts,
  type LunchPrices,
  type ParticipationMode,
} from "@/lib/eventRsvp";
import { formatPrice } from "@/lib/currency";
import EventRsvpGuests, { type CyclistGuest, type DinnerGuest } from "@/components/events/EventRsvpGuests";

type LunchGuest = DinnerGuest;

type RsvpData = {
  event: { title: string; date: string; location: string };
  name: string | null;
  response: "voy" | "no_voy" | null;
  participation_mode: ParticipationMode | null;
  guests_count: number;
  cyclist_guests: CyclistGuest[];
  non_cyclist_guests: DinnerGuest[];
  lunch: LunchCounts & { status: string; terms_version: string | null; terms_accepted_at: string | null; attendees: LunchGuest[] };
  prices: LunchPrices;
};

const modes = Object.entries(PARTICIPATION_LABELS) as [ParticipationMode, string][];
const eventDate = (value: string) => {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  const weekday = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"][new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${weekday} ${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
};

export default function EventRsvp() {
  const { token } = useParams<{ token: string }>();
  const [params] = useSearchParams();
  const [data, setData] = useState<RsvpData | null>(null);
  const linkChoice = params.get("opcion");
  const [choice, setChoice] = useState<"voy" | "no_voy">(linkChoice === "no_voy" ? "no_voy" : "voy");
  // Si la PWA está abierta y se pulsa el otro botón del correo con el mismo
  // token, React conserva el componente: actualizar la elección por la URL.
  useEffect(() => {
    if (linkChoice === "voy" || linkChoice === "no_voy") setChoice(linkChoice);
  }, [linkChoice, token]);
  const [mode, setMode] = useState<ParticipationMode>("fondo_y_almuerzo");
  const [cyclists, setCyclists] = useState<CyclistGuest[]>([]);
  const [nonCyclists, setNonCyclists] = useState<DinnerGuest[]>([]);
  const guests = choice === "voy" && mode !== "solo_fondo"
    ? nonCyclists.length + (mode === "solo_almuerzo" ? 0 : cyclists.filter((person) => person.lunch).length)
    : 0;
  const guestDetails = useMemo<LunchGuest[]>(() => [
    ...nonCyclists.map((person) => ({ name: person.name, category: person.category, is_cyclist: false })),
    ...(mode === "fondo_y_almuerzo"
      ? cyclists.filter((person) => person.lunch).map((person) => ({ name: person.name, category: "adult" as const, is_cyclist: true }))
      : []),
  ], [cyclists, nonCyclists, mode]);
  const counts = useMemo<LunchCounts>(() => {
    const derived = { adults_count: 1, children_4_9_count: 0, under_4_count: 0 };
    guestDetails.slice(0, guests).forEach((person) => {
      if (person.category === "adult") derived.adults_count += 1;
      else if (person.category === "child_4_9") derived.children_4_9_count += 1;
      else derived.under_4_count += 1;
    });
    return derived;
  }, [guestDetails, guests]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);

  const hydrate = (response: RsvpData, isInitialLoad = false) => {
    setData(response);
    setTermsAccepted(response.lunch.terms_version === LUNCH_POLICY_VERSION && !!response.lunch.terms_accepted_at);
    // Un enlace VOY/NO VOY del correo debe respetar la elección inicial incluso
    // si el participante ya respondió anteriormente. Al guardar usamos el estado del servidor.
    const requestedOption = params.get("opcion");
    const hasLinkChoice = requestedOption === "voy" || requestedOption === "no_voy";
    if (response.response && (!isInitialLoad || !hasLinkChoice)) setChoice(response.response);
    if (response.participation_mode) setMode(response.participation_mode);
    setCyclists(Array.isArray(response.cyclist_guests)
      ? response.cyclist_guests.map((person) => ({ ...person, category: "adult" as const }))
      : []);
    setNonCyclists(Array.isArray(response.non_cyclist_guests) ? response.non_cyclist_guests : []);
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!token) { setError("Enlace inválido."); setLoading(false); return; }
      const { data: response, error: failure } = await supabase.functions.invoke("event-rsvp", {
        body: { action: "status", token },
      });
      if (!mounted) return;
      if (failure || response?.error) setError(response?.error || "No pudimos abrir este enlace.");
      else hydrate(response as RsvpData, true);
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [token]);

  const call = async (extra: Record<string, unknown>) => {
    if (!token) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      // Todo se guarda y valida en el servidor; los nuevos invitados generan
      // alertas idempotentes para Claudio sin requerir sesión en la app.
      const { data: saved, error: failure } = await supabase.functions.invoke("event-rsvp", {
        body: {
          action: "respond_with_types", token,
          response: extra.response,
          participation_mode: extra.participation_mode,
          cyclists: extra.cyclists,
          non_cyclists: extra.non_cyclists,
          accept_terms: extra.accept_terms,
        },
      });
      if (failure || saved?.error || !saved) {
        throw new Error(saved?.error || failure?.message || "No pudimos confirmar tu respuesta.");
      }
      hydrate(saved as RsvpData);
      setNotice(extra.response === "no_voy"
        ? "Recibimos tu respuesta."
        : "¡Listo! Recibimos tu confirmación.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos confirmar tu respuesta. Intentá nuevamente.");
    } finally {
      setSaving(false);
    }
  };

  const submitRsvp = () => {
    const riders = choice === "voy" && mode !== "solo_almuerzo"
      ? cyclists.map((person) => ({ name: person.name.trim(), category: "adult", lunch: mode !== "solo_fondo" && person.lunch }))
      : [];
    const diners = choice === "voy" && mode !== "solo_fondo"
      ? nonCyclists.map((person) => ({ name: person.name.trim(), category: person.category }))
      : [];
    if ([...riders, ...diners].some((person) => person.name.length < 2 || person.name.length > 100)) {
      setError("Completá nombre y apellido de cada acompañante."); return;
    }
    if (choice === "voy" && mode !== "solo_fondo" && !termsAccepted) {
      setError("Aceptá las condiciones del almuerzo para continuar."); return;
    }
    call({
      response: choice, participation_mode: choice === "voy" ? mode : null,
      cyclists: riders, non_cyclists: diners,
      accept_terms: choice === "voy" && mode !== "solo_fondo" ? termsAccepted : false,
    });
  };

  const total = useMemo(() => data ? lunchAmount(counts, data.prices) : null, [counts, data]);
  const locked = data?.lunch.status === "pago_verificado" || data?.lunch.status === "comprobante_informado";

  return (
    <div className="min-h-screen bg-background text-foreground px-4 py-8 sm:py-12">
      <Card className="w-full max-w-xl mx-auto border-accent/30 bg-card shadow-xl">
        <CardContent className="space-y-6 p-5 sm:p-8">
          <div className="space-y-3 border-l-4 border-primary pl-4">
            <div className="font-heading uppercase tracking-widest text-sm text-primary">Ciclismo Reybaud</div>
            <h1 className="font-heading text-3xl sm:text-4xl font-bold uppercase">{data?.event.title || "Fondazo de Fin de Año"}</h1>
            {data && <>
              <p className="flex gap-2 items-center text-accent"><CalendarDays className="w-4 h-4" /> {eventDate(data.event.date)}</p>
              <p className="flex gap-2 items-start text-muted-foreground text-sm"><MapPin className="w-4 h-4 mt-0.5 shrink-0" /> {data.event.location}</p>
              <a
                href="https://maps.app.goo.gl/6Bg9nS9BFn4g8hV79"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-accent text-sm font-semibold underline underline-offset-4 hover:opacity-80"
                aria-label="Ver ubicación de La Carreta del Gato en Google Maps (abre en una pestaña nueva)"
              >
                <MapPin className="w-4 h-4" />
                Ver restaurante en Google Maps (nueva pestaña)
              </a>
            </>}
          </div>

          {loading ? <p className="text-muted-foreground">Abriendo tu invitación…</p> : data ? <>
            <div role="note" className="rounded-lg border border-border p-3 text-sm space-y-1">
              <p><strong>Fondo:</strong> gratis para alumnos activos. Amigos ciclistas: $30.000, previa aprobación de Claudio.</p>
              <p><strong>Parrilla:</strong> adultos $40.000 · niños (4–9) $20.000 · menores de 4 sin cargo. Bebidas aparte.</p>
            </div>
            <p className="text-sm sm:text-base">Hola{data.name ? `, ${data.name}` : ""}! ¿Nos acompañás?</p>
            <div className="grid grid-cols-2 gap-3">
              <Button type="button" aria-pressed={choice === "voy"} variant={choice === "voy" ? "gold" : "outline"} onClick={() => setChoice("voy")}>
                <CheckCircle2 /> VOY
              </Button>
              <Button type="button" aria-pressed={choice === "no_voy"} variant={choice === "no_voy" ? "secondary" : "outline"}
                className={choice === "no_voy" ? "border-2 border-accent bg-accent/15 text-foreground" : ""}
                onClick={() => setChoice("no_voy")}>
                <XCircle /> NO VOY
              </Button>
            </div>

            {choice === "voy" && <div className="space-y-4">
              <div className="space-y-2">
                <Label>¿Qué vas a hacer?</Label>
                {modes.map(([value, label]) => (
                  <label key={value} className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer ${mode === value ? "border-accent bg-accent/10" : ""}`}>
                    <input type="radio" name="mode" checked={mode === value} onChange={() => setMode(value)} className="accent-[hsl(var(--accent))]" />
                    {label}
                  </label>
                ))}
              </div>
              <EventRsvpGuests cyclists={cyclists} setCyclists={setCyclists}
                nonCyclists={nonCyclists} setNonCyclists={setNonCyclists}
                mode={mode} disabled={!!locked} />
            </div>}

            {choice === "voy" && mode !== "solo_fondo" && <section className="rounded-xl border border-accent/30 bg-accent/5 p-4 sm:p-5 space-y-3" aria-label="Resumen de personas para la parrilla">
              <div className="flex items-center gap-2 font-semibold"><UtensilsCrossed className="h-5 w-5 text-accent" /> Personas para la parrilla</div>
              <p className="text-sm text-muted-foreground">Revisá las personas incluidas en el almuerzo.</p>
              <div className="text-sm grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-card p-3"><div className="text-muted-foreground text-xs">Adultos</div><strong>{counts.adults_count}</strong></div>
                <div className="rounded-lg bg-card p-3"><div className="text-muted-foreground text-xs">Niños (4–9)</div><strong>{counts.children_4_9_count}</strong></div>
                <div className="rounded-lg bg-card p-3"><div className="text-muted-foreground text-xs">Menores de 4</div><strong>{counts.under_4_count}</strong></div>
              </div>
              <p className="font-semibold text-sm">Total: {lunchDinerTotal(counts)} {lunchDinerTotal(counts) === 1 ? "comensal" : "comensales"}, incluyéndote.</p>
              {total !== null && <p className="text-sm text-muted-foreground">Valor estimado de la parrilla: {formatPrice(total, "ARS")} (bebidas aparte).</p>}
              <p className="text-xs text-muted-foreground">Los datos para pagar al restaurante te llegarán por correo.</p>
              <div className="space-y-2 border-t border-border pt-3">
                <p className="text-xs text-muted-foreground"><strong>Cancelaciones:</strong> {LUNCH_POLICY_TEXT}</p>
                <label className="flex items-start gap-2 text-sm cursor-pointer">
                  <Checkbox checked={termsAccepted} onCheckedChange={(checked) => setTermsAccepted(checked === true)} aria-label="Acepto las condiciones del almuerzo" />
                  <span>Acepto las condiciones del almuerzo.</span>
                </label>
              </div>
            </section>}

            <Button onClick={submitRsvp} disabled={saving || (choice === "voy" && mode !== "solo_fondo" && !termsAccepted)} variant="gold" className="w-full">
              {saving ? "Guardando…" : "Confirmar respuesta"}
            </Button>

            {notice && <p role="status" className="rounded-lg bg-accent/10 text-accent p-3 text-sm">{notice}</p>}
            {error && <p role="alert" className="rounded-lg bg-destructive/10 text-destructive p-3 text-sm">{error}</p>}
          </> : <p role="alert" className="text-destructive">{error || "Enlace no disponible."}</p>}

          <p className="text-center text-xs text-muted-foreground flex items-center justify-center gap-2"><Bike className="w-4 h-4" /> Ciclismo Reybaud</p>
        </CardContent>
      </Card>
    </div>
  );
}
