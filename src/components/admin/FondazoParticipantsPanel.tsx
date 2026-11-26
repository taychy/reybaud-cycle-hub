import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle, Download, MessageCircle, Search } from "lucide-react";
import {
  ATTENDANCE_LABELS, PAYMENT_LABELS, PELOTONES, PELOTON_LABELS, attendanceOf, diners, expectedLunchAmount, formatArs, holderOf,
  internalReport, matchesFilters, paymentOf, paymentWhatsApp, pelotonOf, restaurantReport,
  type AdminRow, type Attendance, type Filters, type HolderType, type PaymentState, type Peloton, type Prices,
} from "@/lib/fondazoAdmin";

const ATT = Object.keys(ATTENDANCE_LABELS) as Attendance[];
const PAY = Object.keys(PAYMENT_LABELS) as PaymentState[];
const HOLD: Record<HolderType, string> = { alumno: "Alumno", externo: "Invitado externo" };

const download = (name: string, csv: string) => {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

type Props = { rows: AdminRow[]; prices: Prices | null; busy: boolean; onSetPeloton: (row: AdminRow, peloton: Peloton, reason: string) => Promise<boolean> };

export default function FondazoParticipantsPanel({ rows, prices, busy, onSetPeloton }: Props) {
  const [params, setParams] = useSearchParams();
  const list = <T extends string>(key: string) => (params.get(key)?.split(",").filter(Boolean) || []) as T[];
  const filters: Filters = { q: params.get("fz_q") || "", attendance: list("fz_att"), payment: list("fz_pay"), peloton: list("fz_pel"), holder: list("fz_hold") };
  const setParam = (key: string, value: string) => setParams((p) => { const n = new URLSearchParams(p); if (value) n.set(key, value); else n.delete(key); return n; }, { replace: true });
  const toggle = (key: string, value: string) => { const cur = params.get(key)?.split(",").filter(Boolean) || []; setParam(key, (cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value]).join(",")); };
  const [edit, setEdit] = useState<{ row: AdminRow; peloton: Peloton } | null>(null);
  const [reason, setReason] = useState("");

  const filtered = useMemo(() => rows.filter((r) => matchesFilters(r, filters)), [rows, params]);
  const count = <T,>(fn: (r: AdminRow) => T, v: T) => [filtered.filter((r) => fn(r) === v).length, rows.filter((r) => fn(r) === v).length];
  const sums = useMemo(() => {
    let expected = 0, verified = 0, unreconciled = 0;
    filtered.forEach((r) => { const a = expectedLunchAmount(r, prices); if (a == null) unreconciled++; else { expected += a; if (paymentOf(r) === "pago_verificado") verified += a; } });
    return { expected, verified, unreconciled };
  }, [filtered, prices]);
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");

  const chips = <T extends string>(key: string, values: T[], labels: Record<T, string>, fn: (r: AdminRow) => T) => (
    <div className="flex flex-wrap gap-1">{values.map((v) => {
      const [f, t] = count(fn, v); const on = (params.get(key)?.split(",") || []).includes(v);
      return <Button key={v} type="button" size="sm" variant={on ? "default" : "outline"} className="h-7 text-xs" onClick={() => toggle(key, v)} aria-pressed={on}>
        {labels[v]} <span className="ml-1 opacity-70">{f}/{t}</span></Button>;
    })}</div>);

  return <div className="space-y-3">
    <div className="relative"><Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
      <Input className="pl-8" placeholder="Buscar por nombre, email o WhatsApp" value={filters.q} onChange={(e) => setParam("fz_q", e.target.value)} aria-label="Buscar participante" /></div>
    <div className="space-y-2 text-xs">
      <div><div className="font-semibold mb-1">Asistencia</div>{chips("fz_att", ATT, ATTENDANCE_LABELS, attendanceOf)}</div>
      <div><div className="font-semibold mb-1">Pago parrilla</div>{chips("fz_pay", PAY, PAYMENT_LABELS, paymentOf)}</div>
      <div><div className="font-semibold mb-1">Pelotón</div>{chips("fz_pel", PELOTONES, PELOTON_LABELS, pelotonOf)}</div>
      <div><div className="font-semibold mb-1">Titular</div>{chips("fz_hold", ["alumno", "externo"] as HolderType[], HOLD, holderOf)}</div>
      <p className="text-muted-foreground">Cada botón muestra filtrados/total. Los filtros se combinan entre grupos.</p>
    </div>
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
      <div className="border rounded-lg p-2"><div className="text-xs text-muted-foreground">Mostrando</div><strong>{filtered.length} de {rows.length}</strong></div>
      <div className="border rounded-lg p-2"><div className="text-xs text-muted-foreground">Parrilla prevista</div><strong>{formatArs(sums.expected)}</strong></div>
      <div className="border rounded-lg p-2"><div className="text-xs text-muted-foreground">Pago verificado</div><strong>{formatArs(sums.verified)}</strong></div>
      <div className="border rounded-lg p-2"><div className="text-xs text-muted-foreground">Sin conciliar</div><strong>{sums.unreconciled}</strong></div>
    </div>
    <p className="text-xs text-muted-foreground">La parrilla se paga al restaurante. El fondo de invitados ciclistas ($30.000, previa aprobación de Claudio) no se suma acá.</p>
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" onClick={() => download(`fondazo-interno-${stamp}.csv`, internalReport(filtered, prices))}><Download className="h-4 w-4" /> Reporte interno (filtros actuales)</Button>
      <Button size="sm" variant="outline" onClick={() => download(`fondazo-restaurante-${stamp}.csv`, restaurantReport(rows, prices))}><Download className="h-4 w-4" /> Para restaurante</Button>
    </div>
    <div className="border rounded-lg divide-y">{filtered.map((r) => {
      const pay = paymentOf(r); const pel = pelotonOf(r); const amount = expectedLunchAmount(r, prices); const wa = paymentWhatsApp(r, prices); const d = diners(r);
      return <div key={r.id} className="p-3 text-sm space-y-1">
        <div className="flex flex-wrap justify-between gap-2"><div className="min-w-0"><div className="font-medium truncate">{r.recipient_name || r.recipient_email}</div>
          <div className="text-xs text-muted-foreground truncate">{r.recipient_email}</div></div>
          <div className="flex flex-wrap gap-1 items-start"><Badge variant="secondary">{ATTENDANCE_LABELS[attendanceOf(r)]}</Badge><Badge variant="outline">{HOLD[holderOf(r)]}</Badge>
            <Badge variant={pay === "pago_verificado" ? "default" : "outline"}>{PAYMENT_LABELS[pay]}</Badge></div></div>
        {pay !== "no_aplica" && <div className="text-xs">Comensales: {d.adults} adulto(s), {d.children_4_9} de 4–9, {d.under_4} menor(es) de 4 · Monto previsto: {amount == null ? "sin conciliar" : formatArs(amount)}{r.receipt_reference ? ` · Ref: ${r.receipt_reference}` : ""}</div>}
        {!!r.cyclist_guests?.length && <div className="text-xs text-primary">Invita a {r.cyclist_guests.length} ciclista(s): sin pelotón hasta aprobación de Claudio.</div>}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-xs">Pelotón: <strong>{PELOTON_LABELS[pel]}</strong>{r.peloton_override ? " (manual)" : r.alumno_id ? ` (grupo ${r.alumno_grupo || "—"})` : ""}</span>
          {pel === "sin_asignar" && r.response === "voy" && r.participation_mode !== "solo_almuerzo" && <span className="text-xs text-amber-500 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Sin pelotón asignado</span>}
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setEdit({ row: r, peloton: pel }); setReason(""); }}>Cambiar pelotón</Button>
          {pay === "pendiente" && (wa.ok
            ? <Button asChild size="sm" variant="outline" className="h-7 text-xs"><a href={wa.url} target="_blank" rel="noopener noreferrer"><MessageCircle className="h-3 w-3" /> WhatsApp · solicitar pago</a></Button>
            : <Button size="sm" variant="outline" className="h-7 text-xs" disabled title={"reason" in wa ? wa.reason : ""}><MessageCircle className="h-3 w-3" /> {"reason" in wa ? wa.reason : ""}</Button>)}
        </div>
      </div>;
    })}{!filtered.length && <p className="p-3 text-sm text-muted-foreground">Ningún participante coincide con los filtros.</p>}</div>
    <p className="text-xs text-muted-foreground">Abrir WhatsApp no envía nada ni marca el pago; el estado se cambia en la pestaña Almuerzo con comprobante.</p>

    <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
      <DialogContent><DialogHeader><DialogTitle>Pelotón para el Fondazo</DialogTitle>
        <DialogDescription>{edit?.row.recipient_name}. Solo para este evento: no cambia el grupo del alumno. Queda registrado quién, cuándo y el motivo.</DialogDescription></DialogHeader>
        <Select value={edit?.peloton} onValueChange={(v) => edit && setEdit({ ...edit, peloton: v as Peloton })}><SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{PELOTONES.map((p) => <SelectItem key={p} value={p}>{PELOTON_LABELS[p]}</SelectItem>)}</SelectContent></Select>
        <div className="space-y-1"><Label htmlFor="peloton-reason">Motivo obligatorio</Label><Textarea id="peloton-reason" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        <DialogFooter><Button variant="outline" onClick={() => setEdit(null)}>Cancelar</Button>
          <Button disabled={busy || reason.trim().length < 3} onClick={async () => { if (edit && await onSetPeloton(edit.row, edit.peloton, reason.trim())) setEdit(null); }}>Guardar con auditoría</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
