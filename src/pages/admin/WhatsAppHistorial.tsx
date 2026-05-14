import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { History, ChevronLeft, ChevronRight, MessageCircle, FileText, Users } from "lucide-react";

interface Run {
  id: string;
  grupo: string;
  fecha_objetivo: string;
  estado: string;
  total_esperados: number;
  confirmados: number;
  faltantes: number;
  saltados: number;
  plan_revision: number;
  grupo_mal_asignado: number;
  plan_vencido_en_grupo: number;
  desconocidos_en_grupo: number;
  notas_cierre: string | null;
  cerrado_at: string | null;
  cerrado_por: string | null;
  admin_id: string | null;
  created_at: string;
}

interface Item {
  id: string;
  nombre_snapshot: string;
  resultado: string;
  nota: string | null;
  plan_inconsistente: boolean;
  grupo_incorrecto: boolean;
  grupo_real_sugerido: string | null;
}

interface Extra {
  id: string;
  nombre: string;
  telefono: string | null;
  motivo: string | null;
  nota: string | null;
}

const ESTADO_CLS: Record<string, string> = {
  cerrado: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  en_progreso: "bg-blue-500/15 text-blue-600 border-blue-500/30",
  pendiente: "bg-muted text-muted-foreground border-border",
};

const RESULTADO_LABEL: Record<string, string> = {
  presente: "✓ En grupo",
  ausente: "✗ Falta",
  saltado: "⤼ Saltado",
  pendiente: "— Pendiente",
};

const MOTIVO_LABEL: Record<string, string> = {
  no_es_alumno: "No es alumno",
  alumno_otro_grupo: "Alumno de otro grupo",
  alumno_inactivo: "Inactivo / baja",
  desconocido: "Desconocido",
};

const WhatsAppHistorial = () => {
  const navigate = useNavigate();
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [selected, setSelected] = useState<Run | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [extras, setExtras] = useState<Extra[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/admin/login"); return; }
      // Permitir admin y super_admin (admin lo necesita para revisar; super_admin para auditar)
      setAllowed(true);
      const { data } = await supabase
        .from("whatsapp_check_runs")
        .select("*")
        .order("fecha_objetivo", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(200);
      setRuns((data as any[]) || []);
      setLoading(false);
    };
    init();
  }, [navigate]);

  const openDetail = async (run: Run) => {
    setSelected(run);
    setLoadingDetail(true);
    const [{ data: its }, { data: exs }] = await Promise.all([
      supabase.from("whatsapp_check_items").select("*").eq("run_id", run.id).order("nombre_snapshot"),
      supabase.from("whatsapp_check_extras" as any).select("*").eq("run_id", run.id),
    ]);
    setItems((its as any[]) || []);
    setExtras((exs as any[]) || []);
    setLoadingDetail(false);
  };

  if (loading) return <div className="text-muted-foreground p-8">Cargando…</div>;
  if (!allowed) return <div className="text-muted-foreground p-8">Sin acceso.</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/admin/whatsapp-conciliador")}>
          <ChevronLeft className="w-4 h-4 mr-1" /> Volver
        </Button>
        <div>
          <h1 className="text-2xl font-heading font-bold uppercase tracking-wider flex items-center gap-2">
            <History className="w-5 h-5" /> Historial de chequeos de WhatsApp
          </h1>
          <p className="text-sm text-muted-foreground">Reporte completo y auditable de todos los chequeos cerrados.</p>
        </div>
      </div>

      {runs.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground">Aún no hay chequeos registrados.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {runs.map(r => (
            <Card key={r.id} className="hover:border-primary/40 cursor-pointer transition-colors" onClick={() => openDetail(r)}>
              <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <MessageCircle className="w-4 h-4 text-primary" />
                    <p className="font-heading font-bold uppercase tracking-wider text-sm">{r.grupo}</p>
                    <Badge variant="outline" className={`text-[10px] ${ESTADO_CLS[r.estado] || ""}`}>{r.estado}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Fecha objetivo: {r.fecha_objetivo}
                    {r.cerrado_at && ` · cerrado ${new Date(r.cerrado_at).toLocaleDateString("es-AR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`}
                  </p>
                </div>
                <div className="flex gap-3 text-xs">
                  <Mini label="✓" value={r.confirmados} cls="text-emerald-600" />
                  <Mini label="A invitar" value={r.plan_revision} cls="text-amber-600" />
                  <Mini label="Vencido" value={r.plan_vencido_en_grupo} cls="text-red-600" />
                  <Mini label="Mal grupo" value={r.grupo_mal_asignado} cls="text-blue-600" />
                  <Mini label="Extras" value={r.desconocidos_en_grupo} cls="text-blue-600" />
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle>{selected.grupo} · {selected.fecha_objetivo}</SheetTitle>
              </SheetHeader>
              {loadingDetail ? (
                <p className="text-sm text-muted-foreground mt-6">Cargando…</p>
              ) : (
                <div className="space-y-5 mt-6">
                  <div className="grid grid-cols-3 gap-2">
                    <Mini label="Esperados" value={selected.total_esperados} />
                    <Mini label="Confirmados" value={selected.confirmados} cls="text-emerald-600" />
                    <Mini label="Faltantes" value={selected.faltantes} cls="text-red-600" />
                    <Mini label="A invitar" value={selected.plan_revision} cls="text-amber-600" />
                    <Mini label="Plan vencido" value={selected.plan_vencido_en_grupo} cls="text-red-600" />
                    <Mini label="Grupo mal" value={selected.grupo_mal_asignado} cls="text-blue-600" />
                  </div>

                  {selected.notas_cierre && (
                    <Card className="border-primary/30">
                      <CardHeader><CardTitle className="text-sm flex items-center gap-2"><FileText className="w-4 h-4" /> Notas de cierre</CardTitle></CardHeader>
                      <CardContent><p className="text-sm whitespace-pre-wrap">{selected.notas_cierre}</p></CardContent>
                    </Card>
                  )}

                  <Card>
                    <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Users className="w-4 h-4" /> Detalle por alumno ({items.length})</CardTitle></CardHeader>
                    <CardContent className="space-y-1.5 max-h-80 overflow-y-auto">
                      {items.map(it => (
                        <div key={it.id} className="text-xs flex items-start justify-between py-1 border-b border-border/40 last:border-0 gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium">{it.nombre_snapshot}</p>
                            {it.grupo_incorrecto && it.grupo_real_sugerido && (
                              <p className="text-blue-600">→ visto en: {it.grupo_real_sugerido}</p>
                            )}
                            {it.nota && <p className="text-muted-foreground italic">"{it.nota}"</p>}
                          </div>
                          <div className="flex flex-col items-end gap-0.5 shrink-0">
                            <span className={
                              it.resultado === "presente" ? "text-emerald-600"
                              : it.resultado === "ausente" ? "text-red-600"
                              : "text-muted-foreground"
                            }>{RESULTADO_LABEL[it.resultado] || it.resultado}</span>
                            {it.plan_inconsistente && <Badge variant="outline" className="text-[9px] bg-amber-500/15 text-amber-600 border-amber-500/30">A invitar</Badge>}
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  {extras.length > 0 && (
                    <Card>
                      <CardHeader><CardTitle className="text-sm">Personas extras detectadas en el grupo ({extras.length})</CardTitle></CardHeader>
                      <CardContent className="space-y-1.5">
                        {extras.map(ex => (
                          <div key={ex.id} className="text-xs flex justify-between gap-2 py-1 border-b border-border/40 last:border-0">
                            <div>
                              <p className="font-medium">{ex.nombre} {ex.telefono && <span className="text-muted-foreground">· {ex.telefono}</span>}</p>
                              {ex.nota && <p className="text-muted-foreground italic">"{ex.nota}"</p>}
                            </div>
                            <Badge variant="outline" className="text-[9px] shrink-0">{MOTIVO_LABEL[ex.motivo || "desconocido"]}</Badge>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

const Mini = ({ label, value, cls }: { label: string; value: number; cls?: string }) => (
  <div className="bg-muted/30 border border-border rounded p-2 text-center">
    <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">{label}</p>
    <p className={`text-base font-heading font-bold ${cls || "text-foreground"}`}>{value}</p>
  </div>
);

export default WhatsAppHistorial;
