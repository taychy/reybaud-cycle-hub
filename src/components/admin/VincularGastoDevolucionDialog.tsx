import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatPrice } from "@/lib/currency";
import { GASTO_PAYMENT_LABELS } from "@/lib/gastoPaymentMethods";
import { RotateCcw, Search, Loader2, Info } from "lucide-react";
import { toast } from "sonner";

export interface GastoParaDevolucion {
  id: string;
  descripcion: string;
  monto: number;
  moneda: string;
  fecha: string;
  forma_pago: string;
  mp_payment_id?: string | null;
  event_id?: string | null;
  alumno_id?: string | null;
  reservation_id?: string | null;
}

interface Alumno { id: string; nombre: string; apellido: string | null; email: string }
interface ReservaOpt { id: string; event_id: string; event_title: string; estado: string | null; amount_total: number | null }

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gasto: GastoParaDevolucion | null;
  onDone?: () => void;
}

export default function VincularGastoDevolucionDialog({ open, onOpenChange, gasto, onDone }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Alumno[]>([]);
  const [alumno, setAlumno] = useState<Alumno | null>(null);
  const [reservas, setReservas] = useState<ReservaOpt[]>([]);
  const [loadingReservas, setLoadingReservas] = useState(false);
  const [eventoId, setEventoId] = useState<string>("ninguno");
  const [reservaId, setReservaId] = useState<string>("ninguna");
  const [motivo, setMotivo] = useState("Devolución a participante");
  const [notas, setNotas] = useState("");
  const [saving, setSaving] = useState(false);

  const esMp = !!gasto?.mp_payment_id;

  useEffect(() => {
    if (!open) {
      setQuery(""); setResults([]); setAlumno(null); setReservas([]);
      setEventoId("ninguno"); setReservaId("ninguna");
      setMotivo("Devolución a participante"); setNotas("");
    }
  }, [open]);

  useEffect(() => {
    if (!open || !gasto?.alumno_id) return;
    (async () => {
      const { data } = await supabase
        .from("alumnos").select("id, nombre, apellido, email")
        .eq("id", gasto.alumno_id!).maybeSingle();
      if (data) setAlumno(data as Alumno);
    })();
  }, [open, gasto?.alumno_id]);

  useEffect(() => {
    if (alumno || query.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      const q = `%${query.trim()}%`;
      const { data } = await supabase
        .from("alumnos").select("id, nombre, apellido, email")
        .or(`nombre.ilike.${q},apellido.ilike.${q},email.ilike.${q}`)
        .order("nombre").limit(8);
      setResults((data || []) as Alumno[]);
    }, 250);
    return () => clearTimeout(t);
  }, [query, alumno]);

  const loadReservas = useCallback(async (alumnoId: string) => {
    setLoadingReservas(true);
    const { data } = await supabase
      .from("event_reservations")
      .select("id, event_id, estado, amount_total, events(title)")
      .eq("alumno_id", alumnoId)
      .order("created_at", { ascending: false })
      .limit(40);
    const rows: ReservaOpt[] = ((data as any[]) ?? []).map((r) => ({
      id: r.id,
      event_id: r.event_id,
      event_title: r.events?.title ?? "Evento",
      estado: r.estado ?? null,
      amount_total: r.amount_total ?? null,
    }));
    setReservas(rows);
    setLoadingReservas(false);
  }, []);

  useEffect(() => {
    if (!open || !alumno) return;
    loadReservas(alumno.id);
    setReservaId("ninguna");
    setEventoId(gasto?.event_id || "ninguno");
  }, [open, alumno, loadReservas, gasto?.event_id]);

  const eventos = Array.from(
    new Map(reservas.map((r) => [r.event_id, r.event_title])).entries()
  ).map(([id, title]) => ({ id, title }));

  const reservasFiltradas = eventoId === "ninguno"
    ? reservas
    : reservas.filter((r) => r.event_id === eventoId);

  const handleSubmit = async () => {
    if (!gasto) return;
    if (!alumno) { toast.error("Elegí el participante"); return; }
    if (!motivo.trim()) { toast.error("Indicá el motivo"); return; }
    setSaving(true);
    const { error } = await supabase.rpc("vincular_gasto_como_devolucion" as any, {
      p_gasto_id: gasto.id,
      p_alumno_id: alumno.id,
      p_reservation_id: reservaId !== "ninguna" ? reservaId : null,
      p_motivo: motivo.trim(),
      p_notas: notas.trim() || null,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Gasto vinculado como devolución");
    onOpenChange(false);
    onDone?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="w-5 h-5" /> Vincular como devolución
          </DialogTitle>
          <DialogDescription>
            Este movimiento no se duplicará. Se vinculará a la cuenta corriente del participante y al viaje.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          {gasto && (
            <div className="rounded-md border border-orange-500/30 bg-orange-500/5 p-3 text-xs space-y-1">
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Egreso</span>
                <span className="truncate">{gasto.descripcion}</span>
              </div>
              <div className="flex justify-between"><span className="text-muted-foreground">Monto</span>
                <span className="font-bold text-orange-400">- {formatPrice(Number(gasto.monto), gasto.moneda)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Fecha</span>
                <span>{gasto.fecha}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Medio de pago</span>
                <span>{GASTO_PAYMENT_LABELS[gasto.forma_pago] || gasto.forma_pago}</span></div>
              {esMp && (
                <div className="flex justify-between"><span className="text-muted-foreground">Nº operación MP</span>
                  <span className="font-mono">{gasto.mp_payment_id}</span></div>
              )}
              <p className="text-[10px] text-muted-foreground pt-1 flex items-start gap-1">
                <Info className="w-3 h-3 mt-0.5 shrink-0" />
                Monto, fecha y medio de pago se toman del gasto y no se editan acá.
              </p>
            </div>
          )}

          {!alumno ? (
            <div className="space-y-2">
              <Label className="text-xs">Participante</Label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 w-4 h-4 text-muted-foreground" />
                <Input autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
                  placeholder="Nombre, apellido o email" className="pl-8" />
              </div>
              {results.length > 0 && (
                <div className="border rounded-md divide-y max-h-56 overflow-y-auto">
                  {results.map((a) => (
                    <button key={a.id} type="button" onClick={() => setAlumno(a)}
                      className="w-full text-left px-3 py-2 hover:bg-accent text-sm">
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
              <Button variant="ghost" size="sm" onClick={() => setAlumno(null)}>Cambiar</Button>
            </div>
          )}

          {alumno && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">Viaje / evento</Label>
                <Select value={eventoId} onValueChange={(v) => { setEventoId(v); setReservaId("ninguna"); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ninguno">Todos los viajes</SelectItem>
                    {eventos.map((e) => <SelectItem key={e.id} value={e.id}>{e.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Reserva</Label>
                {loadingReservas ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Buscando reservas…
                  </div>
                ) : (
                  <Select value={reservaId} onValueChange={setReservaId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ninguna">Sin reserva específica</SelectItem>
                      {reservasFiltradas.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.event_title}
                          {r.estado ? ` · ${r.estado}` : ""}
                          {r.amount_total != null ? ` · ${formatPrice(Number(r.amount_total), gasto?.moneda || "ARS")}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <p className="text-[10px] text-muted-foreground">Se incluyen también las reservas canceladas.</p>
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Motivo</Label>
            <Input value={motivo} onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej: Devolución por baja del viaje" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Notas internas (opcional)</Label>
            <Textarea rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving || !alumno}>
            {saving ? "Vinculando…" : "Vincular devolución"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
