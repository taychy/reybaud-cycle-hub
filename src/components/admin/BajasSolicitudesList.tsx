import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { RefreshCw, CheckCircle2, ShieldCheck, X } from "lucide-react";
import ConfirmBajaDialog from "@/components/admin/ConfirmBajaDialog";

type Row = {
  id: string;
  alumno_id: string;
  origen: string;
  motivo: string;
  motivo_otro_detalle: string | null;
  comentario: string | null;
  estado: string;
  created_at: string;
  snapshot: any;
  alumnos: { id: string; nombre: string; apellido: string | null; email: string } | null;
};

const MOTIVOS_LABEL: Record<string, string> = {
  economico: "Económico",
  horarios: "Horarios",
  lesion_salud: "Lesión/Salud",
  viaje_vacaciones: "Viaje",
  cambio_actividad: "Cambio actividad",
  disconforme_servicio: "Disconforme",
  otro: "Otro",
};

const ESTADO_BADGE: Record<string, string> = {
  solicitada: "bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-400",
  confirmada: "bg-red-500/15 text-red-700 border-red-500/30 dark:text-red-400",
  evitada: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-400",
  cancelada_por_alumno: "bg-muted text-muted-foreground border-border",
};

const fmt = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" });
};

export default function BajasSolicitudesList() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterEstado, setFilterEstado] = useState<string>("solicitada");
  const [confirmRow, setConfirmRow] = useState<Row | null>(null);
  const [evitarRow, setEvitarRow] = useState<Row | null>(null);
  const [evitarMotivo, setEvitarMotivo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("bajas_solicitudes")
      .select("id, alumno_id, origen, motivo, motivo_otro_detalle, comentario, estado, created_at, snapshot, alumnos(id, nombre, apellido, email)")
      .order("created_at", { ascending: false })
      .limit(200);
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setRows((data || []) as unknown as Row[]);
  }, []);

  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => filterEstado === "all" ? rows : rows.filter((r) => r.estado === filterEstado), [rows, filterEstado]);

  const handleEvitar = async () => {
    if (!evitarRow) return;
    if (evitarMotivo.trim().length < 3) { toast.error("Motivo requerido"); return; }
    const { error } = await supabase.rpc("marcar_baja_evitada", {
      p_solicitud_id: evitarRow.id,
      p_motivo: evitarMotivo,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Marcada como retenida");
    setEvitarRow(null);
    setEvitarMotivo("");
    load();
  };

  return (
    <Card>
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={filterEstado} onValueChange={setFilterEstado}>
            <SelectTrigger className="w-[200px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="solicitada">Pendientes</SelectItem>
              <SelectItem value="confirmada">Confirmadas</SelectItem>
              <SelectItem value="evitada">Retenidas</SelectItem>
              <SelectItem value="cancelada_por_alumno">Canceladas por alumno</SelectItem>
              <SelectItem value="all">Todas</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" onClick={load}>
            <RefreshCw className="w-4 h-4 mr-1" /> Actualizar
          </Button>
          <span className="text-xs text-muted-foreground ml-auto">{visible.length} solicitud(es)</span>
        </div>

        {loading ? (
          <div className="py-10 text-center text-muted-foreground animate-pulse">Cargando...</div>
        ) : visible.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Sin solicitudes en este estado.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Alumno</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Origen</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-sm">
                    <div className="font-medium">{[r.alumnos?.nombre, r.alumnos?.apellido].filter(Boolean).join(" ") || "—"}</div>
                    <div className="text-[11px] text-muted-foreground">{r.alumnos?.email}</div>
                  </TableCell>
                  <TableCell className="text-xs">{fmt(r.created_at)}</TableCell>
                  <TableCell><Badge variant="outline" className="text-[10px]">{r.origen}</Badge></TableCell>
                  <TableCell className="text-xs">{MOTIVOS_LABEL[r.motivo] || r.motivo}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-[10px] ${ESTADO_BADGE[r.estado] || ""}`}>{r.estado}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {r.estado === "solicitada" && (
                      <div className="flex gap-1 justify-end">
                        <Button size="sm" variant="outline" className="h-7" onClick={() => { setEvitarRow(r); setEvitarMotivo(""); }}>
                          <ShieldCheck className="w-3 h-3 mr-1" /> Retenido
                        </Button>
                        <Button size="sm" variant="destructive" className="h-7" onClick={() => setConfirmRow(r)}>
                          <CheckCircle2 className="w-3 h-3 mr-1" /> Confirmar baja
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {confirmRow && (
          <ConfirmBajaDialog
            open={!!confirmRow}
            onOpenChange={(v) => { if (!v) setConfirmRow(null); }}
            solicitud={{
              id: confirmRow.id,
              alumno_id: confirmRow.alumno_id,
              motivo: MOTIVOS_LABEL[confirmRow.motivo] || confirmRow.motivo,
              motivo_otro_detalle: confirmRow.motivo_otro_detalle,
              comentario: confirmRow.comentario,
              snapshot: confirmRow.snapshot,
              alumno_nombre: [confirmRow.alumnos?.nombre, confirmRow.alumnos?.apellido].filter(Boolean).join(" "),
            }}
            onConfirmed={load}
          />
        )}

        <Dialog open={!!evitarRow} onOpenChange={(v) => { if (!v) { setEvitarRow(null); setEvitarMotivo(""); } }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Marcar como retenido</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              <Label>¿Qué pasó? (queda registrado)</Label>
              <Textarea rows={4} value={evitarMotivo} onChange={(e) => setEvitarMotivo(e.target.value)} placeholder="Ej: hablé por WA, retoma con plan reducido en agosto" />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEvitarRow(null)}><X className="w-4 h-4 mr-1" />Cancelar</Button>
              <Button onClick={handleEvitar}><ShieldCheck className="w-4 h-4 mr-1" />Confirmar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
