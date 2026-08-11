import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatPrice } from "@/lib/currency";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { AlertTriangle, RefreshCw, Search, User, Receipt, Wallet } from "lucide-react";
import { useNavigate } from "react-router-dom";

type Severidad = "critica" | "alta" | "media";

type Row = {
  tipo: string;
  severidad: Severidad;
  alumno_id: string | null;
  alumno_nombre: string | null;
  fecha: string | null;
  mp_payment_id: string | null;
  pago_origen: string | null;
  pago_id: string | null;
  monto_pago: number | null;
  moneda: string | null;
  obligacion_tipo: string | null;
  obligacion_id: string | null;
  monto_obligacion: number | null;
  pagado: number | null;
  saldo: number | null;
  diferencia: number | null;
  descripcion: string | null;
  metadata: Record<string, unknown> | null;
};

const TIPO_LABEL: Record<string, string> = {
  MP_IDENTIFICADO_SIN_IMPUTAR: "MP identificado sin imputar",
  MP_SIN_IDENTIFICAR: "MP sin identificar",
  PAGO_CONFIRMADO_CON_SALDO_PENDIENTE: "Pago confirmado con saldo pendiente",
  MEDIO_PAGO_CONTRADICTORIO: "Medio de pago contradictorio",
  IMPORTE_PAGO_DIFERENTE_A_SALDO: "Importe distinto al saldo",
  CREDITO_MP_DUPLICADO: "Crédito MP duplicado",
  CREDITO_MP_SIN_APLICAR_CON_DEUDA: "Crédito sin aplicar con deuda",
  FACTURACION_ESTANCADA: "Facturación estancada",
};

const SEV_CLASS: Record<Severidad, string> = {
  critica: "bg-destructive/15 text-destructive border-destructive/30",
  alta: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  media: "bg-sky-500/15 text-sky-400 border-sky-500/30",
};

const SEV_LABEL: Record<Severidad, string> = { critica: "Crítica", alta: "Alta", media: "Media" };

function fmtDate(d: string | null): string {
  if (!d) return "—";
  const p = d.substring(0, 10).split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
}

export default function InconsistenciasTab() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [sevFilter, setSevFilter] = useState<string>("all");
  const [tipoFilter, setTipoFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("vw_pagos_inconsistencias" as any)
      .select("*")
      .limit(2000);
    if (error) toast.error(error.message);
    else setRows((data as any) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const tipos = useMemo(() => Array.from(new Set(rows.map((r) => r.tipo))).sort(), [rows]);

  const kpis = useMemo(() => {
    const acc = { critica: 0, alta: 0, media: 0 } as Record<Severidad, number>;
    rows.forEach((r) => { acc[r.severidad] = (acc[r.severidad] || 0) + 1; });
    return acc;
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (sevFilter !== "all" && r.severidad !== sevFilter) return false;
      if (tipoFilter !== "all" && r.tipo !== tipoFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        const hay = [r.alumno_nombre, r.mp_payment_id, r.descripcion, r.tipo]
          .filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [rows, sevFilter, tipoFilter, search]);

  const porTipo = useMemo(() => {
    const m = new Map<string, { n: number; monto: number }>();
    filtered.forEach((r) => {
      const cur = m.get(r.tipo) || { n: 0, monto: 0 };
      cur.n += 1;
      cur.monto += Number(r.monto_pago) || 0;
      m.set(r.tipo, cur);
    });
    return Array.from(m.entries()).sort((a, b) => b[1].n - a[1].n);
  }, [filtered]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {(["critica", "alta", "media"] as Severidad[]).map((sev) => (
          <Card
            key={sev}
            className="cursor-pointer hover:border-primary/40"
            onClick={() => setSevFilter(sev)}
          >
            <CardContent className="p-4">
              <span className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" /> {SEV_LABEL[sev]}s
              </span>
              <p className="text-2xl font-bold mt-1">{kpis[sev] || 0}</p>
              <p className="text-[10px] text-muted-foreground">Detección automática · no corrige nada</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar alumno, MP id o descripción…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <Select value={sevFilter} onValueChange={setSevFilter}>
          <SelectTrigger className="h-9 w-40 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las severidades</SelectItem>
            <SelectItem value="critica">Críticas</SelectItem>
            <SelectItem value="alta">Altas</SelectItem>
            <SelectItem value="media">Medias</SelectItem>
          </SelectContent>
        </Select>
        <Select value={tipoFilter} onValueChange={setTipoFilter}>
          <SelectTrigger className="h-9 w-64 text-xs"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            {tipos.map((t) => <SelectItem key={t} value={t}>{TIPO_LABEL[t] ?? t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Actualizar
        </Button>
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} detecciones</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {porTipo.map(([tipo, v]) => (
          <button
            key={tipo}
            onClick={() => setTipoFilter(tipo)}
            className="text-[11px] rounded-full border border-border px-3 py-1 hover:bg-muted/50"
          >
            {TIPO_LABEL[tipo] ?? tipo} · <strong>{v.n}</strong>
            {v.monto > 0 && <span className="text-muted-foreground"> · {formatPrice(v.monto, "ARS")}</span>}
          </button>
        ))}
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-secondary/40">
              <TableHead className="text-xs w-24">Severidad</TableHead>
              <TableHead className="text-xs">Tipo</TableHead>
              <TableHead className="text-xs">Alumno</TableHead>
              <TableHead className="text-xs">Detalle</TableHead>
              <TableHead className="text-xs text-right w-28">Monto</TableHead>
              <TableHead className="text-xs w-24">Fecha</TableHead>
              <TableHead className="text-xs w-36 text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-10">
                  {loading ? "Cargando…" : "Sin inconsistencias con estos filtros."}
                </TableCell>
              </TableRow>
            ) : filtered.map((r, i) => (
              <TableRow key={`${r.tipo}-${r.pago_id ?? r.obligacion_id ?? i}`} className="border-border hover:bg-muted/30">
                <TableCell>
                  <Badge variant="outline" className={`text-[10px] ${SEV_CLASS[r.severidad]}`}>
                    {SEV_LABEL[r.severidad]}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs font-medium">{TIPO_LABEL[r.tipo] ?? r.tipo}</TableCell>
                <TableCell className="text-xs">
                  {r.alumno_nombre || <span className="text-muted-foreground">Sin identificar</span>}
                </TableCell>
                <TableCell className="text-[11px] text-muted-foreground max-w-sm">
                  {r.descripcion || "—"}
                  {r.mp_payment_id && (
                    <span className="block font-mono text-[10px]">MP {r.mp_payment_id}</span>
                  )}
                </TableCell>
                <TableCell className="text-right font-mono text-xs whitespace-nowrap">
                  {r.monto_pago != null ? formatPrice(Number(r.monto_pago), r.moneda || "ARS") : "—"}
                  {r.saldo != null && (
                    <span className="block text-[10px] text-muted-foreground">
                      saldo {formatPrice(Number(r.saldo), r.moneda || "ARS")}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{fmtDate(r.fecha)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center gap-1 justify-end">
                    {r.alumno_id && (
                      <>
                        <Button
                          size="icon" variant="ghost" className="h-7 w-7" title="Ver alumno"
                          onClick={() => navigate(`/admin/alumnos?alumno=${r.alumno_id}`)}
                        >
                          <User className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon" variant="ghost" className="h-7 w-7" title="Ver cuenta corriente"
                          onClick={() => navigate(`/admin/alumnos?alumno=${r.alumno_id}&tab=cuenta`)}
                        >
                          <Wallet className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                    {r.mp_payment_id && (
                      <Button
                        size="icon" variant="ghost" className="h-7 w-7" title="Ver pago en cuentas MP"
                        onClick={() => navigate(`/admin/pagos?tab=mp&q=${r.mp_payment_id}`)}
                      >
                        <Receipt className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <p className="text-[11px] text-muted-foreground">
        Esta pantalla sólo <strong>detecta</strong>: no modifica pagos ni suscripciones. “Importe distinto al saldo”
        puede ser un pago parcial o un excedente legítimo.
      </p>
    </div>
  );
}
