/**
 * Drawer genérico para cargar/editar los pasos de preparación del viaje
 * que no tienen un drawer dedicado (alimentación, habitación, arribo, salud, peticiones).
 *
 * Renderiza el schema definido en `src/lib/tripSteps.ts`. Guarda vía supabase
 * directo o vía token (external) según se le pase `token`.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { tripTokenGet, tripTokenSaveStep } from "@/lib/tripTokenApi";
import { getTripStep, type FieldSchema } from "@/lib/tripSteps";

import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservationId: string;
  alumnoId: string | null;
  stepKey: string;
  token?: string;
  onSaved: () => void;
}

const isMeaningful = (v: any) =>
  v !== null && v !== undefined && v !== "" && v !== false;

const TripFormDrawer = ({ open, onOpenChange, reservationId, alumnoId, stepKey, token, onSaved }: Props) => {
  const step = getTripStep(stepKey);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [values, setValues] = useState<Record<string, any>>({});
  const [existingId, setExistingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !step) return;
    setLoading(true);

    const apply = (row: any | null) => {
      if (row) {
        setExistingId(row.id);
        setValues((row.data as Record<string, any>) ?? {});
      } else {
        setExistingId(null);
        setValues({});
      }
      setLoading(false);
    };

    if (token) {
      tripTokenGet(token)
        .then((resp) => apply(resp.checklist.find((c) => c.step_key === stepKey) ?? null))
        .catch(() => apply(null));
    } else {
      supabase
        .from("reservation_checklist_data")
        .select("*")
        .eq("reservation_id", reservationId)
        .eq("step_key", stepKey)
        .maybeSingle()
        .then(({ data }) => apply(data));
    }
  }, [open, reservationId, stepKey, token, step]);

  if (!step || !step.fields) return null;

  const setField = (key: string, v: any) => setValues((prev) => ({ ...prev, [key]: v }));

  const isComplete = step.fields.some((f) => isMeaningful(values[f.key]));

  const handleSave = async () => {
    setSaving(true);
    const payload = {
      reservation_id: reservationId,
      alumno_id: alumnoId,
      step_key: stepKey,
      completed: isComplete,
      needs_advice: false,
      data: values,
      file_url: null,
    };

    try {
      if (token) {
        await tripTokenSaveStep({
          token,
          step_key: stepKey,
          completed: isComplete,
          needs_advice: false,
          data: values,
          file_url: null,
        });
      } else if (existingId) {
        const { error } = await supabase
          .from("reservation_checklist_data")
          .update(payload)
          .eq("id", existingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("reservation_checklist_data").insert(payload);
        if (error) throw error;
      }
      toast.success("¡Información guardada!");
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error("Error al guardar", { description: e?.message });
    } finally {
      setSaving(false);
    }
  };

  const renderField = (f: FieldSchema) => {
    const val = values[f.key] ?? "";
    const wrapCls = f.colSpan === 2 ? "sm:col-span-2" : "";

    if (f.type === "textarea") {
      return (
        <div key={f.key} className={`space-y-1.5 ${wrapCls}`}>
          <Label>{f.label}</Label>
          <Textarea rows={3} placeholder={f.placeholder} value={val} onChange={(e) => setField(f.key, e.target.value)} />
          {f.help && <p className="text-[10px] text-muted-foreground">{f.help}</p>}
        </div>
      );
    }
    if (f.type === "select") {
      return (
        <div key={f.key} className={`space-y-1.5 ${wrapCls}`}>
          <Label>{f.label}</Label>
          <Select value={val || undefined} onValueChange={(v) => setField(f.key, v)}>
            <SelectTrigger><SelectValue placeholder="Elegí una opción" /></SelectTrigger>
            <SelectContent>
              {f.options?.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    }
    if (f.type === "toggle") {
      return (
        <div key={f.key} className={`flex items-center justify-between rounded-lg border p-3 ${wrapCls}`}>
          <Label className="cursor-pointer">{f.label}</Label>
          <Switch checked={!!val} onCheckedChange={(v) => setField(f.key, v)} />
        </div>
      );
    }
    // text / number / date / time
    return (
      <div key={f.key} className={`space-y-1.5 ${wrapCls}`}>
        <Label>{f.label}</Label>
        <Input
          type={f.type === "number" ? "number" : f.type === "date" ? "date" : f.type === "time" ? "time" : "text"}
          placeholder={f.placeholder}
          value={val}
          onChange={(e) => setField(f.key, e.target.value)}
        />
      </div>
    );
  };

  const Icon = step.icon;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[92vh]">
        <DrawerHeader className="text-left">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
              <Icon className="w-5 h-5 text-primary" />
            </div>
            <div>
              <DrawerTitle>{step.label}</DrawerTitle>
              <DrawerDescription>{step.description}</DrawerDescription>
            </div>
          </div>
        </DrawerHeader>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="px-4 pb-6 space-y-4 overflow-y-auto">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {step.fields.map(renderField)}
            </div>

            <Button className="w-full h-12" onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Guardar
            </Button>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
};

export default TripFormDrawer;
