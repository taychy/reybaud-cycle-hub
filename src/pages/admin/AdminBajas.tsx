import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { AlertTriangle, ChevronLeft, ChevronRight, CheckCheck, Pencil, RefreshCw, Inbox, ClipboardCheck, RotateCcw, UserMinus } from "lucide-react";
import BajasSolicitudesList from "@/components/admin/BajasSolicitudesList";
import DevolucionesList from "@/components/admin/DevolucionesList";
import DarBajaDirectaDialog from "@/components/admin/DarBajaDirectaDialog";
import RegistrarDevolucionDialog from "@/components/admin/RegistrarDevolucionDialog";

type SubRow = {
  id: string;
  alumno_id: string;
  plan_id: string;
  estado: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  baja_nota: string | null;
  baja_chequeada: boolean;
  baja_chequeada_at: string | null;
  alumnos: { id: string; nombre: string; apellido: string | null; email: string; telefono: string | null } | null;
  planes: { id: string; nombre: string } | null;
};

type AnySub = {
  id: string;
  alumno_id: string;
  estado: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;
};

const fmtDate = (d: string | null) => {
  if (!d) return "—";
  const [y, m, day] = d.substring(0, 10).split("-");
  return `${day}/${m}/${y}`;
};

const monthLabel = (key: string) => {
  const [y, m] = key.split("-");
  const names = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  return `${names[Number(m) - 1]} ${y}`;
};

const shiftMonth = (key: string, delta: number) => {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const currentMonthKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const todayISO = () => new Date().toISOString().split("T")[0];

const AdminBajas = () => {
  // Periodo = mes en el que tenían sub activa. Default: mes anterior.
  const defaultPeriodo = (() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  })();
  const [periodo, setPeriodo] = useState<string>(defaultPeriodo);
  const [rows, setRows] = useState<SubRow[]>([]);
  const [allSubs, setAllSubs] = useState<AnySub[]>([]);
  const [loading, setLoading] = useState(true);
  const [showOnlyPending, setShowOnlyPending] = useState(true);
  const [editing, setEditing] = useState<SubRow | null>(null);
  const [noteValue, setNoteValue] = useState("");
  const [openBajaDirecta, setOpenBajaDirecta] = useState(false);
  const [openDevolucion, setOpenDevolucion] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadData = useCallback(async () => {
    setLoading(true);
    const monthStart = `${periodo}-01`;
    const [y, m] = periodo.split("-").map(Number);
    const monthEnd = new Date(y, m, 0).toISOString().split("T")[0];

    // 1. Subs con cobertura en el período (tuvieron sub activa ese mes)
    //    cobertura = fecha_inicio <= monthEnd AND (fecha_fin null OR fecha_fin >= monthStart)
    const [subsRes, allRes] = await Promise.all([
      supabase
        .from("suscripciones")
        .select("id, alumno_id, plan_id, estado, fecha_inicio, fecha_fin, baja_nota, baja_chequeada, baja_chequeada_at, alumnos(id, nombre, apellido, email, telefono), planes(id, nombre)")
        .lte("fecha_inicio", monthEnd)
        .or(`fecha_fin.is.null,fecha_fin.gte.${monthStart}`),
      supabase.from("suscripciones").select("id, alumno_id, estado, fecha_inicio, fecha_fin"),
    ]);

    if (subsRes.data) setRows(subsRes.data as unknown as SubRow[]);
    if (allRes.data) setAllSubs(allRes.data as any);
    setLoading(false);
  }, [periodo]);

  useEffect(() => { loadData(); }, [loadData]);

  // Baja = alumno sin sub activa HOY (estado activa/conciliado y vigente)
  // que SÍ tenía sub activa en el período seleccionado.
  // Mostramos UNA fila por alumno (la última sub que tuvo en el período).
  const bajas = useMemo(() => {
    const today = todayISO();
    const hasActiveToday = (alumnoId: string) =>
      allSubs.some(s =>
        s.alumno_id === alumnoId &&
        (s.estado === "activa" || s.estado === "conciliado") &&
        (!s.fecha_inicio || s.fecha_inicio <= today) &&
        (!s.fecha_fin || s.fecha_fin >= today)
      );

    // Agrupar por alumno y quedarnos con la sub más reciente (mayor fecha_fin / fecha_inicio)
    const byAlumno = new Map<string, SubRow>();
    rows.forEach(r => {
      if (hasActiveToday(r.alumno_id)) return; // tiene sub vigente hoy → no es baja
      const prev = byAlumno.get(r.alumno_id);
      const key = (s: SubRow) => s.fecha_fin || s.fecha_inicio || "";
      if (!prev || key(r) > key(prev)) byAlumno.set(r.alumno_id, r);
    });
    return Array.from(byAlumno.values());
  }, [rows, allSubs]);

  const visible = useMemo(
    () => (showOnlyPending ? bajas.filter(b => !b.baja_chequeada) : bajas),
    [bajas, showOnlyPending]
  );

  const pendingCount = bajas.filter(b => !b.baja_chequeada).length;

  const handleToggleChequeada = async (row: SubRow) => {
    const next = !row.baja_chequeada;
    const { data: { session } } = await supabase.auth.getSession();
    const { error } = await supabase.from("suscripciones").update({
      baja_chequeada: next,
      baja_chequeada_at: next ? new Date().toISOString() : null,
      baja_chequeada_by: next ? session?.user?.id ?? null : null,
    } as any).eq("id", row.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    setRows(prev => prev.map(x => x.id === row.id ? { ...x, baja_chequeada: next } : x));
    toast({ title: next ? "Baja marcada como chequeada" : "Chequeo removido" });
  };

  const handleSaveNote = async () => {
    if (!editing) return;
    const { error } = await supabase.from("suscripciones").update({
      baja_nota: noteValue || null,
    } as any).eq("id", editing.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    setRows(prev => prev.map(x => x.id === editing.id ? { ...x, baja_nota: noteValue || null } : x));
    toast({ title: "Nota guardada" });
    setEditing(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-heading font-bold uppercase tracking-wider">Bajas</h1>
          <p className="text-sm text-muted-foreground">Solicitudes de baja, devoluciones y chequeo histórico</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setOpenDevolucion(true)}>
            <RotateCcw className="w-4 h-4 mr-1" /> Registrar devolución
          </Button>
          <Button variant="destructive" size="sm" onClick={() => setOpenBajaDirecta(true)}>
            <UserMinus className="w-4 h-4 mr-1" /> Dar de baja directa
          </Button>
        </div>
      </div>

      <Tabs defaultValue="solicitudes" className="w-full">
        <TabsList className="bg-secondary">
          <TabsTrigger value="solicitudes" className="gap-1.5"><Inbox className="w-4 h-4" />Solicitudes</TabsTrigger>
          <TabsTrigger value="devoluciones" className="gap-1.5"><RotateCcw className="w-4 h-4" />Devoluciones</TabsTrigger>
          <TabsTrigger value="chequeo" className="gap-1.5"><ClipboardCheck className="w-4 h-4" />Chequeo histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="solicitudes" className="mt-4">
          <BajasSolicitudesList key={`sol-${refreshKey}`} />
        </TabsContent>

        <TabsContent value="devoluciones" className="mt-4">
          <DevolucionesList key={`dev-${refreshKey}`} />
        </TabsContent>

        <TabsContent value="chequeo" className="mt-4 space-y-4">


      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setPeriodo(shiftMonth(periodo, -1))}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="min-w-[180px] text-center">
                <p className="text-sm font-heading font-bold uppercase tracking-wider">{monthLabel(periodo)}</p>
                <p className="text-[10px] text-muted-foreground">Mes con sub activa</p>
              </div>
              <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setPeriodo(shiftMonth(periodo, 1))} disabled={periodo >= currentMonthKey()}>
                <ChevronRight className="w-4 h-4" />
              </Button>
              <Input
                type="month"
                value={periodo}
                onChange={(e) => e.target.value && setPeriodo(e.target.value)}
                className="h-9 text-sm w-[160px] ml-2"
                max={currentMonthKey()}
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant={showOnlyPending ? "default" : "outline"}
                size="sm"
                onClick={() => setShowOnlyPending(v => !v)}
              >
                {showOnlyPending ? "Mostrar todas" : "Solo pendientes"}
              </Button>
              <Button variant="ghost" size="sm" onClick={loadData}>
                <RefreshCw className="w-4 h-4 mr-1" /> Actualizar
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3 mb-4">
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-red-500/10 border border-red-500/30">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              <span className="text-sm"><b>{pendingCount}</b> bajas sin chequear</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-emerald-500/10 border border-emerald-500/30">
              <CheckCheck className="w-4 h-4 text-emerald-600" />
              <span className="text-sm"><b>{bajas.length - pendingCount}</b> chequeadas</span>
            </div>
          </div>

          {loading ? (
            <div className="py-12 text-center text-muted-foreground animate-pulse">Cargando bajas...</div>
          ) : visible.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              {bajas.length === 0 ? "No hay bajas en este período" : "Todas las bajas fueron chequeadas"}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Alumno</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Vencimiento</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Nota</TableHead>
                  <TableHead className="text-right">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((r) => (
                  <TableRow key={r.id} className={r.baja_chequeada ? "bg-emerald-500/10 hover:bg-emerald-500/15" : "hover:bg-muted/50"}>
                    <TableCell className="text-sm font-medium">
                      {[r.alumnos?.nombre, r.alumnos?.apellido].filter(Boolean).join(" ") || "—"}
                      <div className="text-[11px] text-muted-foreground">{r.alumnos?.email}</div>
                    </TableCell>
                    <TableCell className="text-sm">{r.planes?.nombre || "—"}</TableCell>
                    <TableCell className="text-sm">{fmtDate(r.fecha_fin)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={r.estado === "cancelada" ? "border-red-500/30 text-red-700" : "border-amber-500/30 text-amber-700"}>
                        {r.estado === "cancelada" ? "Cancelada" : "Vencida"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm max-w-[280px]">
                      {r.baja_nota ? <span className="text-muted-foreground line-clamp-2">{r.baja_nota}</span> : <span className="text-[11px] italic text-muted-foreground">Sin nota</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center gap-1 justify-end">
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7"
                          onClick={() => { setEditing(r); setNoteValue(r.baja_nota || ""); }}
                          title="Editar nota"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant={r.baja_chequeada ? "default" : "outline"}
                          size="sm"
                          className={`h-7 px-2 text-[11px] ${r.baja_chequeada ? "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600" : ""}`}
                          onClick={() => handleToggleChequeada(r)}
                        >
                          <CheckCheck className="w-3 h-3 mr-1" />
                          {r.baja_chequeada ? "Chequeada" : "Chequear"}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nota de baja</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Motivo / contacto / acción tomada</Label>
            <Textarea
              value={noteValue}
              onChange={(e) => setNoteValue(e.target.value)}
              rows={5}
              placeholder="Ej: Llamado al alumno, no continúa por mudanza. Ofrecimos plan reducido, evaluará en julio."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={handleSaveNote}>Guardar nota</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
        </TabsContent>
      </Tabs>

      <DarBajaDirectaDialog
        open={openBajaDirecta}
        onOpenChange={setOpenBajaDirecta}
        onDone={() => { setRefreshKey((k) => k + 1); loadData(); }}
      />
      <RegistrarDevolucionDialog
        open={openDevolucion}
        onOpenChange={setOpenDevolucion}
        onDone={() => setRefreshKey((k) => k + 1)}
      />
    </div>
  );

};

export default AdminBajas;
