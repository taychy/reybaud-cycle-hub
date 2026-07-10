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

const STATUS_COLORS: Record<string, string> = {
  approved: "bg-green-500/20 text-green-400 border-green-500/30",
  pending: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  rejected: "bg-red-500/20 text-red-400 border-red-500/30",
  refunded: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  cancelled: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

export default function MpMovementsTab() {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [cuentas, setCuentas] = useState<Array<{ id: string; nombre: string; slug: string }>>([]);
  const [cuentaFilter, setCuentaFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [assignFilter, setAssignFilter] = useState<"all" | "assigned" | "unassigned">("all");
  const [search, setSearch] = useState("");

  const [assignDialog, setAssignDialog] = useState<Movement | null>(null);
  const [alumnos, setAlumnos] = useState<Alumno[]>([]);
  const [selectedAlumno, setSelectedAlumno] = useState<string | null>(null);
  const [assignNotes, setAssignNotes] = useState("");
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    void load();
    void loadCuentas();
  }, []);

  async function loadCuentas() {
    const { data } = await supabase.from("cuentas_mp").select("id, nombre, slug").eq("activa", true).order("nombre");
    setCuentas(data ?? []);
  }

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("mp_account_movements")
      .select(`
        id, cuenta_mp_id, mp_payment_id, status, status_detail, payment_method, payment_type,
        amount, net_received, currency, description, payer_email, payer_name, payer_document,
        external_reference, fecha_movimiento, alumno_id, reservation_payment_id, suscripcion_id,
        assigned_manually, assign_notes,
        cuentas_mp:cuentas_mp!cuenta_mp_id ( nombre, slug ),
        alumnos:alumnos!alumno_id ( id, nombre, apellido, email )
      `)
      .order("fecha_movimiento", { ascending: false })
      .limit(500);
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

  async function loadAlumnosQuery(q: string) {
    if (q.length < 2) {
      setAlumnos([]);
      return;
    }
    const { data } = await supabase
      .from("alumnos")
      .select("id, nombre, apellido, email")
      .or(`nombre.ilike.%${q}%,apellido.ilike.%${q}%,email.ilike.%${q}%,documento.ilike.%${q}%`)
      .limit(20);
    setAlumnos((data as any) ?? []);
  }

  async function handleAssign() {
    if (!assignDialog || !selectedAlumno) return;
    setAssigning(true);
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("mp_account_movements")
      .update({
        alumno_id: selectedAlumno,
        assigned_manually: true,
        assigned_by: userData?.user?.id ?? null,
        assigned_at: new Date().toISOString(),
        assign_notes: assignNotes || null,
      })
      .eq("id", assignDialog.id);
    setAssigning(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Movimiento asignado" });
    setAssignDialog(null);
    setSelectedAlumno(null);
    setAssignNotes("");
    await load();
  }

  async function handleUnassign(m: Movement) {
    if (!confirm("¿Quitar la asignación de este movimiento?")) return;
    const { error } = await supabase
      .from("mp_account_movements")
      .update({
        alumno_id: null,
        assigned_manually: false,
        assigned_by: null,
        assigned_at: null,
        assign_notes: null,
      })
      .eq("id", m.id);
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    toast({ title: "Asignación removida" });
    await load();
  }

  const filtered = useMemo(() => {
    return movements.filter((m) => {
      if (cuentaFilter !== "all" && m.cuenta_mp_id !== cuentaFilter) return false;
      if (statusFilter !== "all" && (m.status ?? "") !== statusFilter) return false;
      const hasAssignment = !!(m.alumno_id || m.reservation_payment_id || m.suscripcion_id);
      if (assignFilter === "assigned" && !hasAssignment) return false;
      if (assignFilter === "unassigned" && hasAssignment) return false;
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
    const totalByCurrency = approved.reduce<Record<string, number>>((acc, m) => {
      acc[m.currency] = (acc[m.currency] ?? 0) + Number(m.amount);
      return acc;
    }, {});
    return {
      total: filtered.length,
      approved: approved.length,
      unassigned: filtered.filter((m) => !m.alumno_id && !m.reservation_payment_id && !m.suscripcion_id).length,
      totalByCurrency,
    };
  }, [filtered]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Movimientos de cuentas Mercado Pago</h3>
          <p className="text-sm text-muted-foreground">
            Todos los cobros recibidos en las cuentas MP. Asigná un alumno cuando no lo identifiquemos automáticamente.
          </p>
        </div>
        <Button onClick={handleSync} disabled={syncing} variant="outline">
          <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Sincronizando..." : "Sincronizar con MP"}
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Movimientos</div><div className="text-2xl font-bold">{totals.total}</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Aprobados</div><div className="text-2xl font-bold text-green-500">{totals.approved}</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Sin asignar</div><div className="text-2xl font-bold text-orange-500">{totals.unassigned}</div></CardContent></Card>
        <Card><CardContent className="pt-4">
          <div className="text-xs text-muted-foreground">Total (aprobados)</div>
          <div className="text-sm font-bold">
            {Object.entries(totals.totalByCurrency).map(([cur, val]) => (
              <div key={cur}>{formatPrice(val, cur)}</div>
            ))}
            {Object.keys(totals.totalByCurrency).length === 0 && "—"}
          </div>
        </CardContent></Card>
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Cuenta</TableHead>
                  <TableHead>Pagador</TableHead>
                  <TableHead>Monto</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Alumno</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead>MP ID</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
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
                        <div>{m.payer_name || "—"}</div>
                        {m.payer_email && <div className="text-muted-foreground">{m.payer_email}</div>}
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
                      <TableCell className="text-right">
                        {assigned ? (
                          <Button size="sm" variant="ghost" onClick={() => handleUnassign(m)}>Desasignar</Button>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => { setAssignDialog(m); setSelectedAlumno(null); setAssignNotes(""); setAlumnos([]); }}>
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

          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Alumno</label>
              <Command className="border rounded-md" shouldFilter={false}>
                <CommandInput placeholder="Buscar por nombre, email o DNI..." onValueChange={loadAlumnosQuery} />
                <CommandList>
                  <CommandEmpty>Escribí al menos 2 caracteres...</CommandEmpty>
                  <CommandGroup>
                    {alumnos.map((a) => (
                      <CommandItem
                        key={a.id}
                        value={a.id}
                        onSelect={() => setSelectedAlumno(a.id)}
                        className={selectedAlumno === a.id ? "bg-accent" : ""}
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
            <div>
              <label className="text-sm font-medium">Notas (opcional)</label>
              <Input value={assignNotes} onChange={(e) => setAssignNotes(e.target.value)} placeholder="Ej: transferencia por seña evento X" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setAssignDialog(null)}>Cancelar</Button>
            <Button onClick={handleAssign} disabled={!selectedAlumno || assigning}>
              {assigning ? "Asignando..." : "Asignar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
