/**
 * Encuesta gastronómica del viaje (paso `gastronomia`).
 * Sirve para alumno autenticado (RLS propia) o enlace personal (/viaje?token=).
 * No pide nombre/paquete/pensión: se derivan de la reserva.
 * "Me interesa pensión completa" es solo una solicitud: no genera pago ni cambia la reserva.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { tripTokenGet, tripTokenSaveStep } from "@/lib/tripTokenApi";
import {
  FOOD_TYPE_LABELS, type FoodSurveyData, type FoodType,
  isFoodSurveyAnswered, normalizeFoodSurvey, suggestionFromHistory, validateFoodSurvey,
} from "@/lib/foodSurvey";
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

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setErrors({});
    setHistoryAt(null);
    (async () => {
      try {
        let current: any = null;
        let legacy: any = null;
        let history: { step_key: string; data: any; updated_at: string } | null = null;
        if (token) {
          const r = await tripTokenGet(token);
          current = r.checklist.find((c) => c.step_key === "gastronomia") ?? null;
          legacy = r.checklist.find((c) => c.step_key === "alimentacion") ?? null;
          history = r.food_history ?? null;
          setPkgName(r.package?.nombre ?? null);
          setIncluded(!!r.package?.incluye_gastronomia);
        } else {
          const { data: res } = await supabase
            .from("event_reservations")
            .select("package_id, package_nombre_snapshot")
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
          const { data: rows } = await supabase
            .from("reservation_checklist_data")
            .select("reservation_id, step_key, data, updated_at")
            .in("step_key", ["gastronomia", "alimentacion"])
            .order("updated_at", { ascending: false });
          const list = (rows as any[]) || [];
          current = list.find((r) => r.reservation_id === reservationId && r.step_key === "gastronomia") ?? null;
          legacy = list.find((r) => r.reservation_id === reservationId && r.step_key === "alimentacion") ?? null;
          history = list.find((r) => r.reservation_id !== reservationId) ?? null;
        }

        if (current?.data && isFoodSurveyAnswered(current.data)) {
          setSaved(current.data);
          setValues(current.data);
        } else {
          setSaved(null);
          const src = legacy ? { step_key: "alimentacion", data: legacy.data, updated_at: legacy.updated_at } : history;
          const sug = src ? suggestionFromHistory(src.step_key, src.data) : null;
          if (sug) {
            setValues({ ...sug, pension_interes: false });
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
      { ...values, historico_confirmado: historyAt !== null ? true : values.historico_confirmado ?? null },
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
              <p className="text-muted-foreground">{included ? "Incluye pensión completa (desayuno, almuerzo y cena)." : "No incluye pensión completa."}</p>
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
              <label className="flex items-start gap-3 rounded-lg border border-border p-3 cursor-pointer">
                <Checkbox checked={!!values.pension_interes} onCheckedChange={(v) => set({ pension_interes: !!v })} className="mt-0.5" />
                <span className="text-sm">
                  Me interesa contratar pensión completa
                  <span className="block text-[11px] text-muted-foreground mt-0.5">
                    Es solo una consulta: no se cobra nada ni cambia tu reserva. Administración te contactará con la opción y el precio.
                  </span>
                </span>
              </label>
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
