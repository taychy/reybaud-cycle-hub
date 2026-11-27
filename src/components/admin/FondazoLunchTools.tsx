import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { GuestCategory, Prices } from "@/lib/fondazoAdmin";
import {
  CATEGORY_LABELS, COVERAGE_LABELS, buildDiners, evaluateCoverage, pricesConfirmed, priceOf,
  validateGuestEdit, validatePaymentDraft, verifyExistingBlocker, countsOf, type DinerSource, type GuestDraft, type LunchPayment,
} from "@/lib/fondazoLunch";

export type LunchToolRow = DinerSource & { id: string; lunch_status: string; receipt_reference: string | null; lunch_payments?: LunchPayment[] };

const ars = (n: number) => `$${n.toLocaleString("es-AR")}`;
const rpc = supabase as unknown as { rpc: (n: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> };
export const activePayments = (r: LunchToolRow) => (r.lunch_payments || []).filter((p) => !p.voided_at);

/** Detalle por persona, con importe por categoría y comprobantes registrados. */
export function LunchDinersDetail({ row, prices, onVoid }: { row: LunchToolRow; prices: Prices | null; onVoid: (p: LunchPayment) => void }) {
  const diners = buildDiners(row);
  const cov = evaluateCoverage(diners, activePayments(row), prices);
  const ok = pricesConfirmed(prices);
  return <div className="space-y-2">
    <ul className="space-y-1">{diners.map((d) => <li key={d.key} className="flex justify-between gap-2">
      <span>{d.name} · {d.role === "titular" ? "Titular" : d.role === "ciclista" ? "Amigo ciclista" : "Acompañante"} · {CATEGORY_LABELS[d.category]}{cov.coveredKeys.has(d.key) ? " · cubierto por comprobante" : ""}</span>
      <span className="shrink-0">{ok ? ars(priceOf(prices, d.category)) : "—"}</span>
    </li>)}</ul>
    <div className="font-medium">Total previsto: {cov.expected == null ? "sin conciliar (tarifas no confirmadas)" : ars(cov.expected)}</div>
    {(row.lunch_payments || []).map((p) => <div key={p.id} className={`rounded border p-2 ${p.voided_at ? "opacity-60 line-through" : ""}`}>
      Comprobante {ars(Number(p.amount_ars))} · ref. {p.bank_reference} · cubre: {p.covered.map((c) => c.name).join("; ")}
      <div className="text-muted-foreground no-underline">{new Date(p.created_at).toLocaleString("es-AR")} · {p.comment}{p.voided_at ? ` · Anulado: ${p.void_reason}` : ""}</div>
      {!p.voided_at && row.lunch_status !== "pago_verificado" && <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => onVoid(p)}>Anular comprobante</Button>}
    </div>)}
    {!!activePayments(row).length && <div className={cov.canVerify ? "text-accent" : "text-destructive"}>
      {COVERAGE_LABELS[cov.status]} · registrado {ars(cov.registered)}{cov.uncovered.length ? ` · sin cubrir: ${cov.uncovered.map((d) => d.name).join("; ")}` : ""}
    </div>}
  </div>;
}

export function GuestEditDialog({ row, onClose, onDone }: { row: LunchToolRow | null; onClose: () => void; onDone: () => Promise<void> }) {
  const { toast } = useToast();
  const [guests, setGuests] = useState<GuestDraft[]>([]);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setGuests((row?.non_cyclist_guests || []).map((g) => ({ ...g }))); setReason(""); }, [row]);
  if (!row) return null;
  const cyLunch = (row.cyclist_guests || []).filter((c) => c.lunch).length;
  const error = validateGuestEdit(row, guests, reason, activePayments(row).length > 0);
  const after = countsOf(guests, cyLunch);
  const save = async () => {
    setBusy(true);
    try {
      const { error: e } = await rpc.rpc("admin_edit_event_rsvp_lunch_guests", {
        p_invite_id: row.id, p_non_cyclists: guests.map((g) => ({ name: g.name.trim().replace(/\s+/g, " "), category: g.category })), p_reason: reason,
      });
      if (e) throw new Error(e.message);
      toast({ title: "Acompañantes actualizados con auditoría" });
      onClose(); await onDone();
    } catch (e) {
      toast({ title: "No se guardó la corrección", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally { setBusy(false); }
  };
  return <Dialog open onOpenChange={(o) => !o && onClose()}>
    <DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Editar acompañantes</DialogTitle>
      <DialogDescription>Corrección administrativa de acompañantes no ciclistas. El titular y los amigos ciclistas no se modifican. No cambia la confirmación de asistencia ni las condiciones aceptadas.</DialogDescription></DialogHeader>
      <div className="text-sm">Titular: <strong>{buildDiners(row)[0].name}</strong> · Adulto</div>
      {(row.cyclist_guests || []).map((c, i) => <div key={i} className="text-xs text-muted-foreground">Amigo ciclista (sin cambios): {c.name}{c.lunch ? " · almuerza" : ""}</div>)}
      <div className="space-y-2">{guests.map((g, i) => <div key={i} className="flex flex-col sm:flex-row gap-2">
        <Input aria-label={`Nombre del acompañante ${i + 1}`} value={g.name} onChange={(e) => setGuests(guests.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} placeholder="Nombre y apellido" />
        <div className="flex gap-2"><Select value={g.category} onValueChange={(v) => setGuests(guests.map((x, j) => j === i ? { ...x, category: v as GuestCategory } : x))}>
          <SelectTrigger className="sm:w-36"><SelectValue /></SelectTrigger>
          <SelectContent>{(Object.keys(CATEGORY_LABELS) as GuestCategory[]).map((c) => <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>)}</SelectContent></Select>
          <Button variant="outline" size="icon" aria-label="Quitar acompañante" onClick={() => setGuests(guests.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button></div>
      </div>)}
        <Button variant="outline" size="sm" onClick={() => setGuests([...guests, { name: "", category: "adult" }])}><Plus className="h-4 w-4" /> Agregar acompañante</Button>
      </div>
      <p className="text-xs text-muted-foreground">Quedará: {after.adults} adulto(s), {after.children_4_9} de 4 a 9, {after.under_4} menor(es) de 4 · {after.guests_count} acompañante(s).</p>
      <div className="space-y-1"><Label htmlFor="guest-reason">Motivo obligatorio</Label><Textarea id="guest-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej.: faltaba el nombre de la acompañante, informado por WhatsApp" /></div>
      {error && reason.trim().length >= 3 && <p className="text-sm text-destructive">{error}</p>}
      <DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button><Button disabled={busy || !!error} onClick={save}>Guardar con auditoría</Button></DialogFooter>
    </DialogContent></Dialog>;
}

export function PaymentDialog({ row, prices, onClose, onDone }: { row: LunchToolRow | null; prices: Prices | null; onClose: () => void; onDone: () => Promise<void> }) {
  const { toast } = useToast();
  const diners = useMemo(() => (row ? buildDiners(row) : []), [row]);
  const payments = row ? activePayments(row) : [];
  const prevKeys = new Set(payments.flatMap((p) => p.covered.map((c) => c.key)));
  const [keys, setKeys] = useState<string[]>([]);
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!row) return;
    const prev = new Set(activePayments(row).flatMap((p) => p.covered.map((c) => c.key)));
    setKeys(buildDiners(row).filter((d) => !prev.has(d.key)).map((d) => d.key));
    setAmount(""); setReference(row.receipt_reference || ""); setComment("");
  }, [row]);
  if (!row) return null;
  const amountN = Number(amount.replace(/\./g, "").replace(",", "."));
  const selected = diners.filter((d) => keys.includes(d.key));
  const selExpected = pricesConfirmed(prices) ? selected.reduce((s, d) => s + priceOf(prices, d.category), 0) : null;
  const cov = evaluateCoverage(diners, payments, prices, { keys, amount: amountN || 0 });
  const base = { keys, amount: amountN, reference, comment };
  const errRegister = validatePaymentDraft(diners, payments, prices, { ...base, markVerified: false });
  const errVerify = validatePaymentDraft(diners, payments, prices, { ...base, markVerified: true });
  const save = async (markVerified: boolean) => {
    setBusy(true);
    try {
      const { error } = await rpc.rpc("admin_register_event_rsvp_lunch_payment", {
        p_invite_id: row.id, p_amount: amountN, p_bank_reference: reference, p_covered_keys: keys, p_comment: comment, p_mark_verified: markVerified,
      });
      if (error) throw new Error(error.message);
      toast({ title: markVerified ? "Pago verificado con auditoría" : "Comprobante registrado · pendiente de verificación total" });
      onClose(); await onDone();
    } catch (e) {
      toast({ title: "No se registró el comprobante", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally { setBusy(false); }
  };
  return <Dialog open onOpenChange={(o) => !o && onClose()}>
    <DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Registrar comprobante de almuerzo</DialogTitle>
      <DialogDescription>{buildDiners(row)[0].name}. Marcá a quiénes cubre este comprobante. Solo se verifica el grupo si cubre a todos y el importe coincide con la tarifa confirmada.</DialogDescription></DialogHeader>
      <div className="space-y-2">{diners.map((d) => {
        const already = prevKeys.has(d.key);
        return <label key={d.key} className="flex items-center justify-between gap-2 rounded border p-2 text-sm">
          <span className="flex items-center gap-2"><Checkbox disabled={already} checked={already || keys.includes(d.key)} onCheckedChange={(c) => setKeys(c ? [...keys, d.key] : keys.filter((k) => k !== d.key))} />
            {d.name} · {CATEGORY_LABELS[d.category]}{already ? " · ya cubierto" : ""}</span>
          <span>{pricesConfirmed(prices) ? ars(priceOf(prices, d.category)) : "—"}</span>
        </label>;
      })}</div>
      <p className="text-xs">Importe según tarifa para lo seleccionado: <strong>{selExpected == null ? "sin conciliar" : ars(selExpected)}</strong> · total del grupo {cov.expected == null ? "sin conciliar" : ars(cov.expected)}</p>
      <div className="grid sm:grid-cols-2 gap-2">
        <div><Label htmlFor="pay-amount">Monto del comprobante ARS</Label><Input id="pay-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="80000" /></div>
        <div><Label htmlFor="pay-ref">Referencia bancaria</Label><Input id="pay-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="N.º de operación y fecha" /></div>
      </div>
      <p className="text-xs text-muted-foreground">No ingreses CBU, CUIT ni teléfonos: la referencia aparece en el reporte para el restaurante.</p>
      <div><Label htmlFor="pay-comment">Comentario obligatorio</Label><Textarea id="pay-comment" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Ej.: cotejado con el restaurante" /></div>
      {amountN > 0 && <p className={`text-sm ${cov.canVerify ? "text-accent" : "text-destructive"}`}>{COVERAGE_LABELS[cov.status]}{cov.uncovered.length ? ` · sin cubrir: ${cov.uncovered.map((d) => d.name).join("; ")}` : ""}{cov.status === "monto_no_coincide" && cov.expected != null ? ` · registrado ${ars(cov.registered)} vs ${ars(cov.expected)}` : ""}</p>}
      <DialogFooter className="gap-2"><Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button variant="secondary" disabled={busy || !!errRegister} onClick={() => save(false)}>Registrar sin verificar</Button>
        <Button disabled={busy || !!errVerify} onClick={() => save(true)} title={errVerify || undefined}>Registrar y verificar pago</Button></DialogFooter>
    </DialogContent></Dialog>;
}

export function VoidPaymentDialog({ payment, onClose, onDone }: { payment: LunchPayment | null; onClose: () => void; onDone: () => Promise<void> }) {
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => setReason(""), [payment]);
  if (!payment) return null;
  const save = async () => {
    setBusy(true);
    try {
      const { error } = await rpc.rpc("admin_void_event_rsvp_lunch_payment", { p_payment_id: payment.id, p_reason: reason });
      if (error) throw new Error(error.message);
      toast({ title: "Comprobante anulado con auditoría" }); onClose(); await onDone();
    } catch (e) {
      toast({ title: "No se anuló", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally { setBusy(false); }
  };
  return <Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent><DialogHeader><DialogTitle>Anular comprobante</DialogTitle>
    <DialogDescription>{ars(Number(payment.amount_ars))} · ref. {payment.bank_reference}. Queda en el historial; no se borra.</DialogDescription></DialogHeader>
    <Label htmlFor="void-reason">Motivo obligatorio</Label><Textarea id="void-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
    <DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button><Button variant="destructive" disabled={busy || reason.trim().length < 3} onClick={save}>Anular</Button></DialogFooter>
  </DialogContent></Dialog>;
}

export function VerifyPaymentsDialog({ row, prices, onClose, onDone }: { row: LunchToolRow | null; prices: Prices | null; onClose: () => void; onDone: () => Promise<void> }) {
  const { toast } = useToast();
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => setComment(""), [row]);
  if (!row) return null;
  const diners = buildDiners(row); const payments = activePayments(row);
  const blocker = verifyExistingBlocker(row.lunch_status, diners, payments, prices);
  const cov = evaluateCoverage(diners, payments, prices);
  const save = async () => {
    setBusy(true);
    try {
      const { error } = await rpc.rpc("admin_verify_event_rsvp_lunch_payments", { p_invite_id: row.id, p_comment: comment });
      if (error) throw new Error(error.message);
      toast({ title: "Pago verificado con auditoría" }); onClose(); await onDone();
    } catch (e) {
      toast({ title: "No se verificó", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally { setBusy(false); }
  };
  return <Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent><DialogHeader><DialogTitle>Verificar pagos registrados</DialogTitle>
    <DialogDescription>{diners[0].name}. Se verifican los comprobantes ya cargados, sin agregar uno nuevo.</DialogDescription></DialogHeader>
    <ul className="text-sm space-y-1">{payments.map((p) => <li key={p.id}>{ars(Number(p.amount_ars))} · ref. {p.bank_reference} · cubre: {p.covered.map((c) => c.name).join("; ")}</li>)}</ul>
    <p className="text-sm">Registrado {ars(cov.registered)} · tarifa confirmada {cov.expected == null ? "sin conciliar" : ars(cov.expected)}</p>
    {blocker && <p className="text-sm text-destructive">{blocker}</p>}
    <Label htmlFor="verify-comment">Comentario obligatorio</Label><Textarea id="verify-comment" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Ej.: cotejado con La Carreta del Gato" />
    <DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button><Button disabled={busy || !!blocker || comment.trim().length < 3} onClick={save}>Verificar pago</Button></DialogFooter>
  </DialogContent></Dialog>;
}
