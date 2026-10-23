import { ExternalLink, Info } from "lucide-react";
import type { EventPaymentPolicy } from "@/lib/eventPaymentPolicy";

interface Props {
  policy: EventPaymentPolicy;
  /** Muestra título "Formas de pago" (landing / estado de reserva). */
  titled?: boolean;
}

const EventPaymentPolicyNotice = ({ policy, titled }: Props) => (
  <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2" aria-label="Formas de pago">
    {titled && <p className="text-sm font-semibold text-foreground">Formas de pago</p>}
    <div className="flex items-start gap-2">
      <Info className="w-4 h-4 text-primary mt-0.5 shrink-0" />
      <p className="text-xs leading-relaxed text-foreground">
        Precio contractual en {policy.contract_currency}. Pago en {policy.contract_currency} efectivo
        {policy.eur_cash_surcharge_pct > 0 ? ` + ${policy.eur_cash_surcharge_pct}%` : " sin recargo"}.
        {" "}Transferencia en ARS: cotización vigente de la app + {policy.ars_transfer_surcharge_pct}%.
      </p>
    </div>
    {policy.external_portal && (
      <div className="space-y-1.5 border-t border-primary/20 pt-2">
        <a
          href={policy.external_portal.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
        >
          {policy.external_portal.label} <ExternalLink className="w-3.5 h-3.5" aria-hidden />
          <span className="sr-only">(se abre en una pestaña nueva)</span>
        </a>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Es un portal externo a Reybaud y se abre en una pestaña nueva. El pago no se acredita automáticamente:
          después de pagar, informá el comprobante desde tu reserva y lo validamos desde administración.
        </p>
      </div>
    )}
  </div>
);

export default EventPaymentPolicyNotice;
