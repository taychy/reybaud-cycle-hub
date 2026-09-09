import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { formatPrice } from "@/lib/currency";
import AlumnoPicker, { AlumnoLite, alumnoFullName } from "@/components/admin/AlumnoPicker";

export interface ReassignItem {
  id: string;
  list_id: string;
  cliente_nombre: string;
  alumno_id: string | null;
  producto: string;
  variante: string | null;
  cantidad: number;
  precio_venta: number | null;
  moneda: string | null;
}

interface Props {
  item: ReassignItem | null;
  cobrosPrevios: number;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}

/**
 * Reasigna la responsabilidad comercial de UN ítem de una lista de entrega
 * a otro alumno (o corrige el nombre de un cliente externo).
 * No mueve cobros ya registrados del comprador anterior.
 */
const ReassignBuyerDialog = ({ item, cobrosPrevios, onOpenChange, onDone }: Props) => {
  const [alumno, setAlumno] = useState<AlumnoLite | null>(null);
  const [nombreManual, setNombreManual] = useState("");
  const [actual, setActual] = useState<AlumnoLite | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setAlumno(null);
    setNombreManual(item?.cliente_nombre || "");
    setActual(null);
    if (item?.alumno_id) {
      (async () => {
        const { data } = await supabase
          .from("alumnos")
          .select("id, nombre, apellido, email")
          .eq("id", item.alumno_id!)
          .maybeSingle();
        setActual((data as any) || null);
      })();
    }
  }, [item?.id, item?.alumno_id, item?.cliente_nombre]);

  const confirmar = async () => {
    if (!item) return;
    const nombre = nombreManual.trim();
    if (!alumno && !nombre) { toast.error("Elegí un alumno o escribí un nombre"); return; }
    setSaving(true);
    const { error } = await supabase.rpc("reasignar_comprador_entrega", {
      _item_id: item.id,
      _alumno_id: alumno?.id ?? null,
      _cliente_nombre: alumno ? null : nombre,
    });
    setSaving(false);
    if (error) { toast.error("No se pudo reasignar", { description: error.message }); return; }
    toast.success(`Comprador reasignado a ${alumno ? alumnoFullName(alumno) : nombre}`);
    onOpenChange(false);
    onDone();
  };

  return (
    <Dialog open={!!item} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Reasignar comprador</DialogTitle>
          <DialogDescription>
            Cambia quién es el responsable comercial de este producto. Sólo afecta a este ítem.
          </DialogDescription>
        </DialogHeader>

        {item && (
          <div className="space-y-3 text-sm">
            <div className="rounded-md border border-border/60 p-2.5 space-y-1">
              <div className="text-[11px] uppercase text-muted-foreground">Comprador actual</div>
              <div className="font-medium">{item.cliente_nombre || "(sin cliente)"}</div>
              <div className="text-xs text-muted-foreground">
                {actual ? `Alumno vinculado: ${alumnoFullName(actual)}${actual.email ? ` · ${actual.email}` : ""}` : "Sin alumno vinculado"}
              </div>
            </div>

            <div className="rounded-md border border-border/60 p-2.5 text-xs space-y-0.5">
              <div className="text-foreground font-medium">
                {item.producto}{item.variante ? ` · ${item.variante}` : ""} × {item.cantidad}
              </div>
              <div className="text-muted-foreground">
                {item.precio_venta != null
                  ? `${formatPrice(Number(item.precio_venta), item.moneda || "ARS")} c/u · total ${formatPrice(Number(item.precio_venta) * Number(item.cantidad || 1), item.moneda || "ARS")}`
                  : "Sin precio cargado"}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Nuevo comprador (alumno)</Label>
              <AlumnoPicker value={alumno} onChange={setAlumno} initialQuery="" />
            </div>

            {!alumno && (
              <div className="space-y-1.5">
                <Label>O corregir el nombre del cliente externo</Label>
                <Input value={nombreManual} onChange={(e) => setNombreManual(e.target.value)} placeholder="Nombre del comprador" />
                <p className="text-[11px] text-muted-foreground">Si elegís un alumno, se usa su nombre completo.</p>
              </div>
            )}

            {cobrosPrevios > 0 && (
              <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-600">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Hay cobros registrados para el comprador anterior. No se moverán automáticamente; revisalos en Cobros.
                </span>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button variant="gold" onClick={confirmar} disabled={saving}>
            {saving ? "Guardando..." : "Confirmar reasignación"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ReassignBuyerDialog;
