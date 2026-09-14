import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { todayISO } from "@/lib/programEnrollment";
import { Loader2 } from "lucide-react";

const sb: any = supabase;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (programId: string) => void;
}

const initialForm = {
  nombre: "",
  descripcion_corta: "",
  descripcion: "",
  fecha_inicio_programa: "",
  fecha_fin_programa: "",
  fecha_cierre_inscripcion: "",
  max_inscripciones: "",
  precio: "",
  moneda: "ARS",
  cuotas_cantidad: "",
  cuota_valor: "",
};

const parseOptionalNumber = (value: string): number | null => {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export default function CreateProgramaDialog({ open, onOpenChange, onCreated }: Props) {
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm(initialForm);
  }, [open]);

  const cuotaCalculada = useMemo(() => {
    const precio = Number(form.precio);
    const cuotas = Number(form.cuotas_cantidad);
    if (!(precio > 0) || !(cuotas > 0)) return null;
    return Math.round((precio / cuotas) * 100) / 100;
  }, [form.precio, form.cuotas_cantidad]);

  const validate = (): string | null => {
    if (form.nombre.trim().length < 2) return "Ingresá el nombre del programa.";

    const precio = Number(form.precio);
    if (!Number.isFinite(precio) || precio <= 0) return "Ingresá un precio total mayor a 0.";

    if (!form.fecha_inicio_programa) return "Ingresá la fecha de inicio del programa.";
    if (!form.fecha_fin_programa) return "Ingresá la fecha de finalización del programa.";
    if (!form.fecha_cierre_inscripcion) return "Ingresá la fecha de cierre de inscripciones.";

    if (form.fecha_fin_programa < form.fecha_inicio_programa)
      return "La fecha de finalización no puede ser anterior a la fecha de inicio.";
    if (form.fecha_cierre_inscripcion > form.fecha_fin_programa)
      return "El cierre de inscripciones no puede ser posterior a la finalización del programa.";
    if (form.fecha_cierre_inscripcion < todayISO())
      return "El cierre de inscripciones no puede estar en el pasado.";

    const max = parseOptionalNumber(form.max_inscripciones);
    if (max != null && (!Number.isInteger(max) || max < 0))
      return "Los cupos deben ser un número entero mayor o igual a 0.";

    const cuotas = parseOptionalNumber(form.cuotas_cantidad);
    if (cuotas != null && (!Number.isInteger(cuotas) || cuotas < 1))
      return "La cantidad de cuotas debe ser un número entero mayor o igual a 1.";

    const cuota = parseOptionalNumber(form.cuota_valor);
    if (cuota != null && cuota <= 0) return "El valor de la cuota debe ser mayor a 0.";
    if (cuota != null && cuotas == null) return "Indicá la cantidad de cuotas para definir un valor por cuota.";

    return null;
  };

  const handleSave = async () => {
    const validationError = validate();
    if (validationError) {
      toast({ title: "Revisá los datos", description: validationError, variant: "destructive" });
      return;
    }

    setSaving(true);
    let newPlanId: string | null = null;

    try {
      const precio = Number(form.precio);
      const cuotas = parseOptionalNumber(form.cuotas_cantidad);
      const cuotaIngresada = parseOptionalNumber(form.cuota_valor);
      const cuotaValor = cuotas
        ? cuotaIngresada ?? Math.round((precio / cuotas) * 100) / 100
        : null;

      // En el modelo actual un programa cerrado ES también su registro comercial
      // en `planes`. De esta forma no se crean dos entidades que puedan divergir.
      const { data: plan, error: planError } = await sb
        .from("planes")
        .insert({
          nombre: form.nombre.trim(),
          descripcion_corta: form.descripcion_corta.trim() || null,
          descripcion: form.descripcion.trim() || null,
          precio,
          moneda: form.moneda,
          frecuencia: "unico",
          renovacion_auto_permitida: false,
          visibilidad: "oculto",
          activo: true,
          tipo: "programa",
          es_programa_cerrado: true,
          landing_public: false,
          fecha_inicio_programa: form.fecha_inicio_programa,
          fecha_fin_programa: form.fecha_fin_programa,
          fecha_cierre_inscripcion: form.fecha_cierre_inscripcion,
          max_inscripciones: parseOptionalNumber(form.max_inscripciones),
          cuotas_cantidad: cuotas,
          cuota_valor: cuotaValor,
          tipo_consumo: "mensual",
        })
        .select("id")
        .single();

      if (planError || !plan?.id) throw planError || new Error("No se pudo crear el programa.");
      const createdPlanId = String(plan.id);
      newPlanId = createdPlanId;

      // Se crea una etapa comercial inicial para que el precio quede utilizable
      // por la landing cuando más adelante se decida publicarla.
      const { error: stageError } = await sb.from("plan_price_stages").insert({
        plan_id: createdPlanId,
        nombre: "Precio general",
        precio,
        precio_cuota: cuotaValor,
        cuotas_cantidad: cuotas,
        fecha_desde: todayISO(),
        fecha_hasta: form.fecha_cierre_inscripcion,
        activo: true,
        orden: 1,
      });

      if (stageError) throw stageError;

      toast({
        title: "Programa creado",
        description: "Quedó creado en Programas y con su configuración comercial asociada, sin publicarse todavía.",
      });
      onOpenChange(false);
      onCreated(createdPlanId);
    } catch (error: any) {
      // Si falló la creación de la etapa inicial, intentamos no dejar un programa
      // incompleto. Como todavía es nuevo, no tiene inscripciones ni pagos.
      if (newPlanId) {
        await sb.from("planes").delete().eq("id", newPlanId);
      }
      toast({
        title: "No se pudo crear el programa",
        description: error?.message || "Ocurrió un error inesperado.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={saving ? undefined : onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo programa</DialogTitle>
          <DialogDescription>
            Creá la edición y su configuración comercial en un solo paso. Se guarda oculta y con la landing pública desactivada.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide">Programa</h3>
            <div className="space-y-2">
              <Label htmlFor="programa-nombre">Nombre *</Label>
              <Input
                id="programa-nombre"
                value={form.nombre}
                onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                placeholder="Ej. Programa de Iniciación · Octubre 2026"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="programa-descripcion-corta">Descripción corta</Label>
              <Input
                id="programa-descripcion-corta"
                value={form.descripcion_corta}
                onChange={(e) => setForm((f) => ({ ...f, descripcion_corta: e.target.value }))}
                placeholder="Resumen para identificar esta edición"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="programa-descripcion">Descripción</Label>
              <Textarea
                id="programa-descripcion"
                value={form.descripcion}
                onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
                rows={3}
              />
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide">Fechas e inscripciones</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label htmlFor="programa-inicio">Inicio *</Label>
                <Input
                  id="programa-inicio"
                  type="date"
                  value={form.fecha_inicio_programa}
                  onChange={(e) => setForm((f) => ({ ...f, fecha_inicio_programa: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="programa-fin">Finalización *</Label>
                <Input
                  id="programa-fin"
                  type="date"
                  value={form.fecha_fin_programa}
                  onChange={(e) => setForm((f) => ({ ...f, fecha_fin_programa: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="programa-cierre">Cierre inscripción *</Label>
                <Input
                  id="programa-cierre"
                  type="date"
                  value={form.fecha_cierre_inscripcion}
                  onChange={(e) => setForm((f) => ({ ...f, fecha_cierre_inscripcion: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2 sm:max-w-[220px]">
              <Label htmlFor="programa-cupos">Cupos máximos</Label>
              <Input
                id="programa-cupos"
                type="number"
                min="0"
                step="1"
                value={form.max_inscripciones}
                onChange={(e) => setForm((f) => ({ ...f, max_inscripciones: e.target.value }))}
                placeholder="Sin límite"
              />
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide">Precio y cobro</h3>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="programa-precio">Precio total *</Label>
                <Input
                  id="programa-precio"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.precio}
                  onChange={(e) => setForm((f) => ({ ...f, precio: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Moneda</Label>
                <Select value={form.moneda} onValueChange={(value) => setForm((f) => ({ ...f, moneda: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ARS">ARS</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="programa-cuotas">Cuotas</Label>
                <Input
                  id="programa-cuotas"
                  type="number"
                  min="1"
                  step="1"
                  value={form.cuotas_cantidad}
                  onChange={(e) => setForm((f) => ({ ...f, cuotas_cantidad: e.target.value }))}
                  placeholder="1"
                />
              </div>
            </div>
            <div className="space-y-2 sm:max-w-[280px]">
              <Label htmlFor="programa-cuota-valor">Valor por cuota</Label>
              <Input
                id="programa-cuota-valor"
                type="number"
                min="0"
                step="0.01"
                value={form.cuota_valor}
                onChange={(e) => setForm((f) => ({ ...f, cuota_valor: e.target.value }))}
                placeholder={cuotaCalculada != null ? String(cuotaCalculada) : "Se calcula automáticamente"}
              />
              <p className="text-xs text-muted-foreground">
                Si lo dejás vacío y definís cuotas, se calcula a partir del precio total.
              </p>
            </div>
          </div>

          <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
            Al guardar, el programa queda activo internamente pero oculto al público. La landing pública permanece desactivada hasta que la habilites desde el detalle del programa.
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Crear programa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
