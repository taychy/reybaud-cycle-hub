import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Wallet, RefreshCw, Search, Download, ArrowRight, TrendingUp, TrendingDown, Equal } from "lucide-react";
import { formatPrice } from "@/lib/currency";
import { toast } from "sonner";

interface Saldo {
  alumno_id: string;
  nombre: string;
  apellido: string;
  email: string | null;
  telefono: string | null;
  sede_id: string | null;
  grupo: string | null;
  estado: string | null;
  moneda: string;
  total_cargos: number;
  total_pagos: number;
  saldo: number;
  ultimo_movimiento: string | null;
  cantidad_movimientos: number;
}

interface Sede {
  id: string;
  nombre: string;
}

type SaldoFilter = "todos" | "deben" | "a_favor" | "al_dia";

function formatDate(d: string | null): string {
  if (!d) return "—";
  const parts = d.substring(0, 10).split("-");
  if (parts.length !== 3) return d;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function daysSince(d: string | null): number | null {
  if (!d) return null;
  const parts = d.substring(0, 10).split("-").map((s) => parseInt(s, 10));
  if (parts.length !== 3) return null;
  const then = new Date(parts[0], parts[1] - 1, parts[2]);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.floor((now.getTime() - then.getTime()) / (1000 * 60 * 60 * 24));
}

export default function AdminCuentaCorriente() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Saldo[]>([]);
  const [sedes, setSedes] = useState<Sede[]>([]);

  const [search, setSearch] = useState("");
  const [monedaFilter, setMonedaFilter] = useState<string>("all");
  const [saldoFilter, setSaldoFilter] = useState<SaldoFilter>("deben");
  const [sedeFilter, setSedeFilter] = useState<string>("all");
  const [grupoFilter, setGrupoFilter] = useState<string>("all");

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [saldosRes, sedesRes] = await Promise.all([
      supabase.rpc("get_saldos_todos_alumnos" as any),
      supabase.from("sedes").select("id, nombre").order("nombre"),
    ]);
    if (saldosRes.error) {
      console.error(saldosRes.error);
      toast.error("No se pudo cargar la cuenta corriente global");
    } else {
      setRows((saldosRes.data || []) as Saldo[]);
    }
    if (sedesRes.data) setSedes(sedesRes.data as Sede[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Apply filter from query string if provided
  useEffect(() => {
    const f = searchParams.get("filter");
    if (f === "deben" || f === "a_favor" || f === "al_dia" || f === "todos") {
      setSaldoFilter(f);
    }
  }, [searchParams]);

  const monedasPresentes = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => s.add(r.moneda));
    return Array.from(s).sort();
  }, [rows]);

  const gruposPresentes = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => r.grupo && s.add(r.grupo));
    return Array.from(s).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (monedaFilter !== "all" && r.moneda !== monedaFilter) return false;
      if (sedeFilter !== "all" && r.sede_id !== sedeFilter) return false;
      if (grupoFilter !== "all" && r.grupo !== grupoFilter) return false;
      const saldo = Number(r.saldo) || 0;
      if (saldoFilter === "deben" && saldo <= 0.01) return false;
      if (saldoFilter === "a_favor" && saldo >= -0.01) return false;
      if (saldoFilter === "al_dia" && Math.abs(saldo) > 0.01) return false;
      if (q) {
        const haystack = `${r.nombre} ${r.apellido} ${r.email || ""} ${r.telefono || ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, monedaFilter, sedeFilter, grupoFilter, saldoFilter]);

  // KPIs por moneda (sobre TODOS los rows, no los filtrados)
  const kpis = useMemo(() => {
    const acc: Record<string, { porCobrar: number; aFavor: number; alumnosDeudores: Set<string>; alumnosCredito: Set<string> }> = {};
    rows.forEach((r) => {
      if (!acc[r.moneda]) acc[r.moneda] = { porCobrar: 0, aFavor: 0, alumnosDeudores: new Set(), alumnosCredito: new Set() };
      const s = Number(r.saldo) || 0;
      if (s > 0.01) {
        acc[r.moneda].porCobrar += s;
        acc[r.moneda].alumnosDeudores.add(r.alumno_id);
      } else if (s < -0.01) {
        acc[r.moneda].aFavor += Math.abs(s);
        acc[r.moneda].alumnosCredito.add(r.alumno_id);
      }
    });
    return Object.entries(acc)
      .map(([moneda, v]) => ({
        moneda,
        porCobrar: v.porCobrar,
        aFavor: v.aFavor,
        cantDeudores: v.alumnosDeudores.size,
        cantCredito: v.alumnosCredito.size,
      }))
      .sort((a, b) => a.moneda.localeCompare(b.moneda));
  }, [rows]);

  const handleExport = () => {
    const headers = ["Apellido", "Nombre", "Email", "Teléfono", "Grupo", "Moneda", "Cargos", "Pagos", "Saldo", "Últ. mov.", "Días"];
    const lines = [headers.join(",")];
    filtered.forEach((r) => {
      const days = daysSince(r.ultimo_movimiento);
      lines.push([
        `"${r.apellido}"`,
        `"${r.nombre}"`,
        `"${r.email || ""}"`,
        `"${r.telefono || ""}"`,
        `"${r.grupo || ""}"`,
        r.moneda,
        Number(r.total_cargos).toFixed(2),
        Number(r.total_pagos).toFixed(2),
        Number(r.saldo).toFixed(2),
        formatDate(r.ultimo_movimiento),
        days ?? "",
      ].join(","));
    });
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cuenta-corriente-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center">
            <Wallet className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-heading font-bold tracking-wider uppercase text-foreground">Cuenta corriente</h1>
            <p className="text-sm text-muted-foreground">Saldos globales por alumno y moneda</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Actualizar
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={filtered.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            Exportar CSV
          </Button>
        </div>
      </div>

      {/* KPIs por moneda */}
      {kpis.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground text-center">
          {loading ? "Cargando saldos…" : "Sin movimientos registrados en ningún alumno."}
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {kpis.map((k) => (
            <Card key={k.moneda} className="p-4 bg-card border-border">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">{k.moneda}</span>
                <Badge variant="outline" className="text-[10px]">{k.cantDeudores + k.cantCredito} alumnos</Badge>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <TrendingUp className="w-3.5 h-3.5 text-destructive" />
                    Por cobrar
                  </div>
                  <div className="text-right">
                    <div className="font-mono font-bold text-destructive">{formatPrice(k.porCobrar, k.moneda)}</div>
                    <div className="text-[10px] text-muted-foreground">{k.cantDeudores} {k.cantDeudores === 1 ? "alumno" : "alumnos"}</div>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <TrendingDown className="w-3.5 h-3.5 text-emerald-400" />
                    A favor
                  </div>
                  <div className="text-right">
                    <div className="font-mono font-bold text-emerald-400">{formatPrice(k.aFavor, k.moneda)}</div>
                    <div className="text-[10px] text-muted-foreground">{k.cantCredito} {k.cantCredito === 1 ? "alumno" : "alumnos"}</div>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar alumno, email, teléfono…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 bg-secondary border-border"
          />
        </div>

        <Select value={saldoFilter} onValueChange={(v) => setSaldoFilter(v as SaldoFilter)}>
          <SelectTrigger className="h-9 w-40 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="deben">Solo deudores</SelectItem>
            <SelectItem value="a_favor">Solo saldo a favor</SelectItem>
            <SelectItem value="al_dia">Solo al día</SelectItem>
            <SelectItem value="todos">Todos</SelectItem>
          </SelectContent>
        </Select>

        <Select value={monedaFilter} onValueChange={setMonedaFilter}>
          <SelectTrigger className="h-9 w-32 text-xs"><SelectValue placeholder="Moneda" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas monedas</SelectItem>
            {monedasPresentes.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>

        {sedes.length > 0 && (
          <Select value={sedeFilter} onValueChange={setSedeFilter}>
            <SelectTrigger className="h-9 w-40 text-xs"><SelectValue placeholder="Sede" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las sedes</SelectItem>
              {sedes.map((s) => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}
            </SelectContent>
          </Select>
        )}

        {gruposPresentes.length > 0 && (
          <Select value={grupoFilter} onValueChange={setGrupoFilter}>
            <SelectTrigger className="h-9 w-32 text-xs"><SelectValue placeholder="Grupo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los grupos</SelectItem>
              {gruposPresentes.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
            </SelectContent>
          </Select>
        )}

        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} filas</span>
      </div>

      {/* Tabla */}
      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-secondary/40">
              <TableHead className="text-xs">Alumno</TableHead>
              <TableHead className="text-xs w-20">Grupo</TableHead>
              <TableHead className="text-xs w-20">Moneda</TableHead>
              <TableHead className="text-xs text-right w-32">Cargos</TableHead>
              <TableHead className="text-xs text-right w-32">Pagos</TableHead>
              <TableHead className="text-xs text-right w-32">Saldo</TableHead>
              <TableHead className="text-xs w-28">Últ. mov.</TableHead>
              <TableHead className="text-xs w-16 text-right">Mora</TableHead>
              <TableHead className="text-xs w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-10">
                  {loading ? "Cargando…" : "No hay alumnos que cumplan los filtros."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => {
                const saldo = Number(r.saldo) || 0;
                const isDeuda = saldo > 0.01;
                const isCredito = saldo < -0.01;
                const tone = isDeuda ? "text-destructive" : isCredito ? "text-emerald-400" : "text-muted-foreground";
                const Icon = isDeuda ? TrendingUp : isCredito ? TrendingDown : Equal;
                const days = isDeuda ? daysSince(r.ultimo_movimiento) : null;
                return (
                  <TableRow
                    key={`${r.alumno_id}-${r.moneda}`}
                    className="border-border hover:bg-muted/30 cursor-pointer"
                    onClick={() => navigate(`/admin/alumnos?alumno=${r.alumno_id}`)}
                  >
                    <TableCell>
                      <div className="font-medium text-sm text-foreground">{r.apellido}, {r.nombre}</div>
                      <div className="text-[10px] text-muted-foreground">{r.email || "—"}</div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.grupo || "—"}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]">{r.moneda}</Badge></TableCell>
                    <TableCell className="text-right font-mono text-xs text-destructive whitespace-nowrap">
                      {formatPrice(Number(r.total_cargos) || 0, r.moneda)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-emerald-400 whitespace-nowrap">
                      {formatPrice(Number(r.total_pagos) || 0, r.moneda)}
                    </TableCell>
                    <TableCell className={`text-right font-mono text-sm font-bold whitespace-nowrap ${tone}`}>
                      <span className="inline-flex items-center gap-1 justify-end">
                        <Icon className="w-3 h-3" />
                        {formatPrice(Math.abs(saldo), r.moneda)}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(r.ultimo_movimiento)}</TableCell>
                    <TableCell className="text-right">
                      {days !== null && days > 0 && (
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${
                            days > 30 ? "bg-destructive/15 text-destructive border-destructive/30"
                              : days > 7 ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {days}d
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
