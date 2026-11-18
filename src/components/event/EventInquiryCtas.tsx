import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, Loader2 } from "lucide-react";

export interface InquiryCta {
  key: string;
  label: string;
  note?: string;
}

/** Lee metadata.inquiry_ctas: consultas sin cobro automático (se guardan en event_waitlist_entries). */
export function parseInquiryCtas(metadata: unknown): InquiryCta[] {
  const raw = (metadata as any)?.inquiry_ctas;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c) => c && typeof c.key === "string" && typeof c.label === "string")
    .map((c) => ({ key: c.key, label: c.label, note: typeof c.note === "string" ? c.note : undefined }));
}

const schema = z.object({
  nombre: z.string().trim().min(2, "Nombre y apellido requerido").max(100),
  email: z.string().trim().email("Email inválido").max(150),
  telefono: z.string().trim().min(6, "WhatsApp requerido").max(30),
  mensaje: z.string().trim().max(1000).optional(),
});

export default function EventInquiryCtas({ eventId, eventTitle, ctas }: { eventId: string; eventTitle: string; ctas: InquiryCta[] }) {
  const [active, setActive] = useState<InquiryCta | null>(null);
  const [form, setForm] = useState({ nombre: "", email: "", telefono: "", mensaje: "" });
  const [alumnoId, setAlumnoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!active) return;
    setDone(false);
    setError(null);
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: a } = await supabase.from("alumnos").select("id, nombre, apellido, email, telefono").eq("user_id", session.user.id).maybeSingle();
      if (a) {
        setAlumnoId(a.id);
        setForm((f) => ({
          ...f,
          nombre: f.nombre || `${a.nombre || ""} ${a.apellido || ""}`.trim(),
          email: f.email || a.email || "",
          telefono: f.telefono || a.telefono || "",
        }));
      }
    })();
  }, [active]);

  const submit = async () => {
    if (!active) return;
    const parsed = schema.safeParse(form);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message || "Revisá los datos"); return; }
    setSending(true); setError(null);
    try {
      const { data, error } = await supabase.rpc("submit_waitlist_entry" as any, {
        p_event_id: eventId,
        p_nombre: parsed.data.nombre,
        p_email: parsed.data.email,
        p_telefono: parsed.data.telefono,
        p_dni: null,
        p_respuestas: { tipo: "consulta", opcion: active.key, opcion_label: active.label, mensaje: parsed.data.mensaje || "", evento: eventTitle },
        p_alumno_id: alumnoId,
        p_user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 250) : null,
      });
      if (error) throw error;
      if (!(data as any)?.ok) throw new Error((data as any)?.error || "No se pudo guardar");
      setDone(true);
    } catch (e: any) {
      setError(e.message || "No se pudo enviar tu consulta. Probá de nuevo.");
    } finally { setSending(false); }
  };

  if (!ctas.length) return null;
  return (
    <div className="glass-card rounded-xl p-5 space-y-3 animate-fade-in border border-primary/30">
      {ctas.map((c, i) => (
        <div key={c.key} className="space-y-1">
          <Button variant={i === 0 ? "gold" : "outline"} className="w-full h-12 text-sm whitespace-normal" onClick={() => setActive(c)}>
            {c.label}
          </Button>
          {c.note && <p className="text-[11px] text-muted-foreground text-center">{c.note}</p>}
        </div>
      ))}
      <p className="text-[11px] text-muted-foreground text-center">No se cobra nada ahora: el equipo de Reybaud te contacta para confirmar y coordinar el pago.</p>

      <Dialog open={!!active} onOpenChange={(v) => !v && setActive(null)}>
        <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{active?.label}</DialogTitle>
            <DialogDescription>{eventTitle}</DialogDescription>
          </DialogHeader>
          {done ? (
            <div className="text-center py-8 space-y-3">
              <CheckCircle2 className="w-12 h-12 text-primary mx-auto" />
              <h3 className="text-lg font-semibold">¡Recibimos tu consulta!</h3>
              <p className="text-sm text-muted-foreground">Te vamos a escribir por WhatsApp o correo para confirmar los detalles. No se realizó ningún cobro.</p>
              <Button variant="outline" onClick={() => setActive(null)}>Listo</Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div><Label className="text-xs">Nombre y apellido *</Label><Input value={form.nombre} maxLength={100} onChange={(e) => setForm({ ...form, nombre: e.target.value })} /></div>
              <div><Label className="text-xs">Correo *</Label><Input type="email" value={form.email} maxLength={150} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div><Label className="text-xs">WhatsApp *</Label><Input type="tel" value={form.telefono} maxLength={30} onChange={(e) => setForm({ ...form, telefono: e.target.value })} /></div>
              <div><Label className="text-xs">Mensaje (opcional)</Label><Textarea value={form.mensaje} maxLength={1000} onChange={(e) => setForm({ ...form, mensaje: e.target.value })} /></div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setActive(null)}>Cancelar</Button>
                <Button onClick={submit} disabled={sending}>{sending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Enviar consulta"}</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
