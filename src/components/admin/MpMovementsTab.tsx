import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatPrice } from "@/lib/currency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { RefreshCw, Search, UserPlus, ExternalLink, Link2 } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PeriodBadge } from "@/components/admin/PeriodBadge";


type Movement = {
  id: string;
  cuenta_mp_id: string;
  mp_payment_id: string;
  status: string | null;
  status_detail: string | null;
  payment_method: string | null;
  payment_type: string | null;
  amount: number;
  net_received: number | null;
  currency: string;
  description: string | null;
  payer_email: string | null;
  payer_name: string | null;
  payer_document: string | null;
  external_reference: string | null;
  fecha_movimiento: string;
  alumno_id: string | null;
  reservation_payment_id: string | null;
  suscripcion_id: string | null;
  assigned_manually: boolean;
  assign_notes: string | null;
  cuentas_mp?: { nombre: string; slug: string } | null;
  alumnos?: { id: string; nombre: string; apellido: string | null; email: string } | null;
};

type Alumno = { id: string; nombre: string; apellido: string | null; email: string };

type TargetRow = { id: string; label: string; currency: string; total: number; paid?: number; balance?: number; estado?: string; fecha?: string };
type PaymentTargets = { reservations: TargetRow[]; subscriptions: TargetRow[] };


const STATUS_COLORS: Record<string, string> = {
  approved: "bg-green-500/20 text-green-400 border-green-500/30",
  pending: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  rejected: "bg-red-500/20 text-red-400 border-red-500/30",
  refunded: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  cancelled: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

const OWN_MP_EMAILS_BY_SLUG: Record<string, string[]> = {
  claudio_reybaud: ["cobrosreybaud@gmail.com"],
  scarlett_tayna_barros: ["scarlett.tayna.bs@gmail.com"],
};

const isOwnMpEmail = (slug: string | undefined, email: string | null) => {
  if (!slug || !email) return false;
  return (OWN_MP_EMAILS_BY_SLUG[slug] ?? []).includes(email.toLowerCase());
};

export default function MpMovementsTab({ periodo = "all" }: { periodo?: string }) {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [cuentas, setCuentas] = useState<Array<{ id: string; nombre: string; slug: string }>>([]);
  const [cuentaFilter, setCuentaFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [assignFilter, setAssignFilter] = useState<"all" | "assigned" | "unassigned">("unassigned");
  const [search, setSearch] = useState("");

  const [assignDialog, setAssignDialog] = useState<Movement | null>(null);
  const [alumnos, setAlumnos] = useState<Alumno[]>([]);
  const [suggested, setSuggested] = useState<Alumno[]>([]);

  const [selectedAlumno, setSelectedAlumno] = useState<string | null>(null);
  const [assignNotes, setAssignNotes] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [targets, setTargets] = useState<PaymentTargets | null>(null);
  const [loadingTargets, setLoadingTargets] = useState(false);
  const [target, setTarget] = useState<{ type: "saldo" | "reservation" | "suscripcion"; id: string | null }>({ type: "saldo", id: null });
  const [splitMode, setSplitMode] = useState(false);
  const [splitRows, setSplitRows] = useState<Array<{ alumno: Alumno; monto: string }>>([]);

  function addSplitAlumno(a: Alumno) {
    setSplitRows((prev) => (prev.some((r) => r.alumno.id === a.id) ? prev : [...prev, { alumno: a, monto: "" }]));
  }

  useEffect(() => {
    setTarget({ type: "saldo", id: null });
    if (selectedAlumno) void loadTargets(selectedAlumno);
    else setTargets(null);
  }, [selectedAlumno]);


  useEffect(() => {
    void load();
    void loadCuentas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodo]);

  async function loadCuentas() {
    const { data } = await supabase.from("cuentas_mp").select("id, nombre, slug").eq("activa", true).order("nombre");
    setCuentas(data ?? []);
  }

  async function load() {
    setLoading(true);
    let query = supabase
      .from("mp_account_movements")
      .select(`
        id, cuenta_mp_id, mp_payment_id, status, status_detail, payment_method, payment_type,
        amount, net_received, currency, description, payer_email, payer_name, payer_document,
        external_reference, fecha_movimiento, alumno_id, reservation_payment_id, suscripcion_id,
        assigned_manually, assign_notes,
        cuentas_mp:cuentas_mp!cuenta_mp_id ( nombre, slug ),
        alumnos:alumnos!alumno_id ( id, nombre, apellido, email )
      `)
      .eq("direccion", "ingreso");

    if (periodo && periodo !== "all" && /^\d{4}-\d{2}$/.test(periodo)) {
      const [y, m] = periodo.split("-").map(Number);
      const start = new Date(Date.UTC(y, m - 1, 1)).toISOString();
      const end = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1)).toISOString();
      query = query.gte("fecha_movimiento", start).lt("fecha_movimiento", end);
    }

    const { data, error } = await query
      .order("fecha_movimiento", { ascending: false })
      .limit(1000);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setMovements((data as any) ?? []);
    }
    setLoading(false);
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-mp-account-movements", {
        body: { days: 30 },
      });
      if (error) throw error;
      toast({
        title: "Sincronización lista",
        description: `Cuentas: ${data?.cuentas?.length ?? 0}. Nuevos/actualizados en ${data?.cuentas?.map((c: any) => `${c.cuenta}: +${c.inserted}/${c.updated}`).join(", ") ?? "—"}`,
      });
      await load();
    } catch (e: any) {
      toast({ title: "Error sincronizando", description: e.message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  }

  async function handleEnrich() {
    setEnriching(true);
    try {
      const { data, error } = await supabase.functions.invoke("enrich-mp-settlement-report", {
        body: { days: 30 },
      });
      if (error) throw error;
      const pending = (data?.cuentas ?? []).filter((c: any) => c.pending);
      const enriched = (data?.cuentas ?? []).reduce((s: number, c: any) => s + (c.enriched ?? 0), 0);
      const matched = (data?.cuentas ?? []).reduce((s: number, c: any) => s + (c.matched ?? 0), 0);
      if (pending.length && enriched === 0) {
        toast({
          title: "Reporte MP en preparación",
          description: "MP está generando el settlement report. Volvé a apretar en 2-3 min.",
        });
      } else {
        toast({
          title: "Enriquecimiento completo",
          description: `${enriched} movimientos actualizados (de ${matched} matches). Sólo se completaron campos vacíos.`,
        });
      }
      await load();
    } catch (e: any) {
      toast({ title: "Error enriqueciendo", description: e.message, variant: "destructive" });
    } finally {
      setEnriching(false);
    }
  }


  async function loadAlumnosQuery(q: string) {
    if (q.length < 2) {
      setAlumnos([]);
      return;
    }
    const { data } = await supabase
      .from("alumnos")
      .select("id, nombre, apellido, email, emails_adicionales")
      .or(`nombre.ilike.%${q}%,apellido.ilike.%${q}%,email.ilike.%${q}%,documento.ilike.%${q}%,emails_adicionales.cs.{${q.toLowerCase()}}`)
      .limit(20);
    setAlumnos((data as any) ?? []);
  }

  async function suggestByPayerEmail(email: string | null) {
    setSuggested([]);
    if (!email) return;
    const e = email.toLowerCase().trim();
    const { data } = await supabase
      .from("alumnos")
      .select("id, nombre, apellido, email, emails_adicionales")
      .or(`email.eq.${e},emails_adicionales.cs.{${e}}`)
      .limit(5);
    const found = (data as any as Alumno[]) ?? [];
    setSuggested(found);
    if (found.length === 1) setSelectedAlumno(found[0].id);
  }
  async function loadTargets(alumnoId: string) {
    setTargets(null);
    setLoadingTargets(true);
    const { data, error } = await supabase.rpc("get_alumno_payment_targets", { _alumno_id: alumnoId });
    setLoadingTargets(false);
    if (error) {
      toast({ title: "No se pudieron cargar los destinos", description: error.message, variant: "destructive" });
      return;
    }
    setTargets((data as any) ?? { reservations: [], subscriptions: [] });
  }

  async function handleAssign() {
    if (!assignDialog || !selectedAlumno) return;
    setAssigning(true);
    const { data, error } = await supabase.rpc("assign_mp_movement_to_target", {
      _movement_id: assignDialog.id,
      _alumno_id: selectedAlumno,
      _target_type: target.type,
      _target_id: target.id,
      _notes: assignNotes || null,
    });
    setAssigning(false);
    if (error) {
      const msg = error.message || "";
      let human = msg;
      if (msg.includes("already_assigned_to_other_student")) human = "Este movimiento ya fue asignado a otro alumno. Desasigná primero si querés reasignar.";
      else if (msg.includes("only_approved_movements")) human = "Sólo se pueden asignar movimientos aprobados.";
      else if (msg.includes("only_income_movements")) human = "Sólo se pueden asignar ingresos.";
      else if (msg.includes("not_authorized")) human = "No tenés permisos para asignar movimientos.";
      else if (msg.includes("reservation_not_found")) human = "No se encontró la reserva seleccionada.";
      else if (msg.includes("subscription_not_found")) human = "No se encontró el plan seleccionado.";
      toast({ title: "No se pudo asignar", description: human, variant: "destructive" });
      return;
    }
    const created = (data as any)?.created;
    toast({
      title: "Movimiento asignado",
      description:
        target.type === "reservation"
          ? (created ? "Se registró el pago en la reserva del evento y se imputó a la cuota más antigua." : "Este pago ya estaba vinculado a la reserva.")
          : target.type === "suscripcion"
            ? "El plan quedó marcado como pagado con este movimiento."
            : (created ? "Se registró un saldo a favor en la cuenta corriente del alumno." : "Ya existía un saldo a favor vinculado a este pago."),
    });
    setAssignDialog(null);
    setSelectedAlumno(null);
    setAssignNotes("");
    setTargets(null);
    setTarget({ type: "saldo", id: null });
    await load();
  }

  async function handleSplit() {
    if (!assignDialog || splitRows.length === 0) return;
    const splits = splitRows.map((r) => ({ alumno_id: r.alumno.id, monto: Number(r.monto) }));
    if (splits.some((s) => !s.monto || s.monto <= 0)) {
      toast({ title: "Faltan montos", description: "Poné un importe mayor a cero para cada alumno.", variant: "destructive" });
      return;
    }
    setAssigning(true);
    const { data, error } = await supabase.rpc("split_mp_movement_among_alumnos" as any, {
      _movement_id: assignDialog.id,
      _splits: splits as any,
      _notes: assignNotes || null,
    });
    setAssigning(false);
    if (error) {
      const msg = error.message || "";
      let human = msg;
      if (msg.includes("splits_exceed_movement_amount")) human = "La suma de las partes supera el monto del pago.";
      else if (msg.includes("already_assigned_to_other_student")) human = "Este movimiento ya está asignado a otro alumno.";
      else if (msg.includes("not_authorized")) human = "No tenés permisos para asignar movimientos.";
      toast({ title: "No se pudo dividir el pago", description: human, variant: "destructive" });
      return;
    }
    const restante = Number((data as any)?.restante ?? 0);
    toast({
      title: "Pago familiar dividido",
      description: `Se generó un saldo a favor para ${splitRows.length} alumnos.` + (restante > 0.01 ? ` Quedaron sin asignar ${formatPrice(restante, assignDialog.currency)}.` : ""),
    });
    setAssignDialog(null);
    setSplitMode(false);
    setSplitRows([]);
    setSelectedAlumno(null);
    setAssignNotes("");
    await load();
  }


  async function handleUnassign(m: Movement) {
    if (!confirm("¿Quitar la asignación de este movimiento? Se revertirá el saldo a favor si aún no fue aplicado.")) return;
    const { error } = await supabase.rpc("unassign_mp_movement", { _movement_id: m.id });
    if (error) {
      const msg = error.message || "";
      let human = msg;
      if (msg.includes("credit_already_applied_cannot_unassign")) {
        human = "El saldo a favor ya fue aplicado a una deuda. Revertí primero esa imputación desde la cuenta del alumno.";
      } else if (msg.includes("not_authorized")) {
        human = "No tenés permisos.";
      }
      return toast({ title: "No se pudo desasignar", description: human, variant: "destructive" });
    }
    toast({ title: "Asignación removida", description: "Se revirtió el saldo a favor." });
    await load();
  }

  const filtered = useMemo(() => {
    return movements.filter((m) => {
      if (cuentaFilter !== "all" && m.cuenta_mp_id !== cuentaFilter) return false;
      if (statusFilter !== "all" && (m.status ?? "") !== statusFilter) return false;
      const hasAssignment = !!(m.alumno_id || m.reservation_payment_id || m.suscripcion_id);
      if (assignFilter === "assigned" && !hasAssignment) return false;
      // "Sin asignar" es cola de trabajo: sólo aprobados son asignables.
      if (assignFilter === "unassigned" && (hasAssignment || (statusFilter === "all" && m.status !== "approved"))) return false;
      if (search) {
        const s = search.toLowerCase();
        const hay = [
          m.mp_payment_id, m.payer_email, m.payer_name, m.payer_document,
          m.description, m.external_reference,
          m.alumnos?.nombre, m.alumnos?.apellido, m.alumnos?.email,
        ].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [movements, cuentaFilter, statusFilter, assignFilter, search]);

  const totals = useMemo(() => {
    const approved = filtered.filter((m) => m.status === "approved");
    const rejected = filtered.filter((m) => m.status && m.status !== "approved" && m.status !== "pending" && m.status !== "in_process");
    const totalByCurrency = approved.reduce<Record<string, number>>((acc, m) => {
      acc[m.currency] = (acc[m.currency] ?? 0) + Number(m.amount);
      return acc;
    }, {});
    return {
      total: filtered.length,
      approved: approved.length,
      rejected: rejected.length,
      // Sólo cuentan los asignables: un pago rechazado/cancelado nunca se asigna.
      unassigned: filtered.filter(
        (m) => m.status === "approved" && !m.alumno_id && !m.reservation_payment_id && !m.suscripcion_id
      ).length,
      totalByCurrency,
    };
  }, [filtered]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Movimientos de cuentas Mercado Pago</h3>
          <p className="text-sm text-muted-foreground">
            Cobros recibidos en las cuentas MP {periodo && periodo !== "all" ? <span className="text-foreground font-medium">· período {periodo}</span> : <span className="text-foreground font-medium">· todos los meses</span>}. Asigná un alumno cuando no lo identifiquemos automáticamente.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleEnrich} disabled={enriching} variant="outline" title="Completa nombres de pagador leyendo el settlement report de MP. Sólo llena campos vacíos.">
            <UserPlus className={`h-4 w-4 mr-2 ${enriching ? "animate-pulse" : ""}`} />
            {enriching ? "Enriqueciendo..." : "Enriquecer nombres"}
          </Button>
          <Button onClick={handleSync} disabled={syncing} variant="outline">
            <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Sincronizando..." : "Sincronizar con MP"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {(() => {
          const isMes = !!periodo && periodo !== "all";
          const badge = <PeriodBadge scope={isMes ? "mes" : "acumulado"} label={isMes ? periodo : "Todos los meses"} className="ml-auto" />;
          return (
            <>
              <Card><CardContent className="pt-4"><div className="flex items-center gap-2"><div className="text-xs text-muted-foreground">Movimientos</div>{badge}</div><div className="text-2xl font-bold">{totals.total}</div></CardContent></Card>
              <Card><CardContent className="pt-4"><div className="flex items-center gap-2"><div className="text-xs text-muted-foreground">Aprobados</div>{badge}</div><div className="text-2xl font-bold text-green-500">{totals.approved}</div></CardContent></Card>
              <Card><CardContent className="pt-4"><div className="flex items-center gap-2"><div className="text-xs text-muted-foreground">Rechazados / cancelados</div>{badge}</div><div className="text-2xl font-bold text-red-500">{totals.rejected}</div></CardContent></Card>
              <Card><CardContent className="pt-4"><div className="flex items-center gap-2"><div className="text-xs text-muted-foreground">Sin asignar (aprobados)</div>{badge}</div><div className="text-2xl font-bold text-orange-500">{totals.unassigned}</div></CardContent></Card>
              <Card><CardContent className="pt-4">
                <div className="flex items-center gap-2"><div className="text-xs text-muted-foreground">Total (aprobados)</div>{badge}</div>
                <div className="text-sm font-bold">
                  {Object.entries(totals.totalByCurrency).map(([cur, val]) => (
                    <div key={cur}>{formatPrice(val, cur)}</div>
                  ))}
                  {Object.keys(totals.totalByCurrency).length === 0 && "—"}
                </div>
              </CardContent></Card>
            </>
          );
        })()}
      </div>


      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <div className="flex-1 min-w-[200px] relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar MP id, pagador, alumno..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
            </div>
            <Select value={cuentaFilter} onValueChange={setCuentaFilter}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Cuenta MP" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las cuentas</SelectItem>
                {cuentas.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="Estado" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="approved">Aprobado</SelectItem>
                <SelectItem value="pending">Pendiente</SelectItem>
                <SelectItem value="rejected">Rechazado</SelectItem>
                <SelectItem value="refunded">Devuelto</SelectItem>
                <SelectItem value="cancelled">Cancelado</SelectItem>
              </SelectContent>
            </Select>
            <Select value={assignFilter} onValueChange={(v: any) => setAssignFilter(v)}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="assigned">Asignados</SelectItem>
                <SelectItem value="unassigned">Sin asignar</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border overflow-x-auto">
            <Table className="min-w-[1100px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">Fecha</TableHead>
                  <TableHead className="whitespace-nowrap">Cuenta</TableHead>
                  <TableHead className="min-w-[220px]">Pagador</TableHead>
                  <TableHead className="whitespace-nowrap">Monto</TableHead>
                  <TableHead className="whitespace-nowrap">Estado</TableHead>
                  <TableHead className="min-w-[160px]">Alumno</TableHead>
                  <TableHead className="whitespace-nowrap">Método</TableHead>
                  <TableHead className="whitespace-nowrap">MP ID</TableHead>
                  <TableHead className="text-right whitespace-nowrap sticky right-0 bg-card shadow-[-8px_0_12px_-8px_rgba(0,0,0,0.5)]">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Cargando...</TableCell></TableRow>}
                {!loading && filtered.length === 0 && (
                  <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    Sin movimientos. Presioná "Sincronizar con MP" para traer los últimos cobros.
                  </TableCell></TableRow>
                )}
                {filtered.map((m) => {
                  const assigned = !!(m.alumno_id || m.reservation_payment_id || m.suscripcion_id);
                  return (
                    <TableRow key={m.id} className={!assigned ? "bg-orange-500/5" : ""}>
                      <TableCell className="text-xs">{new Date(m.fecha_movimiento).toLocaleString("es-AR")}</TableCell>
                      <TableCell><Badge variant="outline">{m.cuentas_mp?.nombre ?? "—"}</Badge></TableCell>
                      <TableCell className="text-xs">
                        {(() => {
                          const isTransfer = ["account_money", "cvu", "bank_transfer"].includes(m.payment_method ?? "");
                          const emailIsOwn = isOwnMpEmail(m.cuentas_mp?.slug, m.payer_email);
                          const desc = m.description && m.description.trim() && m.description.trim().toLowerCase() !== "varios"
                            ? m.description.trim()
                            : null;
                          const descBlock = desc ? (
                            <div className="mt-1 text-[10px] text-cyan-400/80 italic border-l border-cyan-500/40 pl-1.5">
                              {desc}
                            </div>
                          ) : null;
                          if (m.payer_name) {
                            return (
                              <>
                                <div className="font-medium">{m.payer_name}</div>
                                {m.payer_email && !emailIsOwn && <div className="text-muted-foreground">{m.payer_email}</div>}
                                {m.payer_document && <div className="text-muted-foreground">DNI/CUIT: {m.payer_document}</div>}
                                {descBlock}
                              </>
                            );
                          }
                          if (m.payer_email && !emailIsOwn) {
                            return (
                              <>
                                <div>{m.payer_email}</div>
                                {m.payer_document && <div className="text-muted-foreground">DNI/CUIT: {m.payer_document}</div>}
                                {descBlock}
                              </>
                            );
                          }
                          // Sin datos utilizables del pagador
                          return (
                            <div className="space-y-0.5">
                              <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/30 text-[10px]">
                                {isTransfer ? "Transferencia sin datos" : "Sin datos del pagador"}
                              </Badge>
                              <div className="text-muted-foreground text-[10px]">
                                MP no envía el nombre. Identificá por monto/fecha y asigná manualmente.
                              </div>
                              {descBlock}
                            </div>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="font-mono font-semibold">{formatPrice(Number(m.amount), m.currency)}</TableCell>
                      <TableCell>
                        <Badge className={STATUS_COLORS[m.status ?? ""] ?? ""} variant="outline">{m.status ?? "—"}</Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {m.alumnos ? (
                          <div className="flex items-center gap-1">
                            {m.assigned_manually && <Link2 className="h-3 w-3 text-blue-400" />}
                            <span>{m.alumnos.nombre} {m.alumnos.apellido ?? ""}</span>
                          </div>
                        ) : (
                          <Badge variant="outline" className="bg-orange-500/10 text-orange-400 border-orange-500/30">Sin asignar</Badge>
                        )}
                        {m.reservation_payment_id && <div className="text-muted-foreground">Evento</div>}
                        {m.suscripcion_id && <div className="text-muted-foreground">Suscripción</div>}
                      </TableCell>
                      <TableCell className="text-xs">{m.payment_type || m.payment_method || "—"}</TableCell>
                      <TableCell className="text-xs font-mono">{m.mp_payment_id}</TableCell>
                      <TableCell className={`text-right whitespace-nowrap sticky right-0 shadow-[-8px_0_12px_-8px_rgba(0,0,0,0.5)] ${!assigned ? "bg-[hsl(var(--card))]" : "bg-card"}`}>
                        {assigned ? (
                          <Button size="sm" variant="ghost" onClick={() => handleUnassign(m)}>Desasignar</Button>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => { setAssignDialog(m); setSelectedAlumno(null); setAssignNotes(""); setAlumnos([]); void suggestByPayerEmail(m.payer_email); }}>
                            <UserPlus className="h-3 w-3 mr-1" /> Asignar alumno
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!assignDialog} onOpenChange={(o) => !o && setAssignDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Asignar movimiento a un alumno</DialogTitle>
            <DialogDescription>
              MP {assignDialog?.mp_payment_id} · {assignDialog && formatPrice(Number(assignDialog.amount), assignDialog.currency)}
              {assignDialog?.payer_email && <div className="text-xs mt-1">Pagador: {assignDialog.payer_name} ({assignDialog.payer_email})</div>}
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-md border border-blue-500/30 bg-blue-500/5 p-3 text-xs text-blue-200">
            {splitMode
              ? <>Pago familiar: agregá a cada integrante y el monto que le corresponde. Cada uno recibe su saldo a favor y después lo aplicás a su plan.</>
              : <>Paso 1: elegí el alumno. Paso 2: elegí <b>a qué se aplica</b> el pago (evento, plan o saldo a favor).</>}
          </div>

          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
            <div className="text-xs">
              <div className="font-medium">Un solo pago para varios alumnos (familia)</div>
              <div className="text-muted-foreground">Ej: el papá paga su plan y el de sus hijos.</div>
            </div>
            <Button
              size="sm"
              variant={splitMode ? "default" : "outline"}
              onClick={() => { setSplitMode((v) => !v); setSplitRows([]); setSelectedAlumno(null); }}
            >
              {splitMode ? "Volver a asignación simple" : "Dividir pago"}
            </Button>
          </div>



          <div className="space-y-3">
            {suggested.length > 0 && (
              <div className="rounded-md border border-green-500/30 bg-green-500/5 p-3 space-y-2">
                <div className="text-xs text-green-300 font-medium">
                  Coincidencia por email del pagador ({assignDialog?.payer_email})
                </div>
                {suggested.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => (splitMode ? addSplitAlumno(a) : setSelectedAlumno(a.id))}
                    className={`w-full text-left rounded px-2 py-1.5 text-sm ${!splitMode && selectedAlumno === a.id ? "bg-accent" : "hover:bg-muted"}`}
                  >
                    <div>{a.nombre} {a.apellido ?? ""}</div>
                    <div className="text-xs text-muted-foreground">{a.email}</div>
                  </button>
                ))}
              </div>
            )}
            <div>
              <label className="text-sm font-medium">{splitMode ? "Agregar integrantes de la familia" : "Alumno"}</label>
              <Command className="border rounded-md" shouldFilter={false}>
                <CommandInput placeholder="Buscar por nombre, email (incl. adicionales) o DNI..." onValueChange={loadAlumnosQuery} />

                <CommandList>
                  <CommandEmpty>Escribí al menos 2 caracteres...</CommandEmpty>
                  <CommandGroup>
                    {alumnos.map((a) => (
                      <CommandItem
                        key={a.id}
                        value={a.id}
                        onSelect={() => (splitMode ? addSplitAlumno(a) : setSelectedAlumno(a.id))}
                        className={!splitMode && selectedAlumno === a.id ? "bg-accent" : ""}
                      >
                        <div>
                          <div>{a.nombre} {a.apellido ?? ""}</div>
                          <div className="text-xs text-muted-foreground">{a.email}</div>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </div>

            {splitMode && (
              <div className="space-y-2">
                {splitRows.length === 0 && (
                  <div className="text-xs text-muted-foreground">Buscá y tocá a cada alumno para agregarlo al reparto.</div>
                )}
                {splitRows.map((r, i) => (
                  <div key={r.alumno.id} className="flex items-center gap-2">
                    <div className="flex-1 text-sm truncate">
                      {r.alumno.nombre} {r.alumno.apellido ?? ""}
                      {i === 0 && <span className="ml-1 text-[10px] text-muted-foreground">(pagador)</span>}
                    </div>
                    <Input
                      className="w-32 h-8"
                      inputMode="decimal"
                      placeholder="Monto"
                      value={r.monto}
                      onChange={(e) => setSplitRows((prev) => prev.map((p, idx) => idx === i ? { ...p, monto: e.target.value } : p))}
                    />
                    <Button size="sm" variant="ghost" onClick={() => setSplitRows((prev) => prev.filter((_, idx) => idx !== i))}>✕</Button>
                  </div>
                ))}
                {splitRows.length > 0 && assignDialog && (() => {
                  const suma = splitRows.reduce((s, r) => s + (Number(r.monto) || 0), 0);
                  const total = Number(assignDialog.amount) || 0;
                  const resto = total - suma;
                  return (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Repartido: {formatPrice(suma, assignDialog.currency)} de {formatPrice(total, assignDialog.currency)}</span>
                      <span className={resto < -0.01 ? "text-destructive" : Math.abs(resto) < 0.01 ? "text-emerald-400" : "text-amber-400"}>
                        {resto < -0.01 ? `Excede por ${formatPrice(Math.abs(resto), assignDialog.currency)}` : Math.abs(resto) < 0.01 ? "Exacto ✓" : `Resta ${formatPrice(resto, assignDialog.currency)}`}
                      </span>
                    </div>
                  );
                })()}
              </div>
            )}

            {!splitMode && selectedAlumno && (
              <div className="space-y-2">
                <label className="text-sm font-medium">¿A qué se aplica este pago?</label>
                {loadingTargets && <div className="text-xs text-muted-foreground">Buscando deudas abiertas...</div>}
                {!loadingTargets && (
                  <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                    {(targets?.reservations ?? []).map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setTarget({ type: "reservation", id: r.id })}
                        className={`w-full text-left rounded border px-2 py-1.5 text-sm ${target.type === "reservation" && target.id === r.id ? "border-primary bg-accent" : "border-border hover:bg-muted"}`}
                      >
                        <div className="font-medium">🎟️ {r.label}</div>
                        <div className="text-xs text-muted-foreground">
                          Saldo {formatPrice(Number(r.balance ?? 0), r.currency)} · Total {formatPrice(Number(r.total ?? 0), r.currency)}
                        </div>
                      </button>
                    ))}
                    {(targets?.subscriptions ?? []).map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setTarget({ type: "suscripcion", id: s.id })}
                        className={`w-full text-left rounded border px-2 py-1.5 text-sm ${target.type === "suscripcion" && target.id === s.id ? "border-primary bg-accent" : "border-border hover:bg-muted"}`}
                      >
                        <div className="font-medium">📅 {s.label}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatPrice(Number(s.total ?? 0), s.currency)} · {s.estado} · desde {s.fecha}
                        </div>
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setTarget({ type: "saldo", id: null })}
                      className={`w-full text-left rounded border px-2 py-1.5 text-sm ${target.type === "saldo" ? "border-primary bg-accent" : "border-border hover:bg-muted"}`}
                    >
                      <div className="font-medium">💰 Dejar como saldo a favor</div>
                      <div className="text-xs text-muted-foreground">Queda como crédito en la cuenta corriente para aplicar después.</div>
                    </button>
                  </div>
                )}
              </div>
            )}
            <div>
              <label className="text-sm font-medium">Notas (opcional)</label>
              <Input value={assignNotes} onChange={(e) => setAssignNotes(e.target.value)} placeholder="Ej: transferencia por seña evento X" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setAssignDialog(null)}>Cancelar</Button>
            {splitMode ? (
              <Button onClick={handleSplit} disabled={assigning || splitRows.length === 0}>
                {assigning ? "Dividiendo..." : `Dividir entre ${splitRows.length || 0} alumnos`}
              </Button>
            ) : (
              <Button onClick={handleAssign} disabled={!selectedAlumno || assigning || (target.type !== "saldo" && !target.id)}>
                {assigning ? "Asignando..." : target.type === "reservation" ? "Aplicar al evento" : target.type === "suscripcion" ? "Aplicar al plan" : "Dejar como saldo a favor"}
              </Button>
            )}
          </DialogFooter>


        </DialogContent>
      </Dialog>
    </div>
  );
}
