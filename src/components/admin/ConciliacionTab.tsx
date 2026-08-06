import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, CheckCircle2, RotateCcw, ShieldCheck, AlertTriangle } from "lucide-react";
import { formatPrice } from "@/lib/currency";

type Fuente = "suscripcion" | "evento" | "tienda";

interface Row {
  fuente: Fuente;
  registro_id: string;
  alumno_id: string | null;
  alumno_nombre: string | null;
  monto: number | null;
  moneda: string | null;
  fecha: string | null;
  metodo_pago: string | null;
  origen: string | null;
  mp_payment_id: string | null;
  estado_origen: string | null;
  estado_conciliacion: "auto_conciliado" | "verificado" | "por_verificar" | "no_aplica";
  verificado: boolean | null;
  verificado_at: string | null;
  descripcion: string | null;
}

const FUENTE_LABEL: Record<Fuente, string> = {
  suscripcion: "Mensualidad",
  evento: "Evento",
  tienda: "Tienda",
};

export function ConciliacionTab() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [fuente, setFuente] = useState<string>("todas");
  const [estado, setEstado] = useState<string>("por_verificar");
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("vw_conciliacion_pagos" as any)
      .select("*")
      .neq("estado_conciliacion", "no_aplica")
      .order("fecha", { ascending: false })
      .limit(500);
    if (error) {
      toast.error("No pudimos cargar la conciliación");
    } else {
      setRows((data as unknown as Row[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (fuente !== "todas" && r.fuente !== fuente) return false;
      if (estado !== "todos" && r.estado_conciliacion !== estado) return false;
      if (q && !`${r.alumno_nombre ?? ""} ${r.descripcion ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, fuente, estado, search]);

  const counts = useMemo(() => {
    const c = { por_verificar: 0, verificado: 0, auto_conciliado: 0 };
    rows.forEach((r) => {
      if (r.estado_conciliacion in c) (c as any)[r.estado_conciliacion]++;
    });
    return c;
  }, [rows]);

  const toggle = async (row: Row, value: boolean) => {
    setSaving(row.registro_id);
    const { error } = await supabase.rpc("marcar_pago_verificado" as any, {
      _fuente: row.fuente,
      _registro_id: row.registro_id,
      _verificado: value,
      _nota: null,
    });
    setSaving(null);
    if (error) {
      toast.error(error.message || "No pudimos actualizar el pago");
      return;
    }
    toast.success(value ? "Pago verificado" : "Verificación quitada");
    setRows((prev) =>
      prev.map((r) =>
        r.registro_id === row.registro_id && r.fuente === row.fuente
          ? { ...r, verificado: value, estado_conciliacion: value ? "verificado" : "por_verificar" }
          : r
      )
    );
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Por verificar
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{counts.por_verificar}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" /> Verificados a mano
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{counts.verificado}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" /> Conciliados automáticamente
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{counts.auto_conciliado}</CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <Select value={fuente} onValueChange={setFuente}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todos los módulos</SelectItem>
            <SelectItem value="suscripcion">Mensualidades</SelectItem>
            <SelectItem value="evento">Eventos</SelectItem>
            <SelectItem value="tienda">Tienda</SelectItem>
          </SelectContent>
        </Select>
        <Select value={estado} onValueChange={setEstado}>
          <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="por_verificar">Por verificar</SelectItem>
            <SelectItem value="verificado">Verificados</SelectItem>
            <SelectItem value="auto_conciliado">Conciliados automáticamente</SelectItem>
            <SelectItem value="todos">Todos</SelectItem>
          </SelectContent>
        </Select>
        <Input
          placeholder="Buscar alumno o concepto…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-[240px]"
        />
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RotateCcw className="h-4 w-4 mr-2" /> Actualizar
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground">Nada pendiente por acá.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => (
            <Card key={`${r.fuente}-${r.registro_id}`}>
              <CardContent className="py-3 flex flex-wrap items-center gap-3 justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline">{FUENTE_LABEL[r.fuente]}</Badge>
                    <span className="font-medium truncate">{r.alumno_nombre || "Sin alumno"}</span>
                    {r.estado_conciliacion === "auto_conciliado" && (
                      <Badge className="bg-primary/15 text-primary border-primary/30">Auto (MP)</Badge>
                    )}
                    {r.estado_conciliacion === "verificado" && (
                      <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30">Verificado</Badge>
                    )}
                    {r.estado_conciliacion === "por_verificar" && (
                      <Badge variant="destructive">Por verificar</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground truncate">
                    {r.descripcion} · {r.metodo_pago || "sin método"}
                    {r.fecha ? ` · ${new Date(r.fecha).toLocaleDateString("es-AR")}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold whitespace-nowrap">
                    {formatPrice(Number(r.monto || 0), r.moneda || "ARS")}
                  </span>
                  {r.estado_conciliacion !== "auto_conciliado" && (
                    <Button
                      size="sm"
                      variant={r.estado_conciliacion === "verificado" ? "outline" : "default"}
                      disabled={saving === r.registro_id}
                      onClick={() => toggle(r, r.estado_conciliacion !== "verificado")}
                    >
                      {saving === r.registro_id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : r.estado_conciliacion === "verificado" ? (
                        "Quitar"
                      ) : (
                        "Verificar"
                      )}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default ConciliacionTab;
