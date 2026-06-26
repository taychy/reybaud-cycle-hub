import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Trash2, Mail, CreditCard, FileText, ListChecks, Info } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export type FormFieldDef = {
  key: string;
  label: string;
  type: "text" | "tel" | "textarea" | "number";
  required: boolean;
};

interface Props {
  servicio: any;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}

const RECORDATORIO_OPCIONES = [
  { value: "1", label: "1 hora antes" },
  { value: "3", label: "3 horas antes" },
  { value: "24", label: "1 día antes" },
  { value: "48", label: "2 días antes" },
  { value: "168", label: "1 semana antes" },
];

export function ServicioConfigDialog({ servicio, open, onOpenChange, onSaved }: Props) {
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [duracion, setDuracion] = useState("60");
  const [precio, setPrecio] = useState("");
  const [modalidad, setModalidad] = useState("presencial");
  const [activo, setActivo] = useState(true);
  const [politica, setPolitica] = useState("");
  const [emailConf, setEmailConf] = useState(true);
  const [emailRec, setEmailRec] = useState(true);
  const [emailCoach, setEmailCoach] = useState(true);
  const [recHoras, setRecHoras] = useState("24");
  const [ics, setIcs] = useState(true);
  const [pagoModo, setPagoModo] = useState<"ninguno" | "sena" | "total">("ninguno");
  const [pagoSena, setPagoSena] = useState("");
  const [fields, setFields] = useState<FormFieldDef[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!servicio) return;
    setNombre(servicio.nombre || "");
    setDescripcion(servicio.descripcion || "");
    setDuracion(String(servicio.duracion_minutos ?? 60));
    setPrecio(servicio.precio != null ? String(servicio.precio) : "");
    setModalidad(servicio.modalidad || "presencial");
    setActivo(servicio.activo ?? true);
    setPolitica(servicio.politica_cancelacion || "");
    setEmailConf(servicio.email_confirmacion_enabled ?? true);
    setEmailRec(servicio.email_recordatorio_enabled ?? true);
    setRecHoras(String(servicio.recordatorio_horas_antes ?? 24));
    setIcs(servicio.ics_adjunto ?? true);
    setPagoModo((servicio.pago_modo as any) || "ninguno");
    setPagoSena(servicio.pago_monto_sena != null ? String(servicio.pago_monto_sena) : "");
    setFields(Array.isArray(servicio.form_fields) ? servicio.form_fields : []);
  }, [servicio]);

  const addField = () => {
    setFields([...fields, { key: `campo_${fields.length + 1}`, label: "", type: "text", required: false }]);
  };
  const updateField = (idx: number, patch: Partial<FormFieldDef>) => {
    setFields(fields.map((f, i) => (i === idx ? { ...f, ...patch } : f)));
  };
  const removeField = (idx: number) => setFields(fields.filter((_, i) => i !== idx));

  const save = async () => {
    if (!nombre.trim()) {
      toast({ title: "El nombre es obligatorio", variant: "destructive" });
      return;
    }
    if (pagoModo === "sena" && (!pagoSena || Number(pagoSena) <= 0)) {
      toast({ title: "Definí el monto de la seña", variant: "destructive" });
      return;
    }
    const keys = fields.map(f => f.key.trim()).filter(Boolean);
    if (new Set(keys).size !== keys.length) {
      toast({ title: "Los campos del formulario tienen claves duplicadas", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("servicios_turnera")
      .update({
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || null,
        duracion_minutos: Number(duracion) || 60,
        precio: precio !== "" ? Number(precio) : null,
        modalidad,
        activo,
        politica_cancelacion: politica || null,
        email_confirmacion_enabled: emailConf,
        email_recordatorio_enabled: emailRec,
        recordatorio_horas_antes: Number(recHoras),
        ics_adjunto: ics,
        pago_modo: pagoModo,
        pago_monto_sena: pagoModo === "sena" ? Number(pagoSena) : null,
        form_fields: fields as any,
      } as any)
      .eq("id", servicio.id);
    setSaving(false);
    if (error) {
      toast({ title: "Error al guardar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Configuración guardada" });
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configurar · {servicio?.nombre}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Datos básicos */}
          <Section icon={<Info className="w-4 h-4" />} title="Datos del servicio">
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Nombre *</Label>
                <Input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Clase evaluatoria" />
              </div>
              <div>
                <Label className="text-xs">Descripción</Label>
                <Textarea rows={2} value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Breve descripción visible al reservar" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Duración (min)</Label>
                  <Input type="number" value={duracion} onChange={e => setDuracion(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Precio ($)</Label>
                  <Input type="number" value={precio} onChange={e => setPrecio(e.target.value)} placeholder="Opcional" />
                </div>
                <div>
                  <Label className="text-xs">Modalidad</Label>
                  <Select value={modalidad} onValueChange={setModalidad}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="presencial">Presencial</SelectItem>
                      <SelectItem value="virtual">Virtual</SelectItem>
                      <SelectItem value="hibrida">Híbrida</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center justify-between pt-2">
                <div>
                  <Label>Servicio activo</Label>
                  <p className="text-xs text-muted-foreground">Si está apagado, no aparece en el link público.</p>
                </div>
                <Switch checked={activo} onCheckedChange={setActivo} />
              </div>
            </div>
          </Section>

          {/* Formulario de reserva */}
          <Section icon={<ListChecks className="w-4 h-4" />} title="Formulario de reserva" subtitle="Campos adicionales que pedirás al alumno. Nombre, apellido y email ya están incluidos.">

            <div className="space-y-2">
              {fields.length === 0 && (
                <p className="text-xs text-muted-foreground">Sin campos extra.</p>
              )}
              {fields.map((f, i) => (
                <Card key={i} className="border-border">
                  <CardContent className="p-3 space-y-2">
                    <div className="grid grid-cols-12 gap-2">
                      <Input
                        className="col-span-5"
                        placeholder="Etiqueta (ej: Teléfono)"
                        value={f.label}
                        onChange={e => updateField(i, { label: e.target.value, key: e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || f.key })}
                      />
                      <Select value={f.type} onValueChange={v => updateField(i, { type: v as any })}>
                        <SelectTrigger className="col-span-4"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="text">Texto corto</SelectItem>
                          <SelectItem value="textarea">Texto largo</SelectItem>
                          <SelectItem value="tel">Teléfono</SelectItem>
                          <SelectItem value="number">Número</SelectItem>
                        </SelectContent>
                      </Select>
                      <div className="col-span-2 flex items-center gap-2">
                        <Switch checked={f.required} onCheckedChange={v => updateField(i, { required: v })} />
                        <span className="text-xs">Obligatorio</span>
                      </div>
                      <Button variant="ghost" size="icon" className="col-span-1 text-destructive" onClick={() => removeField(i)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
              <Button variant="outline" size="sm" onClick={addField}>
                <Plus className="w-4 h-4 mr-1" /> Agregar campo
              </Button>
            </div>
          </Section>

          {/* Confirmación + recordatorio */}
          <Section icon={<Mail className="w-4 h-4" />} title="Confirmaciones y recordatorios">
            <div className="flex items-center justify-between">
              <div>
                <Label>Email de confirmación al reservar</Label>
                <p className="text-xs text-muted-foreground">El alumno recibe un email apenas confirma la reserva.</p>
              </div>
              <Switch checked={emailConf} onCheckedChange={setEmailConf} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Adjuntar invitación de calendario (.ics)</Label>
                <p className="text-xs text-muted-foreground">El alumno puede sumar el turno a Google/Apple Calendar.</p>
              </div>
              <Switch checked={ics} onCheckedChange={setIcs} disabled={!emailConf} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1">
                <Label>Recordatorio por email antes del turno</Label>
                <p className="text-xs text-muted-foreground">Se envía automáticamente.</p>
              </div>
              <Switch checked={emailRec} onCheckedChange={setEmailRec} />
            </div>
            {emailRec && (
              <Select value={recHoras} onValueChange={setRecHoras}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RECORDATORIO_OPCIONES.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </Section>

          {/* Política */}
          <Section icon={<FileText className="w-4 h-4" />} title="Política de cancelación" subtitle="Aparecerá en el formulario de reserva y en los emails.">
            <Textarea
              rows={4}
              value={politica}
              onChange={e => setPolitica(e.target.value)}
              placeholder="Ej: Las cancelaciones con menos de 24hs no son reembolsables."
            />
          </Section>

          {/* Pago */}
          <Section icon={<CreditCard className="w-4 h-4" />} title="Pago online (Mercado Pago)" subtitle="Próximamente: el alumno paga al reservar.">
            <Select value={pagoModo} onValueChange={v => setPagoModo(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ninguno">Sin pago online (se gestiona aparte)</SelectItem>
                <SelectItem value="sena">Seña / reserva parcial</SelectItem>
                <SelectItem value="total">Pago total por adelantado</SelectItem>
              </SelectContent>
            </Select>
            {pagoModo === "sena" && (
              <div>
                <Label className="text-xs">Monto de la seña ($)</Label>
                <Input type="number" value={pagoSena} onChange={e => setPagoSena(e.target.value)} placeholder="Ej: 5000" />
              </div>
            )}
            {pagoModo !== "ninguno" && (
              <p className="text-xs text-amber-500">
                La integración con Mercado Pago se activa en la Fase 3. Por ahora la configuración queda guardada.
              </p>
            )}
          </Section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Guardando..." : "Guardar configuración"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Section({ icon, title, subtitle, children }: { icon: React.ReactNode; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 border border-border rounded-lg p-4 bg-muted/30">
      <div className="flex items-start gap-2">
        <div className="mt-0.5 text-primary">{icon}</div>
        <div>
          <p className="text-sm font-semibold text-foreground">{title}</p>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}
