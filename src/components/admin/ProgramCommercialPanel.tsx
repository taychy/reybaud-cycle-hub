import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, XCircle, Loader2, Plus, Save, MapPin } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  DIAS_SEMANA,
  PHASE_LABELS,
  hasCommercialDates,
  inscriptionReadiness,
  resolveCommercialPhase,
  type ProgramSedeLike,
} from "@/lib/programCommercialPhase";
import type { ProgramStageLike } from "@/lib/programEnrollment";

const sb: any = supabase;
const ACTIVE_STATES = ["activa", "pendiente_pago", "pendiente_verificacion"];

interface Props {
  plan: any;
  priceStages: ProgramStageLike[];
  onSaved?: () => void;
}

type SedeRow = ProgramSedeLike & { id: string; nombre: string; waitlist: number; dirty?: boolean };

export default function ProgramCommercialPanel({ plan, priceStages, onSaved }: Props) {
  const [dates, setDates] = useState({
    fecha_inicio_preinscripcion: plan.fecha_inicio_preinscripcion || "",
    fecha_fin_preinscripcion: plan.fecha_fin_preinscripcion || "",
    fecha_inicio_inscripcion: plan.fecha_inicio_inscripcion || "",
    fecha_fin_inscripcion: plan.fecha_fin_inscripcion || "",
    preinscripcion_slug: plan.preinscripcion_slug || "",
  });
  const [sedes, setSedes] = useState<SedeRow[]>([]);
  const [allSedes, setAllSedes] = useState<{ id: string; nombre: string }[]>([]);
  const [addSede, setAddSede] = useState<string>("");
  const [savingDates, setSavingDates] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: ps }, { data: all }, { data: subs }, { data: wl }] = await Promise.all([
        sb.from("planes_sedes").select("id, sede_id, activa, dia_semana, hora_inicio, hora_fin, cupo_maximo").eq("plan_id", plan.id),
        sb.from("sedes").select("id, nombre").order("nombre"),
        sb.from("suscripciones").select("programa_sede_id, estado").eq("plan_id", plan.id).in("estado", ACTIVE_STATES),
        sb.from("program_waitlist_entries").select("sede_id, estado").eq("plan_id", plan.id),
      ]);
      const names = new Map((all || []).map((s: any) => [s.id, s.nombre]));
      const count = (arr: any[] | null, key: string, id: string) => (arr || []).filter((r) => r[key] === id).length;
      setAllSedes(all || []);
      setSedes(
        (ps || []).map((r: any) => ({
          ...r,
          nombre: names.get(r.sede_id) || "Sede",
          inscriptos: count(subs, "programa_sede_id", r.sede_id),
          waitlist: (wl || []).filter((w: any) => w.sede_id === r.sede_id && w.estado === "pendiente").length,
        })),
      );
      setLoading(false);
    })();
  }, [plan.id, reload]);

  const effectivePlan = { ...plan, ...Object.fromEntries(Object.entries(dates).map(([k, v]) => [k, v || null])) };
  const commercial = hasCommercialDates(effectivePlan);
  const phase = resolveCommercialPhase(effectivePlan);
  const checks = useMemo(
    () => inscriptionReadiness({ program: effectivePlan, sedes, stages: priceStages }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(effectivePlan), sedes, priceStages],
  );
  const activas = sedes.filter((s) => s.activa !== false);
  const totalCupo = activas.reduce((a, s) => a + (Number(s.cupo_maximo) || 0), 0);
  const totalInsc = activas.reduce((a, s) => a + (Number(s.inscriptos) || 0), 0);

  const saveDates = async () => {
    const d = dates;
    if (d.fecha_inicio_preinscripcion && d.fecha_fin_preinscripcion && d.fecha_inicio_preinscripcion > d.fecha_fin_preinscripcion) {
      toast({ title: "La preinscripción termina antes de empezar", variant: "destructive" }); return;
    }
    if (d.fecha_inicio_inscripcion && d.fecha_fin_inscripcion && d.fecha_inicio_inscripcion > d.fecha_fin_inscripcion) {
      toast({ title: "La inscripción termina antes de empezar", variant: "destructive" }); return;
    }
    if (d.preinscripcion_slug && !/^[a-z0-9-]+$/.test(d.preinscripcion_slug)) {
      toast({ title: "Formulario de preinscripción inválido", description: "Usá solo minúsculas, números y guiones.", variant: "destructive" }); return;
    }
    setSavingDates(true);
    const { error } = await sb.from("planes").update({
      fecha_inicio_preinscripcion: d.fecha_inicio_preinscripcion || null,
      fecha_fin_preinscripcion: d.fecha_fin_preinscripcion || null,
      fecha_inicio_inscripcion: d.fecha_inicio_inscripcion || null,
      fecha_fin_inscripcion: d.fecha_fin_inscripcion || null,
      preinscripcion_slug: d.preinscripcion_slug || null,
    }).eq("id", plan.id);
    setSavingDates(false);
    if (error) { toast({ title: "No se pudieron guardar las fechas", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Fechas guardadas" });
    onSaved?.();
  };

  const patchSede = (id: string, patch: Partial<SedeRow>) =>
    setSedes((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch, dirty: true } : s)));

  const saveSede = async (s: SedeRow) => {
    if (s.cupo_maximo != null && Number(s.cupo_maximo) < 0) { toast({ title: "Cupo inválido", variant: "destructive" }); return; }
    const { error } = await sb.from("planes_sedes").update({
      activa: s.activa !== false,
      dia_semana: s.dia_semana ?? null,
      hora_inicio: s.hora_inicio || null,
      hora_fin: s.hora_fin || null,
      cupo_maximo: s.cupo_maximo === null || s.cupo_maximo === undefined || (s.cupo_maximo as any) === "" ? null : Number(s.cupo_maximo),
      updated_at: new Date().toISOString(),
    }).eq("id", s.id);
    if (error) { toast({ title: "No se pudo guardar la sede", description: error.message, variant: "destructive" }); return; }
    toast({ title: `Sede ${s.nombre} guardada` });
    setReload((k) => k + 1);
  };

  const addNewSede = async () => {
    if (!addSede) return;
    const { error } = await sb.from("planes_sedes").insert({ plan_id: plan.id, sede_id: addSede, activa: true });
    if (error) { toast({ title: "No se pudo agregar la sede", description: error.message, variant: "destructive" }); return; }
    setAddSede("");
    setReload((k) => k + 1);
  };

  const disponibles = allSedes.filter((a) => !sedes.some((s) => s.sede_id === a.id));
  const dateField = (key: keyof typeof dates, label: string) => (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input type="date" value={dates[key]} onChange={(e) => setDates((d) => ({ ...d, [key]: e.target.value }))} />
    </div>
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2 flex-wrap">
            Fase comercial
            <Badge variant={phase === "inscripcion" ? "default" : "secondary"}>{PHASE_LABELS[phase]}</Badge>
            {!commercial && <Badge variant="outline">Modo anterior (sin fechas nuevas)</Badge>}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            La landing pública cambia sola según estas fechas. Sin fechas nuevas se usa la fecha de cierre anterior.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            {dateField("fecha_inicio_preinscripcion", "Inicio preinscripción")}
            {dateField("fecha_fin_preinscripcion", "Fin preinscripción")}
            {dateField("fecha_inicio_inscripcion", "Inicio inscripción")}
            {dateField("fecha_fin_inscripcion", "Fin inscripción")}
          </div>
          <div>
            <Label className="text-xs">Formulario de preinscripción (identificador)</Label>
            <Input placeholder="programa-iniciacion-octubre-2026" value={dates.preinscripcion_slug}
              onChange={(e) => setDates((d) => ({ ...d, preinscripcion_slug: e.target.value.trim() }))} />
          </div>
          <Button size="sm" onClick={saveDates} disabled={savingDates}>
            {savingDates ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />} Guardar fechas
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="w-4 h-4" /> Sedes y cupos
            <Badge variant="outline">{totalInsc} / {totalCupo || "—"} inscriptos</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : sedes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Este programa todavía no tiene sedes configuradas.</p>
          ) : (
            sedes.map((s) => (
              <div key={s.id} className="rounded-lg border border-border p-3 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="font-semibold">{s.nombre}</p>
                  <div className="flex items-center gap-2 text-xs">
                    <Badge variant={s.cupo_maximo != null && (s.inscriptos || 0) >= Number(s.cupo_maximo) ? "destructive" : "secondary"}>
                      {s.inscriptos || 0} / {s.cupo_maximo ?? "—"}
                    </Badge>
                    {s.waitlist > 0 && <Badge variant="outline">{s.waitlist} en espera</Badge>}
                    <span className="text-muted-foreground">Activa</span>
                    <Switch checked={s.activa !== false} onCheckedChange={(v) => patchSede(s.id, { activa: v })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div>
                    <Label className="text-xs">Día</Label>
                    <Select value={s.dia_semana != null ? String(s.dia_semana) : ""} onValueChange={(v) => patchSede(s.id, { dia_semana: Number(v) })}>
                      <SelectTrigger><SelectValue placeholder="Día" /></SelectTrigger>
                      <SelectContent>
                        {DIAS_SEMANA.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Desde</Label>
                    <Input type="time" value={s.hora_inicio?.slice(0, 5) || ""} onChange={(e) => patchSede(s.id, { hora_inicio: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Hasta</Label>
                    <Input type="time" value={s.hora_fin?.slice(0, 5) || ""} onChange={(e) => patchSede(s.id, { hora_fin: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Cupo</Label>
                    <Input type="number" min={0} value={s.cupo_maximo ?? ""} onChange={(e) => patchSede(s.id, { cupo_maximo: e.target.value === "" ? null : Number(e.target.value) })} />
                  </div>
                </div>
                {s.dirty && (
                  <Button size="sm" variant="secondary" onClick={() => saveSede(s)}>
                    <Save className="w-4 h-4 mr-1" /> Guardar sede
                  </Button>
                )}
              </div>
            ))
          )}
          {disponibles.length > 0 && (
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <Label className="text-xs">Agregar sede</Label>
                <Select value={addSede} onValueChange={setAddSede}>
                  <SelectTrigger><SelectValue placeholder="Elegí una sede" /></SelectTrigger>
                  <SelectContent>
                    {disponibles.map((d) => <SelectItem key={d.id} value={d.id}>{d.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button size="sm" onClick={addNewSede} disabled={!addSede}><Plus className="w-4 h-4 mr-1" /> Agregar</Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Antes de abrir la inscripción</CardTitle>
          <p className="text-xs text-muted-foreground">Chequeo automático. No envía avisos ni emails.</p>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {checks.map((c) => (
              <li key={c.key} className="flex gap-2">
                {c.ok ? <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" /> : <XCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />}
                <div>
                  <p>{c.label}</p>
                  {!c.ok && c.detail && <p className="text-xs text-muted-foreground">{c.detail}</p>}
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
