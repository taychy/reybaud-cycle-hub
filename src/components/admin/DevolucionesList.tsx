import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { RefreshCw, Plus, RotateCcw } from "lucide-react";
import { formatPrice } from "@/lib/currency";
import RegistrarDevolucionDialog from "@/components/admin/RegistrarDevolucionDialog";

type Row = {
  id: string;
  alumno_id: string;
  monto: number;
  moneda: string;
  fecha: string;
  metodo: string;
  referencia: string | null;
  motivo: string;
  notas: string | null;
  created_at: string;
  alumnos: { id: string; nombre: string; apellido: string | null; email: string } | null;
};

const fmtDate = (d: string | null) => {
  if (!d) return "—";
  const [y, m, day] = d.substring(0, 10).split("-");
  return `${day}/${m}/${y}`;
};

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export default function DevolucionesList() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState<string>(monthKey(new Date()));
  const [filterMoneda, setFilterMoneda] = useState<string>("all");
  const [openCreate, setOpenCreate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const start = `${periodo}-01`;
    const [y, m] = periodo.split("-").map(Number);
    const end = new Date(y, m, 1).toISOString().substring(0, 10);
    const { data, error } = await supabase
      .from("devoluciones")
      .select("id, alumno_id, monto, moneda, fecha, metodo, referencia, motivo, notas, created_at, alumnos(id, nombre, apellido, email)")
      .gte("fecha", start)
      .lt("fecha", end)
      .order("fecha", { ascending: false })
      .limit(500);
    setLoading(false);
    if (!error) setRows((data || []) as unknown as Row[]);
  }, [periodo]);

  useEffect(() => { load(); }, [load]);

  const visible = useMemo(
    () => filterMoneda === "all" ? rows : rows.filter((r) => r.moneda === filterMoneda),
    [rows, filterMoneda]
  );

  const totalesPorMoneda = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const r of visible) acc[r.moneda] = (acc[r.moneda] || 0) + Number(r.monto || 0);
    return acc;
  }, [visible]);

  return (
    <Card>
      <CardContent className="pt-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="month"
            value={periodo}
            onChange={(e) => e.target.value && setPeriodo(e.target.value)}
            className="h-9 w-[160px]"
          />
          <Select value={filterMoneda} onValueChange={setFilterMoneda}>
            <SelectTrigger className="w-[140px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las monedas</SelectItem>
              <SelectItem value="ARS">ARS</SelectItem>
              <SelectItem value="USD">USD</SelectItem>
              <SelectItem value="EUR">EUR</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" onClick={load}>
            <RefreshCw className="w-4 h-4 mr-1" /> Actualizar
          </Button>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {Object.entries(totalesPorMoneda).map(([mon, tot]) => (
              <Badge key={mon} variant="outline" className="text-xs">
                {mon}: {formatPrice(tot, mon)}
              </Badge>
            ))}
            <Button size="sm" onClick={() => setOpenCreate(true)}>
              <Plus className="w-4 h-4 mr-1" /> Nueva devolución
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="py-10 text-center text-muted-foreground animate-pulse">Cargando…</div>
        ) : visible.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
            <RotateCcw className="w-8 h-8 opacity-40" />
            Sin devoluciones en este período.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Alumno</TableHead>
                <TableHead>Monto</TableHead>
                <TableHead>Método</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead>Ref.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs">{fmtDate(r.fecha)}</TableCell>
                  <TableCell className="text-sm">
                    <div className="font-medium">{[r.alumnos?.nombre, r.alumnos?.apellido].filter(Boolean).join(" ") || "—"}</div>
                    <div className="text-[11px] text-muted-foreground">{r.alumnos?.email}</div>
                  </TableCell>
                  <TableCell className="text-sm font-medium">{formatPrice(Number(r.monto), r.moneda)}</TableCell>
                  <TableCell className="text-xs"><Badge variant="outline" className="text-[10px]">{r.metodo}</Badge></TableCell>
                  <TableCell className="text-xs max-w-[260px] truncate" title={r.motivo}>{r.motivo}</TableCell>
                  <TableCell className="text-[11px] text-muted-foreground">{r.referencia || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <RegistrarDevolucionDialog open={openCreate} onOpenChange={setOpenCreate} onDone={load} />
      </CardContent>
    </Card>
  );
}
