/**
 * Encuesta gastronómica del viaje (paso `gastronomia`).
 * Sirve para alumno autenticado (RLS propia) o enlace personal (/viaje?token=).
 * No pide nombre/paquete/pensión: se derivan de la reserva (tarjeta informativa).
 * Comidas adicionales: solo del programa real (metadata.food_survey.meal_program) y Extras
 * activos; la selección es una solicitud, no una compra: el cobro sigue el circuito de Extras.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { tripTokenGet, tripTokenSaveStep } from "@/lib/tripTokenApi";
import {
  FOOD_TYPE_LABELS, type FoodSurveyData, type FoodType,
  isFoodSurveyAnswered, normalizeFoodSurvey, suggestionFromHistory, validateFoodSurvey,
  MEAL_TYPE_LABELS, type MealSlot, contractedMealsFromAddons, dedupeMeals, formatMealDate,
  mealKey, mealRequestTotal, offerableMeals, parseMealProgram,
  allStayMeals, mealSelectionMode, type MealMode,
} from "@/lib/foodSurvey";
import { formatPrice as formatCurrency } from "@/lib/currency";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Utensils, History, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservationId: string;
  alumnoId: string | null;
  token?: string;
  onSaved: () => void;
}

const fmt = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

const Choice = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button
    type="button"
    onClick={onClick}
    className={`h-11 rounded-lg border px-3 text-sm transition ${active ? "border-primary bg-primary/15 text-primary font-medium" : "border-border bg-muted/30 hover:bg-muted/50"}`}
  >
    {children}
  </button>
);

const TripFoodSurveyDrawer = ({ open, onOpenChange, reservationId, alumnoId, token, onSaved }: Props) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [values, setValues] = useState<FoodSurveyData>({});
  const [saved, setSaved] = useState<FoodSurveyData | null>(null);
  const [pkgName, setPkgName] = useState<string | null>(null);
  const [included, setIncluded] = useState(false);
  const [historyAt, setHistoryAt] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [offer, setOffer] = useState<ReturnType<typeof offerableMeals>>([]);
  const [contracted, setContracted] = useState<MealSlot[]>([]);
  const [hasProgram, setHasProgram] = useState(false);
  const [mealMode, setMealMode] = useState<MealMode | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setErrors({});
    setHistoryAt(null);
    setMealMode(null);
    (async () => {
      try {
        let current: any = null;
        let legacy: any = null;
        let history: { step_key: string; data: any; updated_at: string } | null = null;
        let meta: any = null;
        let pkgId: string | null = null;
        let inc0 = false;
        let addons: any[] = [];
        let resAddons: any[] = [];
        if (token) {
          const r = await tripTokenGet(token);
          current = r.checklist.find((c) => c.step_key === "gastronomia") ?? null;
          legacy = r.checklist.find((c) => c.step_key === "alimentacion") ?? null;
          history = r.food_history ?? null;
          setPkgName(r.package?.nombre ?? null);
          setIncluded(!!r.package?.incluye_gastronomia);
          inc0 = !!r.package?.incluye_gastronomia;
          meta = r.event?.metadata ?? null;
          pkgId = r.package?.id ?? null;
          if (parseMealProgram(meta)) {
            const { data: ex } = await supabase.functions.invoke("manage-trip-extras-by-token", { body: { action: "get", token } });
            addons = (ex as any)?.addons ?? [];
            resAddons = (ex as any)?.contracted ?? [];
          }
        } else {
          const { data: res } = await supabase
            .from("event_reservations")
            .select("package_id, package_nombre_snapshot, event_id, events(metadata)")
            .eq("id", reservationId)
            .maybeSingle();
          let inc = false;
          let name = res?.package_nombre_snapshot ?? null;
          if (res?.package_id) {
            const { data: pkg } = await supabase
              .from("event_packages")
              .select("nombre, incluye_gastronomia")
              .eq("id", res.package_id)
              .maybeSingle();
            inc = !!pkg?.incluye_gastronomia;
            name = pkg?.nombre ?? name;
          }
          setPkgName(name);
          setIncluded(inc);
          inc0 = inc;
          meta = (res as any)?.events?.metadata ?? null;
          pkgId = res?.package_id ?? null;
          if (parseMealProgram(meta) && res?.event_id) {
            const [{ data: a }, { data: ra }] = await Promise.all([
              supabase.from("event_addons").select("id, precio, currency, activo").eq("event_id", res.event_id),
              supabase.from("reservation_addons").select("addon_id, notas").eq("reservation_id", reservationId),
            ]);
            addons = a || [];
            resAddons = ra || [];
          }
          // Solo datos propios: por alumno (otras reservas suyas) o por esta reserva.
          let q = supabase
            .from("reservation_checklist_data")
            .select("reservation_id, step_key, data, updated_at")
            .in("step_key", ["gastronomia", "alimentacion"]);
          q = alumnoId ? q.eq("alumno_id", alumnoId) : q.eq("reservation_id", reservationId);
          const { data: rows } = await q.order("updated_at", { ascending: false }).limit(20);
          const list = (rows as any[]) || [];
          current = list.find((r) => r.reservation_id === reservationId && r.step_key === "gastronomia") ?? null;
          legacy = list.find((r) => r.reservation_id === reservationId && r.step_key === "alimentacion") ?? null;
          history = list.find((r) => r.reservation_id !== reservationId) ?? null;
        }

        const program = parseMealProgram(meta);
        const done = contractedMealsFromAddons(program, resAddons);
        setHasProgram(!!program);
        setContracted(done);
        setOffer(offerableMeals({
          program, pensionIncluded: inc0, packageId: pkgId, contracted: done,
          addons: addons.map((x: any) => ({ id: x.id, precio: Number(x.precio) || 0, currency: x.currency || "ARS", activo: x.activo !== false })),
        }));

        if (current?.data && isFoodSurveyAnswered(current.data)) {
          setSaved(current.data);
          setValues(current.data);
        } else {
          setSaved(null);
          const src = legacy ? { step_key: "alimentacion", data: legacy.data, updated_at: legacy.updated_at } : history;
          const sug = src ? suggestionFromHistory(src.step_key, src.data) : null;
          if (sug) {
            setValues({ ...sug, pension_interes: false, comidas_solicitadas: [] });
            setHistoryAt(src!.updated_at ?? "");
          } else {
            setValues({});
          }
        }
      } catch {
        setValues({});
      } finally {
        setLoading(false);
      }
    })();
  }, [open, reservationId, token]);

  const selected = dedupeMeals(values.comidas_solicitadas ?? []).filter((m) => offer.some((o) => mealKey(o) === mealKey(m)));
  const totals = mealRequestTotal(selected, offer);
  const currency = offer[0]?.currency ?? "ARS";
  const toggleMeal = (m: MealSlot) => {
    const k = mealKey(m);
    const has = selected.some((x) => mealKey(x) === k);
    setValues((v) => ({ ...v, comidas_solicitadas: has ? selected.filter((x) => mealKey(x) !== k) : [...selected, { fecha: m.fecha, tipo: m.tipo }] }));
  };

  const set = (patch: Partial<FoodSurveyData>) => setValues((v) => ({ ...v, ...patch }));

  const handleSave = async () => {
    const errs = validateFoodSurvey(values);
    setErrors(errs);
    if (Object.keys(errs).length) {
      toast.error("Revisá las respuestas marcadas");
      return;
    }
    setSaving(true);
    const data = normalizeFoodSurvey(
      { ...values, comidas_solicitadas: selected, historico_confirmado: historyAt !== null ? true : values.historico_confirmado ?? null },
      included,
    ) as Record<string, unknown>;
    try {
      if (token) {
        await tripTokenSaveStep({ token, step_key: "gastronomia", completed: true, needs_advice: false, data, file_url: null });
      } else {
        const { error } = await supabase
          .from("reservation_checklist_data")
          .upsert(
            { reservation_id: reservationId, alumno_id: alumnoId, step_key: "gastronomia", completed: true, needs_advice: false, data: data as any, file_url: null },
            { onConflict: "reservation_id,step_key" },
          );
        if (error) throw error;
      }
      toast.success("¡Gracias! Guardamos tus preferencias de comida.");
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error("No pudimos guardar", { description: e?.message });
    } finally {
      setSaving(false);
    }
  };

  const err = (k: string) => errors[k] && <p className="text-[11px] text-destructive">{errors[k]}</p>;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[92vh]">
        <DrawerHeader className="text-left">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
              <Utensils className="w-5 h-5 text-primary" />
            </div>
            <div>
              <DrawerTitle>Encuesta gastronómica</DrawerTitle>
              <DrawerDescription>Para que la cocina del alojamiento prepare todo a tu medida.</DrawerDescription>
            </div>
          </div>
        </DrawerHeader>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="px-4 pb-6 space-y-5 overflow-y-auto">
            <div className="rounded-lg border border-border bg-muted/20 p-3 text-xs space-y-1">
              <p><span className="text-muted-foreground">Tu paquete:</span> <span className="font-medium">{pkgName || "—"}</span></p>
              <p className="font-medium text-foreground">{included ? "Tu paquete incluye pensión completa" : "Tu paquete no incluye pensión completa"}</p>
              <p className="text-muted-foreground">{included ? "Desayuno, almuerzo y cena incluidos." : "El desayuno está incluido."}</p>
              {saved?.actualizado_at && <p className="text-muted-foreground">Última actualización: {fmt(saved.actualizado_at)}</p>}
            </div>

            {historyAt !== null && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs flex gap-2">
                <History className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <span>Completamos con datos que nos diste antes{historyAt ? ` (${fmt(historyAt)})` : ""}. Revisalos y confirmá o corregí antes de guardar: no los usamos hasta que los confirmes.</span>
              </div>
            )}

            <div className="space-y-2">
              <Label>¿Qué tipo de alimentación tenés? *</Label>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(FOOD_TYPE_LABELS) as FoodType[]).map((k) => (
                  <Choice key={k} active={values.tipo_alimentacion === k} onClick={() => set({ tipo_alimentacion: k })}>
                    {FOOD_TYPE_LABELS[k]}
                  </Choice>
                ))}
              </div>
              {err("tipo_alimentacion")}
              {values.tipo_alimentacion === "otra" && (
                <>
                  <Input placeholder="Ej: sin gluten, keto, pescetariana…" maxLength={200} value={values.tipo_otra_detalle ?? ""} onChange={(e) => set({ tipo_otra_detalle: e.target.value })} />
                  {err("tipo_otra_detalle")}
                </>
              )}
            </div>

            <div className="space-y-2">
              <Label>¿Tenés alergias o intolerancias alimentarias? *</Label>
              <div className="grid grid-cols-2 gap-2">
                <Choice active={values.tiene_alergias === false} onClick={() => set({ tiene_alergias: false })}>No</Choice>
                <Choice active={values.tiene_alergias === true} onClick={() => set({ tiene_alergias: true })}>Sí</Choice>
              </div>
              {err("tiene_alergias")}
              {values.tiene_alergias && (
                <div className="space-y-3 pt-1">
                  <div className="space-y-1.5">
                    <Label className="text-xs">¿Cuáles? *</Label>
                    <Textarea rows={2} maxLength={500} placeholder="Ej: celiaquía, frutos secos, lactosa…" value={values.alergias_detalle ?? ""} onChange={(e) => set({ alergias_detalle: e.target.value })} />
                    {err("alergias_detalle")}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">¿Necesitás que se evite la contaminación cruzada? *</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <Choice active={values.contaminacion_cruzada === false} onClick={() => set({ contaminacion_cruzada: false })}>No</Choice>
                      <Choice active={values.contaminacion_cruzada === true} onClick={() => set({ contaminacion_cruzada: true })}>Sí</Choice>
                    </div>
                    {err("contaminacion_cruzada")}
                    {values.contaminacion_cruzada && (
                      <Input maxLength={300} placeholder="Ej: utensilios y aceite separados (opcional)" value={values.contaminacion_detalle ?? ""} onChange={(e) => set({ contaminacion_detalle: e.target.value })} />
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Observaciones (opcional)</Label>
              <Textarea rows={2} maxLength={1000} placeholder="Algo más que la cocina deba saber" value={values.observaciones ?? ""} onChange={(e) => set({ observaciones: e.target.value })} />
            </div>

            {!included && (
              <div className="rounded-lg border border-border p-3 space-y-2">
                <p className="text-sm font-medium">Comidas adicionales (opcional)</p>
                {contracted.length > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    Ya contratadas: {contracted.map((m) => `${MEAL_TYPE_LABELS[m.tipo]} ${formatMealDate(m.fecha)}`).join(", ")}.
                  </p>
                )}
                {(() => {
                  const disabled = !hasProgram || offer.length === 0;
                  const mode = mealSelectionMode(selected, offer, mealMode);
                  const pick = (m: MealMode) => {
                    setMealMode(m);
                    if (m === "ninguna") set({ comidas_solicitadas: [] });
                    if (m === "todas") set({ comidas_solicitadas: allStayMeals(offer) });
                  };
                  return (
                    <>
                      <div className="grid gap-2">
                        <Choice active={!disabled && mode === "todas"} onClick={() => !disabled && pick("todas")}>
                          Agregar todas las comidas de mi estadía{!disabled ? ` (${offer.length})` : ""}
                        </Choice>
                        <Choice active={!disabled && mode === "individual"} onClick={() => !disabled && pick("individual")}>
                          Elegir almuerzos y cenas individuales
                        </Choice>
                        <Choice active={disabled || mode === "ninguna"} onClick={() => pick("ninguna")}>
                          No agregar comidas
                        </Choice>
                      </div>
                      {!hasProgram ? (
                        <p className="text-[11px] text-muted-foreground">Las comidas adicionales todavía no están disponibles: Administración aún no cargó el programa de almuerzos y cenas de este viaje. No se contrata ni se cobra nada.</p>
                      ) : offer.length === 0 ? (
                        <p className="text-[11px] text-muted-foreground">No hay comidas adicionales disponibles para tu reserva.</p>
                      ) : (
                        <>
                          {mode === "individual" && (
                            <div className="space-y-1.5">
                              {offer.map((m) => (
                                <label key={mealKey(m)} className="flex items-center gap-3 rounded-md border border-border/60 px-3 py-2 cursor-pointer">
                                  <Checkbox checked={selected.some((x) => mealKey(x) === mealKey(m))} onCheckedChange={() => toggleMeal(m)} />
                                  <span className="text-sm flex-1">{MEAL_TYPE_LABELS[m.tipo]} · {formatMealDate(m.fecha)}</span>
                                  <span className="text-xs text-muted-foreground">{formatCurrency(m.precio, m.currency)}</span>
                                </label>
                              ))}
                            </div>
                          )}
                          {totals.cantidad > 0 && (
                            <div className="rounded-md bg-muted/30 p-2 text-xs space-y-0.5">
                              {offer.filter((o) => selected.some((x) => mealKey(x) === mealKey(o))).map((o) => (
                                <div key={mealKey(o)} className="flex justify-between"><span>{MEAL_TYPE_LABELS[o.tipo]} · {formatMealDate(o.fecha)}</span><span>{formatCurrency(o.precio, o.currency)}</span></div>
                              ))}
                              <div className="flex justify-between border-t border-border/60 pt-1 text-sm font-semibold">
                                <span>{totals.cantidad} comida(s)</span><span>{formatCurrency(totals.total, currency)}</span>
                              </div>
                            </div>
                          )}
                          <p className="text-[11px] text-muted-foreground">Desayuno incluido, no se suma. Es una solicitud: no se cobra nada ahora. Administración la confirma y el pago se hace como cualquier otro Extra.</p>
                        </>
                      )}
                    </>
                  );
                })()}
              </div>
            )}

            <Button className="w-full h-12" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              {historyAt !== null ? "Confirmar y guardar" : saved ? "Actualizar respuestas" : "Guardar respuestas"}
            </Button>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
};

export default TripFoodSurveyDrawer;
