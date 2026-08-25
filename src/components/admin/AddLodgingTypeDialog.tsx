import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { MONEDAS } from "@/lib/currency";
import { capacidadFisica } from "@/lib/lodgingCapacity";
import type { CostBasis } from "@/lib/eventCostCalculator";

const TIPOS: { value: string; label: string; personas: number }[] = [
  { value: "individual", label: "Individual", personas: 1 },
  { value: "doble", label: "Doble", personas: 2 },
  { value: "triple", label: "Triple", personas: 3 },
  { value: "cuadruple", label: "Cuádruple", personas: 4 },
  { value: "cabana", label: "Cabaña", personas: 4 },
  { value: "dormitorio", label: "Dormitorio", personas: 6 },
];

const BASIS_LABELS: Record<CostBasis, string> = {
  persona_estadia: "Por persona / estadía",
  persona_noche: "Por persona / noche",
  habitacion_noche: "Por habitación / noche",
  total: "Total contratado",
};

export interface NewLodgingResult {
  packageId: string;
  cupo: number;
  habitaciones: number;
  personas: number;
  tipo: string;
  costo: {
    cost_basis: CostBasis;
    precio_unitario: number;
    moneda: string;
    descripcion: string;
    noches: number;
  };
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  eventId: string;
  monedaBase: string;
  nextSortOrder: number;
  nochesDefault?: number;
  onCreated: (result: NewLodgingResult) => void | Promise<void>;
}

export default function AddLodgingTypeDialog({
  open, onOpenChange, eventId, monedaBase, nextSortOrder, nochesDefault = 0, onCreated,
}: Props) {
  const [tipo, setTipo] = useState("doble");
  const [nombre, setNombre] = useState("Habitación doble");
  const [habitaciones, setHabitaciones] = useState(1);
  const [personas, setPersonas] = useState(2);
  const [basis, setBasis] = useState<CostBasis>("persona_estadia");
  const [precio, setPrecio] = useState(0);
  const [moneda, setMoneda] = useState(monedaBase);
  const [descripcion, setDescripcion] = useState("");
  const [noches, setNoches] = useState(nochesDefault);
  const [saving, setSaving] = useState(false);

  const cupo = capacidadFisica(habitaciones, personas);
  const tipoLabel = TIPOS.find((t) => t.value === tipo)?.label || "Habitación";

  const onTipoChange = (v: string) => {
    setTipo(v);
    const t = TIPOS.find((x) => x.value === v);
    if (t) {
      setPersonas(t.personas);
      setNombre(`Habitación ${t.label.toLowerCase()}`);
    }
  };

  const crear = async () => {
    if (!nombre.trim()) { toast({ title: "Poné un nombre", variant: "destructive" }); return; }
    setSaving(true);
    const { data: pkg, error } = await supabase.from("event_packages").insert({
      event_id: eventId,
      nombre: nombre.trim(),
      precio: 0,
      sena: 0,
      currency: monedaBase,
      cupo,
      personas_por_habitacion: Math.max(1, Number(personas) || 1),
      sin_alojamiento: false,
      activo: true,
      sort_order: nextSortOrder,
    }).select("id").single();

    if (error || !pkg) {
      setSaving(false);
      toast({ title: "Error", description: error?.message, variant: "destructive" });
      return;
    }

    const rooms = Array.from({ length: Math.max(0, Number(habitaciones) || 0) }, (_, i) => ({
      event_id: eventId,
      package_id: pkg.id,
      nombre: `${tipoLabel} ${i + 1}`,
      capacidad: Math.max(1, Number(personas) || 1),
      tipo,
      sort_order: i,
    }));
    if (rooms.length > 0) {
      const { error: rErr } = await supabase.from("event_rooms").insert(rooms as any);
      if (rErr) toast({ title: "Paquete creado, pero falló crear habitaciones", description: rErr.message, variant: "destructive" });
    }

    setSaving(false);
    toast({ title: "Alojamiento creado" });
    onOpenChange(false);
    onCreated({
      packageId: pkg.id,
      cupo,
      habitaciones: Math.max(0, Number(habitaciones) || 0),
      personas: Math.max(1, Number(personas) || 1),
      tipo,
      costo: {
        cost_basis: basis,
        precio_unitario: Number(precio) || 0,
        moneda,
        descripcion: descripcion.trim(),
        noches: Number(noches) || 0,
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agregar alojamiento</DialogTitle>
          <DialogDescription>
            Se crea la modalidad con sus habitaciones y su costo principal, listo para presupuestar. El evento sigue en borrador.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Tipo</Label>
              <Select value={tipo} onValueChange={onTipoChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPOS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Nombre</Label>
              <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Cantidad de habitaciones</Label>
              <Input type="number" value={habitaciones} onChange={(e) => setHabitaciones(Number(e.target.value))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Personas por habitación</Label>
              <Input type="number" value={personas} onChange={(e) => setPersonas(Number(e.target.value))} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Capacidad física: <span className="font-medium">{cupo} plazas</span>
          </p>

          <div className="border-t pt-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Forma de costo</Label>
                <Select value={basis} onValueChange={(v) => setBasis(v as CostBasis)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(BASIS_LABELS) as CostBasis[]).map((b) => (
                      <SelectItem key={b} value={b}>{BASIS_LABELS[b]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {basis !== "total" && basis !== "persona_estadia" && (
                <div className="space-y-1">
                  <Label className="text-xs">Noches</Label>
                  <Input type="number" value={noches} onChange={(e) => setNoches(Number(e.target.value))} />
                </div>
              )}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1 col-span-2">
                <Label className="text-xs">Costo unitario</Label>
                <Input type="number" value={precio} onChange={(e) => setPrecio(Number(e.target.value))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Moneda</Label>
                <Select value={moneda} onValueChange={setMoneda}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONEDAS.map((m) => <SelectItem key={m.value} value={m.value}>{m.value}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Descripción (opcional)</Label>
              <Input placeholder="Hotel, hostel…" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={crear} disabled={saving}>{saving ? "Creando…" : "Crear"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
