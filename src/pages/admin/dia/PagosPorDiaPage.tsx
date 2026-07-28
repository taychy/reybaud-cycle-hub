import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CreditCard, CheckCheck } from "lucide-react";
import { formatPrice } from "@/lib/currency";
import DayNavigatorBar from "@/components/admin/DayNavigatorBar";
import { useDayCursor } from "@/hooks/useDayCursor";
import { toast } from "@/hooks/use-toast";

type SubRow = {
  id: string;
  alumno_id: string;
  estado: string;
  metodo_pago: string;
  precio_final: number | null;
  created_at: string;
  chequeado_admin: boolean;
  alumnos: { nombre: string; apellido: string | null } | null;
  planes: { nombre: string; precio: number } | null;
};

const PagosPorDiaPage = () => {
  const day = useDayCursor({ maxDaysBack: 60 });
  const [rows, setRows] = useState<SubRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("suscripciones")
      .select("id, alumno_id, estado, metodo_pago, precio_final, created_at, chequeado_admin, alumnos(nombre, apellido), planes(nombre, precio)")
      .in("estado", ["activa", "conciliado"])
      .eq("chequeado_admin", false)
      .gte("created_at", `${day.selected}T00:00:00`)
      .lte("created_at", `${day.selected}T23:59:59.999`)
      .order("created_at", { ascending: true });
    if (!error && data) setRows(data as unknown as SubRow[]);
    setLoading(false);
  }, [day.selected]);

  useEffect(() => { load(); }, [load]);

  const handleToggle = async (row: SubRow) => {
    const { data: { session } } = await supabase.auth.getSession();
    const { error } = await supabase.from("suscripciones").update({
      chequeado_admin: true,
      chequeado_admin_at: new Date().toISOString(),
      chequeado_admin_by: session?.user?.id ?? null,
    } as any).eq("id", row.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    setRows((prev) => prev.filter((x) => x.id !== row.id));
    toast({ title: "Pago chequeado" });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link to="/admin/resumen">
          <Button variant="ghost" size="icon" className="h-8 w-8"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-heading font-bold uppercase tracking-wider">Pagos a chequear</h1>
          <p className="text-sm text-muted-foreground">Conciliar contra MP / transferencia / efectivo, día por día</p>
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
              <Badge variant="outline" className="border-orange-500/40 text-orange-600">
                {rows.length} pendiente{rows.length === 1 ? "" : "s"} este día
              </Badge>
            }
          />

          {loading ? (
            <div className="py-12 text-center text-muted-foreground animate-pulse">Cargando...</div>
          ) : rows.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">Sin pagos por chequear para este día. 🎉</div>
          ) : (
            <div className="space-y-2">
              {rows.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 border rounded-lg px-4 py-3 border-orange-500/30 bg-orange-500/5">
                  <div className="flex items-center gap-3 min-w-0">
                    <CreditCard className="w-4 h-4 shrink-0 text-orange-600" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">
                        {[r.alumnos?.nombre, r.alumnos?.apellido].filter(Boolean).join(" ") || "—"}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {r.planes?.nombre || "—"} · {formatPrice(r.precio_final ?? r.planes?.precio ?? 0)} · {r.metodo_pago}
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

export default PagosPorDiaPage;
