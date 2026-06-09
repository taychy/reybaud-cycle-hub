import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, Search } from "lucide-react";
import { toast } from "sonner";

interface Alumno {
  id: string;
  nombre: string;
  apellido: string | null;
  email: string;
  estado: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialAlumnoId?: string;
  onDone?: () => void;
}

const MOTIVOS = [
  { value: "economico", label: "Económico" },
  { value: "horarios", label: "Horarios" },
  { value: "lesion_salud", label: "Lesión / Salud" },
  { value: "viaje_vacaciones", label: "Viaje" },
  { value: "cambio_actividad", label: "Cambio de actividad" },
  { value: "disconforme_servicio", label: "Disconforme con servicio" },
  { value: "otro", label: "Otro" },
];

export default function DarBajaDirectaDialog({ open, onOpenChange, initialAlumnoId, onDone }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Alumno[]>([]);
  const [alumno, setAlumno] = useState<Alumno | null>(null);
  const [motivo, setMotivo] = useState("otro");
  const [otroDetalle, setOtroDetalle] = useState("");
  const [comentario, setComentario] = useState("");
  const [notas, setNotas] = useState("");
  const [emailNotificar, setEmailNotificar] = useState(true);
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      setQuery(""); setResults([]); setAlumno(null);
      setMotivo("otro"); setOtroDetalle(""); setComentario(""); setNotas("");
      setEmailNotificar(true);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !initialAlumnoId) return;
    (async () => {
      const { data } = await supabase
        .from("alumnos")
        .select("id, nombre, apellido, email, estado")
        .eq("id", initialAlumnoId)
        .maybeSingle();
      if (data) setAlumno(data as Alumno);
    })();
  }, [open, initialAlumnoId]);

  useEffect(() => {
    if (alumno || query.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      const q = `%${query.trim()}%`;
      const { data } = await supabase
        .from("alumnos")
        .select("id, nombre, apellido, email, estado")
        .or(`nombre.ilike.${q},apellido.ilike.${q},email.ilike.${q}`)
        .neq("estado", "inactivo")
        .order("nombre")
        .limit(8);
      setResults((data || []) as Alumno[]);
    }, 250);
    return () => clearTimeout(t);
  }, [query, alumno]);

  const handleSubmit = async () => {
    if (!alumno) { toast.error("Seleccioná un alumno"); return; }
    if (motivo === "otro" && !otroDetalle.trim()) {
      toast.error("Detallá el motivo");
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.rpc("dar_baja_directa", {
      p_alumno_id: alumno.id,
      p_motivo: motivo,
      p_motivo_otro_detalle: otroDetalle.trim() || null,
      p_comentario: comentario.trim() || null,
      p_notas: notas.trim() || null,
      p_email_notificar: emailNotificar,
    });
    setLoading(false);
    setConfirmOpen(false);
    if (error) { toast.error(error.message); return; }

    // Cancelar preapprovals MP (best-effort) usando la edge function existente
    const row = Array.isArray(data) ? data[0] : data;
    const preapprovals: string[] = (row as any)?.mp_preapproval_ids || [];
    for (const pid of preapprovals.filter(Boolean)) {
      try {
        await supabase.functions.invoke("cancel-mp-preapproval", { body: { preapproval_id: pid } });
      } catch (e) {
        console.warn("cancel-mp-preapproval falló:", (e as Error).message);
      }
    }

    toast.success("Baja registrada correctamente");
    onOpenChange(false);
    onDone?.();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" /> Dar de baja directa
            </DialogTitle>
            <DialogDescription>
              Registra una baja iniciada por el admin (sin solicitud previa del alumno). Cancela todas las suscripciones operativas.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {!alumno ? (
              <div className="space-y-2">
                <Label className="text-xs">Buscar alumno</Label>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 w-4 h-4 text-muted-foreground" />
                  <Input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Nombre, apellido o email"
                    className="pl-8"
                  />
                </div>
                {results.length > 0 && (
                  <div className="border rounded-md divide-y max-h-56 overflow-y-auto">
                    {results.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => setAlumno(a)}
                        className="w-full text-left px-3 py-2 hover:bg-accent text-sm"
                      >
                        <div className="font-medium">{[a.nombre, a.apellido].filter(Boolean).join(" ")}</div>
                        <div className="text-[11px] text-muted-foreground">{a.email} · {a.estado || "—"}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between rounded-md border p-2 bg-muted/30">
                <div className="text-sm">
                  <div className="font-medium">{[alumno.nombre, alumno.apellido].filter(Boolean).join(" ")}</div>
                  <div className="text-[11px] text-muted-foreground">{alumno.email}</div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setAlumno(null)}>Cambiar</Button>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">Motivo</Label>
              <Select value={motivo} onValueChange={setMotivo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MOTIVOS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {motivo === "otro" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Detalle del motivo</Label>
                <Input value={otroDetalle} onChange={(e) => setOtroDetalle(e.target.value)} />
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">Comentario contextual (opcional)</Label>
              <Textarea rows={2} value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Lo que se conversó con el alumno" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Notas internas (opcional)</Label>
              <Textarea rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} />
            </div>

            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={emailNotificar} onCheckedChange={(v) => setEmailNotificar(!!v)} />
              <span>Enviar email de notificación al alumno</span>
            </label>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancelar</Button>
            <Button variant="destructive" onClick={() => setConfirmOpen(true)} disabled={loading || !alumno}>
              Dar de baja
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Confirmás la baja directa?</AlertDialogTitle>
            <AlertDialogDescription>
              Se cancelan todas las suscripciones operativas de <b>{alumno ? [alumno.nombre, alumno.apellido].filter(Boolean).join(" ") : "—"}</b> y pasa a inactivo. El historial queda intacto.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleSubmit} disabled={loading} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {loading ? "Procesando…" : "Sí, dar de baja"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
