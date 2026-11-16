import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Mail, CheckCircle, XCircle, Users, RefreshCw, Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const FONDAZO_EVENT_ID = "08fc7e07-10df-4ace-b3ed-a0d581b6f7c9";

type Row = {
  recipient_name: string | null;
  recipient_email: string;
  response: string | null;
  participation_mode: string | null;
  guests_count: number;
  responded_at: string | null;
  last_sent_at: string | null;
};
type Summary = {
  invited: number; yes: number; no: number; pending: number;
  fondo: number; almuerzo: number; rows: Row[];
};
const labels: Record<string, string> = {
  fondo_y_almuerzo: "Fondo + almuerzo",
  solo_fondo: "Solo fondo",
  solo_almuerzo: "Solo almuerzo",
};

export default function EventRsvpDashboard({ eventId }: { eventId: string }) {
  const { toast } = useToast();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [eligible, setEligible] = useState<number | null>(null);
  const [testEmail, setTestEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testSent, setTestSent] = useState(false);
  const [testVerified, setTestVerified] = useState(false);
  const call = async (action: string, extra: Record<string, unknown> = {}) => {
    const { data, error } = await supabase.functions.invoke("event-rsvp", {
      body: { action, ...extra },
    });
    if (error || data?.error) throw new Error(data?.error || error?.message || "Error inesperado");
    return data;
  };
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [s, count] = await Promise.all([call("summary"), call("preview_count")]);
      setSummary(s as Summary);
      setEligible(count.eligible);
    } catch (err) {
      toast({ title: "No pudimos consultar las respuestas", description: String(err), variant: "destructive" });
    } finally { setLoading(false); }
  }, []);
  useEffect(() => {
    if (eventId !== FONDAZO_EVENT_ID) return;
    refresh();
    supabase.auth.getUser().then(({ data }) => setTestEmail(data.user?.email || ""));
  }, [eventId, refresh]);

  if (eventId !== FONDAZO_EVENT_ID) return null;

  const test = async () => {
    setBusy(true);
    try {
      const r = await call("test_send", { test_email: testEmail });
      setTestSent(true);
      setTestVerified(false);
      toast({ title: "Prueba encolada", description: "Revisá el correo y probá ambas respuestas antes del envío general." });
      await refresh();
    } catch (err) {
      toast({ title: "No se pudo enviar la prueba", description: String(err), variant: "destructive" });
    } finally { setBusy(false); }
  };
  const send = async () => {
    setBusy(true);
    try {
      const r = await call("send", { confirm_send: true });
      toast({ title: "Invitaciones procesadas", description: "Encoladas: " + r.queued + " · Omitidas: " + r.skipped + " · Fallidas: " + r.failed });
      await refresh();
    } catch (err) {
      toast({ title: "No se pudo enviar", description: String(err), variant: "destructive" });
    } finally { setBusy(false); }
  };

  return (
    <Card className="border-cyan-500/30">
      <CardContent className="p-4 sm:p-6 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-heading font-bold">Confirmación de asistencia · Fondazo 29/11</h3>
            <p className="text-xs text-muted-foreground">Encuesta preliminar: Voy / No voy. Estos números no son reservas pagadas. Más adelante se enviará el alias del evento para confirmar el almuerzo, sin checkout en la app.</p>
          </div>
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCw className="h-4 w-4 mr-1" /> Actualizar
          </Button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {[
            ["Invitados", summary?.invited ?? 0],
            ["Voy (sin pago)", summary?.yes ?? 0],
            ["No voy", summary?.no ?? 0],
            ["Sin responder", summary?.pending ?? 0],
            ["Al fondo", summary?.fondo ?? 0],
            ["Al almuerzo (con acompañantes)", summary?.almuerzo ?? 0],
          ].map(([name, n]) => (
            <div key={String(name)} className="border rounded-lg p-3 bg-muted/20">
              <div className="text-xs text-muted-foreground">{name}</div>
              <div className="text-2xl font-bold">{n}</div>
            </div>
          ))}
        </div>
        <div className="rounded-lg border p-4 space-y-3">
          <h4 className="font-semibold flex items-center gap-2"><Mail className="w-4 h-4" /> Invitaciones por email</h4>
          <p className="text-sm text-muted-foreground">Alumnos activos elegibles: <strong>{eligible ?? "..."}</strong>. Primero enviá una prueba y comprobá el circuito completo. El envío general requiere confirmación.</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input type="email" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} aria-label="Correo de prueba" placeholder="Tu correo de prueba" />
            <Button variant="outline" onClick={test} disabled={busy || !testEmail}>Enviar prueba</Button>
          </div>
          {testSent && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={testVerified} onCheckedChange={(checked) => setTestVerified(checked === true)} />
              Revisé el correo de prueba y confirmé que los dos botones funcionan correctamente.
            </label>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button disabled={busy || !testSent || !testVerified || !eligible} className="w-full sm:w-auto">
                <Send className="w-4 h-4 mr-2" /> Enviar invitaciones
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Enviar a los alumnos activos?</AlertDialogTitle>
                <AlertDialogDescription>
                  Se enviarán hasta {eligible ?? 0} emails individualizados. Los que ya recibieron la invitación no se volverán a enviar. Esta acción no se puede deshacer.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={send}>Confirmar envío</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          {!testVerified && <p className="text-xs text-muted-foreground">El envío general se habilita después de enviar y verificar una prueba en esta sesión.</p>}
        </div>
        <div>
          <h4 className="font-semibold mb-2">Respuestas individuales</h4>
          {summary?.rows?.length ? (
            <div className="max-h-72 overflow-y-auto border rounded-lg divide-y">
              {summary.rows.map((r) => (
                <div key={r.recipient_email} className="p-3 flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{r.recipient_name || r.recipient_email}</div>
                    <div className="text-xs text-muted-foreground truncate">{r.recipient_email}</div>
                    {r.participation_mode && <div className="text-xs">{labels[r.participation_mode]} · Acompañantes: {r.guests_count || 0}</div>}
                  </div>
                  <span className="shrink-0 flex gap-1 items-center">
                    {r.response === "voy" ? <><CheckCircle className="w-4 h-4 text-green-500" /> Voy</>
                      : r.response === "no_voy" ? <><XCircle className="w-4 h-4" /> No voy</> : r.last_sent_at ? "Pendiente" : "No invitado"}
                  </span>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-muted-foreground">Todavía no hay invitaciones registradas.</p>}
        </div>
      </CardContent>
    </Card>
  );
}
