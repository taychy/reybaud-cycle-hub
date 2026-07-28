import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, AlertTriangle, CheckCheck } from "lucide-react";
import DayNavigatorBar from "@/components/admin/DayNavigatorBar";
import { useDayCursor } from "@/hooks/useDayCursor";
import { toast } from "@/hooks/use-toast";

type SubRow = {
  id: string;
  alumno_id: string;
  estado: string;
  fecha_fin: string | null;
  fecha_inicio: string | null;
  baja_chequeada: boolean;
  alumnos: { nombre: string; apellido: string | null } | null;
  planes: { nombre: string } | null;
};

const BajasPorDiaPage = () => {
  const day = useDayCursor({ maxDaysBack: 60 });
  const [rows, setRows] = useState<SubRow[]>([]);
  const [allSubs, setAllSubs] = useState<{ alumno_id: string; fecha_inicio: string | null }[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [subsRes, allRes] = await Promise.all([
      supabase
        .from("suscripciones")
        .select("id, alumno_id, estado, fecha_fin, fecha_inicio, baja_chequeada, alumnos(nombre, apellido), planes(nombre)")
        .in("estado", ["vencida", "cancelada"])
        .eq("baja_chequeada", false)
        .eq("fecha_fin", day.selected),
      supabase.from("suscripciones").select("alumno_id, fecha_inicio"),
    ]);
    if (!subsRes.error && subsRes.data) {
      const all = (allRes.data as { alumno_id: string; fecha_inicio: string | null }[]) || [];
      setAllSubs(all);
      // Excluir a quienes ya renovaron después de la baja
      const filtered = (subsRes.data as unknown as SubRow[]).filter((s) => {
        const renewed = all.some((o) => o.alumno_id === s.alumno_id && o.fecha_inicio && s.fecha_fin && o.fecha_inicio > s.fecha_fin);
        return !renewed;
      });
      setRows(filtered);
    }
    setLoading(false);
  }, [day.selected]);

  useEffect(() => { load(); }, [load]);

  const handleToggle = async (row: SubRow) => {
    const { data: { session } } = await supabase.auth.getSession();
    const { error } = await supabase.from("suscripciones").update({
      baja_chequeada: true,
      baja_chequeada_at: new Date().toISOString(),
      baja_chequeada_by: session?.user?.id ?? null,
    } as any).eq("id", row.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    setRows((prev) => prev.filter((x) => x.id !== row.id));
    toast({ title: "Baja marcada como chequeada" });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link to="/admin/resumen">
          <Button variant="ghost" size="icon" className="h-8 w-8"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-heading font-bold uppercase tracking-wider">Bajas a chequear</h1>
          <p className="text-sm text-muted-foreground">Alumnos sin renovar, día por día (según fecha de fin)</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <DayNavigatorBar
            label={day.label}
            selected={day.selected}
            minISO={day.minISO}
            todayISO={day.todayISO}
            canGoPrev={day.canGoPrev}
            canGoNext={day.canGoNext}
            isToday={day.isToday}
            onPrev={day.goPrev}
            onNext={day.goNext}
            onToday={day.goToday}
            onPick={day.goTo}
            rightContent={
              <Badge variant="outline" className="border-destructive/50 text-destructive">
                {rows.length} pendiente{rows.length === 1 ? "" : "s"} este día
              </Badge>
            }
          />

          {loading ? (
            <div className="py-12 text-center text-muted-foreground animate-pulse">Cargando...</div>
          ) : rows.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">Sin bajas por chequear para este día. 🎉</div>
          ) : (
            <div className="space-y-2">
              {rows.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 border rounded-lg px-4 py-3 border-destructive/40 bg-destructive/5">
                  <div className="flex items-center gap-3 min-w-0">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-destructive" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">
                        {[r.alumnos?.nombre, r.alumnos?.apellido].filter(Boolean).join(" ") || "—"}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {r.planes?.nombre || "—"} · {r.estado === "cancelada" ? "Cancelada" : "Vencida"}
                      </p>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => handleToggle(r)}>
                    <CheckCheck className="w-3.5 h-3.5 mr-1" /> Chequear
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default BajasPorDiaPage;
