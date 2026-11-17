import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Bike, CalendarDays, CheckCircle2, MapPin, XCircle, UtensilsCrossed } from "lucide-react";
import {
  PARTICIPATION_LABELS,
  normalizeGuestWhatsApp,
  lunchAmount,
  lunchDinerTotal,
  type LunchCounts,
  type LunchPrices,
  type ParticipationMode,
} from "@/lib/eventRsvp";
import { formatPrice } from "@/lib/currency";
import EventRsvpGuests, { type CyclistGuest, type DinnerGuest } from "@/components/events/EventRsvpGuests";
import {
  FONDAZO_TEST_RECIPIENT, buildAutomaticFondazoTestMails, buildApprovedCyclistsTestMail,
  type FondazoTestMail,
} from "@/lib/fondazoTestEmails";

type LunchGuest = DinnerGuest;

type RsvpData = {
  is_test?: boolean;
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
  const [reloadNonce, setReloadNonce] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [testMailStatus, setTestMailStatus] = useState("");
  const [testMailBusy, setTestMailBusy] = useState(false);

  const hydrate = (response: RsvpData, isInitialLoad = false) => {
    setData(response);
    // Un enlace VOY/NO VOY del correo debe respetar la elección inicial incluso
    // si el participante ya respondió anteriormente. Al guardar usamos el estado del servidor.
    const requestedOption = params.get("opcion");
    const hasLinkChoice = requestedOption === "voy" || requestedOption === "no_voy";
    if (response.response && (!isInitialLoad || !hasLinkChoice)) setChoice(response.response);
    if (response.participation_mode) setMode(response.participation_mode);
    setCyclists(Array.isArray(response.cyclist_guests)
      ? response.cyclist_guests.map((person) => ({ ...person, category: "adult" as const, whatsapp: person.whatsapp || "" }))
      : []);
    setNonCyclists(Array.isArray(response.non_cyclist_guests) ? response.non_cyclist_guests : []);
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError("");
      if (!token) { setError("Enlace inválido."); setLoading(false); return; }
      let response: RsvpData | null = null;
      let lastError = "";
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const result = await supabase.functions.invoke("event-rsvp", { body: { action: "status", token } });
          if (!result.error && result.data && !result.data.error) {
            response = result.data as RsvpData;
            break;
          }
          lastError = result.data?.error || result.error?.message || "El enlace no respondió.";
          // Los enlaces vencidos o inválidos no deberían recibir reintentos.
          if (result.data?.error) break;
        } catch (err) {
          lastError = err instanceof Error ? err.message : "Problema de conexión.";
        }
      }
      if (!mounted) return;
      if (response) hydrate(response, true);
      else setError(lastError || "No pudimos abrir tu encuesta. Intentá nuevamente.");
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [token, reloadNonce]);

  const sendBrevoTestMail = async (mail: FondazoTestMail) => {
    // La función send-broadcast comprueba también la sesión de administrador
    // en el servidor. Nunca utilizar mode:"send" ni destinatarios reales aquí.
    const { data: answer, error: failure } = await supabase.functions.invoke("send-broadcast", {
      body: {
        mode: "test",
        test_email: FONDAZO_TEST_RECIPIENT,
        subject: mail.subject,
        content_html: mail.content_html,
        preheader: "Simulación del Fondazo de Reybaud. No realices transferencias.",
        segment_filters: { layout: "plain" },
      },
    });
    if (failure || answer?.ok !== true) {
      throw new Error(answer?.error || answer?.response?.message || failure?.message ||
        "El servicio de correos no confirmó el envío.");
    }
  };

  const sendAutomaticTestEmails = async (updated: RsvpData) => {
    if (!updated.is_test || !token) return;
    setTestMailBusy(true);
    setTestMailStatus("Comprobando tu sesión para iniciar el envío de prueba...");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Abrí la prueba desde Reybaud con tu sesión de administración iniciada.");
      const mails = buildAutomaticFondazoTestMails(updated, token);
      if (!mails.length) return;
      let sent = 0;
      for (const mail of mails) {
        setTestMailStatus("Enviando correo de prueba " + (sent + 1) + " de " + mails.length + "...");
        await sendBrevoTestMail(mail);
        sent++;
      }
      setTestMailStatus(
        "Brevo aceptó " + sent + " correo(s) de prueba para " +
        FONDAZO_TEST_RECIPIENT + ". Comprobá la bandeja de entrada y spam."
      );
    } catch (err) {
      setTestMailStatus(
        "La asistencia se guardó, pero el correo de prueba no pudo enviarse: " +
        (err instanceof Error ? err.message : "error de envío") +
        ". Probá Reenviar correos con tu cuenta administradora."
      );
    } finally {
      setTestMailBusy(false);
    }
  };

  const simulateCyclistApproval = async () => {
    if (!data?.is_test || data.response !== "voy" || !data.cyclist_guests.length) return;
    setTestMailBusy(true);
    setTestMailStatus("Enviando simulación del correo de cupo aprobado por Claudio...");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Iniciá sesión con tu cuenta administradora.");
      await sendBrevoTestMail(buildApprovedCyclistsTestMail(data));
      setTestMailStatus(
        "Brevo aceptó el correo de cupo aprobado SIMULADO para " + FONDAZO_TEST_RECIPIENT +
        ". No se aprobó ningún ciclista real."
      );
    } catch (err) {
      setTestMailStatus("No se pudo enviar la simulación: " +
        (err instanceof Error ? err.message : "error desconocido"));
    } finally {
      setTestMailBusy(false);
    }
  };

  const call = async (action: "respond_with_types", extra: Record<string, unknown>) => {
    if (!token) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const namedRpc = supabase as unknown as {
        rpc: (name: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
      };
      const saved = await namedRpc.rpc("respond_event_rsvp_with_guest_types", {
        p_token: token,
        p_response: extra.response,
        p_mode: extra.participation_mode,
        p_cyclists: extra.cyclists,
        p_non_cyclists: extra.non_cyclists,
      });
      if (saved.error) throw new Error(saved.error.message);
      const loaded = await supabase.functions.invoke("event-rsvp", { body: { action: "status", token } });
      if (loaded.error || loaded.data?.error || !loaded.data) {
        throw new Error(loaded.data?.error || loaded.error?.message || "No pudimos comprobar la respuesta guardada.");
      }
      const savedRsvp = loaded.data as RsvpData;
      hydrate(savedRsvp);
      setNotice(extra.response === "no_voy"
        ? "Gracias por responder. Registramos que no vas a asistir."
        : "¡Tu asistencia quedó registrada! Si corresponde abonar parrilla o cupos ciclistas aprobados por Claudio, te enviaremos las instrucciones por otro correo.");
      // Solo el registro marcado como PRUEBA. La confirmación real permanece
      // separada de emails y Brevo recibe únicamente la casilla permitida.
      if (savedRsvp.is_test) await sendAutomaticTestEmails(savedRsvp);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos confirmar tu respuesta. Intentá nuevamente.");
    } finally {
      setSaving(false);
    }
  };

  const submitRsvp = () => {
    const riders = choice === "voy" && mode !== "solo_almuerzo"
      ? cyclists.map((person) => ({
          name: person.name.trim(),
          category: "adult",
          lunch: mode !== "solo_fondo" && person.lunch,
          whatsapp: normalizeGuestWhatsApp(person.whatsapp) || "",
        }))
      : [];
    const diners = choice === "voy" && mode !== "solo_fondo"
      ? nonCyclists.map((person) => ({ name: person.name.trim(), category: person.category }))
      : [];
    if ([...riders, ...diners].some((person) => person.name.length < 2 || person.name.length > 100)) {
      setError("Completá nombre y apellido de cada acompañante."); return;
    }
    if (riders.some((person) => !/\S+\s+\S+/.test(person.name))) {
      setError("Ingresá nombre y apellido completos de cada ciclista invitado."); return;
    }
    if (riders.some((person) => !person.whatsapp)) {
      setError("Ingresá el WhatsApp de cada ciclista invitado con código de país (por ejemplo, +54 9 11 1234-5678)."); return;
    }
    call("respond_with_types", {
      response: choice, participation_mode: choice === "voy" ? mode : null,
      cyclists: riders, non_cyclists: diners,
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

            <p className="text-xs text-muted-foreground">Solo estamos confirmando tu asistencia y la cantidad de acompañantes. Si corresponde un pago, recibirás sus instrucciones por correo separado.</p>
            <Button onClick={submitRsvp} disabled={saving} variant="gold" className="w-full">
              {saving ? "Guardando…" : "Confirmar mi respuesta"}
            </Button>

            {choice === "voy" && mode !== "solo_fondo" && <section className="rounded-xl border border-accent/30 bg-accent/5 p-4 sm:p-5 space-y-3" aria-label="Resumen de personas para la parrilla">
              <div className="flex items-center gap-2 font-semibold"><UtensilsCrossed className="h-5 w-5 text-accent" /> Personas para la parrilla</div>
              <p className="text-sm text-muted-foreground">Comprobá los datos de arriba antes de confirmar tu respuesta.</p>
              <div className="text-sm grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-card p-3"><div className="text-muted-foreground text-xs">Adultos</div><strong>{counts.adults_count}</strong></div>
                <div className="rounded-lg bg-card p-3"><div className="text-muted-foreground text-xs">Niños (4–9)</div><strong>{counts.children_4_9_count}</strong></div>
                <div className="rounded-lg bg-card p-3"><div className="text-muted-foreground text-xs">Menores de 4</div><strong>{counts.under_4_count}</strong></div>
              </div>
              <p className="font-semibold text-sm">Total: {lunchDinerTotal(counts)} {lunchDinerTotal(counts) === 1 ? "comensal" : "comensales"}, incluyéndote.</p>
              {total !== null && <p className="text-sm text-muted-foreground">Valor estimado de la parrilla: {formatPrice(total, "ARS")} (bebidas aparte).</p>}
              <p className="text-xs text-muted-foreground">No tenés que transferir ahora. El correo de pago llegará por separado después de confirmar tu asistencia.</p>
            </section>}

            {data.is_test && <section className="rounded-lg border border-primary/50 bg-primary/5 p-4 space-y-3" aria-label="Prueba de correos automáticos">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold">Prueba de correos automáticos · solo administración</h3>
                <p className="text-xs text-muted-foreground">
                  Esta prueba envía correos exclusivamente a {FONDAZO_TEST_RECIPIENT} desde Brevo.
                  No modifica cupos reales, no registra pagos y no envía mensajes a los alumnos.
                </p>
              </div>
              {testMailStatus && <p role="status" className="rounded bg-muted/40 p-2 text-sm">{testMailStatus}</p>}
              {data.response && <Button type="button" variant="outline" className="w-full" disabled={saving || testMailBusy}
                onClick={() => void sendAutomaticTestEmails(data)}>
                {testMailBusy ? "Enviando correos de prueba..." : "Reenviar mis correos automáticos de prueba"}
              </Button>}
              {data.response === "voy" && data.cyclist_guests.length > 0 && <Button
                type="button" variant="outline" className="w-full" disabled={saving || testMailBusy}
                onClick={() => void simulateCyclistApproval()}>
                Simular aprobación de Claudio y enviarme el correo del cupo
              </Button>}
            </section>}
            {notice && <p role="status" className="rounded-lg bg-accent/10 text-accent p-3 text-sm">{notice}</p>}
            {error && <p role="alert" className="rounded-lg bg-destructive/10 text-destructive p-3 text-sm">{error}</p>}
          </> : <div className="space-y-3">
            <p role="alert" className="text-destructive">{error || "Enlace no disponible."}</p>
            <Button type="button" variant="outline" onClick={() => setReloadNonce((value) => value + 1)}>
              Reintentar abrir mi encuesta
            </Button>
          </div>}

          <p className="text-center text-xs text-muted-foreground flex items-center justify-center gap-2"><Bike className="w-4 h-4" /> Ciclismo Reybaud</p>
        </CardContent>
      </Card>
    </div>
  );
}
