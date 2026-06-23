import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  HelpCircle, ChevronDown, ChevronUp, FileText, MessageCircle, X,
} from "lucide-react";
import { buildWhatsAppUrl, buildRecordHoraHelpMessage } from "@/lib/contactInfo";
import CancelReservationDrawer from "./CancelReservationDrawer";

interface CancellationPolicy {
  allow_cancellation: boolean;
  cancellation_days_before: number;
  cancellation_type: string;
  cancellation_text_short: string;
  cancellation_text_full: string;
  require_reason: boolean;
}

interface Props {
  reservationId: string;
  eventTitle: string;
  eventDate: string;
  eventType?: string;
  reglamentoUrl?: string;
  whatsappUrl?: string;
  alumnoNombre?: string | null;
  cancellationPolicy: CancellationPolicy;
  canCancel: boolean;
  onCancelled: () => void;
}

/**
 * Footer "Más opciones" — ayuda + cancelación. Se renderiza al final
 * de la landing del evento para no competir con los CTAs principales.
 */
const ReservationHelpFooter = ({
  reservationId, eventTitle, eventDate, eventType,
  reglamentoUrl, whatsappUrl, alumnoNombre,
  cancellationPolicy, canCancel, onCancelled,
}: Props) => {
  const [showHelp, setShowHelp] = useState(false);
  const [showCancelDrawer, setShowCancelDrawer] = useState(false);

  return (
    <div className="space-y-3 mt-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-heading px-1">
        Más opciones
      </p>

      <div className="glass-card rounded-xl overflow-hidden">
        <button
          onClick={() => setShowHelp(!showHelp)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors text-sm"
        >
          <span className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-primary" />
            <span className="font-heading font-semibold text-foreground">¿Necesitás ayuda?</span>
          </span>
          {showHelp ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </button>
        {showHelp && (
          <div className="px-4 pb-4 space-y-3">
            {eventType === "record_hora" ? (
              <>
                <p className="text-xs text-muted-foreground">
                  Si tenés dudas sobre tu inscripción, el pago, el check-in o la carga de tu resultado, podés escribirnos por WhatsApp.
                </p>
                <a
                  href={buildWhatsAppUrl(buildRecordHoraHelpMessage({ alumnoNombre, fechaEvento: eventDate }))}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block"
                >
                  <Button variant="outline" size="sm" className="w-full text-xs">
                    <MessageCircle className="w-3.5 h-3.5 mr-1.5" /> Escribir por WhatsApp
                  </Button>
                </a>
              </>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  Consultanos por dudas sobre pagos, bicicleta, pedales, documentación o cualquier tema del viaje.
                </p>
                <div className="flex flex-wrap gap-2">
                  {reglamentoUrl && (
                    <a href={reglamentoUrl} target="_blank" rel="noopener noreferrer" className="flex-1">
                      <Button variant="outline" size="sm" className="w-full text-xs">
                        <FileText className="w-3.5 h-3.5 mr-1.5" /> Reglamento
                      </Button>
                    </a>
                  )}
                  {whatsappUrl && (
                    <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="flex-1">
                      <Button variant="outline" size="sm" className="w-full text-xs">
                        <MessageCircle className="w-3.5 h-3.5 mr-1.5" /> Chatear por WhatsApp
                      </Button>
                    </a>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {canCancel && (
        <Button
          variant="outline"
          size="sm"
          className="w-full text-xs text-destructive/80 border-destructive/20 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/40"
          onClick={() => setShowCancelDrawer(true)}
        >
          <X className="w-3.5 h-3.5 mr-1.5" /> Cancelar reserva
        </Button>
      )}

      <CancelReservationDrawer
        open={showCancelDrawer}
        onOpenChange={setShowCancelDrawer}
        reservationId={reservationId}
        eventTitle={eventTitle}
        eventDate={eventDate}
        cancellationPolicy={cancellationPolicy}
        onCancelled={() => { setShowCancelDrawer(false); onCancelled(); }}
      />
    </div>
  );
};

export default ReservationHelpFooter;
