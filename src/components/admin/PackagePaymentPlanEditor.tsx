import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, Trash2, Wand2, Calendar as CalendarIcon } from "lucide-react";
import { formatPrice } from "@/lib/currency";
import {
  type InstallmentTemplate, type PlanTemplate, type SenaTipo,
  type MontoTipo, type ReglaReservaTardia,
  validateTemplate, generateMonthlyInstallments,
  DEFAULT_REMINDERS_CUOTA, DEFAULT_REMINDERS_ULTIMA, DEFAULT_REMINDERS_SENA,
} from "@/lib/paymentPlanCalculator";

interface Props {
  packageId: string;
  packagePrice: number;
  currency: string;
}

const REMINDER_OPTIONS = [-14, -7, -2, 0, 1, 3, 7];

function chipLabel(offset: number) {
  if (offset === 0) return "Día D";
  if (offset > 0) return `+${offset}d`;
  return `${offset}d`;
}

export const PackagePaymentPlanEditor = ({ packageId, packagePrice, currency }: Props) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [planExists, setPlanExists] = useState(false);
  const [planId, setPlanId] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);

  const [nombre, setNombre] = useState("Plan de pagos");
  const [senaTipo, setSenaTipo] = useState<SenaTipo>("porcentaje_paquete");
  const [senaValor, setSenaValor] = useState<string>("20");
  const [senaVenceDias, setSenaVenceDias] = useState<string>("0");
  const [reglaTardia, setReglaTardia] = useState<ReglaReservaTardia>("cobrar_al_reservar");
  const [absorbRounding, setAbsorbRounding] = useState(true);
  const [installments, setInstallments] = useState<InstallmentTemplate[]>([]);
  const [genMonths, setGenMonths] = useState<string>("4");
  const [genStartDate, setGenStartDate] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-30`;
  });

  const load = useCallback(async () => {
    setLoading(true);
    const { data: plan } = await supabase
      .from("event_package_payment_plans" as any)
      .select("*")
      .eq("package_id", packageId)
      .is("archived_at", null)
      .eq("activo", true)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (plan) {
      const p = plan as any;
      setPlanExists(true);
      setEnabled(true);
      setPlanId(p.id);
      setNombre(p.nombre || "Plan de pagos");
      setSenaTipo(p.sena_tipo);
      setSenaValor(String(p.sena_valor));
      setSenaVenceDias(String(p.sena_vence_dias ?? 0));
      setReglaTardia(p.regla_reserva_tardia);
      setAbsorbRounding(!!p.last_installment_absorbs_rounding);
      const { data: insts } = await supabase
        .from("event_package_payment_plan_installments" as any)
        .select("*")
        .eq("plan_id", p.id)
        .order("numero", { ascending: true });
      setInstallments(((insts as any[]) || []).map((i) => ({
        numero: i.numero,
        descripcion: i.descripcion,
        monto_tipo: i.monto_tipo,
        monto_valor: Number(i.monto_valor),
        fecha_vencimiento: i.fecha_vencimiento,
        reminders_config: Array.isArray(i.reminders_config) ? i.reminders_config : [],
      })));
    } else {
      setPlanExists(false);
      setEnabled(false);
      setPlanId(null);
      setInstallments([]);
    }
    setLoading(false);
  }, [packageId]);

  useEffect(() => { load(); }, [load]);

  const template: PlanTemplate = useMemo(() => ({
    nombre,
    sena_tipo: senaTipo,
    sena_valor: Number(senaValor) || 0,
    sena_vence_dias: Number(senaVenceDias) || 0,
    cantidad_cuotas: installments.length,
    last_installment_absorbs_rounding: absorbRounding,
    regla_reserva_tardia: reglaTardia,
    installments,
  }), [nombre, senaTipo, senaValor, senaVenceDias, installments, absorbRounding, reglaTardia]);

  const preview = useMemo(() => validateTemplate(template, packagePrice || 0), [template, packagePrice]);

  const addRow = () => {
    setInstallments((prev) => [...prev, {
      numero: prev.length + 1,
      descripcion: `Cuota ${prev.length + 1}`,
      monto_tipo: "porcentaje_saldo",
      monto_valor: 25,
      fecha_vencimiento: null,
      reminders_config: DEFAULT_REMINDERS_CUOTA,
    }]);
  };

  const removeRow = (idx: number) => {
    setInstallments((prev) => prev.filter((_, i) => i !== idx).map((r, i) => ({ ...r, numero: i + 1 })));
  };

  const updateRow = (idx: number, patch: Partial<InstallmentTemplate>) => {
    setInstallments((prev) => prev.map((r, i) => i === idx ? { ...r, ...patch } : r));
  };

  const toggleReminder = (idx: number, offset: number) => {
    setInstallments((prev) => prev.map((r, i) => {
      if (i !== idx) return r;
      const cur = r.reminders_config ?? [];
      const has = cur.includes(offset);
      return { ...r, reminders_config: has ? cur.filter(o => o !== offset) : [...cur, offset].sort((a, b) => a - b) };
    }));
  };

  const generateMonthly = () => {
    const n = parseInt(genMonths, 10);
    if (!n || n <= 0) { toast.error("Cantidad de cuotas inválida"); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(genStartDate)) { toast.error("Fecha inicial inválida"); return; }
    const generated = generateMonthlyInstallments({ cantidad: n, fechaPrimera: genStartDate });
    setInstallments(generated);
    toast.success(`${n} cuotas generadas`);
  };

  const save = async () => {
    if (!enabled) {
      // Archivar plan existente
      if (planExists && planId) {
        setSaving(true);
        const { error } = await supabase.from("event_package_payment_plans" as any)
          .update({ activo: false, archived_at: new Date().toISOString() })
          .eq("id", planId);
        setSaving(false);
        if (error) { toast.error("Error al desactivar: " + error.message); return; }
        toast.success("Plan desactivado");
        load();
      }
      return;
    }

    if (!preview.ok) {
      toast.error(preview.errors[0] || "El plan no es válido");
      return;
    }

    setSaving(true);
    try {
      // Si ya existe un plan, archivarlo y crear nueva versión
      let newVersion = 1;
      if (planExists && planId) {
        const { data: prev } = await supabase
          .from("event_package_payment_plans" as any)
          .select("version")
          .eq("id", planId)
          .single();
        newVersion = ((prev as any)?.version || 0) + 1;

        // Chequear si hay reservas usando este plan
        const { count: usedCount } = await supabase
          .from("event_reservations" as any)
          .select("id", { count: "exact", head: true })
          .eq("payment_plan_id", planId);

        if ((usedCount || 0) > 0) {
          // Archivar y crear nueva versión
          await supabase.from("event_package_payment_plans" as any)
            .update({ archived_at: new Date().toISOString(), activo: false })
            .eq("id", planId);
        } else {
          // Sin reservas: actualizar in-place
          const { error: updErr } = await supabase.from("event_package_payment_plans" as any)
            .update({
              nombre: template.nombre,
              sena_tipo: template.sena_tipo,
              sena_valor: template.sena_valor,
              sena_vence_dias: template.sena_vence_dias,
              cantidad_cuotas: template.cantidad_cuotas,
              last_installment_absorbs_rounding: template.last_installment_absorbs_rounding,
              regla_reserva_tardia: template.regla_reserva_tardia,
              activo: true,
            }).eq("id", planId);
          if (updErr) throw updErr;
          await supabase.from("event_package_payment_plan_installments" as any)
            .delete().eq("plan_id", planId);
          if (installments.length > 0) {
            const rows = installments.map(i => ({
              plan_id: planId,
              numero: i.numero,
              descripcion: i.descripcion ?? null,
              monto_tipo: i.monto_tipo,
              monto_valor: i.monto_valor,
              fecha_vencimiento: i.fecha_vencimiento,
              reminders_config: i.reminders_config ?? [],
            }));
            const { error: instErr } = await supabase.from("event_package_payment_plan_installments" as any).insert(rows);
            if (instErr) throw instErr;
          }
          toast.success("Plan actualizado");
          setSaving(false);
          load();
          return;
        }
      }

      // Crear nuevo (o nueva versión)
      const { data: created, error: insErr } = await supabase.from("event_package_payment_plans" as any).insert({
        package_id: packageId,
        nombre: template.nombre,
        version: newVersion,
        sena_tipo: template.sena_tipo,
        sena_valor: template.sena_valor,
        sena_vence_dias: template.sena_vence_dias,
        cantidad_cuotas: template.cantidad_cuotas,
        last_installment_absorbs_rounding: template.last_installment_absorbs_rounding,
        regla_reserva_tardia: template.regla_reserva_tardia,
        activo: true,
      }).select("id").single();
      if (insErr) throw insErr;
      const newId = (created as any).id;
      if (installments.length > 0) {
        const rows = installments.map(i => ({
          plan_id: newId,
          numero: i.numero,
          descripcion: i.descripcion ?? null,
          monto_tipo: i.monto_tipo,
          monto_valor: i.monto_valor,
          fecha_vencimiento: i.fecha_vencimiento,
          reminders_config: i.reminders_config ?? [],
        }));
        const { error: instErr } = await supabase.from("event_package_payment_plan_installments" as any).insert(rows);
        if (instErr) throw instErr;
      }
      toast.success(newVersion > 1 ? `Plan v${newVersion} creado (reservas anteriores conservan su versión)` : "Plan creado");
      load();
    } catch (e: any) {
      toast.error("Error: " + (e.message || e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-3"><Loader2 className="w-4 h-4 animate-spin" /></div>;
  }

  return (
    <div className="space-y-3 mt-3 pt-3 border-t border-border/30">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium">Plan de cuotas</p>
          <p className="text-[10px] text-muted-foreground">Configurá seña + cuotas con recordatorios automáticos</p>
        </div>
        <Switch checked={enabled} onCheckedChange={setEnabled} />
      </div>

      {enabled && (
        <>
          {/* Seña */}
          <div className="rounded-md border border-border/50 p-2 space-y-2 bg-muted/10">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Seña</p>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-[10px]">Tipo</Label>
                <Select value={senaTipo} onValueChange={(v) => setSenaTipo(v as SenaTipo)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="porcentaje_paquete">% del paquete</SelectItem>
                    <SelectItem value="monto_fijo">Monto fijo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">Valor</Label>
                <Input type="number" step="0.01" value={senaValor} onChange={(e) => setSenaValor(e.target.value)} className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">Días para vencer</Label>
                <Input type="number" min="0" value={senaVenceDias} onChange={(e) => setSenaVenceDias(e.target.value)} className="h-8 text-xs" />
              </div>
            </div>
          </div>

          {/* Generador rápido */}
          <div className="flex items-end gap-2 rounded-md border border-dashed border-border/40 p-2">
            <div className="space-y-1">
              <Label className="text-[10px]">N° cuotas</Label>
              <Input type="number" min="1" value={genMonths} onChange={(e) => setGenMonths(e.target.value)} className="h-8 w-16 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">1ª fecha</Label>
              <Input type="date" value={genStartDate} onChange={(e) => setGenStartDate(e.target.value)} className="h-8 text-xs" />
            </div>
            <Button size="sm" variant="outline" onClick={generateMonthly} className="h-8 gap-1">
              <Wand2 className="w-3 h-3" /> Generar mensuales
            </Button>
          </div>

          {/* Tabla cuotas */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Cuotas ({installments.length})</p>
              <Button size="sm" variant="ghost" onClick={addRow} className="h-7 gap-1 text-xs">
                <Plus className="w-3 h-3" /> Agregar
              </Button>
            </div>
            {installments.length === 0 ? (
              <p className="text-[11px] text-muted-foreground italic">Sin cuotas. Usá el generador o agregá manualmente.</p>
            ) : (
              <div className="space-y-2">
                {installments.map((row, idx) => {
                  const esUltima = idx === installments.length - 1;
                  return (
                    <div key={idx} className="rounded-md border border-border/40 p-2 space-y-1.5 bg-card/40">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-medium text-primary">#{row.numero}</span>
                        <Input value={row.descripcion ?? ""} onChange={(e) => updateRow(idx, { descripcion: e.target.value })}
                          className="h-7 text-xs flex-1" placeholder="Descripción" />
                        <Button size="icon" variant="ghost" onClick={() => removeRow(idx)} className="h-6 w-6">
                          <Trash2 className="w-3 h-3 text-destructive" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        <Select value={row.monto_tipo} onValueChange={(v) => updateRow(idx, { monto_tipo: v as MontoTipo })}>
                          <SelectTrigger className="h-7 text-[11px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="porcentaje_saldo">% saldo</SelectItem>
                            <SelectItem value="fijo">Monto fijo</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input type="number" step="0.01" value={row.monto_valor}
                          onChange={(e) => updateRow(idx, { monto_valor: Number(e.target.value) })}
                          className="h-7 text-[11px]" />
                        <Input type="date" value={row.fecha_vencimiento ?? ""}
                          onChange={(e) => updateRow(idx, { fecha_vencimiento: e.target.value || null })}
                          className="h-7 text-[11px]" />
                      </div>
                      <div className="flex flex-wrap gap-1 pt-0.5">
                        <span className="text-[9px] text-muted-foreground self-center mr-1">Recordatorios:</span>
                        {REMINDER_OPTIONS.map((off) => {
                          const active = (row.reminders_config ?? []).includes(off);
                          return (
                            <button
                              key={off}
                              type="button"
                              onClick={() => toggleReminder(idx, off)}
                              className={`text-[9px] px-1.5 py-0.5 rounded border transition ${active
                                ? "bg-primary/20 border-primary/50 text-primary"
                                : "bg-muted/30 border-border/40 text-muted-foreground hover:bg-muted/60"}`}
                            >
                              {chipLabel(off)}
                            </button>
                          );
                        })}
                      </div>
                      {esUltima && installments.length > 1 && (
                        <p className="text-[9px] text-muted-foreground italic">Última cuota: absorbe redondeo si está activado.</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Config */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[10px]">Reserva tardía</Label>
              <Select value={reglaTardia} onValueChange={(v) => setReglaTardia(v as ReglaReservaTardia)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cobrar_al_reservar">Cobrar vencidas en seña</SelectItem>
                  <SelectItem value="reprogramar_a_hoy">Reprogramar a hoy</SelectItem>
                  <SelectItem value="mantener_fechas_fijas">Mantener fechas (nacen vencidas)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2 pb-1">
              <Switch checked={absorbRounding} onCheckedChange={setAbsorbRounding} id={`ar-${packageId}`} />
              <Label htmlFor={`ar-${packageId}`} className="text-[10px]">Última cuota absorbe redondeo</Label>
            </div>
          </div>

          {/* Preview */}
          <div className={`rounded-md p-2 text-[11px] space-y-0.5 ${preview.ok ? "bg-emerald-500/10 border border-emerald-500/30" : "bg-destructive/10 border border-destructive/40"}`}>
            <div className="flex justify-between"><span>Precio paquete</span><span className="font-mono">{formatPrice(packagePrice, currency as any)}</span></div>
            <div className="flex justify-between"><span>Seña</span><span className="font-mono">{formatPrice(preview.sena_monto, currency as any)}</span></div>
            <div className="flex justify-between"><span>Σ cuotas ({installments.length})</span><span className="font-mono">{formatPrice(preview.cuotas_total, currency as any)}</span></div>
            <div className="flex justify-between font-medium border-t border-current/20 pt-0.5">
              <span>Total</span>
              <span className="font-mono">{formatPrice(preview.sena_monto + preview.cuotas_total, currency as any)}</span>
            </div>
            {!preview.ok && preview.errors.map((e, i) => (
              <p key={i} className="text-destructive text-[10px] pt-1">⚠ {e}</p>
            ))}
          </div>
        </>
      )}

      <Button size="sm" onClick={save} disabled={saving || (enabled && !preview.ok)} className="w-full h-8 gap-1">
        {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
        {enabled ? (planExists ? "Guardar plan" : "Crear plan") : (planExists ? "Desactivar plan" : "Sin plan")}
      </Button>
    </div>
  );
};
