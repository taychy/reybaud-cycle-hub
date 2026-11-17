import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Bike, CalendarDays, CheckCircle2, MapPin, XCircle, UtensilsCrossed } from "lucide-react";
import { Label } from "@/components/ui/label";
import { PARTICIPATION_LABELS, type LunchStatus, type ParticipationMode } from "@/lib/eventRsvp";
import EventRsvpGuests, { type CyclistGuest, type DinnerGuest } from "@/components/events/EventRsvpGuests";

type RsvpData = {
  event: { title: string; date: string; location: string };
  name: string | null;
  response: "voy" | "no_voy" | null;
  participation_mode: ParticipationMode | null;
  guests_count: number;
  cyclist_guests: CyclistGuest[];
  non_cyclist_guests: DinnerGuest[];
  lunch: { status: LunchStatus };
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const hydrate = (response: RsvpData, isInitialLoad = false) => {
    setData(response);
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

  const call = async (payload: Record<string, unknown>) => {
    if (!token) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const client = supabase as unknown as {
        rpc: (name: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
      };
      const result = await client.rpc("respond_event_rsvp_with_guest_types", {
        p_token: token,
        p_response: payload.response,
        p_mode: payload.participation_mode,
        p_cyclists: payload.cyclists,
        p_non_cyclists: payload.non_cyclists,
      });
      if (result.error) throw new Error(result.error.message);
      const refreshed = await supabase.functions.invoke("event-rsvp", { body: { action: "status", token } });
      if (refreshed.error || refreshed.data?.error || !refreshed.data) {
        throw new Error(refreshed.data?.error || refreshed.error?.message || "No se pudo cargar el estado actualizado.");
      }
      hydrate(refreshed.data as RsvpData);
      setNotice(payload.response === "no_voy"
        ? "Recibimos tu respuesta. ¡Gracias por avisarnos!"
        : "¡Asistencia registrada! Te enviaremos por correo las indicaciones del almuerzo y, si solicitaste un amigo ciclista, los pasos a seguir una vez que Claudio apruebe su participación.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos guardar tu respuesta. Intentá nuevamente.");
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
    call({
      response: choice, participation_mode: choice === "voy" ? mode : null,
      cyclists: riders, non_cyclists: diners,
    });
  };

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
            <div role="note" className="rounded-xl border border-border overflow-hidden">
              <div className="bg-muted/40 px-4 py-3 border-b border-border font-semibold text-sm">Información de la jornada</div>
              <div className="grid sm:grid-cols-2 gap-0">
                <div className="p-4 space-y-1.5 sm:border-r border-b sm:border-b-0 border-border">
                  <div className="flex gap-2 items-center font-semibold text-primary"><Bike className="h-4 w-4" /> Fondo en bicicleta</div>
                  <p className="text-sm"><strong>Gratis</strong> para alumnos activos.</p>
                  <p className="text-xs text-muted-foreground">Amigos ciclistas: $30.000 por persona, sujetos a aprobación de Claudio. 10 cupos disponibles en total.</p>
                </div>
                <div className="p-4 space-y-1.5">
                  <div className="flex gap-2 items-center font-semibold text-accent"><UtensilsCrossed className="h-4 w-4" /> Parrilla</div>
                  <p className="text-sm">Adultos <strong>$40.000</strong> · Niños de 4 a 9 <strong>$20.000</strong></p>
                  <p className="text-xs text-muted-foreground">Menores de 4 sin cargo · Bebidas aparte. Acompañantes no ciclistas sin cupo comercial.</p>
                </div>
              </div>
            </div>
            <p className="text-sm sm:text-base">Hola{data.name ? `, ${data.name}` : ""}! ¿Nos acompañás? Elegí una opción para confirmar tu asistencia.</p>
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
                <Label>¿De qué parte de la jornada vas a participar?</Label>
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

            <p className="text-sm text-muted-foreground">Esta encuesta registra tu asistencia. Si venís, más adelante recibirás un correo separado con las indicaciones para reservar y pagar el almuerzo. Los amigos ciclistas necesitan la aprobación previa de Claudio.</p>
            <Button onClick={submitRsvp} disabled={saving} variant="gold" className="w-full">
              {saving ? "Guardando…" : "Confirmar mi respuesta"}
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
