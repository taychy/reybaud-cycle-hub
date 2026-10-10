import { useState } from "react";
import { Wallet, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import EventPaymentPlansPublic from "./EventPaymentPlansPublic";
import { formatPrice } from "@/lib/currency";

interface Props {
  eventId: string;
  label?: string;
  /** Si se pasa, muestra un CTA de reserva dentro del drawer */
  /** Recibe el paquete elegido (si el drawer permite elegir). */
  onReserve?: (packageId: string | null) => void;
  /** Si es true, el CTA exige elegir un paquete y lo pasa al flujo de reserva. */
  selectPackage?: boolean;
  selectedPackageId?: string | null;
  onSelectedPackageChange?: (id: string | null) => void;
  reserveLabel?: string;
  reserveDisabled?: boolean;
  /** Estilo opcional del botón disparador (p.ej. landing premium). No cambia el drawer. */
  triggerClassName?: string;
  premium?: boolean;
}

const EventPackagesDrawer = ({
  eventId,
  label = "Ver precios y paquetes",
  onReserve,
  reserveLabel = "Reservar mi lugar",
  reserveDisabled,
  triggerClassName,
  premium = false,
  selectPackage = false,
  selectedPackageId,
  onSelectedPackageChange,
}: Props) => {
  const [open, setOpen] = useState(false);
  const [localSelected, setLocalSelected] = useState<string | null>(null);
  const selected = selectedPackageId !== undefined ? selectedPackageId : localSelected;
  const [selectedInfo, setSelectedInfo] = useState<{ nombre: string; precio: number; currency: string } | null>(null);
  const setSelected = (id: string | null) => {
    setLocalSelected(id);
    onSelectedPackageChange?.(id);
  };
  const needsSelection = selectPackage && !!onReserve;

  return (
    <>
      <Button
        type="button"
        variant={triggerClassName ? "outline" : "gold-outline"}
        className={triggerClassName || "w-full h-11 text-xs"}
        onClick={() => setOpen(true)}
      >
        <Wallet className="w-4 h-4" />
        {label}
      </Button>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className={`max-h-[90vh] ${premium ? "alpine-event" : ""}`}>
          <DrawerHeader className="text-left">
            <DrawerTitle className="font-heading uppercase tracking-wider text-base">
              Precios y paquetes
            </DrawerTitle>
            <DrawerDescription className="text-xs">
              {needsSelection
                ? "Elegí un paquete para ver qué incluye y su plan de pagos."
                : "Tocá cada paquete para ver qué incluye y el plan de pagos."}
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-4 overflow-y-auto">
            <EventPaymentPlansPublic
              eventId={eventId}
              selectedId={needsSelection ? selected : undefined}
              onSelect={needsSelection ? (p) => { setSelected(p.id); setSelectedInfo(p); } : undefined}
            />
          </div>
          {onReserve && (
            <div className="px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-border/50 bg-background/95 backdrop-blur sticky bottom-0">
              {needsSelection && selected && selectedInfo && (
                <p className="mb-2 text-xs text-muted-foreground text-center">
                  Elegiste <strong className="text-foreground">{selectedInfo.nombre}</strong> · {formatPrice(selectedInfo.precio, selectedInfo.currency)}
                </p>
              )}
              <Button
                variant="gold"
                className="w-full h-12 text-sm"
                disabled={reserveDisabled || (needsSelection && !selected)}
                onClick={() => {
                  setOpen(false);
                  onReserve(needsSelection ? selected : null);
                }}
              >
                <CreditCard className="w-4 h-4 mr-2" />
                {needsSelection ? (selected ? "Continuar con este paquete" : "Elegí un paquete") : reserveLabel}
              </Button>
            </div>
          )}
        </DrawerContent>
      </Drawer>
    </>
  );
};


export default EventPackagesDrawer;
