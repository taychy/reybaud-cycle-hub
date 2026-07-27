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

interface Props {
  eventId: string;
  label?: string;
  /** Si se pasa, muestra un CTA de reserva dentro del drawer */
  onReserve?: () => void;
  reserveLabel?: string;
  reserveDisabled?: boolean;
}

const EventPackagesDrawer = ({
  eventId,
  label = "Ver precios y paquetes",
  onReserve,
  reserveLabel = "Reservar mi lugar",
  reserveDisabled,
}: Props) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="gold-outline"
        className="w-full h-11 text-xs"
        onClick={() => setOpen(true)}
      >
        <Wallet className="w-4 h-4" />
        {label}
      </Button>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="max-h-[90vh]">
          <DrawerHeader className="text-left">
            <DrawerTitle className="font-heading uppercase tracking-wider text-base">
              Precios y paquetes
            </DrawerTitle>
            <DrawerDescription className="text-xs">
              Tocá cada paquete para ver qué incluye y el plan de pagos.
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-4 overflow-y-auto">
            <EventPaymentPlansPublic eventId={eventId} />
          </div>
          {onReserve && (
            <div className="px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-border/50 bg-background/95 backdrop-blur sticky bottom-0">
              <Button
                variant="gold"
                className="w-full h-12 text-sm"
                disabled={reserveDisabled}
                onClick={() => {
                  setOpen(false);
                  onReserve();
                }}
              >
                <CreditCard className="w-4 h-4 mr-2" />
                {reserveLabel}
              </Button>
            </div>
          )}
        </DrawerContent>
      </Drawer>
    </>
  );
};


export default EventPackagesDrawer;
