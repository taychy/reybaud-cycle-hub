import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, UserPlus, MessageCircle } from "lucide-react";
import DayNavigatorBar from "@/components/admin/DayNavigatorBar";
import { useDayCursor } from "@/hooks/useDayCursor";

type AlumnoRow = {
  id: string;
  nombre: string;
  apellido: string | null;
  telefono: string | null;
  email: string;
  grupo: string;
  estado: string;
  created_at: string;
};

const formatWhatsAppUrl = (telefono: string | null, nombre?: string) => {
  if (!telefono) return null;
  let clean = telefono.replace(/\D/g, "");
  if (clean.startsWith("15")) clean = "549" + clean.slice(2);
  else if (clean.startsWith("11") || clean.startsWith("0")) {
    if (clean.startsWith("0")) clean = clean.slice(1);
    clean = "549" + clean;
  } else if (!clean.startsWith("54")) {
    clean = "549" + clean;
  }
  const msg = nombre
    ? encodeURIComponent(`Hola ${nombre}, te contactamos desde Reybaud Ciclismo.`)
    : encodeURIComponent("Hola");
  return `https://wa.me/${clean}?text=${msg}`;
};

const NuevosUsuariosPorDiaPage = () => {
  const day = useDayCursor({ maxDaysBack: 60 });
  const [rows, setRows] = useState<AlumnoRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("alumnos")
      .select("id, nombre, apellido, telefono, email, grupo, estado, created_at")
      .gte("created_at", `${day.selected}T00:00:00`)
      .lte("created_at", `${day.selected}T23:59:59.999`)
      .order("created_at", { ascending: true });
    if (!error && data) setRows(data as unknown as AlumnoRow[]);
    setLoading(false);
  }, [day.selected]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link to="/admin/resumen">
          <Button variant="ghost" size="icon" className="h-8 w-8"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-heading font-bold uppercase tracking-wider">Nuevos usuarios</h1>
          <p className="text-sm text-muted-foreground">Registros por día</p>
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
              <Badge variant="outline" className="border-emerald-500/40 text-emerald-600">
                {rows.length} registro{rows.length === 1 ? "" : "s"} este día
              </Badge>
            }
          />

          {loading ? (
            <div className="py-12 text-center text-muted-foreground animate-pulse">Cargando...</div>
          ) : rows.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">Sin registros nuevos este día.</div>
          ) : (
            <div className="space-y-2">
              {rows.map((r) => {
                const waUrl = formatWhatsAppUrl(r.telefono, r.nombre);
                return (
                  <div key={r.id} className="flex items-center justify-between gap-3 border rounded-lg px-4 py-3 border-emerald-500/30 bg-emerald-500/5">
                    <div className="flex items-center gap-3 min-w-0">
                      <UserPlus className="w-4 h-4 shrink-0 text-emerald-600" />
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">
                          {[r.nombre, r.apellido].filter(Boolean).join(" ")}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{r.email} · {r.grupo}</p>
                      </div>
                    </div>
                    {waUrl && (
                      <Button size="sm" variant="outline" onClick={() => window.open(waUrl, "_blank")}>
                        <MessageCircle className="w-3.5 h-3.5 mr-1" /> WhatsApp
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default NuevosUsuariosPorDiaPage;
