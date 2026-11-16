import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, XCircle, Bike, CalendarDays, MapPin } from "lucide-react";

type Rsvp = {
  event?: { title: string; date: string; location: string };
  name?: string | null;
  response?: "voy" | "no_voy" | null;
  participation_mode?: "fondo_y_almuerzo" | "solo_fondo" | "solo_almuerzo" | null;
  guests_count?: number;
};
const modes = [
  { value: "fondo_y_almuerzo", label: "Fondo + almuerzo" },
  { value: "solo_fondo", label: "Solo fondo" },
  { value: "solo_almuerzo", label: "Solo almuerzo" },
] as const;

export default function EventRsvp() {
  const { token } = useParams<{ token: string }>();
  const [params] = useSearchParams();
  const choice = params.get("opcion") === "no_voy" ? "no_voy" : "voy";
  const [data, setData] = useState<Rsvp | null>(null);
  const [mode, setMode] = useState<string>("fondo_y_almuerzo");
  const [guests, setGuests] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!token) { setError("Enlace inválido"); setLoading(false); return; }
      const { data: response, error: failure } = await supabase.functions.invoke("event-rsvp", {
        body: { action: "status", token },
      });
      if (!mounted) return;
      if (failure || response?.error) setError(response?.error || "No pudimos abrir este enlace.");
      else {
        setData(response as Rsvp);
        if (response.participation_mode) setMode(response.participation_mode);
        if (typeof response.guests_count === "number") setGuests(response.guests_count);
      }
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [token]);

  const submit = async () => {
    if (!token) return;
    setSaving(true); setError("");
    const { data: response, error: failure } = await supabase.functions.invoke("event-rsvp", {
      body: { action: "respond", token, response: choice, participation_mode: choice === "voy" ? mode : null,
        guests_count: choice === "voy" && mode !== "solo_fondo" ? guests : 0 },
    });
    if (failure || response?.error) setError(response?.error || "No pudimos guardar tu respuesta.");
    else setDone(true);
    setSaving(false);
  };

  return (
    <div className="min-h-screen bg-[#071019] text-white flex items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md bg-[#101b26] border-cyan-500/30 text-white shadow-xl">
        <CardContent className="space-y-5 p-6 sm:p-8">
          <div className="font-heading uppercase tracking-widest text-sm text-orange-400">Ciclismo Reybaud</div>
          <h1 className="font-heading text-3xl sm:text-4xl font-bold uppercase">Fondazo de fin de año</h1>
          <p className="flex gap-2 items-center text-cyan-400"><CalendarDays className="w-4 h-4" /> Domingo 29/11/2026</p>
          <p className="flex gap-2 items-center text-white/80 text-sm"><MapPin className="w-4 h-4" /> Capilla del Señor · La Carreta del Gato</p>
          {loading ? <p className="text-white/60">Cargando tu invitación…</p>
            : done ? (
              <div className="space-y-3 text-center py-6">
                <CheckCircle2 className="mx-auto w-14 h-14 text-emerald-400" />
                <h2 className="text-xl font-bold">¡Respuesta registrada!</h2>
                <p className="text-white/70">Gracias por avisarnos. Esta confirmación es preliminar y no implica pago. Si elegiste almuerzo, más adelante te enviaremos el alias del evento para confirmar tu reserva. Podés modificar tu respuesta desde el mail.</p>
              </div>
            ) : data ? (
              <div className="space-y-4">
                <p>Hola{data.name ? ", " + data.name : ""}! {choice === "voy" ? "Qué alegría que quieras sumarte." : "Gracias por avisarnos."}</p>
                {data.response && <p className="text-sm text-white/60">Tu respuesta anterior: <strong>{data.response === "voy" ? "Voy" : "No voy"}</strong>. Podés modificarla.</p>}
                <div className={"flex items-center gap-2 rounded-lg p-3 font-semibold " + (choice === "voy" ? "bg-emerald-600/20 text-emerald-300" : "bg-white/10")}>
                  {choice === "voy" ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                  {choice === "voy" ? "Sí, voy a participar" : "No voy a poder participar"}
                </div>
                {choice === "voy" && (
                  <>
                    <p className="text-sm">¿De qué parte de la jornada vas a participar?</p>
                    <div className="space-y-2">
                      {modes.map((m) => (
                        <label key={m.value} className={"flex items-center gap-3 p-3 border rounded-lg cursor-pointer " + (mode === m.value ? "border-cyan-400 bg-cyan-400/10" : "border-white/20")}>
                          <input type="radio" name="mode" value={m.value} checked={mode === m.value}
                            onChange={() => setMode(m.value)} className="accent-cyan-500" />
                          {m.label}
                        </label>
                      ))}
                    </div>
                    {mode !== "solo_fondo" && (
                      <label className="flex items-center justify-between text-sm">
                        <span>¿Cuántos acompañantes vienen al almuerzo?</span>
                        <input type="number" min={0} max={30} value={guests} onChange={e => setGuests(Math.max(0, Math.min(30, Math.trunc(Number(e.target.value) || 0))))}
                          className="w-16 border rounded-md bg-[#1b2e3d] px-2 py-2 text-white" />
                      </label>
                    )}
                    <p className="text-xs text-white/60">Esta es una respuesta preliminar, no una reserva pagada. Más adelante recibirás otro mail con el alias del evento para pagar directamente y confirmar tu lugar en el almuerzo. Horarios y valores: a confirmar.</p>
                  </>
                )}
                {error && <p role="alert" className="text-red-400 text-sm">{error}</p>}
                <Button onClick={submit} disabled={saving} className="w-full bg-orange-500 text-black hover:bg-orange-400 font-bold">
                  {saving ? "Guardando…" : "Confirmar mi respuesta"}
                </Button>
              </div>
            ) : <p role="alert" className="text-red-400">{error || "Enlace no disponible."}</p>}
          <p className="text-center text-xs text-white/50 flex items-center justify-center gap-2"><Bike className="w-4 h-4" /> Ciclismo Reybaud</p>
        </CardContent>
      </Card>
    </div>
  );
}
