import { FileText, Wallet, Ban, CreditCard, ScrollText, Download } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { extractReglamento, hasAnyReglamento, type ReglamentoFields } from "@/lib/eventReglamentoDefaults";

interface Props {
  metadata: any;
  defaultOpen?: boolean;
  compact?: boolean;
}

const Subsection = ({
  icon: Icon,
  title,
  body,
}: {
  icon: any;
  title: string;
  body?: string;
}) => {
  if (!body) return null;
  return (
    <AccordionItem value={title} className="border-border/40">
      <AccordionTrigger className="text-sm py-3 hover:no-underline">
        <span className="flex items-center gap-2 text-left">
          <Icon className="w-4 h-4 text-primary shrink-0" />
          <span>{title}</span>
        </span>
      </AccordionTrigger>
      <AccordionContent>
        <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">{body}</p>
      </AccordionContent>
    </AccordionItem>
  );
};

const EventReglamentoSection = ({ metadata, defaultOpen = false, compact = false }: Props) => {
  const r: ReglamentoFields = extractReglamento(metadata);
  if (!hasAnyReglamento(r)) return null;

  return (
    <div className={`glass-card rounded-xl ${compact ? "p-4" : "p-5"} space-y-2`}>
      <div className="flex items-center gap-2">
        <FileText className="w-5 h-5 text-primary" />
        <h3 className="font-heading font-semibold text-sm text-foreground uppercase tracking-wide">
          Reglamento y condiciones
        </h3>
      </div>
      <p className="text-xs text-muted-foreground">
        Antes de reservar, revisá las políticas de seña, pagos, cancelación y el reglamento del evento.
      </p>

      <Accordion type="multiple" defaultValue={defaultOpen ? ["Política de seña"] : []} className="w-full">
        <Subsection icon={Wallet} title="Política de seña" body={r.politica_sena} />
        <Subsection icon={Ban} title="Política de cancelación" body={r.politica_cancelacion} />
        <Subsection icon={CreditCard} title="Política de pagos" body={r.politica_pagos} />
        <Subsection icon={ScrollText} title="Reglamento del evento" body={r.reglamento_texto} />
      </Accordion>

      {r.reglamento_url && (
        <a
          href={r.reglamento_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 mt-2 px-3 py-1.5 rounded-full bg-primary/15 text-xs text-primary hover:bg-primary/25 transition-colors"
        >
          <Download className="w-3.5 h-3.5" /> Descargar reglamento (PDF)
        </a>
      )}
    </div>
  );
};

export default EventReglamentoSection;
