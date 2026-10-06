import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { formatPrice } from "@/lib/currency";
import { useToast } from "@/hooks/use-toast";
import { getPaymentProofSignedUrl } from "@/lib/paymentProofs";
import {
  validateTransferAgreement, transferModeLabel, transferExecutionLabel, canCompleteTransfer, type TransferMode,
} from "@/lib/transferAgreement";

interface Props {
  transfer: any;
  currency: string;
  onChanged: () => void;
  originalHolderName?: string;
}

export default function TransferAgreementPanel({ transfer: t, currency, onChanged, originalHolderName }: Props) {
  const { toast } = useToast();
  const [mode, setMode] = useState<TransferMode>("direct_to_original");
  const [direct, setDirect] = useState("");
  const [rey, setRey] = useState("");
  const [refund, setRefund] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<any>(null);
  const [directRows, setDirectRows] = useState<any[]>([]);
  const [refundState, setRefundState] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [dpAmount, setDpAmount] = useState("");
  const [dpDate, setDpDate] = useState("");
  const [dpNotes, setDpNotes] = useState("");
  const [dpFile, setDpFile] = useState<File | null>(null);
  const fmt = (n: number) => formatPrice(n, currency);
  const defined = !!t.agreement_defined_at;
  const holder = originalHolderName || "titular original";

  const input = { mode, direct: Number(direct || 0), toReybaud: Number(rey || 0), refund: Number(refund || 0), originalPaid: Number(t.original_paid_amount || 0) };
  const errors = validateTransferAgreement(input);

  const loadExec = useCallback(async () => {
    if (!t.replacement_reservation_id) return;
    const [{ data: s }, { data: rows }, { data: ob }] = await Promise.all([
      supabase.rpc("reservation_effective_payment_summary" as any, { p_reservation_id: t.replacement_reservation_id }),
      supabase.from("reservation_transfer_direct_payments" as any).select("*").eq("transfer_id", t.id).order("paid_at"),
      supabase.from("reservation_refund_obligations").select("estado").eq("reservation_id", t.original_reservation_id).maybeSingle(),
    ]);
    setSummary(s);
    setDirectRows((rows as any[]) || []);
    setRefundState((ob as any)?.estado ?? null);
  }, [t.id, t.replacement_reservation_id, t.original_reservation_id]);
  useEffect(() => { loadExec(); }, [loadExec, t.status]);

  const run = async (fn: string, args: any, ok: string) => {
    setBusy(true);
    const { error } = await supabase.rpc(fn as any, args);
    setBusy(false);
    if (error) { toast({ title: "No se pudo guardar", description: error.message, variant: "destructive" }); return false; }
    toast({ title: ok });
    onChanged();
    loadExec();
    return true;
  };

  const directAgreed = Number(t.direct_payment_amount || 0);
  const directConfirmed = Number(summary?.direct_external_confirmed || 0);
  const paidRey = Number(summary?.paid_to_reybaud_real || 0);
  const effBal = Number(summary?.effective_balance ?? 0);
  const exec = {
    status: t.status, agreementDefined: defined, mode: t.payment_mode, directAgreed,
    directConfirmed, effectiveBalance: effBal, paidToReybaud: paidRey,
  };
  const refundRequired = Number(t.reybaud_refund_amount || 0) > 0;
  const canClose = summary && canCompleteTransfer(exec, refundState === "completada", refundRequired);
  const allowsDirect = t.payment_mode === "direct_to_original" || t.payment_mode === "mixed";

  const registerDirect = async () => {
    const amt = Number(dpAmount || 0);
    if (!(amt > 0) || !dpDate) { toast({ title: "Completá importe y fecha", variant: "destructive" }); return; }
    if (directConfirmed + amt > directAgreed) { toast({ title: "Supera el monto directo acordado", variant: "destructive" }); return; }
    setBusy(true);
    let proofPath: string | null = null;
    if (dpFile) {
      const ext = dpFile.name.split(".").pop() || "bin";
      const path = `transfer-direct/${t.id}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("payment-proofs").upload(path, dpFile);
      if (error) { setBusy(false); toast({ title: "No se pudo subir el comprobante", description: error.message, variant: "destructive" }); return; }
      proofPath = path;
    }
    setBusy(false);
    const ok = await run("register_reservation_transfer_direct_payment", {
      p_transfer_id: t.id, p_amount: amt, p_paid_at: dpDate, p_proof_path: proofPath, p_notes: dpNotes || null,
    }, "Pago directo registrado");
    if (ok) { setShowForm(false); setDpAmount(""); setDpDate(""); setDpNotes(""); setDpFile(null); }
  };

  const voidDirect = async (id: string) => {
    const reason = window.prompt("Motivo de anulación");
    if (!reason?.trim()) return;
    await run("void_reservation_transfer_direct_payment", { p_direct_payment_id: id, p_reason: reason }, "Pago directo anulado");
  };

  const openProof = async (path: string) => {
    const url = await getPaymentProofSignedUrl(path);
    if (url) window.open(url, "_blank");
  };

  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">Acuerdo de pago de transferencia</p>
        <Badge variant="outline">{transferExecutionLabel(exec)}</Badge>
      </div>
      <div className="text-xs space-y-1 text-muted-foreground">
        <p>Pago histórico del titular original (solo lectura): <span className="text-foreground">{fmt(Number(t.original_paid_amount || 0))}</span></p>
        <p>Seña cobrada al reemplazante: <span className="text-foreground">{fmt(Number(t.deposit_amount || 0))}</span></p>
        <p>Cliente contactado: {t.admin_contacted_at ? new Date(t.admin_contacted_at).toLocaleString("es-AR") : "No"}</p>
      </div>

      {defined ? (
        <>
          <div className="text-sm space-y-1 rounded bg-muted/30 p-2">
            <p className="text-xs font-medium text-muted-foreground">Acuerdo de referencia — no modifica saldos hasta registrar los pagos realizados.</p>
            <p>Modalidad: <strong>{transferModeLabel(t.payment_mode)}</strong></p>
            <p>Previsto directo entre participantes: {fmt(directAgreed)}</p>
            <p>Previsto a Reybaud: {fmt(Number(t.amount_to_reybaud || 0))}</p>
            <p>Devolución prevista de Reybaud: {fmt(Number(t.reybaud_refund_amount || 0))}{refundRequired && <span className="text-muted-foreground"> (estado: {refundState || "sin obligación"})</span>}</p>
            {t.notes && <p className="text-muted-foreground">Notas: {t.notes}</p>}
          </div>

          <div className="space-y-3">
            <p className="text-sm font-semibold">PAGOS REALIZADOS</p>

            {allowsDirect && (
              <div className="space-y-2 rounded border border-border p-2">
                <p className="text-xs font-semibold">A) Pago directo entre participantes</p>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <p>Acordado: <strong>{fmt(directAgreed)}</strong></p>
                  <p>Confirmado: <strong>{fmt(directConfirmed)}</strong></p>
                  <p>Pendiente: <strong>{fmt(Math.max(directAgreed - directConfirmed, 0))}</strong></p>
                </div>
                <p className="text-[11px] text-muted-foreground">Este pago fue recibido por {holder}. Caja Reybaud: $0. Sin conciliación bancaria/MP en Reybaud.</p>
                {directRows.length > 0 && (
                  <ul className="text-xs space-y-1">
                    {directRows.map((d) => (
                      <li key={d.id} className={`flex flex-wrap items-center gap-2 ${d.status === "voided" ? "line-through text-muted-foreground" : ""}`}>
                        <span>{d.paid_at}</span><span>{fmt(Number(d.amount))}</span>
                        {d.proof_path && <button className="underline" onClick={() => openProof(d.proof_path)}>Comprobante</button>}
                        <span className="text-muted-foreground">cargado {new Date(d.created_at).toLocaleDateString("es-AR")}</span>
                        {d.notes && <span className="text-muted-foreground">· {d.notes}</span>}
                        {d.status === "voided"
                          ? <span className="no-underline">Anulado: {d.void_reason}</span>
                          : t.status !== "completed" && <Button size="sm" variant="ghost" className="h-6 px-2" disabled={busy} onClick={() => voidDirect(d.id)}>Anular</Button>}
                      </li>
                    ))}
                  </ul>
                )}
                {t.status !== "completed" && directConfirmed < directAgreed && (
                  showForm ? (
                    <div className="space-y-2">
                      <label className="block text-xs">Importe<Input type="number" min={0} value={dpAmount} onChange={(e) => setDpAmount(e.target.value)} /></label>
                      <label className="block text-xs">Fecha del pago<Input type="date" value={dpDate} onChange={(e) => setDpDate(e.target.value)} /></label>
                      <label className="block text-xs">Comprobante<Input type="file" accept="image/*,application/pdf" onChange={(e) => setDpFile(e.target.files?.[0] || null)} /></label>
                      <Textarea placeholder="Notas" value={dpNotes} onChange={(e) => setDpNotes(e.target.value)} />
                      <div className="flex gap-2">
                        <Button size="sm" disabled={busy} onClick={registerDirect}>Guardar pago directo</Button>
                        <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
                      </div>
                    </div>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => setShowForm(true)}>Registrar pago directo a {holder}</Button>
                  )
                )}
              </div>
            )}

            <div className="space-y-1 rounded border border-border p-2 text-xs">
              <p className="font-semibold">B) Pago a Reybaud</p>
              <p>Acordado a Reybaud (referencia): <strong>{fmt(Number(t.amount_to_reybaud || 0))}</strong></p>
              <p>Pagado real a Reybaud (pagos validados): <strong>{fmt(paidRey)}</strong></p>
              <p className="text-muted-foreground">Los pagos a Reybaud se registran y validan en la sección de pagos de la reserva reemplazante.</p>
            </div>

            <div className="rounded bg-muted/30 p-2 text-xs">
              <p>Total contractual reemplazante: {fmt(Number(summary?.contractual_total || 0))}</p>
              <p>Aplicado (real Reybaud + directo confirmado): {fmt(Number(summary?.total_applied || 0))}</p>
              <p className="font-semibold">Saldo efectivo pendiente: {fmt(effBal)}</p>
            </div>
          </div>

          {t.status !== "completed" && (
            <Button size="sm" disabled={busy || !canClose} onClick={() => run("complete_reservation_transfer", { p_transfer_id: t.id }, "Transferencia completada")}>
              Cerrar transferencia
            </Button>
          )}
          {t.status !== "completed" && !canClose && (
            <p className="text-[11px] text-muted-foreground">Se habilita cuando el pago directo, los pagos reales a Reybaud y cualquier devolución estén cumplidos (saldo efectivo $0).</p>
          )}
        </>
      ) : (
        <div className="space-y-2">
          {!t.admin_contacted_at && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => run("mark_reservation_transfer_contacted", { p_transfer_id: t.id }, "Marcado como contactado")}>
              Marcar cliente contactado
            </Button>
          )}
          <p className="text-xs text-muted-foreground">Acuerdo de referencia — no modifica saldos hasta registrar los pagos realizados.</p>
          <select className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm" value={mode} onChange={(e) => setMode(e.target.value as TransferMode)}>
            <option value="direct_to_original">Pago directo al titular anterior</option>
            <option value="reybaud">Pago a Reybaud</option>
            <option value="mixed">Mixto</option>
          </select>
          {mode !== "reybaud" && (
            <label className="block text-xs">Monto previsto que el nuevo comprador paga directamente al titular anterior
              <Input type="number" min={0} value={direct} onChange={(e) => setDirect(e.target.value)} />
            </label>
          )}
          <label className="block text-xs">Monto previsto a pagar a Reybaud
            <Input type="number" min={0} value={rey} onChange={(e) => setRey(e.target.value)} />
          </label>
          {mode !== "direct_to_original" && (
            <label className="block text-xs">Monto que Reybaud debe devolver al titular anterior
              <Input type="number" min={0} value={refund} onChange={(e) => setRefund(e.target.value)} />
            </label>
          )}
          <Textarea placeholder="Notas" value={notes} onChange={(e) => setNotes(e.target.value)} />
          {errors.length > 0 && <ul className="text-xs text-destructive list-disc pl-4">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
          <Button size="sm" disabled={busy || errors.length > 0 || !t.replacement_reservation_id}
            onClick={() => run("define_reservation_transfer_payment_agreement", {
              p_transfer_id: t.id, p_payment_mode: mode,
              p_direct_payment_amount: mode === "reybaud" ? 0 : input.direct,
              p_amount_to_reybaud: input.toReybaud,
              p_reybaud_refund_amount: mode === "direct_to_original" ? 0 : input.refund,
              p_notes: notes || null, p_admin_contacted: false,
            }, "Acuerdo guardado")}>
            Guardar acuerdo
          </Button>
        </div>
      )}
    </div>
  );
}

/** Ficha del titular original: cuánto recibió directamente del reemplazante (no es devolución de Reybaud). */
export function OriginalDirectReceived({ reservationId, currency }: { reservationId: string; currency: string }) {
  const [amt, setAmt] = useState<number | null>(null);
  useEffect(() => {
    supabase.rpc("reservation_effective_payment_summary" as any, { p_reservation_id: reservationId })
      .then(({ data }) => setAmt(Number((data as any)?.direct_received_as_original || 0)));
  }, [reservationId]);
  if (amt == null) return null;
  return <p className="text-xs">Recibido directamente del reemplazante (confirmado): <strong>{formatPrice(amt, currency)}</strong> <span className="text-muted-foreground">(no es devolución de Reybaud · caja $0)</span></p>;
}
