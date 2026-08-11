import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { formatPrice } from "@/lib/currency";
import {
  computeEnrollmentStatus,
  fmtFechaLargaAR,
  lastActiveStageEnd,
  todayISO,
  type ProgramStageLike,
} from "@/lib/programEnrollment";
import { Loader2, Plus, Trash2, CalendarClock, Users, Save, Lock } from "lucide-react";

const sb: any = supabase;

export interface ProgramaEditable {
  id: string;
  nombre: string;
  descripcion: string | null;
  descripcion_corta: string | null;
  precio: number;
  moneda: string;
  activo: boolean;
  landing_public: boolean | null;
  max_inscripciones: number | null;
  inscripciones_actuales: number | null;
  fecha_inicio_programa: string | null;
  fecha_fin_programa: string | null;
  fecha_cierre_inscripcion: string | null;
  cuotas_cantidad: number | null;
  cuota_valor: number | null;
}

interface StageRow extends ProgramStageLike {
  id: string;
  nombre: string;
  precio: number | string;
  precio_cuota: number | string | null;
  cuotas_cantidad: number | null;
  fecha_desde: string;
  fecha_hasta: string;
  activo: boolean;
  orden: number;
  /** true cuando la fila todavía no existe en la base */
  _new?: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  plan: ProgramaEditable;
  /** Si es true, el sheet arranca scrolleado a la sección de inscripciones. */
  focusInscripciones?: boolean;
  onSaved: () => void;
}

const num = (v: string): number | null => {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export default function EditProgramaDialog({
  open,
  onOpenChange,
  plan,
  focusInscripciones,
  onSaved,
}: Props) {
  const [form, setForm] = useState({
    nombre: plan.nombre || "",
    descripcion_corta: plan.descripcion_corta || "",
    descripcion: plan.descripcion || "",
    fecha_inicio_programa: plan.fecha_inicio_programa || "",
    fecha_fin_programa: plan.fecha_fin_programa || "",
    fecha_cierre_inscripcion: plan.fecha_cierre_inscripcion || "",
    max_inscripciones: String(plan.max_inscripciones ?? ""),
    activo: !!plan.activo,
    landing_public: !!plan.landing_public,
    precio: String(plan.precio ?? ""),
    cuotas_cantidad: String(plan.cuotas_cantidad ?? ""),
    cuota_valor: String(plan.cuota_valor ?? ""),
  });
  const [stages, setStages] = useState<StageRow[]>([]);
  const [loadingStages, setLoadingStages] = useState(true);
  const [saving, setSaving] = useState(false);
  const [warnOpen, setWarnOpen] = useState(false);
  const [deleted, setDeleted] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setForm({
      nombre: plan.nombre || "",
      descripcion_corta: plan.descripcion_corta || "",
      descripcion: plan.descripcion || "",
      fecha_inicio_programa: plan.fecha_inicio_programa || "",
      fecha_fin_programa: plan.fecha_fin_programa || "",
      fecha_cierre_inscripcion: plan.fecha_cierre_inscripcion || "",
      max_inscripciones: String(plan.max_inscripciones ?? ""),
      activo: !!plan.activo,
      landing_public: !!plan.landing_public,
      precio: String(plan.precio ?? ""),
      cuotas_cantidad: String(plan.cuotas_cantidad ?? ""),
      cuota_valor: String(plan.cuota_valor ?? ""),
    });
    setDeleted([]);
    (async () => {
      setLoadingStages(true);
      const { data } = await sb
        .from("plan_price_stages")
        .select("*")
        .eq("plan_id", plan.id)
        .order("orden", { ascending: true });
      setStages(((data || []) as StageRow[]).map((s) => ({ ...s })));
      setLoadingStages(false);
    })();
  }, [open, plan]);

  useEffect(() => {
    if (open && focusInscripciones) {
      const t = setTimeout(() => {
        document.getElementById("sec-inscripciones")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 250);
      return () => clearTimeout(t);
    }
  }, [open, focusInscripciones]);

  // Estado calculado con LA MISMA lógica que la landing pública
  const status = useMemo(
    () =>
      computeEnrollmentStatus(
        {
          activo: form.activo,
          landing_public: form.landing_public,
          max_inscripciones: num(form.max_inscripciones),
          inscripciones_actuales: plan.inscripciones_actuales,
          fecha_cierre_inscripcion: form.fecha_cierre_inscripcion || null,
        },
        stages,
      ),
    [form, stages, plan.inscripciones_actuales],
  );

  const ultimaEtapaFin = lastActiveStageEnd(stages);
  const cierreSinCobertura =
    !!form.fecha_cierre_inscripcion &&
    (!ultimaEtapaFin || form.fecha_cierre_inscripcion > ultimaEtapaFin);

  const setStage = (idx: number, patch: Partial<StageRow>) =>
    setStages((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));

  const addStage = () => {
    const last = stages[stages.length - 1];
    const desde = last ? last.fecha_hasta : todayISO();
    setStages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        nombre: "Nueva etapa",
        precio: Number(form.precio) || 0,
        precio_cuota: null,
        cuotas_cantidad: null,
        fecha_desde: desde,
        fecha_hasta: form.fecha_cierre_inscripcion || desde,
        activo: true,
        orden: (last?.orden ?? 0) + 1,
        _new: true,
      },
    ]);
  };

  /**
   * Sólo se puede borrar físicamente una etapa que todavía no empezó: si ya
   * arrancó pudo haber sido usada en una inscripción y hay que conservarla.
   */
  const canDelete = (s: StageRow) => !!s._new || s.fecha_desde > todayISO();

  const removeStage = (idx: number) => {
    const s = stages[idx];
    if (!canDelete(s)) {
      toast({
        title: "No se puede eliminar",
        description: "Esta etapa ya estuvo vigente y puede haber sido usada en inscripciones. Desactivala en su lugar.",
        variant: "destructive",
      });
      return;
    }
    if (!s._new) setDeleted((d) => [...d, s.id]);
    setStages((prev) => prev.filter((_, i) => i !== idx));
  };

  const extenderUltimaEtapa = () => {
    const activas = stages.filter((s) => s.activo !== false);
    if (activas.length === 0) {
      toast({ title: "No hay etapas activas", description: "Creá una etapa nueva.", variant: "destructive" });
      return;
    }
    const target = activas.reduce((a, b) => (b.fecha_hasta > a.fecha_hasta ? b : a));
    setStages((prev) =>
      prev.map((s) => (s.id === target.id ? { ...s, fecha_hasta: form.fecha_cierre_inscripcion } : s)),
    );
    setWarnOpen(false);
    toast({
      title: "Etapa extendida",
      description: `“${target.nombre}” ahora llega hasta el ${fmtFechaLargaAR(form.fecha_cierre_inscripcion)}. Guardá para aplicar.`,
    });
  };

  const validate = (): string | null => {
    if (form.nombre.trim().length < 2) return "El nombre es obligatorio.";
    const max = num(form.max_inscripciones);
    if (max != null && max < 0) return "Los cupos máximos no pueden ser negativos.";
    if (max != null && max < (plan.inscripciones_actuales ?? 0))
      return `Ya hay ${plan.inscripciones_actuales} inscriptos: los cupos máximos no pueden ser menores.`;
    if (form.fecha_inicio_programa && form.fecha_fin_programa && form.fecha_fin_programa < form.fecha_inicio_programa)
      return "La fecha de finalización no puede ser anterior a la de inicio.";
    for (const s of stages) {
      if (!s.nombre?.trim()) return "Todas las etapas necesitan un nombre.";
      if (s.fecha_hasta < s.fecha_desde) return `La etapa “${s.nombre}” termina antes de empezar.`;
      if (!(Number(s.precio) > 0)) return `La etapa “${s.nombre}” necesita un precio.`;
    }
    return null;
  };

  const doSave = async () => {
    setSaving(true);
    try {
      const { error: planErr } = await sb
        .from("planes")
        .update({
          nombre: form.nombre.trim(),
          descripcion_corta: form.descripcion_corta.trim() || null,
          descripcion: form.descripcion.trim() || null,
          fecha_inicio_programa: form.fecha_inicio_programa || null,
          fecha_fin_programa: form.fecha_fin_programa || null,
          fecha_cierre_inscripcion: form.fecha_cierre_inscripcion || null,
          max_inscripciones: num(form.max_inscripciones),
          activo: form.activo,
          landing_public: form.landing_public,
          precio: num(form.precio) ?? plan.precio,
          cuotas_cantidad: num(form.cuotas_cantidad),
          cuota_valor: num(form.cuota_valor),
        })
        .eq("id", plan.id);
      if (planErr) throw planErr;

      if (deleted.length > 0) {
        const { error } = await sb.from("plan_price_stages").delete().in("id", deleted);
        if (error) throw error;
      }

      const payload = stages.map((s, i) => ({
        id: s.id,
        plan_id: plan.id,
        nombre: s.nombre.trim(),
        precio: Number(s.precio),
        precio_cuota: s.precio_cuota === null || s.precio_cuota === "" ? null : Number(s.precio_cuota),
        cuotas_cantidad: s.cuotas_cantidad ?? null,
        fecha_desde: s.fecha_desde,
        fecha_hasta: s.fecha_hasta,
        activo: s.activo,
        orden: i + 1,
      }));
      if (payload.length > 0) {
        const { error } = await sb.from("plan_price_stages").upsert(payload, { onConflict: "id" });
        if (error) throw error;
      }

      toast({
        title: "Programa actualizado",
        description: "Los cambios sólo aplican a futuras inscripciones. Las suscripciones existentes no se modificaron.",
      });
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "No se pudo guardar", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => {
    const err = validate();
    if (err) {
      toast({ title: "Revisá los datos", description: err, variant: "destructive" });
      return;
    }
    if (cierreSinCobertura) {
      setWarnOpen(true);
      return;
    }
    void doSave();
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Editar programa</SheetTitle>
            <SheetDescription>
              Los cambios de precio aplican sólo a nuevas inscripciones. Las suscripciones y pagos ya
              registrados no se modifican.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-6 py-6">
            {/* ---------- ESTADO ACTUAL ---------- */}
            <Card
              className={
                status.abiertas ? "border-primary/50 bg-primary/5" : "border-destructive/40 bg-destructive/5"
              }
            >
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold uppercase tracking-wide">
                    Estado actual de las inscripciones
                  </p>
                  <Badge variant={status.abiertas ? "default" : "destructive"}>
                    {status.abiertas ? "ABIERTAS" : "CERRADAS"}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <Info label="Cupos utilizados" value={`${status.cuposUsados} / ${status.cuposMax || "—"}`} />
                  <Info
                    label="Cupos disponibles"
                    value={status.cuposLibres === Infinity ? "Sin límite" : String(status.cuposLibres)}
                  />
                  <Info label="Cierre de inscripciones" value={fmtFechaLargaAR(status.fechaCierre)} />
                  <Info label="Etapa vigente" value={status.stageVigente?.nombre || "Ninguna"} />
                  <Info
                    label="Precio vigente"
                    value={
                      status.stageVigente
                        ? formatPrice(Number(status.stageVigente.precio), plan.moneda)
                        : "—"
                    }
                  />
                  <Info
                    label="Cuotas vigentes"
                    value={
                      status.stageVigente?.precio_cuota && status.stageVigente?.cuotas_cantidad
                        ? `${status.stageVigente.cuotas_cantidad} × ${formatPrice(Number(status.stageVigente.precio_cuota), plan.moneda)}`
                        : "—"
                    }
                  />
                </div>
                {!status.abiertas && (
                  <ul className="text-xs text-destructive space-y-1 pt-1">
                    {status.motivos.map((m, i) => (
                      <li key={i}>• {m}</li>
                    ))}
                  </ul>
                )}
                <p className="text-[11px] text-muted-foreground">
                  Calculado con la misma lógica que la landing pública.
                </p>
              </CardContent>
            </Card>

            {/* ---------- DATOS GENERALES ---------- */}
            <Section title="Datos generales">
              <Field label="Nombre">
                <Input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} maxLength={120} />
              </Field>
              <Field label="Descripción corta">
                <Input
                  value={form.descripcion_corta}
                  onChange={(e) => setForm({ ...form, descripcion_corta: e.target.value })}
                  maxLength={200}
                />
              </Field>
              <Field label="Descripción completa">
                <Textarea
                  rows={4}
                  value={form.descripcion}
                  onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                  maxLength={2000}
                />
              </Field>
            </Section>

            {/* ---------- FECHAS ---------- */}
            <Section title="Fechas">
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Inicio del programa">
                  <Input
                    type="date"
                    value={form.fecha_inicio_programa}
                    onChange={(e) => setForm({ ...form, fecha_inicio_programa: e.target.value })}
                  />
                </Field>
                <Field label="Finalización">
                  <Input
                    type="date"
                    value={form.fecha_fin_programa}
                    onChange={(e) => setForm({ ...form, fecha_fin_programa: e.target.value })}
                  />
                </Field>
              </div>
            </Section>

            {/* ---------- INSCRIPCIONES ---------- */}
            <div id="sec-inscripciones">
              <Section title="Inscripciones">
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="Cierre de inscripciones">
                    <Input
                      type="date"
                      value={form.fecha_cierre_inscripcion}
                      onChange={(e) => setForm({ ...form, fecha_cierre_inscripcion: e.target.value })}
                    />
                  </Field>
                  <Field label="Cupos máximos">
                    <Input
                      type="number"
                      min={plan.inscripciones_actuales ?? 0}
                      value={form.max_inscripciones}
                      onChange={(e) => setForm({ ...form, max_inscripciones: e.target.value })}
                    />
                  </Field>
                </div>
                {cierreSinCobertura && (
                  <div className="rounded-lg border border-orange-500/40 bg-orange-500/10 p-3 text-xs space-y-2">
                    <p>
                      La fecha de cierre es posterior al final de la última etapa de precio
                      {ultimaEtapaFin ? ` (${fmtFechaLargaAR(ultimaEtapaFin)})` : ""}. Con esta configuración la
                      landing seguirá mostrando inscripciones cerradas.
                    </p>
                    <Button type="button" size="sm" variant="outline" onClick={extenderUltimaEtapa}>
                      <CalendarClock className="w-3.5 h-3.5 mr-1" />
                      Extender última etapa hasta {fmtFechaLargaAR(form.fecha_cierre_inscripcion)}
                    </Button>
                  </div>
                )}
                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <p className="text-sm font-medium">Programa activo</p>
                    <p className="text-xs text-muted-foreground">Si está inactivo no se puede inscribir nadie.</p>
                  </div>
                  <Switch checked={form.activo} onCheckedChange={(v) => setForm({ ...form, activo: v })} />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <p className="text-sm font-medium">Landing pública</p>
                    <p className="text-xs text-muted-foreground">Publica la página de inscripción.</p>
                  </div>
                  <Switch
                    checked={form.landing_public}
                    onCheckedChange={(v) => setForm({ ...form, landing_public: v })}
                  />
                </div>
              </Section>
            </div>

            {/* ---------- PRECIOS GENERALES ---------- */}
            <Section title="Precios de referencia del programa">
              <p className="text-xs text-muted-foreground -mt-2">
                Se usan como precio de lista. El precio que efectivamente se cobra sale de la etapa vigente.
              </p>
              <div className="grid sm:grid-cols-3 gap-4">
                <Field label="Precio de lista">
                  <Input type="number" value={form.precio} onChange={(e) => setForm({ ...form, precio: e.target.value })} />
                </Field>
                <Field label="Cantidad de cuotas">
                  <Input
                    type="number"
                    value={form.cuotas_cantidad}
                    onChange={(e) => setForm({ ...form, cuotas_cantidad: e.target.value })}
                  />
                </Field>
                <Field label="Valor de cuota">
                  <Input
                    type="number"
                    value={form.cuota_valor}
                    onChange={(e) => setForm({ ...form, cuota_valor: e.target.value })}
                  />
                </Field>
              </div>
            </Section>

            {/* ---------- ETAPAS ---------- */}
            <Section title="Etapas de inscripción y precios">
              {loadingStages ? (
                <p className="text-sm text-muted-foreground">Cargando etapas…</p>
              ) : stages.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Todavía no hay etapas. Sin una etapa vigente la landing muestra inscripciones cerradas.
                </p>
              ) : (
                <div className="space-y-3">
                  {stages.map((s, idx) => {
                    const vigente = status.stageVigente?.id === s.id;
                    return (
                      <div
                        key={s.id}
                        className={`rounded-lg border p-3 space-y-3 ${
                          vigente ? "border-primary bg-primary/5" : "border-border"
                        } ${s.activo ? "" : "opacity-60"}`}
                      >
                        <div className="flex items-center gap-2">
                          <Input
                            className="h-8"
                            value={s.nombre}
                            onChange={(e) => setStage(idx, { nombre: e.target.value })}
                            maxLength={60}
                          />
                          {vigente && <Badge className="shrink-0">Vigente</Badge>}
                          <div className="flex items-center gap-1 shrink-0">
                            <Switch
                              checked={s.activo}
                              onCheckedChange={(v) => setStage(idx, { activo: v })}
                              aria-label="Etapa activa"
                            />
                            {canDelete(s) ? (
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeStage(idx)}>
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            ) : (
                              <span
                                className="h-8 w-8 flex items-center justify-center text-muted-foreground"
                                title="Etapa ya utilizada: sólo se puede desactivar"
                              >
                                <Lock className="w-4 h-4" />
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <Field label="Desde" small>
                            <Input
                              type="date"
                              className="h-8"
                              value={s.fecha_desde}
                              onChange={(e) => setStage(idx, { fecha_desde: e.target.value })}
                            />
                          </Field>
                          <Field label="Hasta" small>
                            <Input
                              type="date"
                              className="h-8"
                              value={s.fecha_hasta}
                              onChange={(e) => setStage(idx, { fecha_hasta: e.target.value })}
                            />
                          </Field>
                          <Field label="Precio contado" small>
                            <Input
                              type="number"
                              className="h-8"
                              value={String(s.precio ?? "")}
                              onChange={(e) => setStage(idx, { precio: e.target.value })}
                            />
                          </Field>
                          <Field label="Cant. cuotas" small>
                            <Input
                              type="number"
                              className="h-8"
                              value={s.cuotas_cantidad ?? ""}
                              onChange={(e) => setStage(idx, { cuotas_cantidad: num(e.target.value) })}
                            />
                          </Field>
                          <Field label="Valor de cuota" small>
                            <Input
                              type="number"
                              className="h-8"
                              value={s.precio_cuota == null ? "" : String(s.precio_cuota)}
                              onChange={(e) => setStage(idx, { precio_cuota: e.target.value })}
                            />
                          </Field>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <Button type="button" variant="outline" size="sm" onClick={addStage}>
                <Plus className="w-4 h-4 mr-1" /> Agregar etapa
              </Button>
            </Section>

            <Separator />

            <div className="flex justify-end gap-2 sticky bottom-0 bg-background py-3">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
                Guardar cambios
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={warnOpen} onOpenChange={setWarnOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revisá las etapas de precio</AlertDialogTitle>
            <AlertDialogDescription>
              La fecha de cierre de inscripciones es posterior al final de la última etapa de precio. Si no
              extendés una etapa o creás una nueva, la landing seguirá mostrando inscripciones cerradas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Volver y corregir</AlertDialogCancel>
            <AlertDialogAction onClick={extenderUltimaEtapa}>
              Extender última etapa hasta {fmtFechaLargaAR(form.fecha_cierre_inscripcion)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
        <Users className="w-3.5 h-3.5" /> {title}
      </h3>
      {children}
    </div>
  );
}

function Field({ label, children, small }: { label: string; children: React.ReactNode; small?: boolean }) {
  return (
    <div className="space-y-1">
      <Label className={small ? "text-[11px] text-muted-foreground" : ""}>{label}</Label>
      {children}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
