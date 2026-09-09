import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { MONEDAS, formatPrice } from "@/lib/currency";
import { RotateCcw, Search, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Alumno {
  id: string;
  nombre: string;
  apellido: string | null;
  email: string;
}

export interface DevolucionMpMovement {
  id: string;
  mp_payment_id: string;
  amount: number;
  currency: string;
  fecha_movimiento: string;
  cuenta_mp_id?: string | null;
  cuenta_nombre?: string | null;
  medio?: string | null;
  operacion?: string | null;
}

interface PagoOrigen {
  id: string;
  reservation_id: string;
  amount: number;
  currency: string;
  payment_date: string;
  payment_method: string | null;
  payment_reference: string | null;
  status: string;
}

interface ReservaOrigen {
  id: string;
  estado: string | null;
  event_title: string;
  total: number | null;
  currency: string;
  pagos: PagoOrigen[];
  pagado: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialAlumnoId?: string;
  bajaSolicitudId?: string;
  mpMovement?: DevolucionMpMovement | null;
  onDone?: () => void;
}

const METODOS = [
  { value: "transferencia", label: "Transferencia" },
  { value: "efectivo", label: "Efectivo" },
  { value: "mercadopago", label: "Mercado Pago" },
  { value: "tarjeta", label: "Tarjeta" },
  { value: "otro", label: "Otro" },
];

const ESTADOS_CANCELADOS = ["cancelada", "cancelado", "desistida", "desistido", "baja"];

export default function RegistrarDevolucionDialog({
  open, onOpenChange, initialAlumnoId, bajaSolicitudId, mpMovement, onDone,
}: Props) {
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

  const [origenes, setOrigenes] = useState<ReservaOrigen[]>([]);
  const [loadingOrigenes, setLoadingOrigenes] = useState(false);
  const [origen, setOrigen] = useState<string>("ninguno"); // "ninguno" | reservation_id
  const [pagoId, setPagoId] = useState<string>("ninguno");

  const bloqueado = !!mpMovement;

  useEffect(() => {
    if (!open) {
      setQuery(""); setResults([]); setAlumno(null);
      setMonto(""); setMoneda("ARS"); setMetodo("transferencia");
      setFecha(today); setReferencia(""); setMotivo(""); setNotas("");
      setOrigenes([]); setOrigen("ninguno"); setPagoId("ninguno");
      return;
    }
    if (mpMovement) {
      setMonto(String(Math.abs(Number(mpMovement.amount))));
      setMoneda(mpMovement.currency || "ARS");
      setFecha(String(mpMovement.fecha_movimiento).substring(0, 10));
      setReferencia(mpMovement.mp_payment_id);
      setMetodo("transferencia");
    }
  }, [open, today, mpMovement]);

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

  const loadOrigenes = useCallback(async (alumnoId: string) => {
    setLoadingOrigenes(true);
    const [resRes, payRes] = await Promise.all([
      supabase
        .from("event_reservations")
        .select("id, estado, event_id, amount_total, currency_snapshot, events(title)")
        .eq("alumno_id", alumnoId)
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("reservation_payments")
        .select("id, reservation_id, amount, currency, payment_date, payment_method, payment_reference, status, anulado_at")
        .eq("alumno_id", alumnoId)
        .is("anulado_at", null)
        .order("payment_date", { ascending: false })
        .limit(100),
    ]);

    const pagos = ((payRes.data as any[]) ?? []).filter((p) => p.status !== "rechazado");
    const rows: ReservaOrigen[] = ((resRes.data as any[]) ?? []).map((r) => {
      const ps: PagoOrigen[] = pagos.filter((p) => p.reservation_id === r.id);
      return {
        id: r.id,
        estado: r.estado ?? null,
        event_title: r.events?.title ?? "Evento",
        total: r.amount_total ?? null,
        currency: r.currency_snapshot ?? "ARS",
        pagos: ps,
        pagado: ps.reduce((s, p) => s + Number(p.amount || 0), 0),
      };
    });

    rows.sort((a, b) => {
      const ca = ESTADOS_CANCELADOS.includes(String(a.estado ?? "").toLowerCase()) ? 0 : 1;
      const cb = ESTADOS_CANCELADOS.includes(String(b.estado ?? "").toLowerCase()) ? 0 : 1;
      if (ca !== cb) return ca - cb;
      return b.pagado - a.pagado;
    });

    setOrigenes(rows.filter((r) => r.pagos.length > 0));
    setLoadingOrigenes(false);
  }, []);

  useEffect(() => {
    if (open && alumno) loadOrigenes(alumno.id);
    setOrigen("ninguno"); setPagoId("ninguno");
  }, [open, alumno, loadOrigenes]);

  const reservaSel = origenes.find((r) => r.id === origen) || null;

  const handleSubmit = async () => {
    if (!alumno) { toast.error("Seleccioná un alumno"); return; }
    const montoNum = parseFloat(monto);
    if (!montoNum || montoNum <= 0) { toast.error("Monto inválido"); return; }
    if (!motivo.trim()) { toast.error("Indicá el motivo"); return; }
    if (!mpMovement && !referencia.trim()) {
      toast.error("En una devolución manual indicá la referencia o comprobante");
      return;
    }

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
      p_mp_movement_id: mpMovement?.id ?? null,
      p_cuenta_mp_id: mpMovement?.cuenta_mp_id ?? null,
      p_reservation_id: origen !== "ninguno" ? origen : null,
      p_reservation_payment_id: pagoId !== "ninguno" ? pagoId : null,
    } as any);
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
            Registra un reintegro real al alumno. En la cuenta corriente se muestra como salida que consume el
            saldo a favor: no genera un nuevo crédito.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          {mpMovement && (
            <div className="rounded-md border border-orange-500/30 bg-orange-500/5 p-3 text-xs space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Egreso Mercado Pago</span>
                <span className="font-bold text-orange-400">- {formatPrice(Math.abs(Number(mpMovement.amount)), mpMovement.currency)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Fecha</span>
                <span>{new Date(mpMovement.fecha_movimiento).toLocaleString("es-AR")}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Cuenta de salida</span>
                <span>{mpMovement.cuenta_nombre ?? "Mercado Pago"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Nº operación MP</span>
                <span className="font-mono">{mpMovement.mp_payment_id}</span></div>
              {mpMovement.medio && (
                <div className="flex justify-between"><span className="text-muted-foreground">Medio informado por MP</span>
                  <span>{mpMovement.medio}</span></div>
              )}
            </div>
          )}

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

          {alumno && (
            <div className="space-y-1.5">
              <Label className="text-xs">Origen de la devolución</Label>
              {loadingOrigenes ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Buscando reservas con pagos…
                </div>
              ) : (
                <Select value={origen} onValueChange={(v) => { setOrigen(v); setPagoId("ninguno"); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ninguno">Sin origen específico</SelectItem>
                    {origenes.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.event_title} · pagado {formatPrice(r.pagado, r.currency)}
                        {r.estado ? ` · ${r.estado}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {reservaSel && (
                <div className="rounded-md border p-2 text-[11px] space-y-1 bg-muted/20">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{reservaSel.event_title}</span>
                    {reservaSel.estado && <Badge variant="outline" className="text-[10px]">{reservaSel.estado}</Badge>}
                  </div>
                  <div className="text-muted-foreground">
                    Total {reservaSel.total != null ? formatPrice(Number(reservaSel.total), reservaSel.currency) : "—"} ·
                    {" "}pagado histórico {formatPrice(reservaSel.pagado, reservaSel.currency)}
                  </div>
                  <div className="space-y-1 pt-1">
                    <Label className="text-[11px]">Pago original (opcional)</Label>
                    <Select value={pagoId} onValueChange={setPagoId}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ninguno">Sin pago específico</SelectItem>
                        {reservaSel.pagos.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.payment_date?.substring(0, 10)} · {formatPrice(Number(p.amount), p.currency)} · {p.payment_method ?? "—"}
                            {p.payment_reference ? ` · ${p.payment_reference}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Monto</Label>
              <Input type="number" min="0" step="0.01" value={monto} disabled={bloqueado}
                onChange={(e) => setMonto(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Moneda</Label>
              <Select value={moneda} onValueChange={setMoneda} disabled={bloqueado}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONEDAS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Medio de la devolución</Label>
              <Select value={metodo} onValueChange={setMetodo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {METODOS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
              {bloqueado && (
                <p className="text-[10px] text-muted-foreground">
                  Cuenta de salida: {mpMovement?.cuenta_nombre ?? "Mercado Pago"} (viene del movimiento)
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Fecha</Label>
              <Input type="date" value={fecha} disabled={bloqueado} onChange={(e) => setFecha(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">
              {bloqueado ? "Nº operación MP" : "Referencia / comprobante"}
            </Label>
            <Input value={referencia} disabled={bloqueado} onChange={(e) => setReferencia(e.target.value)}
              placeholder="N° de operación, recibo, etc." />
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
