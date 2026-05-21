import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Trash2, ExternalLink, RefreshCw, Wallet, ChevronDown, ChevronUp } from "lucide-react";
import { formatPrice } from "@/lib/currency";
import { toast } from "sonner";
import { AjusteCuentaModal, type AjusteCuentaValue } from "./AjusteCuentaModal";

interface Props {
  alumnoId: string;
}

interface Movimiento {
  alumno_id: string;
  fecha: string;
  tipo: string;
  concepto: string;
  fuente_tabla: string;
  fuente_id: string;
  debe: number;
  haber: number;
  moneda: string;
  estado: string | null;
  referencia_extra: any;
}

interface SaldoRow {
  moneda: string;
  total_cargos: number;
  total_pagos: number;
  saldo: number;
}

const TIPO_LABEL: Record<string, { label: string; className: string }> = {
  cargo_suscripcion: { label: "Suscripción", className: "bg-primary/15 text-primary border-primary/30" },
  pago_suscripcion: { label: "Pago plan", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  cargo_reserva: { label: "Reserva", className: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30" },
  pago_reserva: { label: "Pago reserva", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  ajuste_cargo: { label: "Ajuste (cargo)", className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  ajuste_credito: { label: "Ajuste (crédito)", className: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
};

function formatDate(d: string): string {
  if (!d) return "—";
  const parts = d.substring(0, 10).split("-");
  if (parts.length !== 3) return d;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export function StudentCuentaCorrienteSection({ alumnoId }: Props) {
  const [loading, setLoading] = useState(true);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [saldos, setSaldos] = useState<SaldoRow[]>([]);
  const [monedaFilter, setMonedaFilter] = useState<string>("all");
  const [tipoFilter, setTipoFilter] = useState<string>("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AjusteCuentaValue | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [movRes, saldoRes] = await Promise.all([
      supabase
        .from("vw_cuenta_corriente_movimientos" as any)
        .select("*")
        .eq("alumno_id", alumnoId)
        .order("fecha", { ascending: false }),
      supabase.rpc("get_saldo_alumno" as any, { p_alumno_id: alumnoId }),
    ]);

    if (movRes.error) {
      console.error(movRes.error);
      toast.error("No se pudieron cargar los movimientos");
    } else {
      setMovimientos(((movRes.data || []) as unknown) as Movimiento[]);
    }
    if (saldoRes.error) {
      console.error(saldoRes.error);
    } else {
      setSaldos((saldoRes.data || []) as SaldoRow[]);
    }
    setLoading(false);
  }, [alumnoId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filtered = useMemo(() => {
    return movimientos.filter((m) => {
      if (monedaFilter !== "all" && m.moneda !== monedaFilter) return false;
      if (tipoFilter !== "all" && m.tipo !== tipoFilter) return false;
      return true;
    });
  }, [movimientos, monedaFilter, tipoFilter]);

  const monedasPresentes = useMemo(() => {
    const set = new Set<string>(saldos.map((s) => s.moneda));
    movimientos.forEach((m) => set.add(m.moneda));
    return Array.from(set).sort();
  }, [saldos, movimientos]);

  const handleEditAjuste = (m: Movimiento) => {
    if (m.fuente_tabla !== "cuenta_ajustes") return;
    setEditing({
      id: m.fuente_id,
      tipo: m.tipo === "ajuste_cargo" ? "cargo" : "credito",
      concepto: m.concepto,
      monto: m.tipo === "ajuste_cargo" ? m.debe : m.haber,
      moneda: m.moneda,
      fecha: m.fecha,
      notas: m.referencia_extra?.notas || "",
    });
    setModalOpen(true);
  };

  const handleDeleteAjuste = async () => {
    if (!deletingId) return;
    const { error } = await supabase.from("cuenta_ajustes").delete().eq("id", deletingId);
    if (error) {
      toast.error("Error al eliminar ajuste");
    } else {
      toast.success("Ajuste eliminado");
      fetchData();
    }
    setDeletingId(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wallet className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-heading font-semibold text-foreground">Cuenta corriente</h3>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-1" /> Ajuste manual
          </Button>
        </div>
      </div>

      {/* Saldos por moneda */}
      {saldos.length === 0 ? (
        <Card className="p-4 text-sm text-muted-foreground">
          Sin movimientos registrados.
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {saldos.map((s) => {
            const tone =
              s.saldo > 0 ? "text-destructive" : s.saldo < 0 ? "text-emerald-400" : "text-muted-foreground";
            const label =
              s.saldo > 0 ? "Debe" : s.saldo < 0 ? "A favor" : "Sin saldo";
            return (
              <Card key={s.moneda} className="p-4 bg-card/50 border-border">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs uppercase tracking-wider text-muted-foreground">{s.moneda}</span>
                  <span className={`text-[10px] uppercase font-semibold ${tone}`}>{label}</span>
                </div>
                <div className={`text-2xl font-heading font-bold ${tone}`}>
                  {formatPrice(Math.abs(Number(s.saldo) || 0), s.moneda)}
                </div>
                <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
                  <span>Cargos: {formatPrice(Number(s.total_cargos) || 0, s.moneda)}</span>
                  <span>Pagos: {formatPrice(Number(s.total_pagos) || 0, s.moneda)}</span>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={monedaFilter} onValueChange={setMonedaFilter}>
          <SelectTrigger className="h-8 w-32 text-xs">
            <SelectValue placeholder="Moneda" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las monedas</SelectItem>
            {monedasPresentes.map((m) => (
              <SelectItem key={m} value={m}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={tipoFilter} onValueChange={setTipoFilter}>
          <SelectTrigger className="h-8 w-44 text-xs">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            {Object.entries(TIPO_LABEL).map(([key, v]) => (
              <SelectItem key={key} value={key}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">{filtered.length} movimientos</span>
      </div>

      {/* Tabla de movimientos */}
      <div className="rounded-md border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-secondary/40">
              <TableHead className="text-xs">Fecha</TableHead>
              <TableHead className="text-xs">Origen</TableHead>
              <TableHead className="text-xs">Concepto</TableHead>
              <TableHead className="text-xs text-right">Debe</TableHead>
              <TableHead className="text-xs text-right">Haber</TableHead>
              <TableHead className="text-xs">Estado</TableHead>
              <TableHead className="text-xs w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">
                  {loading ? "Cargando…" : "Sin movimientos para los filtros seleccionados."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((m) => {
                const tipoInfo = TIPO_LABEL[m.tipo] || { label: m.tipo, className: "" };
                const isAjuste = m.fuente_tabla === "cuenta_ajustes";
                return (
                  <TableRow key={`${m.fuente_tabla}-${m.fuente_id}-${m.tipo}`} className="text-sm">
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatDate(m.fecha)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] ${tipoInfo.className}`}>
                        {tipoInfo.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-foreground">{m.concepto}</TableCell>
                    <TableCell className="text-right font-mono text-xs text-destructive">
                      {m.debe > 0 ? formatPrice(Number(m.debe), m.moneda) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-emerald-400">
                      {m.haber > 0 ? formatPrice(Number(m.haber), m.moneda) : "—"}
                    </TableCell>
                    <TableCell className="text-[10px] text-muted-foreground">{m.estado || "—"}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        {isAjuste ? (
                          <>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => handleEditAjuste(m)}
                              title="Editar ajuste"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => setDeletingId(m.fuente_id)}
                              title="Eliminar ajuste"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <AjusteCuentaModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        alumnoId={alumnoId}
        initialValue={editing}
        onSaved={() => {
          setModalOpen(false);
          setEditing(null);
          fetchData();
        }}
      />

      <AlertDialog open={!!deletingId} onOpenChange={(o) => !o && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar ajuste?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. El movimiento será removido de la cuenta corriente del alumno.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteAjuste} className="bg-destructive hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
