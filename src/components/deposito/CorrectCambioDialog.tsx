import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { correctionBaseline, correctionChanges, correctionFields, correctionLabels, correctionStage, validateCorrection, type CorrectionData } from "@/lib/storeCambioCorrection";

type Product = { id: string; name: string; variants: any };
type Props = { cambio: any; onClose: () => void; onSaved: () => void };

export function CambioCorrectionAccess({ cambio, onSaved }: { cambio: any; onSaved: () => void }) {
  const [allowed, setAllowed] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => { let alive = true; void supabase.rpc("can_correct_store_cambio").then(({ data }) => { if (alive) setAllowed(data === true); }); return () => { alive = false; }; }, []);
  if (!allowed || cambio.tipo !== "cambio") return null;
  return <><Button size="sm" variant="outline" onClick={() => setOpen(true)}>Corregir registro</Button>{open && <CorrectCambioDialog cambio={cambio} onClose={() => setOpen(false)} onSaved={onSaved} />}</>;
}

export default function CorrectCambioDialog({ cambio, onClose, onSaved }: Props) {
  const [current, setCurrent] = useState<any>(null);
  const [draft, setDraft] = useState<CorrectionData>({});
  const [products, setProducts] = useState<Product[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [mode, setMode] = useState<"administrativa" | "stock">("administrativa");
  const [source, setSource] = useState("");
  const [target, setTarget] = useState("");
  const [variant, setVariant] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [requestId] = useState(() => crypto.randomUUID());
  const [loadError, setLoadError] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [row, ps, hs, ms] = await Promise.all([
        supabase.from("store_cambios").select("*").eq("id", cambio.id).single(),
        supabase.from("store_products").select("id,name,variants").order("name"),
        supabase.from("store_cambio_corrections").select("*").eq("cambio_id", cambio.id).order("created_at", { ascending: false }),
        supabase.from("stock_movements").select("*").eq("cambio_id", cambio.id).order("created_at"),
      ]);
      if (!alive) return;
      const error = row.error || ps.error || hs.error || ms.error;
      if (error) { setLoadError(error.message); return; }
      setCurrent(row.data); setDraft(correctionBaseline(row.data || {}));
      setProducts((ps.data || []) as Product[]); setHistory(hs.data || []); setMovements(ms.data || []);
    })();
    return () => { alive = false; };
  }, [cambio.id]);

  const baseline = useMemo(() => correctionBaseline(current || {}), [current]);
  const changes = correctionChanges(baseline, draft);
  const selectedMovement = movements.find(m => m.id === source);
  const textValue = (v: unknown) => {
    if (typeof v === "string") return products.find(p => p.id === v)?.name || v;
    return v == null ? "—" : JSON.stringify(v);
  };
  const productPicker = (value: string, change: (value: string) => void, label: string) => <Select value={value} onValueChange={change}><SelectTrigger aria-label={label}><SelectValue placeholder="Seleccionar producto" /></SelectTrigger><SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select>;
  const variantPicker = (productId: string, value: Record<string, string>, change: (value: Record<string, string>) => void, prefix: string) => {
    const specs = products.find(p => p.id === productId)?.variants;
    return <div className="grid grid-cols-2 gap-2">{(Array.isArray(specs) ? specs : []).map((spec: any) => <div key={spec.name}><Label>{spec.name}</Label><Select value={value[spec.name] || ""} onValueChange={v => change({ ...value, [spec.name]: v })}><SelectTrigger aria-label={`${prefix} ${spec.name}`}><SelectValue placeholder="Sin registrar" /></SelectTrigger><SelectContent>{(spec.options || []).map((o: string) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select></div>)}</div>;
  };
  const validate = () => {
    if (mode === "administrativa") return validateCorrection(baseline, draft, reason, true);
    if (!source || !target) return "Seleccioná el movimiento y la identidad física correcta.";
    if (!reason.trim()) return "Indicá el motivo del ajuste físico.";
    return null;
  };
  const save = async () => {
    if (!current || busy) return;
    const error = validate();
    if (error || !confirmed) { toast({ title: "Revisá la corrección", description: error || "Confirmá explícitamente.", variant: "destructive" }); return; }
    setBusy(true);
    const result = mode === "administrativa"
      ? await supabase.rpc("admin_correct_store_cambio", { p_cambio_id: current.id, p_patch: changes as any, p_reason: reason, p_confirm: confirmed, p_request_id: requestId, p_expected_updated_at: current.updated_at })
      : await supabase.rpc("admin_compensate_store_cambio", { p_cambio_id: current.id, p_source_id: source, p_product_id: target, p_variant: variant, p_reason: reason, p_confirm: confirmed, p_request_id: requestId, p_expected_updated_at: current.updated_at });
    setBusy(false);
    if (result.error) { toast({ title: "No se guardó", description: result.error.message, variant: "destructive" }); return; }
    // Read the persisted audit entry before reporting success.
    const receipt = await supabase.from("store_cambio_corrections").select("id").eq("request_id", requestId).single();
    if (receipt.error) { toast({ title: "Verificación pendiente", description: "No repitas con otra solicitud. Reabrí el detalle para comprobar el historial.", variant: "destructive" }); return; }
    toast({ title: mode === "administrativa" ? "Corrección registrada · sin stock" : "Compensación registrada", description: `Registro ${receipt.data.id}` });
    onSaved(); onClose();
  };

  return <Dialog open onOpenChange={v => { if (!v && !busy) onClose(); }}><DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>Corregir registro #{cambio.id.slice(0, 8)}</DialogTitle></DialogHeader>
    {loadError ? <p role="alert" className="text-destructive">{loadError}</p> : !current ? <p>Cargando registro…</p> : <div className="space-y-4">
      <p className="text-sm">{cambio.alumnos?.nombre} {cambio.alumnos?.apellido} · Estado histórico: <b>{current.estado}</b> · Cantidad: <b>1</b></p>
      <p className="text-xs text-muted-foreground">Pedido: {current.order_id || current.compra_id || "Sin referencia"} · Preventa: {current.preorder_id || "—"}</p>
      <p className="text-sm text-muted-foreground">{correctionStage(current)}</p>
      <div className="flex flex-wrap gap-2"><Button variant={mode === "administrativa" ? "default" : "outline"} disabled={review} onClick={() => setMode("administrativa")}>Datos administrativos · sin stock</Button><Button variant={mode === "stock" ? "default" : "outline"} disabled={review} onClick={() => setMode("stock")}>Ajuste físico · compensación</Button></div>
      {!review && mode === "administrativa" && <>
        <p className="text-sm text-muted-foreground">Los datos declarados quedan separados del original, la recepción y el reemplazo históricos. No cambian entregas, stock ni etiquetas.</p>
        {([ ["producto_id", "variante_origen", "Original"], ["producto_reemplazo_id", "variante_destino", "Reemplazo"] ] as const).map(([pk, vk, label]) => <div key={pk} className="space-y-2"><Label>{label} declarado</Label>{productPicker(String(draft[pk] || ""), v => setDraft({ ...draft, [pk]: v, [vk]: {} }), label)}{variantPicker(String(draft[pk] || ""), (draft[vk] || {}) as Record<string, string>, v => setDraft({ ...draft, [vk]: v }), label)}</div>)}
        <div><Label>Recepción declarada (no confirma ingreso físico)</Label><Select value={String(draft.recepcion_estado)} onValueChange={v => setDraft({ ...draft, recepcion_estado: v, recepcion_fecha: v === "pendiente" ? null : draft.recepcion_fecha })}><SelectTrigger aria-label="Recepción declarada"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pendiente">Pendiente</SelectItem><SelectItem value="recibida">Recibida</SelectItem></SelectContent></Select></div>
        {draft.recepcion_estado === "recibida" && <div><Label htmlFor="receipt-date">Fecha y hora declaradas (UTC)</Label><Input id="receipt-date" type="datetime-local" value={typeof draft.recepcion_fecha === "string" ? draft.recepcion_fecha.slice(0, 16) : ""} onChange={e => setDraft({ ...draft, recepcion_fecha: e.target.value ? `${e.target.value}:00Z` : null })} /></div>}
        <div><Label htmlFor="correction-comment">Comentario</Label><Textarea id="correction-comment" maxLength={4000} value={String(draft.comentario || "")} onChange={e => setDraft({ ...draft, comentario: e.target.value })} /></div>
        <div><Label htmlFor="correction-description">Descripción administrativa</Label><Textarea id="correction-description" maxLength={4000} value={String(draft.motivo_admin || "")} onChange={e => setDraft({ ...draft, motivo_admin: e.target.value })} /></div>
      </>}
      {!review && mode === "stock" && <>
        <p className="text-sm text-destructive">No es una corrección de texto. Se revierte una unidad del movimiento elegido y se registra la misma unidad con su identidad correcta. No altera la entrega histórica. Requiere comprobación física.</p>
        <Select value={source} onValueChange={v => { setSource(v); setTarget(""); setVariant({}); }}><SelectTrigger aria-label="Movimiento a compensar"><SelectValue placeholder="Movimiento original de stock" /></SelectTrigger><SelectContent>{movements.filter(m => ["cambio_in", "cambio_out"].includes(m.motivo) && m.cantidad === 1).map(m => <SelectItem key={m.id} value={m.id} disabled={history.some(h => h.source_movement_id === m.id) || movements.some(r => r.reversa_de_movimiento_id === m.id)}>{m.tipo} · {textValue(m.product_id)} · {m.variante || "sin variante"} · {m.id.slice(0, 8)}</SelectItem>)}</SelectContent></Select>
        {movements.length === 0 && <p className="text-muted-foreground">Sin movimiento verificable: no se puede compensar ni crear un ingreso desde aquí.</p>}
        <Label>Producto físico correcto</Label>{productPicker(target, v => { setTarget(v); setVariant({}); }, "Producto físico correcto")}{variantPicker(target, variant, setVariant, "Físico")}
      </>}
      {!review && <><Label htmlFor="correction-reason">Motivo obligatorio</Label><Textarea id="correction-reason" value={reason} onChange={e => setReason(e.target.value)} /><Button disabled={busy} onClick={() => { const error = validate(); if (error) toast({ title: "Revisá los datos", description: error, variant: "destructive" }); else { setConfirmed(false); setReview(true); } }}>Revisar antes y después</Button></>}
      {review && <div className="space-y-3"><h3 className="font-semibold">Antes → Después</h3>
        {mode === "administrativa" ? correctionFields.filter(k => k in changes).map(k => <div key={k} className="border-b border-border py-2 text-sm break-words"><b>{correctionLabels[k]}</b><p>{textValue(baseline[k])} → {textValue(draft[k])}</p></div>) : <div className="text-sm space-y-1 break-words"><p>Movimiento: {source}</p><p>{textValue(selectedMovement?.product_id)} · {selectedMovement?.variante || "Sin variante"} → {textValue(target)} · {textValue(variant)}</p><p>Reversa: {selectedMovement?.tipo === "ingreso" ? "−1" : "+1"} en origen · Registro correcto: {selectedMovement?.tipo === "ingreso" ? "+1" : "−1"} en destino.</p><p>Si falta stock para un egreso, no se registra ninguna parte.</p></div>}
        <p className="text-sm break-words"><b>Motivo:</b> {reason}</p>
        <div className="flex gap-2 items-start"><Checkbox id="confirm-correction" checked={confirmed} onCheckedChange={v => setConfirmed(v === true)} /><Label htmlFor="confirm-correction">{mode === "administrativa" ? "Confirmo esta corrección administrativa, sin modificar stock ni entregas." : "Verifiqué físicamente la discrepancia y autorizo los dos movimientos de compensación indicados."}</Label></div>
        <div className="flex gap-2"><Button variant="outline" disabled={busy} onClick={() => { setReview(false); setConfirmed(false); }}>Volver</Button><Button disabled={busy || !confirmed} onClick={save}>{busy ? "Registrando…" : mode === "administrativa" ? "Confirmar corrección sin stock" : "Confirmar compensación de stock"}</Button></div>
      </div>}
      <div className="border-t border-border pt-3 space-y-2"><h3 className="font-semibold">Historial inalterable de correcciones</h3>{history.length === 0 ? <p className="text-sm text-muted-foreground">Sin correcciones registradas.</p> : history.map(h => <div key={h.id} className="text-xs border-b border-border py-2 break-words"><b>{h.kind === "administrativa" ? "Sin stock" : "Compensación física"}</b> · {h.actor_label} · {new Date(h.created_at).toLocaleString("es-AR")}<p>Actor: {h.actor_id} · Registro: {h.id}</p><p>{h.reason}</p><details><summary>Antes / después</summary><pre className="whitespace-pre-wrap break-all">{JSON.stringify({ antes: h.before_data, despues: h.after_data }, null, 2)}</pre></details></div>)}</div>
    </div>}
  </DialogContent></Dialog>;
}