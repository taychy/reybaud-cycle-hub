/**
 * Encuesta operativa de una sola pregunta (config en events.metadata.choice_surveys).
 * Sin preselección: el participante debe elegir conscientemente antes de guardar.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { tripTokenSaveStep } from "@/lib/tripTokenApi";
import { choiceSurveyStepKey, type ChoiceSurveyConfig } from "@/lib/choiceSurvey";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Loader2, Shirt } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  survey: ChoiceSurveyConfig | null;
  reservationId: string;
  alumnoId: string | null;
  token?: string;
  currentAnswer?: string | null;
  onSaved: () => void;
}

const TripChoiceSurveyDrawer = ({ open, onOpenChange, survey, reservationId, alumnoId, token, currentAnswer, onSaved }: Props) => {
  const [value, setValue] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) setValue(currentAnswer ?? null); }, [open, currentAnswer]);

  if (!survey) return null;
  const stepKey = choiceSurveyStepKey(survey.key);

  const handleSave = async () => {
    if (!value) return;
    setSaving(true);
    try {
      if (token) {
        await tripTokenSaveStep({ token, step_key: stepKey, completed: true, needs_advice: false, data: { respuesta: value }, file_url: null });
      } else {
        const { error } = await supabase.from("reservation_checklist_data").upsert(
          { reservation_id: reservationId, alumno_id: alumnoId, step_key: stepKey, completed: true, needs_advice: false, data: { respuesta: value }, file_url: null },
          { onConflict: "reservation_id,step_key" },
        );
        if (error) throw error;
      }
      toast.success("¡Respuesta guardada!");
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      toast.error("No se pudo guardar", { description: msg.includes("reserva_no_activa") ? "Tu reserva no está activa." : "Probá de nuevo en unos minutos." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[92vh]">
        <DrawerHeader className="text-left">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Shirt className="w-5 h-5 text-primary" />
            </div>
            <div>
              <DrawerTitle>{survey.title}</DrawerTitle>
              {survey.subtitle && <DrawerDescription>{survey.subtitle}</DrawerDescription>}
            </div>
          </div>
        </DrawerHeader>
        <div className="px-4 pb-6 space-y-4 overflow-y-auto">
          {survey.intro && <p className="text-sm text-muted-foreground">{survey.intro}</p>}
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium mb-3">{survey.question}</legend>
            <div className="grid grid-cols-4 gap-2" role="radiogroup">
              {survey.options.map((o) => {
                const selected = value === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setValue(o.value)}
                    className={`h-12 rounded-lg border text-sm font-semibold transition ${o.needs_follow_up ? "col-span-4" : ""} ${selected ? "bg-primary text-primary-foreground border-primary" : "bg-muted/40 hover:bg-muted border-border"}`}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </fieldset>
          {!value && <p className="text-xs text-muted-foreground">Elegí una opción para poder guardar.</p>}
          <Button className="w-full h-12" onClick={handleSave} disabled={saving || !value}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {currentAnswer ? "Actualizar respuesta" : "Guardar"}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
};

export default TripChoiceSurveyDrawer;
