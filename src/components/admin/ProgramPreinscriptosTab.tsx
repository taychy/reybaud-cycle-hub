import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, RefreshCw, Eye, UserX, Undo2, Tag, Mail, RotateCcw, Copy, MessageCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { formatPrice } from "@/lib/currency";
import { normalizePhoneAr, buildWaLink, buildPreinscriptoWaMessage } from "@/lib/whatsappPreinscripto";
import {
  resolvePreinscriptoStatus, findSedeAnswer, PREINSCRIPTO_STATUS_LABEL, NO_CONTINUA_ENTRY_STATE,
  type PreinscriptoStatus, type PreinscriptoSub,
} from "@/lib/programPreinscriptos";

const sb: any = supabase;

/** Precio de preinscripción sugerido por plan (editable antes de asignar). */
const DEFAULT_PRICE: Record<string, { total: number; cuota: number; cuotas: number; hasta: string }> = {
  "fa1a2399-3904-4620-8156-9b43fd84806a": { total: 153000, cuota: 82500, cuotas: 2, hasta: "2026-10-16" },
};
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });

interface Row {
  entry_id: string;
  nombre: string;
  email: string;
  telefono: string | null;
  respuestas: Record<string, any>;
  entry_estado: string;
  created_at: string;
  preguntas: any[];
  alumno_ids: string[];
  suscripciones: (PreinscriptoSub & { created_at?: string })[];
  benefit_id: string | null;
  benefit_precio_total: number | null;
  benefit_precio_cuota: number | null;
  benefit_cuotas: number | null;
  benefit_valid_until: string | null;
  benefit_email_sent_at: string | null;
  benefit_email_status: string | null;
  status: PreinscriptoStatus;
  sede: string | null;
}

const STATUS_CLASS: Record<PreinscriptoStatus, string> = {
  preinscripto: "bg-muted text-muted-foreground border-border",
  pendiente_pago: "bg-primary/15 text-primary border-primary/30",
  inscripto: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  no_continua: "bg-foreground/10 text-foreground/50 border-foreground/20",
};

type Filter = "todos" | PreinscriptoStatus;
const FILTERS: { v: Filter; l: string }[] = [
  { v: "todos", l: "Todos" },
  { v: "preinscripto", l: "Preinscriptos" },
  { v: "pendiente_pago", l: "Pendiente de pago" },
  { v: "inscripto", l: "Inscriptos" },
  { v: "no_continua", l: "No continúa" },
];

interface Props {
  planId: string;
  moneda?: string | null;
  hasSlug: boolean;
  reloadKey?: number;
  onCount?: (n: number) => void;
}

export default function ProgramPreinscriptosTab({ planId, moneda, hasSlug, reloadKey, onCount }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("todos");
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<Row | null>(null);
  const [confirmRow, setConfirmRow] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);
  const def = DEFAULT_PRICE[planId];
  const [pTotal, setPTotal] = useState(def ? String(def.total) : "");
  const [pCuota, setPCuota] = useState(def ? String(def.cuota) : "");
  const [pCuotas, setPCuotas] = useState(def ? String(def.cuotas) : "1");
  const [pHasta, setPHasta] = useState(def?.hasta ?? "");
  const [assigning, setAssigning] = useState(false);
  const [sendRow, setSendRow] = useState<Row | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [waStarted, setWaStarted] = useState<Record<string, string>>({});
  const [waBusyId, setWaBusyId] = useState<string | null>(null);

  const assign = async () => {
    setAssigning(true);
    const { data, error } = await sb.rpc("assign_program_preinscripcion_benefits", {
      p_plan_id: planId, p_precio_total: Number(pTotal), p_precio_cuota: pCuota ? Number(pCuota) : null,
      p_cuotas: Number(pCuotas) || 1, p_valid_until: pHasta,
    });
    setAssigning(false);
    if (error) { toast({ title: "No se pudo asignar el precio", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Precio asignado", description: `${data.created} nuevos · ${data.existing} ya tenían · ${data.skipped} excluidos` });
    load();
  };

  const sendOne = async (row: Row) => {
    if (!row.benefit_id) return;
    setSendingId(row.benefit_id);
    const { data, error } = await sb.functions.invoke("send-program-preinscripcion-opening", { body: { benefit_id: row.benefit_id } });
    setSendingId(null);
    setSendRow(null);
    const msg = error ? (await (error as any)?.context?.json?.().catch(() => null))?.error || error.message : data?.ok ? null : data?.error || data?.status;
    if (msg) toast({ title: `No se pudo enviar a ${row.nombre}`, description: String(msg), variant: "destructive" });
    else toast({ title: `Mail enviado a ${row.nombre}` });
    load();
  };

  const getPersonalLink = async (row: Row): Promise<string | null> => {
    if (!row.benefit_id) return null;
    const { data } = await sb.from("program_preinscripcion_benefits").select("token").eq("id", row.benefit_id).single();
    const { data: plan } = await sb.from("planes").select("cohort_slug").eq("id", planId).single();
    if (!data?.token) return null;
    return `https://reybaud-app.com/formacion-inicial?cohort=${encodeURIComponent(plan?.cohort_slug || "")}&beneficio=${data.token}`;
  };

  const copyLink = async (row: Row) => {
    const link = await getPersonalLink(row);
    if (!link) return;
    await navigator.clipboard.writeText(link);
    toast({ title: "Link personal copiado" });
  };

  const buildWaMessage = async (row: Row): Promise<string> => {
    const link = row.benefit_id ? await getPersonalLink(row) : null;
    return buildPreinscriptoWaMessage({ nombre: row.nombre, linkPersonal: link });
  };

  const openWhatsApp = async (row: Row) => {
    const phone = normalizePhoneAr(row.telefono);
    if (!phone) return;
    setWaBusyId(row.entry_id);
    const msg = await buildWaMessage(row);
    setWaBusyId(null);
    window.open(buildWaLink(phone, msg), "_blank", "noopener,noreferrer");
    // Solo se registra que se inició la conversación; el envío real lo confirma Natalia en WhatsApp.
    setWaStarted((m) => ({ ...m, [row.entry_id]: new Date().toISOString() }));
  };

  const copyWaMessage = async (row: Row) => {
    setWaBusyId(row.entry_id);
    const msg = await buildWaMessage(row);
    setWaBusyId(null);
    await navigator.clipboard.writeText(msg);
    toast({ title: "Mensaje de WhatsApp copiado" });
  };

  const emailCell = (r: Row) => {
    if (!r.benefit_id) return <span className="text-muted-foreground">—</span>;
    if (r.benefit_email_sent_at) return <Badge variant="outline" className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">Mail enviado · {fmtDate(r.benefit_email_sent_at)}</Badge>;
    if (r.benefit_email_status) return <Badge variant="outline" className="bg-destructive/15 text-destructive border-destructive/30">Error: {r.benefit_email_status}</Badge>;
    return <span className="text-muted-foreground">Sin enviar</span>;
  };
  const canSend = (r: Row) => !!r.benefit_id && !r.benefit_email_sent_at && r.status !== "no_continua";

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await sb.rpc("get_program_preinscriptos", { p_plan_id: planId });
    setLoading(false);
    if (error) {
      toast({ title: "No se pudieron cargar los preinscriptos", description: error.message, variant: "destructive" });
      return;
    }
    const list: Row[] = (data || []).map((r: any) => ({
      ...r,
      suscripciones: r.suscripciones || [],
      status: resolvePreinscriptoStatus(r.entry_estado, r.suscripciones || []),
      sede: findSedeAnswer(r.preguntas, r.respuestas),
    }));
    setRows(list);
    onCount?.(list.length);
  }, [planId, onCount]);

  useEffect(() => { load(); }, [load, reloadKey]);

  // Recalcular al volver a la pestaña del navegador.
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [load]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { todos: rows.length };
    rows.forEach((r) => (c[r.status] = (c[r.status] || 0) + 1));
    return c;
  }, [rows]);

  const visible = rows.filter((r) => {
    if (filter !== "todos" && r.status !== filter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return r.nombre.toLowerCase().includes(q) || r.email.toLowerCase().includes(q) || (r.telefono || "").includes(q);
  });

  const setEntryEstado = async (row: Row, estado: string) => {
    setBusy(true);
    const { error } = await sb.from("waitlist_template_entries").update({ estado }).eq("id", row.entry_id);
    setBusy(false);
    if (error) {
      toast({ title: "No se pudo actualizar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: estado === NO_CONTINUA_ENTRY_STATE ? "Marcado como No continúa" : "Preinscripción reactivada" });
    setConfirmRow(null);
    setDetail(null);
    load();
  };

  if (!hasSlug) {
    return <p className="text-sm text-muted-foreground">Este programa no tiene un formulario de preinscripción vinculado.</p>;
  }

  const withBenefit = rows.filter((r) => r.benefit_id).length;
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
        <p className="text-sm font-medium flex items-center gap-1.5"><Tag className="w-4 h-4 text-primary" />
          Precio de preinscripción: {pTotal ? formatPrice(Number(pTotal), moneda || "ARS") : "—"}
          {Number(pCuotas) > 1 && pCuota ? ` o ${pCuotas} × ${formatPrice(Number(pCuota), moneda || "ARS")}` : ""}
          {pHasta ? ` · válido hasta ${pHasta.split("-").reverse().slice(0, 2).join("/")}` : ""}
        </p>
        <div className="flex flex-wrap items-end gap-2 text-xs">
          <label className="space-y-0.5"><span className="text-muted-foreground">Total</span><Input className="h-8 w-28" type="number" value={pTotal} onChange={(e) => setPTotal(e.target.value)} /></label>
          <label className="space-y-0.5"><span className="text-muted-foreground">Cuotas</span><Input className="h-8 w-16" type="number" value={pCuotas} onChange={(e) => setPCuotas(e.target.value)} /></label>
          <label className="space-y-0.5"><span className="text-muted-foreground">Valor cuota</span><Input className="h-8 w-28" type="number" value={pCuota} onChange={(e) => setPCuota(e.target.value)} /></label>
          <label className="space-y-0.5"><span className="text-muted-foreground">Válido hasta</span><Input className="h-8 w-36" type="date" value={pHasta} onChange={(e) => setPHasta(e.target.value)} /></label>
          <Button size="sm" className="h-8" disabled={assigning || !pTotal || !pHasta} onClick={assign}>
            {assigning ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Tag className="w-3.5 h-3.5 mr-1" />} Asignar precio a preinscriptos
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{withBenefit} de {rows.length} con precio asignado. Quienes ya lo tienen no se duplican; se excluyen "No continúa" y emails inválidos. El mail de apertura se envía de a una persona desde cada fila.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <Button key={f.v} size="sm" variant={filter === f.v ? "default" : "outline"} className="h-8 text-xs" onClick={() => setFilter(f.v)}>
            {f.l} ({counts[f.v] || 0})
          </Button>
        ))}
        <div className="flex-1" />
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1" />} Actualizar
        </Button>
      </div>
      <Input placeholder="Buscar por nombre, email o teléfono…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-md" />

      {loading && rows.length === 0 ? (
        <p className="text-sm text-muted-foreground animate-pulse">Cargando…</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin preinscriptos en este filtro.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Contacto</TableHead>
                <TableHead>Sede preferida</TableHead>
                <TableHead>Preinscripción</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Beneficio</TableHead>
                <TableHead>Email apertura</TableHead>
                <TableHead className="text-right">Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((r) => (
                <TableRow key={r.entry_id}>
                  <TableCell className="font-medium">{r.nombre}</TableCell>
                  <TableCell className="text-xs">
                    <div>{r.email}</div>
                    {r.telefono && <div className="text-muted-foreground">{r.telefono}</div>}
                  </TableCell>
                  <TableCell className="text-xs">{r.sede || "—"}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">
                    {new Date(r.created_at).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" })}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={STATUS_CLASS[r.status]}>{PREINSCRIPTO_STATUS_LABEL[r.status]}</Badge>
                  </TableCell>
                  <TableCell className="text-xs whitespace-nowrap">
                    {r.benefit_id && r.benefit_precio_total != null ? (
                      <div><div className="text-primary font-medium">Precio asignado</div>{formatPrice(Number(r.benefit_precio_total), moneda || "ARS")}</div>
                    ) : "—"}
                  </TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{emailCell(r)}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {canSend(r) && (
                      <Button size="sm" variant="outline" className="h-7 text-xs mr-1" disabled={sendingId === r.benefit_id} onClick={() => setSendRow(r)}>
                        {sendingId === r.benefit_id ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : r.benefit_email_status ? <RotateCcw className="w-3.5 h-3.5 mr-1" /> : <Mail className="w-3.5 h-3.5 mr-1" />}
                        {r.benefit_email_status ? "Reintentar" : "Enviar mail"}
                      </Button>
                    )}
                    {r.benefit_id && (
                      <Button size="sm" variant="ghost" className="h-7 text-xs" title="Copiar link personal" onClick={() => copyLink(r)}><Copy className="w-3.5 h-3.5" /></Button>
                    )}
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setDetail(r)}>
                      <Eye className="w-3.5 h-3.5 mr-1" /> Ver
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {detail.nombre}
                  <Badge variant="outline" className={STATUS_CLASS[detail.status]}>{PREINSCRIPTO_STATUS_LABEL[detail.status]}</Badge>
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <div className="text-xs text-muted-foreground">
                  {detail.email}{detail.telefono ? ` · ${detail.telefono}` : ""} · Preinscripción {new Date(detail.created_at).toLocaleString("es-AR")}
                </div>
                <div className="space-y-2">
                  {(detail.preguntas || []).map((q: any) => {
                    const v = detail.respuestas?.[q.id];
                    if (v == null || v === "" || (Array.isArray(v) && v.length === 0)) return null;
                    return (
                      <div key={q.id}>
                        <p className="text-xs text-muted-foreground">{q.label}</p>
                        <p>{Array.isArray(v) ? v.join(", ") : String(v)}</p>
                      </div>
                    );
                  })}
                </div>
                {detail.benefit_id && (
                  <div className="rounded-md border border-border p-2 text-xs">
                    Beneficio: {formatPrice(Number(detail.benefit_precio_total), moneda || "ARS")}
                    {detail.benefit_cuotas && detail.benefit_cuotas > 1 && detail.benefit_precio_cuota
                      ? ` o ${detail.benefit_cuotas} × ${formatPrice(Number(detail.benefit_precio_cuota), moneda || "ARS")}` : ""}
                    {detail.benefit_valid_until ? ` · hasta ${detail.benefit_valid_until.split("-").reverse().join("/")}` : ""}
                  </div>
                )}
                <div className="rounded-md border border-border p-2 text-xs">
                  {detail.suscripciones.length === 0
                    ? "Sin inscripción a este programa todavía."
                    : detail.suscripciones.map((s) => <div key={s.id}>Inscripción: {s.estado}</div>)}
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  {detail.entry_estado === NO_CONTINUA_ENTRY_STATE ? (
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => setEntryEstado(detail, "nuevo")}>
                      <Undo2 className="w-3.5 h-3.5 mr-1" /> Reactivar
                    </Button>
                  ) : detail.status === "preinscripto" || detail.status === "pendiente_pago" ? (
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirmRow(detail)}>
                      <UserX className="w-3.5 h-3.5 mr-1" /> No continúa
                    </Button>
                  ) : null}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!sendRow} onOpenChange={(o) => !o && setSendRow(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Enviar mail de apertura?</AlertDialogTitle>
            <AlertDialogDescription>
              Vas a enviar 1 email a {sendRow?.nombre} ({sendRow?.email}) con su precio y su link personal.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={!!sendingId} onClick={() => sendRow && sendOne(sendRow)}>Enviar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmRow} onOpenChange={(o) => !o && setConfirmRow(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Marcar como "No continúa"?</AlertDialogTitle>
            <AlertDialogDescription>
              La preinscripción de {confirmRow?.nombre} queda guardada como historial. Si más adelante se inscribe y paga, pasará a Inscripto automáticamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={() => confirmRow && setEntryEstado(confirmRow, NO_CONTINUA_ENTRY_STATE)}>
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
