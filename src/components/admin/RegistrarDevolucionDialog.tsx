import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { MONEDAS } from "@/lib/currency";
import { RotateCcw, Search } from "lucide-react";
import { toast } from "sonner";

interface Alumno {
  id: string;
  nombre: string;
  apellido: string | null;
  email: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialAlumnoId?: string;
  bajaSolicitudId?: string;
  onDone?: () => void;
}

const METODOS = [
  { value: "transferencia", label: "Transferencia" },
  { value: "efectivo", label: "Efectivo" },
  { value: "mercadopago", label: "Mercado Pago" },
  { value: "tarjeta", label: "Tarjeta" },
  { value: "otro", label: "Otro" },
];

export default function RegistrarDevolucionDialog({ open, onOpenChange, initialAlumnoId, bajaSolicitudId, onDone }: Props) {
  const today = new Date().toISOString().substring(0, 10);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Alumno[]>([]);
  const [alumno, setAlumno] = useState<Alumno | null>(null);
  const [monto, setMonto] = useState("");
  const [moneda, setMoneda] = useState("ARS");
  const [metodo, setMetodo] = useState("transferencia");
  const [fecha, setFecha] = useState(today);
  const [referencia, setReferencia] = useState("");
  const [motivo, setMotivo] = useState("");
  const [notas, setNotas] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setQuery(""); setResults([]); setAlumno(null);
      setMonto(""); setMoneda("ARS"); setMetodo("transferencia");
      setFecha(today); setReferencia(""); setMotivo(""); setNotas("");
    }
  }, [open, today]);

  useEffect(() => {
    if (!open || !initialAlumnoId) return;
    (async () => {
      const { data } = await supabase
        .from("alumnos")
        .select("id, nombre, apellido, email")
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
        .select("id, nombre, apellido, email")
        .or(`nombre.ilike.${q},apellido.ilike.${q},email.ilike.${q}`)
        .order("nombre")
        .limit(8);
      setResults((data || []) as Alumno[]);
    }, 250);
    return () => clearTimeout(t);
  }, [query, alumno]);

  const handleSubmit = async () => {
    if (!alumno) { toast.error("Seleccioná un alumno"); return; }
    const montoNum = parseFloat(monto);
    if (!montoNum || montoNum <= 0) { toast.error("Monto inválido"); return; }
    if (!motivo.trim()) { toast.error("Indicá el motivo"); return; }

    setLoading(true);
    const { error } = await supabase.rpc("registrar_devolucion", {
      p_alumno_id: alumno.id,
      p_monto: montoNum,
      p_moneda: moneda,
      p_motivo: motivo.trim(),
      p_metodo: metodo,
      p_fecha: fecha,
      p_referencia: referencia.trim() || null,
      p_notas: notas.trim() || null,
      p_baja_solicitud_id: bajaSolicitudId || null,
    });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Devolución registrada");
    onOpenChange(false);
    onDone?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="w-5 h-5" /> Registrar devolución
          </DialogTitle>
          <DialogDescription>
            Registra un reintegro al alumno. Queda un crédito espejo en la cuenta corriente para que el panel financiero detecte la devolución.
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
                      <div className="text-[11px] text-muted-foreground">{a.email}</div>
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
              {!initialAlumnoId && (
                <Button variant="ghost" size="sm" onClick={() => setAlumno(null)}>Cambiar</Button>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Monto</Label>
              <Input type="number" min="0" step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Moneda</Label>
              <Select value={moneda} onValueChange={setMoneda}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONEDAS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Método</Label>
              <Select value={metodo} onValueChange={setMetodo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {METODOS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Fecha</Label>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Referencia / comprobante (opcional)</Label>
            <Input value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="N° de operación, recibo, etc." />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Motivo</Label>
            <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej: Devolución por baja anticipada" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Notas internas (opcional)</Label>
            <Textarea rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={loading || !alumno}>
            {loading ? "Guardando…" : "Registrar devolución"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
