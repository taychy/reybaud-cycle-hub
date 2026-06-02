import { CreditCard, ArrowLeft, ChevronRight, Landmark, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useState } from "react";
import { ASESORIA_TRANSFER_INFO } from "@/lib/contactInfo";
import { toast } from "sonner";

// Specific payment method the student declares
export type DeclaredPaymentMethod =
  | "mercadopago"      // Pay now via MP gateway
  | "card"             // Pay now with card form
  | "efectivo"         // Already paid in cash to coach
  | "transferencia"    // Already paid by bank transfer
  | "mp_externo"       // Already paid through MercadoPago (outside our checkout)
  | "otro";            // Other (free-text detail)

interface CheckoutMethodStepProps {
  onSelect: (method: DeclaredPaymentMethod, otherDetail?: string) => void;
  processing: boolean;
  onBack: () => void;
  /** Cuando es true (ej: Asesoría Personalizada), oculta MP/tarjeta y solo permite transferencia bancaria. */
  transferOnly?: boolean;
}

type AlreadyPaidOption = "mercadopago" | "transferencia" | "efectivo" | "otro";

const ALREADY_PAID_LABELS: Record<AlreadyPaidOption, string> = {
  mercadopago: "Mercado Pago",
  transferencia: "Transferencia bancaria",
  efectivo: "Efectivo al profesor",
  otro: "Otro",
};

const CheckoutMethodStep = ({ onSelect, processing, onBack, transferOnly = false }: CheckoutMethodStepProps) => {
  const [showAlreadyPaid, setShowAlreadyPaid] = useState(false);
  const [selectedOption, setSelectedOption] = useState<AlreadyPaidOption | "">("");
  const [otherDetail, setOtherDetail] = useState("");
  const [showTransferInfo, setShowTransferInfo] = useState(false);
  const [copiedField, setCopiedField] = useState<"cbu" | "alias" | null>(null);

  const copyToClipboard = async (value: string, field: "cbu" | "alias") => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      toast.success("Copiado al portapapeles");
      setTimeout(() => setCopiedField(null), 1500);
    } catch {
      toast.error("No se pudo copiar");
    }
  };

  const canConfirm =
    selectedOption !== "" &&
    (selectedOption !== "otro" || otherDetail.trim().length >= 2);

  const handleConfirm = () => {
    if (!canConfirm) return;
    if (selectedOption === "mercadopago") return onSelect("mp_externo");
    if (selectedOption === "transferencia") return onSelect("transferencia");
    if (selectedOption === "efectivo") return onSelect("efectivo");
    if (selectedOption === "otro") return onSelect("otro", otherDetail.trim());
  };

  if (showAlreadyPaid) {
    return (
      <div className="space-y-5 w-full max-w-md mx-auto animate-fade-in">
        <div className="text-center space-y-2">
          <h2 className="text-xl font-heading font-bold uppercase tracking-wider text-foreground">
            ¿Cómo pagaste?
          </h2>
          <p className="text-sm text-muted-foreground">
            Elegí el medio que usaste para que administración pueda validarlo
          </p>
        </div>

        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">
            Forma de pago
          </Label>
          <Select
            value={selectedOption}
            onValueChange={(v) => setSelectedOption(v as AlreadyPaidOption)}
            disabled={processing}
          >
            <SelectTrigger className="h-12">
              <SelectValue placeholder="Elegí una opción" />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(ALREADY_PAID_LABELS) as AlreadyPaidOption[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {ALREADY_PAID_LABELS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedOption === "otro" && (
          <div className="space-y-2 animate-fade-in">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Contanos cómo pagaste
            </Label>
            <Textarea
              value={otherDetail}
              onChange={(e) => setOtherDetail(e.target.value)}
              placeholder="Ej: Pagué con Ualá / depósito en sucursal / etc."
              rows={3}
              maxLength={300}
              disabled={processing}
            />
            <p className="text-[11px] text-muted-foreground text-right">
              {otherDetail.length}/300
            </p>
          </div>
        )}

        <Button
          variant="gold"
          size="lg"
          className="w-full gap-2"
          disabled={processing || !canConfirm}
          onClick={handleConfirm}
        >
          {processing ? "Procesando..." : "Continuar"}
          <ChevronRight className="w-4 h-4" />
        </Button>

        <button
          onClick={() => setShowAlreadyPaid(false)}
          className="flex items-center gap-1.5 mx-auto text-xs text-muted-foreground hover:text-primary transition-colors"
        >
          <ArrowLeft className="w-3 h-3" />
          Volver
        </button>
      </div>
    );
  }

  // Modo transferencia exclusivo (Asesoría Personalizada)
  if (transferOnly) {
    return (
      <>
        <div className="space-y-4 w-full max-w-md mx-auto animate-fade-in">
          <div className="text-center space-y-2">
            <h2 className="text-xl font-heading font-bold uppercase tracking-wider text-foreground">
              Pago por transferencia
            </h2>
            <p className="text-sm text-muted-foreground">
              Este plan se abona únicamente por transferencia bancaria.
            </p>
          </div>

          <Button
            variant="outline"
            size="lg"
            className="w-full gap-2"
            disabled={processing}
            onClick={() => setShowTransferInfo(true)}
          >
            <Landmark className="w-4 h-4" />
            Ver datos para transferencia
          </Button>

          <Button
            variant="gold"
            size="lg"
            className="w-full gap-2"
            disabled={processing}
            onClick={() => onSelect("transferencia")}
          >
            {processing ? "Procesando..." : "Ya transferí — informar pago"}
            <ChevronRight className="w-4 h-4" />
          </Button>

          <button
            onClick={onBack}
            className="flex items-center gap-1.5 mx-auto text-xs text-muted-foreground hover:text-primary transition-colors mt-2"
          >
            <ArrowLeft className="w-3 h-3" />
            Volver
          </button>
        </div>

        <Dialog open={showTransferInfo} onOpenChange={setShowTransferInfo}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="font-heading uppercase tracking-wider">
                Datos para transferir
              </DialogTitle>
              <DialogDescription>
                {ASESORIA_TRANSFER_INFO.cuenta}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 pt-2">
              <div className="space-y-1">
                <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Titular</Label>
                <p className="text-sm font-medium text-foreground">{ASESORIA_TRANSFER_INFO.titular}</p>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">CBU</Label>
                <button
                  onClick={() => copyToClipboard(ASESORIA_TRANSFER_INFO.cbu, "cbu")}
                  className="w-full flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 hover:bg-muted/60 transition"
                >
                  <span className="text-sm font-mono text-foreground break-all text-left">{ASESORIA_TRANSFER_INFO.cbu}</span>
                  {copiedField === "cbu" ? <Check className="w-4 h-4 text-emerald-500 shrink-0" /> : <Copy className="w-4 h-4 text-muted-foreground shrink-0" />}
                </button>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Alias</Label>
                <button
                  onClick={() => copyToClipboard(ASESORIA_TRANSFER_INFO.alias, "alias")}
                  className="w-full flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 hover:bg-muted/60 transition"
                >
                  <span className="text-sm font-mono text-foreground">{ASESORIA_TRANSFER_INFO.alias}</span>
                  {copiedField === "alias" ? <Check className="w-4 h-4 text-emerald-500 shrink-0" /> : <Copy className="w-4 h-4 text-muted-foreground shrink-0" />}
                </button>
              </div>

              <p className="text-[11px] text-muted-foreground pt-1">
                Una vez realizada la transferencia, tocá "Ya transferí — informar pago" para que administración valide tu pago.
              </p>
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <div className="space-y-4 w-full max-w-md mx-auto animate-fade-in">
      <div className="text-center space-y-2">
        <h2 className="text-xl font-heading font-bold uppercase tracking-wider text-foreground">
          ¿Cómo querés pagar?
        </h2>
        <p className="text-sm text-muted-foreground">
          Elegí el medio de pago que prefieras
        </p>
      </div>


      {/* Mercado Pago */}
      <Button
        variant="gold"
        size="lg"
        className="w-full gap-2"
        disabled={processing}
        onClick={() => onSelect("mercadopago")}
      >
        {processing ? "Procesando..." : "Pagar con Mercado Pago"}
        <CreditCard className="w-4 h-4" />
      </Button>

      {/* Card */}
      <button
        disabled={processing}
        onClick={() => onSelect("card")}
        className="w-full flex items-center gap-3 rounded-lg p-4 glass-card hover:ring-1 hover:ring-border transition-all text-left disabled:opacity-50"
      >
        <CreditCard className="w-5 h-5 text-primary shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">Pagar con tarjeta</p>
          <p className="text-xs text-muted-foreground">Crédito o débito · Activación inmediata</p>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground" />
      </button>

      {/* Divider */}
      <div className="flex items-center gap-3 pt-1">
        <div className="flex-1 h-px bg-border" />
        <span className="text-xs text-muted-foreground">o bien</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      {/* Already paid (opens method selector) */}
      <button
        disabled={processing}
        onClick={() => setShowAlreadyPaid(true)}
        className="w-full text-center py-3 text-sm font-medium text-muted-foreground hover:text-primary transition-colors underline underline-offset-4 disabled:opacity-50"
      >
        Ya pagué (informar el medio que usé)
      </button>

      <button
        onClick={onBack}
        className="flex items-center gap-1.5 mx-auto text-xs text-muted-foreground hover:text-primary transition-colors mt-2"
      >
        <ArrowLeft className="w-3 h-3" />
        Volver
      </button>
    </div>
  );
};

export default CheckoutMethodStep;
