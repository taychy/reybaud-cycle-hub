import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2 } from "lucide-react";
import { WaitlistQuestion } from "@/lib/waitlistTypes";
import WaitlistAnswerInput from "./WaitlistAnswerInput";
import { z } from "zod";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  eventId: string;
  eventTitle: string;
  waitlistMensaje?: string | null;
  questions: WaitlistQuestion[];
  onDone?: () => void;
}

const baseSchema = z.object({
  nombre: z.string().trim().min(2, "Nombre requerido").max(100),
  email: z.string().trim().email("Email inválido").max(150),
  telefono: z.string().trim().max(30).optional().or(z.literal("")),
  dni: z.string().trim().max(20).optional().or(z.literal("")),
});

export default function EventWaitlistDialog({
  open,
  onOpenChange,
  eventId,
  eventTitle,
  waitlistMensaje,
  questions,
  onDone,
}: Props) {
  const { toast } = useToast();
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [dni, setDni] = useState("");
  const [respuestas, setRespuestas] = useState<Record<string, any>>({});
  const [alumnoId, setAlumnoId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDone(false);
    setRespuestas({});
    // Detectar sesión: si es alumno, autocompletar
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: alumno } = await supabase
        .from("alumnos")
        .select("id, nombre, apellido, email, telefono, documento")
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (alumno) {
        setAlumnoId(alumno.id);
        setNombre(`${alumno.nombre || ""} ${alumno.apellido || ""}`.trim());
        setEmail(alumno.email || "");
        setTelefono(alumno.telefono || "");
        setDni(alumno.documento || "");
      }
    })();
  }, [open]);

  const submit = async () => {
    const parsed = baseSchema.safeParse({ nombre, email, telefono, dni });
    if (!parsed.success) {
      toast({
        title: "Revisá los datos",
        description: parsed.error.issues[0]?.message || "Datos inválidos",
        variant: "destructive",
      });
      return;
    }
    // Validar preguntas requeridas
    for (const q of questions) {
      if (!q.requerida) continue;
      const v = respuestas[q.id];
      const empty =
        v == null || v === "" || (Array.isArray(v) && v.length === 0);
      if (empty) {
        toast({
          title: "Falta responder",
          description: q.label,
          variant: "destructive",
        });
        return;
      }
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc("submit_waitlist_entry" as any, {
        p_event_id: eventId,
        p_nombre: nombre,
        p_email: email,
        p_telefono: telefono || null,
        p_dni: dni || null,
        p_respuestas: respuestas,
        p_alumno_id: alumnoId,
        p_user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 250) : null,
      });
      if (error) throw error;
      const res = data as any;
      if (!res?.ok) throw new Error(res?.error || "No se pudo guardar");
      setDone(true);
      onDone?.();
    } catch (e: any) {
      toast({
        title: "Error",
        description: e.message || "No se pudo guardar",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Lista de espera — {eventTitle}</DialogTitle>
          {waitlistMensaje && (
            <DialogDescription className="text-sm">{waitlistMensaje}</DialogDescription>
          )}
        </DialogHeader>

        {done ? (
          <div className="text-center py-10 space-y-3">
            <div className="w-14 h-14 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            </div>
            <h3 className="text-lg font-semibold">¡Estás anotado!</h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              Te vamos a avisar por mail apenas abramos las inscripciones para{" "}
              <span className="text-foreground">{eventTitle}</span>.
            </p>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Listo
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Nombre y apellido *</Label>
                <Input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={100} />
              </div>
              <div>
                <Label className="text-xs">Email *</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  maxLength={150}
                />
              </div>
              <div>
                <Label className="text-xs">Teléfono</Label>
                <Input value={telefono} onChange={(e) => setTelefono(e.target.value)} maxLength={30} />
              </div>
              <div>
                <Label className="text-xs">DNI</Label>
                <Input value={dni} onChange={(e) => setDni(e.target.value)} maxLength={20} />
              </div>
            </div>

            {questions.length > 0 && (
              <div className="pt-2 space-y-3 border-t border-border">
                <p className="text-[11px] uppercase tracking-widest text-muted-foreground pt-2">
                  Contanos un poco más
                </p>
                {questions
                  .slice()
                  .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
                  .map((q) => (
                    <WaitlistAnswerInput
                      key={q.id}
                      question={q}
                      value={respuestas[q.id]}
                      onChange={(v) => setRespuestas((prev) => ({ ...prev, [q.id]: v }))}
                    />
                  ))}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={submit} disabled={submitting}>
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Anotarme"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
