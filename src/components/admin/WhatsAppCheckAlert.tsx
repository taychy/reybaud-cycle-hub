import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, ChevronRight, CheckCircle2 } from "lucide-react";

type RunRow = { grupo: string; fecha_objetivo: string; estado: string; cerrado_at: string | null };

// Determina la fecha objetivo activa del chequeo (5 o 15) según el día actual
// Devuelve { fechaObjetivo, ventana: 'naranja' | 'rojo' | null }
const computeWindow = (now = new Date()) => {
  const day = now.getDate();
  const y = now.getFullYear();
  const m = now.getMonth();
  const fmt = (yy: number, mm: number, dd: number) => `${yy}-${String(mm + 1).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  // Ventana del 5: días 5-7 naranja, día 8-10 rojo (atrasado)
  if (day >= 5 && day <= 7) return { fechaObjetivo: fmt(y, m, 5), tone: "naranja" as const };
  if (day >= 8 && day <= 10) return { fechaObjetivo: fmt(y, m, 5), tone: "rojo" as const };
  // Ventana del 15: 15-17 naranja, 18-20 rojo
  if (day >= 15 && day <= 17) return { fechaObjetivo: fmt(y, m, 15), tone: "naranja" as const };
  if (day >= 18 && day <= 20) return { fechaObjetivo: fmt(y, m, 15), tone: "rojo" as const };
  return { fechaObjetivo: null, tone: null };
};

export const WhatsAppCheckAlert = () => {
  const navigate = useNavigate();
  const [grupos, setGrupos] = useState<string[]>([]);
  const [runs, setRuns] = useState<Record<string, RunRow>>({});
  const [loading, setLoading] = useState(true);

  const win = computeWindow();

  useEffect(() => {
    const fetchAll = async () => {
      if (!win.fechaObjetivo) { setLoading(false); return; }
      const [{ data: alums }, { data: rs }] = await Promise.all([
        supabase.from("alumnos").select("grupo").in("estado", ["activo", "vacaciones"]),
        supabase.from("whatsapp_check_runs").select("grupo, fecha_objetivo, estado, cerrado_at").eq("fecha_objetivo", win.fechaObjetivo),
      ]);
      const uniq = Array.from(new Set((alums || []).map((a: any) => a.grupo).filter((g: string) => g && g !== "Sin grupo"))).sort();
      setGrupos(uniq);
      const map: Record<string, RunRow> = {};
      (rs || []).forEach((r: any) => { map[r.grupo] = r; });
      setRuns(map);
      setLoading(false);
    };
    fetchAll();
  }, [win.fechaObjetivo]);

  if (loading || !win.fechaObjetivo) return null;

  const cerrados = grupos.filter(g => runs[g]?.estado === "cerrado").length;
  const enProgreso = grupos.filter(g => runs[g]?.estado === "en_progreso").length;
  const pendientes = grupos.length - cerrados - enProgreso;
  const todoCerrado = cerrados === grupos.length && grupos.length > 0;

  const baseCls = todoCerrado
    ? "border-emerald-500/30 bg-emerald-500/5"
    : win.tone === "rojo"
      ? "border-red-500/40 bg-red-500/10"
      : "border-amber-500/40 bg-amber-500/10";

  const titleCls = todoCerrado ? "text-emerald-600" : win.tone === "rojo" ? "text-red-600" : "text-amber-600";

  return (
    <Card className={baseCls}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3">
            <MessageCircle className={`w-5 h-5 mt-0.5 ${titleCls}`} />
            <div>
              <h3 className={`font-heading font-bold uppercase tracking-wider text-sm ${titleCls}`}>
                Chequeo de WhatsApp · {win.fechaObjetivo}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {todoCerrado
                  ? "Todos los grupos revisados este ciclo. Buen trabajo."
                  : win.tone === "rojo"
                    ? "Atrasado. Revisá los grupos pendientes lo antes posible."
                    : "Toca revisar quién está y quién no en cada grupo de WhatsApp."}
              </p>
            </div>
          </div>
          <Button size="sm" onClick={() => navigate(`/admin/whatsapp-conciliador?fecha=${win.fechaObjetivo}`)}>
            {todoCerrado ? "Ver detalle" : "Iniciar chequeo"} <ChevronRight className="w-3.5 h-3.5 ml-1" />
          </Button>
        </div>

        {grupos.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-border/50">
            <Stat label="Pendientes" value={pendientes} tone={pendientes > 0 ? "warn" : "ok"} />
            <Stat label="En progreso" value={enProgreso} />
            <Stat label="Cerrados" value={cerrados} tone="ok" />
            <Stat label="Grupos" value={grupos.length} />
          </div>
        )}

        {!todoCerrado && grupos.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {grupos.map(g => {
              const r = runs[g];
              const status = r?.estado || "pendiente";
              const cls = status === "cerrado" ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30"
                : status === "en_progreso" ? "bg-blue-500/15 text-blue-600 border-blue-500/30"
                : "bg-muted text-muted-foreground border-border";
              return (
                <Badge key={g} variant="outline"
                  className={`${cls} cursor-pointer text-[10px]`}
                  onClick={() => navigate(`/admin/whatsapp-conciliador?grupo=${encodeURIComponent(g)}&fecha=${win.fechaObjetivo}`)}>
                  {status === "cerrado" && <CheckCircle2 className="w-2.5 h-2.5 mr-1" />}
                  {g}
                </Badge>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const Stat = ({ label, value, tone }: { label: string; value: number; tone?: "ok" | "warn" }) => (
  <div className="bg-background/40 rounded p-2">
    <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">{label}</p>
    <p className={`text-lg font-heading font-bold ${tone === "ok" ? "text-emerald-600" : tone === "warn" ? "text-amber-600" : "text-foreground"}`}>{value}</p>
  </div>
);
