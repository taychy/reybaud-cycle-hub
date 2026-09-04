import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Mail, Send, AlertTriangle, Loader2 } from "lucide-react";
import { arTodayISO, weekRangeAR, formatWeekLabel, isValidEmail } from "@/lib/weeklyTraining";

interface Props {
  alumno: { id: string; nombre: string | null; email: string | null; recibe_entrenamientos_email?: boolean | null };
  canEdit: boolean;
  onAlumnoUpdate?: (patch: { recibe_entrenamientos_email: boolean }) => void;
}

type WeekChoice = "esta" | "proxima" | "elegir";

interface PreviewData {
  semana: { inicio: string; fin: string; dates: string[] };
  subject: string;
  html: string;
  entrenamientos: Array<{ id: string; fecha: string; titulo: string | null; descripcion: string | null; tipo: string | null }>;
  previo: { created_at: string; modo: string; status: string } | null;
}

export function StudentWeeklyEmailSection({ alumno, canEdit, onAlumnoUpdate }: Props) {
  const [enabled, setEnabled] = useState(!!alumno.recibe_entrenamientos_email);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<WeekChoice>("esta");
  const [customDate, setCustomDate] = useState(arTodayISO());
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [ultimo, setUltimo] = useState<{ created_at: string; modo: string } | null>(null);

  const emailOk = isValidEmail(alumno.email);

  useEffect(() => setEnabled(!!alumno.recibe_entrenamientos_email), [alumno.id, alumno.recibe_entrenamientos_email]);

  useEffect(() => {
    let active = true;
    supabase
      .from("weekly_training_email_sends")
      .select("created_at, modo")
      .eq("alumno_id", alumno.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .then(({ data }) => { if (active) setUltimo((data?.[0] as any) ?? null); });
    return () => { active = false; };
  }, [alumno.id, sending]);

  const toggle = async (val: boolean) => {
    setSaving(true);
    const { error } = await supabase
      .from("alumnos")
      .update({ recibe_entrenamientos_email: val })
      .eq("id", alumno.id);
    setSaving(false);
    if (error) { toast.error("No se pudo guardar la preferencia"); return; }
    setEnabled(val);
    onAlumnoUpdate?.({ recibe_entrenamientos_email: val });
    toast.success(val ? "Envío semanal activado" : "Envío semanal desactivado");
  };

  const selectedWeek = choice === "proxima"
    ? weekRangeAR(arTodayISO(), 1)
    : choice === "elegir"
      ? weekRangeAR(customDate || arTodayISO(), 0)
      : weekRangeAR(arTodayISO(), 0);

  const loadPreview = useCallback(async () => {
    setLoadingPreview(true);
    setPreview(null);
    const { data, error } = await supabase.functions.invoke("send-weekly-training-digest", {
      body: { mode: "preview", alumno_id: alumno.id, semana_inicio: selectedWeek.inicio },
    });
    setLoadingPreview(false);
    if (error || (data as any)?.error) { toast.error("No se pudo generar la vista previa"); return; }
    setPreview(data as PreviewData);
  }, [alumno.id, selectedWeek.inicio]);

  useEffect(() => { if (open) loadPreview(); }, [open, choice, customDate, loadPreview]);

  const send = async () => {
    setSending(true);
    const { data, error } = await supabase.functions.invoke("send-weekly-training-digest", {
      body: { mode: "manual", alumno_id: alumno.id, semana_inicio: selectedWeek.inicio },
    });
    setSending(false);
    if (error || (data as any)?.error) { toast.error("No se pudo enviar"); return; }
    if ((data as any)?.skipped) { toast.error("No se envió: no hay entrenamientos o el email no es válido"); return; }
    toast.success("Entrenamientos enviados por email");
    setOpen(false);
  };

  const hasTrainings = (preview?.entrenamientos?.length ?? 0) > 0;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
        <Mail className="h-4 w-4" /> Entrenamientos por email
      </h3>

      {!emailOk && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>Este alumno no tiene un email válido cargado. Agregá un email para poder enviarle los entrenamientos.</span>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
        <div className="space-y-1">
          <Label className="text-sm">Envío semanal automático</Label>
          <p className="text-xs text-muted-foreground">
            Los domingos a las 18:00 le enviamos por email los entrenamientos de la semana siguiente.
          </p>
          {enabled && <p className="text-xs text-primary">Próximo envío: domingo 18:00</p>}
        </div>
        <Switch checked={enabled} disabled={!canEdit || !emailOk || saving} onCheckedChange={toggle} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" disabled={!canEdit || !emailOk} onClick={() => setOpen(true)}>
          <Send className="h-3.5 w-3.5 mr-1.5" /> Enviar entrenamientos ahora
        </Button>
        {ultimo && (
          <Badge variant="secondary" className="text-[11px]">
            Último envío: {new Date(ultimo.created_at).toLocaleDateString("es-AR")} ({ultimo.modo === "manual" ? "manual" : "automático"})
          </Badge>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Enviar entrenamientos por email</DialogTitle>
            <DialogDescription>
              {alumno.nombre} · {alumno.email}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Semana</Label>
              <Select value={choice} onValueChange={(v) => setChoice(v as WeekChoice)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="esta">Esta semana</SelectItem>
                  <SelectItem value="proxima">Próxima semana</SelectItem>
                  <SelectItem value="elegir">Elegir semana</SelectItem>
                </SelectContent>
              </Select>
              {choice === "elegir" && (
                <Input type="date" value={customDate} onChange={(e) => setCustomDate(e.target.value)} />
              )}
              <p className="text-xs text-muted-foreground">{formatWeekLabel(selectedWeek)} (lunes a domingo)</p>
            </div>

            {loadingPreview && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Generando vista previa…
              </div>
            )}

            {preview && !loadingPreview && (
              <div className="space-y-2">
                {preview.previo && (
                  <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
                    Ya se envió un resumen de esta semana el{" "}
                    {new Date(preview.previo.created_at).toLocaleString("es-AR")}. Podés reenviarlo igualmente.
                  </div>
                )}
                {!hasTrainings ? (
                  <p className="text-sm text-muted-foreground">No hay entrenamientos asignados para esta semana.</p>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground">Asunto: {preview.subject}</p>
                    <div
                      className="rounded-md border border-border bg-white p-2 text-black text-xs overflow-x-auto"
                      dangerouslySetInnerHTML={{ __html: preview.html }}
                    />
                  </>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={send} disabled={!hasTrainings || sending || loadingPreview}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Send className="h-4 w-4 mr-1.5" />}
              {preview?.previo ? "Reenviar de todos modos" : "Enviar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
