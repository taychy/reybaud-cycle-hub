import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, CalendarClock, CheckCircle2, GraduationCap, Link2, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  adminEstadoLabel, agendaLabel, bloqueosLiquidacion, confirmacionLabel,
  discrepancias, DIAS, liquidacionLabel,
  type ProgramaClaseDocente, type ProgramaClaseEstado,
} from "@/lib/programaClases";

const sb: any = supabase;

interface AgendaOption {
  id: string;
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
  grupo: string;
  fecha: string | null;
  coach_nombre?: string | null;
  sede_nombre?: string | null;
}

const ProgramaClasesBloque = ({ planId }: { planId: string }) => {
  const [clases, setClases] = useState<ProgramaClaseEstado[]>([]);
  const [docentes, setDocentes] = useState<ProgramaClaseDocente[]>([]);
  const [agenda, setAgenda] = useState<AgendaOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [linkTarget, setLinkTarget] = useState<ProgramaClaseEstado | null>(null);
  const [linkAgendaId, setLinkAgendaId] = useState<string>("");
  const [notaTarget, setNotaTarget] = useState<{ clase: ProgramaClaseEstado; estado: "aprobada" | "observada" } | null>(null);
  const [nota, setNota] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: cl }, { data: ag }] = await Promise.all([
      sb.from("vw_programa_clases_estado").select("*").eq("plan_id", planId).order("orden"),
      sb
        .from("agenda_grupal")
        .select("id, dia_semana, hora_inicio, hora_fin, grupo, fecha, coaches(nombre), sedes(nombre)")
        .eq("activo", true)
        .order("dia_semana"),
    ]);
    const lista = (cl || []) as ProgramaClaseEstado[];
    setClases(lista);
    setAgenda(
      (ag || []).map((a: any) => ({
        id: a.id,
        dia_semana: a.dia_semana,
        hora_inicio: a.hora_inicio,
        hora_fin: a.hora_fin,
        grupo: a.grupo,
        fecha: a.fecha,
        coach_nombre: a.coaches?.nombre ?? null,
        sede_nombre: a.sedes?.nombre ?? null,
      })),
    );
    if (lista.length) {
      const { data: d } = await sb
        .from("programa_clase_docentes")
        .select("*")
        .in("clase_id", lista.map((c) => c.id));
      setDocentes((d || []) as ProgramaClaseDocente[]);
    } else {
      setDocentes([]);
    }
    setLoading(false);
  }, [planId]);

  useEffect(() => { load(); }, [load]);

  const porClase = useMemo(() => {
    const m = new Map<string, ProgramaClaseDocente[]>();
    docentes.forEach((d) => m.set(d.clase_id, [...(m.get(d.clase_id) || []), d]));
    return m;
  }, [docentes]);

  const vincular = async () => {
    if (!linkTarget) return;
    setSaving(true);
    try {
      const { error } = await sb.rpc("programa_clase_vincular_agenda", {
        p_clase_id: linkTarget.id,
        p_agenda_id: linkAgendaId || null,
        p_fecha: null,
        p_nota: null,
      });
      if (error) throw error;
      toast({ title: linkAgendaId ? "Clase vinculada a Agenda" : "Vínculo quitado" });
      setLinkTarget(null);
      setLinkAgendaId("");
      await load();
    } catch (e: any) {
      toast({ title: "No se pudo vincular", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const setEstado = async () => {
    if (!notaTarget) return;
    setSaving(true);
    try {
      const { error } = await sb.rpc("programa_clase_set_admin_estado", {
        p_clase_id: notaTarget.clase.id,
        p_estado: notaTarget.estado,
        p_nota: nota || null,
        p_excepcion_nota: null,
      });
      if (error) throw error;
      toast({ title: `Clase ${adminEstadoLabel(notaTarget.estado).toLowerCase()}` });
      setNotaTarget(null);
      setNota("");
      await load();
    } catch (e: any) {
      toast({ title: "No se pudo guardar", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground animate-pulse">Cargando clases del programa…</p>;
  }

  if (clases.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <GraduationCap className="w-4 h-4" /> Clases del programa
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          La Agenda es la fuente oficial de fecha, hora, sede y profesor. Liquidaciones es la fuente
          oficial de honorarios. Acá sólo se referencian.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {clases.map((c) => {
          const docs = porClase.get(c.id) || [];
          const avisos = discrepancias(c, docs);
          const bloqueos = bloqueosLiquidacion(c, docs);
          return (
            <div key={c.id} className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div>
                  <p className="font-medium text-sm">
                    Clase {c.orden} · {c.titulo}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Planificado: {docs.map((d) => d.nombre_planificado).join(", ") || "—"} · {c.duracion_min} min
                  </p>
                </div>
                <Badge variant={c.admin_estado === "aprobada" ? "default" : c.admin_estado === "observada" ? "destructive" : "outline"}>
                  Admin: {adminEstadoLabel(c.admin_estado)}
                </Badge>
              </div>

              <p className="text-xs">
                <span className="text-muted-foreground">Agenda: </span>
                {agendaLabel(c)}
                {c.agenda_coach_nombre && <> · {c.agenda_coach_nombre}</>}
              </p>

              <div className="flex flex-wrap gap-1.5">
                {docs.map((d) => (
                  <Badge
                    key={d.id}
                    variant={d.confirmacion === "confirmado" ? "default" : d.confirmacion === "no_puede" ? "destructive" : "outline"}
                    className="text-[10px]"
                  >
                    {d.nombre_planificado}: {confirmacionLabel(d.confirmacion)}
                    {d.motivo ? ` · ${d.motivo}` : ""}
                  </Badge>
                ))}
              </div>

              <p className="text-xs">
                <span className="text-muted-foreground">Liquidación: </span>
                {liquidacionLabel(c, docs)}
                {bloqueos.length > 0 && (
                  <span className="text-muted-foreground"> · {bloqueos.join(" · ")}</span>
                )}
              </p>

              {avisos.length > 0 && (
                <div className="text-xs text-amber-500 flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  <span>{avisos.join(" · ")}. Podés aprobar igual dejando una nota de excepción.</span>
                </div>
              )}
              {c.admin_nota && (
                <p className="text-xs text-muted-foreground">Nota Admin: {c.admin_nota}</p>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                <Link to="/admin/agenda">
                  <Button size="sm" variant="outline">
                    <CalendarClock className="w-3.5 h-3.5 mr-1" /> Ver en Agenda
                  </Button>
                </Link>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { setLinkTarget(c); setLinkAgendaId(c.agenda_grupal_id || ""); }}
                >
                  <Link2 className="w-3.5 h-3.5 mr-1" />
                  {c.agenda_grupal_id ? "Revisar asignación" : "Vincular"}
                </Button>
                <Button size="sm" onClick={() => { setNotaTarget({ clase: c, estado: "aprobada" }); setNota(""); }}>
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Aprobar
                </Button>
                <Button size="sm" variant="destructive" onClick={() => { setNotaTarget({ clase: c, estado: "observada" }); setNota(""); }}>
                  Observar
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>

      <Dialog open={!!linkTarget} onOpenChange={(o) => !o && setLinkTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Vincular con una clase de Agenda</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            El Playbook sólo referencia la clase. Para cambiar fecha, hora, sede o profesor usá la Agenda.
          </p>
          <Select value={linkAgendaId || "none"} onValueChange={(v) => setLinkAgendaId(v === "none" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Elegí una clase" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sin clase vinculada en Agenda</SelectItem>
              {agenda.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.fecha || DIAS[a.dia_semana]} · {a.hora_inicio.slice(0, 5)}–{a.hora_fin.slice(0, 5)} · {a.grupo}
                  {a.sede_nombre ? ` · ${a.sede_nombre}` : ""}{a.coach_nombre ? ` · ${a.coach_nombre}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button onClick={vincular} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!notaTarget} onOpenChange={(o) => !o && setNotaTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {notaTarget?.estado === "aprobada" ? "Aprobar clase" : "Observar clase"}
            </DialogTitle>
          </DialogHeader>
          {notaTarget && discrepancias(notaTarget.clase, porClase.get(notaTarget.clase.id) || []).length > 0 && (
            <p className="text-xs text-amber-500">
              Hay diferencias entre lo planificado y la Agenda. Dejá una nota de excepción consciente.
            </p>
          )}
          <Textarea
            placeholder="Nota (opcional, recomendada si hay diferencias)"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
          />
          <DialogFooter>
            <Button onClick={setEstado} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default ProgramaClasesBloque;
