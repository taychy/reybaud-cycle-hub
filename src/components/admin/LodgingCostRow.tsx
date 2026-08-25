import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, AlertTriangle, BedDouble } from "lucide-react";
import { formatPrice, MONEDAS } from "@/lib/currency";
import type { CostBasis, CostItemDetalle } from "@/lib/eventCostCalculator";
import { capacidadFisica } from "@/lib/lodgingCapacity";

export interface LodgingPackage {
  id: string;
  nombre: string;
  personas_por_habitacion: number | null;
  cupo: number | null;
  sin_alojamiento: boolean | null;
}

export interface LodgingRoom {
  id: string;
  package_id: string | null;
  nombre: string | null;
  capacidad: number | null;
  tipo: string | null;
  sort_order?: number | null;
}

interface Props {
  item: {
    id: string;
    descripcion: string;
    cantidad: number;
    precio_unitario: number;
    moneda: string;
    detalle?: CostItemDetalle | null;
  };
  packages: LodgingPackage[];
  rooms: LodgingRoom[];
  monedaBase: string;
  nochesDefault: number;
  esperados: Record<string, number>;
  /** reservas activas por package_id (para el guard de reducción de capacidad) */
  reservasActivas?: Record<string, number>;
  onUpdate: (patch: Record<string, any>) => void;
  onDelete: () => void;
  /** renombra la modalidad/paquete */
  onRenamePackage?: (packageId: string, nombre: string) => void | Promise<void>;
  /** sincroniza habitaciones/personas del paquete (rooms + cupo) */
  onSyncStructure?: (
    packageId: string,
    habitaciones: number,
    personas: number,
  ) => void | Promise<void>;
}

const BASIS_LABELS: Record<CostBasis, string> = {
  habitacion_noche: "Por habitación / noche",
  persona_noche: "Por persona / noche",
  persona_estadia: "Por persona / estadía",
  total: "Total contratado",
};

export function packageRoomsInfo(pkgId: string, rooms: LodgingRoom[], pkg?: LodgingPackage) {
  const own = rooms.filter((r) => r.package_id === pkgId);
  const habitaciones = own.length;
  const plazas = own.reduce((a, r) => a + (Number(r.capacidad) || 0), 0);
  const personas =
    Number(pkg?.personas_por_habitacion) ||
    (habitaciones > 0 ? Math.max(1, Math.round(plazas / habitaciones)) : 1);
  return { habitaciones, plazas: plazas || Number(pkg?.cupo) || 0, personas, tipo: own[0]?.tipo || null };
}

export default function LodgingCostRow({
  item, packages, rooms, monedaBase, nochesDefault, esperados, reservasActivas,
  onUpdate, onDelete, onRenamePackage, onSyncStructure,
}: Props) {
  const det: CostItemDetalle = item.detalle || {};
  const basis: CostBasis = (det.cost_basis as CostBasis) || "habitacion_noche";
  const pkgId = det.package_id || "";
  const pkg = packages.find((p) => p.id === pkgId);
  const info = pkgId ? packageRoomsInfo(pkgId, rooms, pkg) : null;
  const noches = Number(det.noches ?? nochesDefault) || 0;
  const habitaciones = Number(info?.habitaciones ?? det.habitaciones ?? 0) || 0;
  const personas = Number(info?.personas ?? det.personas_por_habitacion ?? 1) || 1;
  const pax = Number(esperados[pkgId] || 0);

  const [nombre, setNombre] = useState(pkg?.nombre || "");
  useEffect(() => { setNombre(pkg?.nombre || ""); }, [pkg?.nombre]);

  const total =
    basis === "habitacion_noche"
      ? habitaciones * noches * Number(item.precio_unitario || 0)
      : basis === "persona_noche"
        ? pax * noches * Number(item.precio_unitario || 0)
        : basis === "persona_estadia"
          ? pax * Number(item.precio_unitario || 0)
          : Number(item.precio_unitario || 0) * (Number(item.cantidad) > 0 ? Number(item.cantidad) : 1);

  const capacidad = pkgId ? capacidadFisica(habitaciones, personas) : 0;
  const excedido = capacidad > 0 && pax > capacidad;

  const patchDetalle = (p: Partial<CostItemDetalle>) =>
    onUpdate({ detalle: { ...det, ...p } });

  const onSelectPackage = (id: string) => {
    const target = packages.find((p) => p.id === id);
    const nfo = packageRoomsInfo(id, rooms, target);
    onUpdate({
      detalle: {
        ...det,
        package_id: id,
        cost_basis: basis,
        habitaciones: nfo.habitaciones || Number(det.habitaciones || 0),
        noches: Number(det.noches ?? nochesDefault) || 0,
        personas_por_habitacion: nfo.personas,
        tipo_habitacion: nfo.tipo,
      },
    });
  };

  const syncStructure = async (nextHab: number, nextPers: number) => {
    if (!pkgId || !onSyncStructure) return;
    await onSyncStructure(pkgId, nextHab, nextPers);
    patchDetalle({ habitaciones: nextHab, personas_por_habitacion: nextPers });
  };

  return (
    <div className="border rounded-md p-3 space-y-3 bg-muted/20">
      <div className="flex items-center gap-2">
        <BedDouble className="w-4 h-4 text-muted-foreground" />
        <span className="text-xs font-medium">Alojamiento</span>
        <Button variant="ghost" size="icon" className="ml-auto h-8 w-8" onClick={onDelete}>
          <Trash2 className="w-4 h-4 text-destructive" />
        </Button>
      </div>

      {/* Modalidad / paquete */}
      {pkgId && onRenamePackage ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1 md:col-span-2">
            <Label className="text-xs">Nombre del alojamiento</Label>
            <Input
              className="h-9"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              onBlur={() => {
                const v = nombre.trim();
                if (v && v !== pkg?.nombre) onRenamePackage(pkgId, v);
              }}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Forma de costo</Label>
            <Select value={basis} onValueChange={(v) => patchDetalle({ cost_basis: v as CostBasis })}>
              <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(BASIS_LABELS) as CostBasis[]).map((b) => (
                  <SelectItem key={b} value={b}>{BASIS_LABELS[b]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1 md:col-span-2">
            <Label className="text-xs">Tipo de habitación / paquete *</Label>
            <Select value={pkgId} onValueChange={onSelectPackage}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Elegí un paquete con alojamiento" />
              </SelectTrigger>
              <SelectContent>
                {packages.map((p) => {
                  const nfo = packageRoomsInfo(p.id, rooms, p);
                  return (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nombre}
                      {nfo.habitaciones > 0
                        ? ` · ${nfo.habitaciones} hab · ${nfo.plazas} plazas · ${nfo.personas} p/hab`
                        : ` · ${nfo.personas} p/hab`}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Forma de costo</Label>
            <Select value={basis} onValueChange={(v) => patchDetalle({ cost_basis: v as CostBasis })}>
              <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(BASIS_LABELS) as CostBasis[]).map((b) => (
                  <SelectItem key={b} value={b}>{BASIS_LABELS[b]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* Estructura física */}
      {pkgId && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Habitaciones</Label>
            <Input
              type="number" className="h-9" value={habitaciones}
              disabled={!onSyncStructure}
              onChange={(e) => syncStructure(Math.max(0, Number(e.target.value) || 0), personas)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Personas por habitación</Label>
            <Input
              type="number" className="h-9" value={personas}
              disabled={!onSyncStructure}
              onChange={(e) => syncStructure(habitaciones, Math.max(1, Number(e.target.value) || 1))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Capacidad física</Label>
            <Input className="h-9" value={`${capacidad} plazas`} readOnly disabled />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Esperados</Label>
            <Input className="h-9" value={pax} readOnly disabled />
          </div>
        </div>
      )}

      {/* Costo */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="space-y-1 md:col-span-2">
          <Label className="text-xs">Descripción</Label>
          <Input className="h-9" placeholder="Hotel, hostel…" value={item.descripcion || ""}
            onChange={(e) => onUpdate({ descripcion: e.target.value })} />
        </div>
        {basis !== "total" && basis !== "persona_estadia" && (
          <div className="space-y-1">
            <Label className="text-xs">Noches</Label>
            <Input type="number" className="h-9" value={noches}
              onChange={(e) => patchDetalle({ noches: Number(e.target.value) })} />
          </div>
        )}
        <div className="space-y-1">
          <Label className="text-xs">Costo unitario</Label>
          <Input type="number" className="h-9" value={item.precio_unitario}
            onChange={(e) => onUpdate({ precio_unitario: Number(e.target.value) })} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Moneda</Label>
          <Select value={item.moneda} onValueChange={(v) => onUpdate({ moneda: v })}>
            <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MONEDAS.map((m) => <SelectItem key={m.value} value={m.value}>{m.value}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        {info && (
          <Badge variant="outline" className="text-[10px]">
            {habitaciones > 0 ? `${habitaciones} habitaciones · ` : ""}
            {capacidad || info.plazas} plazas · {personas} personas/hab.
            {reservasActivas?.[pkgId] ? ` · ${reservasActivas[pkgId]} reservas activas` : ""}
          </Badge>
        )}
        {(basis === "persona_estadia" || basis === "persona_noche") && pax === 0 && (
          <span className="text-muted-foreground">
            Cargá participantes esperados de este paquete para calcular esta forma de costo.
          </span>
        )}
        {excedido && (
          <span className="flex items-center gap-1 text-amber-500">
            <AlertTriangle className="w-3 h-3" /> {pax} esperados supera las {capacidad} plazas del alojamiento
          </span>
        )}
        <span className="ml-auto text-sm">
          <span className="text-muted-foreground">Total estimado de esta línea: </span>
          <span className="font-semibold">{formatPrice(total, item.moneda || monedaBase)}</span>
        </span>
      </div>
    </div>
  );
}
