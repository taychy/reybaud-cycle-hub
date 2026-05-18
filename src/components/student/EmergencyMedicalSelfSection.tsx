import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Phone, Heart, AlertTriangle, Pencil } from "lucide-react";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

type Alumno = Tables<"alumnos">;

interface Props {
  alumno: Alumno;
  onUpdate: (a: Alumno) => void;
  readOnly?: boolean;
}

export function EmergencyMedicalSelfSection({ alumno, onUpdate, readOnly }: Props) {
  const [emerOpen, setEmerOpen] = useState(false);
  const [medOpen, setMedOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Emergencia
  const [n1, setN1] = useState(alumno.contacto_emergencia_nombre || "");
  const [t1, setT1] = useState(alumno.contacto_emergencia_telefono || "");
  const [r1, setR1] = useState(alumno.contacto_emergencia_relacion || "");
  const [n2, setN2] = useState(alumno.contacto_emergencia_nombre_2 || "");
  const [t2, setT2] = useState(alumno.contacto_emergencia_telefono_2 || "");
  const [r2, setR2] = useState(alumno.contacto_emergencia_relacion_2 || "");

  // Obra social
  const [os, setOs] = useState(alumno.obra_social_nombre || "");
  const [osNum, setOsNum] = useState(alumno.obra_social_numero_socio || "");
  const [osPlan, setOsPlan] = useState(alumno.obra_social_plan || "");

  const hasContacto = !!alumno.contacto_emergencia_nombre;
  const hasObra = !!alumno.obra_social_nombre;
  const incompleto = !hasContacto || !hasObra;

  const saveEmergencia = async () => {
    if (!n1.trim() || !t1.trim()) {
      toast.error("Cargá al menos un contacto con nombre y teléfono");
      return;
    }
    setSaving(true);
    const { data, error } = await supabase
      .from("alumnos")
      .update({
        contacto_emergencia_nombre: n1.trim(),
        contacto_emergencia_telefono: t1.trim(),
        contacto_emergencia_relacion: r1.trim() || null,
        contacto_emergencia_nombre_2: n2.trim() || null,
        contacto_emergencia_telefono_2: t2.trim() || null,
        contacto_emergencia_relacion_2: r2.trim() || null,
      })
      .eq("id", alumno.id)
      .select()
      .single();
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Contacto de emergencia guardado");
    onUpdate(data as Alumno);
    setEmerOpen(false);
  };

  const saveObraSocial = async () => {
    if (!os.trim()) {
      toast.error("Ingresá el nombre de tu obra social");
      return;
    }
    setSaving(true);
    const { data, error } = await supabase
      .from("alumnos")
      .update({
        obra_social_nombre: os.trim(),
        obra_social_numero_socio: osNum.trim() || null,
        obra_social_plan: osPlan.trim() || null,
      })
      .eq("id", alumno.id)
      .select()
      .single();
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Cobertura médica guardada");
    onUpdate(data as Alumno);
    setMedOpen(false);
  };

  return (
    <div id="datos-emergencia" className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-sm font-heading font-semibold uppercase tracking-wider text-muted-foreground">
          Mis datos personales
        </h3>
        {incompleto && !readOnly && (
          <Badge variant="outline" className="text-amber-500 border-amber-500/40 text-[10px]">
            <AlertTriangle className="w-3 h-3 mr-1" />
            Completá tus datos
          </Badge>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card/80 backdrop-blur-sm overflow-hidden divide-y divide-border">
        {/* Emergencia */}
        <button
          type="button"
          onClick={() => !readOnly && setEmerOpen(true)}
          disabled={readOnly}
          className="w-full flex items-center gap-3 px-4 py-4 hover:bg-accent/50 transition-colors text-left disabled:opacity-60"
        >
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Phone className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-foreground">Contacto de emergencia</p>
            {hasContacto ? (
              <p className="text-xs text-muted-foreground truncate">
                {alumno.contacto_emergencia_nombre} · {alumno.contacto_emergencia_telefono}
                {alumno.contacto_emergencia_nombre_2 && ` (+1)`}
              </p>
            ) : (
              <p className="text-xs text-amber-500">Pendiente de completar</p>
            )}
          </div>
          <Pencil className="w-4 h-4 text-muted-foreground" />
        </button>

        {/* Obra social */}
        <button
          type="button"
          onClick={() => !readOnly && setMedOpen(true)}
          disabled={readOnly}
          className="w-full flex items-center gap-3 px-4 py-4 hover:bg-accent/50 transition-colors text-left disabled:opacity-60"
        >
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Heart className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-foreground">Obra social / prepaga</p>
            {hasObra ? (
              <p className="text-xs text-muted-foreground truncate">
                {alumno.obra_social_nombre}
                {alumno.obra_social_numero_socio && ` · N° ${alumno.obra_social_numero_socio}`}
              </p>
            ) : (
              <p className="text-xs text-amber-500">Pendiente de completar</p>
            )}
          </div>
          <Pencil className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {/* Dialog emergencia */}
      <Dialog open={emerOpen} onOpenChange={setEmerOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Contacto de emergencia</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase">Contacto principal *</p>
              <Input placeholder="Nombre completo" value={n1} onChange={(e) => setN1(e.target.value)} />
              <Input placeholder="Teléfono" value={t1} onChange={(e) => setT1(e.target.value)} />
              <Input placeholder="Relación (mamá, pareja, etc.)" value={r1} onChange={(e) => setR1(e.target.value)} />
            </div>
            <div className="space-y-2 pt-2 border-t border-border">
              <p className="text-xs font-semibold text-muted-foreground uppercase">Contacto secundario (opcional)</p>
              <Input placeholder="Nombre completo" value={n2} onChange={(e) => setN2(e.target.value)} />
              <Input placeholder="Teléfono" value={t2} onChange={(e) => setT2(e.target.value)} />
              <Input placeholder="Relación" value={r2} onChange={(e) => setR2(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmerOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={saveEmergencia} disabled={saving}>
              {saving ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog obra social */}
      <Dialog open={medOpen} onOpenChange={setMedOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Obra social / prepaga</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Nombre *</Label>
              <Input placeholder="Ej: OSDE, Swiss Medical, IOMA…" value={os} onChange={(e) => setOs(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">N° de socio</Label>
              <Input value={osNum} onChange={(e) => setOsNum(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Plan (opcional)</Label>
              <Input placeholder="Ej: 210, Plata, etc." value={osPlan} onChange={(e) => setOsPlan(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMedOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={saveObraSocial} disabled={saving}>
              {saving ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
