import { Info } from "lucide-react";
import type { EventPaymentPolicy } from "@/lib/eventPaymentPolicy";

interface Props {
  policy: EventPaymentPolicy;
}

const EventPaymentPolicyNotice = ({ policy }: Props) => (
  <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 flex items-start gap-2">
    <Info className="w-4 h-4 text-primary mt-0.5 shrink-0" />
    <p className="text-xs leading-relaxed text-foreground">
      Precio contractual en {policy.contract_currency}. Pago en {policy.contract_currency} efectivo
      {policy.eur_cash_surcharge_pct > 0 ? ` + ${policy.eur_cash_surcharge_pct}%` : " sin recargo"}.
      {" "}Transferencia en ARS: cotización vigente de la app + {policy.ars_transfer_surcharge_pct}%.
    </p>
  </div>
);

export default EventPaymentPolicyNotice;