import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription,
} from "@/components/ui/drawer";
import { Landmark, Copy, Check, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatPrice } from "@/lib/currency";
import { EVENTOS_TRANSFER_INFO } from "@/lib/contactInfo";

interface PayByTransferDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservationId: string;
  currency: string;
  balanceDue: number;
  /** Se llama cuando el alumno confirma que ya transfirió, para abrir "Ya pagué" preseleccionado */
  onProceedToUploadProof: (amount: number) => void;
}

const PayByTransferDrawer = ({
  open, onOpenChange, reservationId, currency, balanceDue, onProceedToUploadProof,
}: PayByTransferDrawerProps) => {
  const [copied, setCopied] = useState<"cbu" | "alias" | null>(null);
  const [amount, setAmount] = useState<number>(balanceDue);
  const [amountCurrency, setAmountCurrency] = useState<string>(currency);
  const [concepto, setConcepto] = useState<string>("saldo");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase.rpc("importe_a_pagar_ahora", {
        _reservation_id: reservationId,
      });
      if (cancelled) return;
      if (data) {
        setAmount(Number((data as any).amount || balanceDue));
        setAmountCurrency((data as any).currency || currency);
        setConcepto((data as any).concepto || "saldo");
      } else {
        setAmount(balanceDue);
        setAmountCurrency(currency);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, reservationId, balanceDue, currency]);

  const copy = async (val: string, field: "cbu" | "alias") => {
    try {
      await navigator.clipboard.writeText(val);
      setCopied(field);
      toast.success("Copiado");
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error("No se pudo copiar");
    }
  };

  const conceptoLabel =
    concepto === "saldo" ? "Saldo total" : concepto.replace("_", " ");

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[92vh]">
        <DrawerHeader className="text-left">
          <DrawerTitle className="font-heading text-lg flex items-center gap-2">
            <Landmark className="w-5 h-5 text-primary" />
            Pagar por transferencia
          </DrawerTitle>
          <DrawerDescription>
            Transferí a esta cuenta y luego subí el comprobante para que administración lo valide.
          </DrawerDescription>
        </DrawerHeader>

        <div className="px-4 pb-6 space-y-4 overflow-y-auto">
          {/* Monto sugerido */}
          <div className="glass-card rounded-xl p-4 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">
              Importe a transferir
            </p>
            {loading ? (
              <Loader2 className="w-5 h-5 mx-auto mt-2 animate-spin text-primary" />
            ) : (
              <>
                <p className="text-2xl font-heading font-bold text-primary mt-1">
                  {formatPrice(amount, amountCurrency)}
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {conceptoLabel}
                </p>
              </>
            )}
          </div>

          {/* Datos bancarios */}
          <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
            <div className="space-y-1">
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Titular
              </Label>
              <p className="text-sm font-medium text-foreground">
                {EVENTOS_TRANSFER_INFO.titular}
              </p>
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                CBU / CVU
              </Label>
              <button
                onClick={() => copy(EVENTOS_TRANSFER_INFO.cbu, "cbu")}
                className="w-full flex items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2 hover:bg-muted/40 transition"
              >
                <span className="text-sm font-mono text-foreground break-all text-left">
                  {EVENTOS_TRANSFER_INFO.cbu}
                </span>
                {copied === "cbu" ? (
                  <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                ) : (
                  <Copy className="w-4 h-4 text-muted-foreground shrink-0" />
                )}
              </button>
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Alias
              </Label>
              <button
                onClick={() => copy(EVENTOS_TRANSFER_INFO.alias, "alias")}
                className="w-full flex items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2 hover:bg-muted/40 transition"
              >
                <span className="text-sm font-mono text-foreground">
                  {EVENTOS_TRANSFER_INFO.alias}
                </span>
                {copied === "alias" ? (
                  <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                ) : (
                  <Copy className="w-4 h-4 text-muted-foreground shrink-0" />
                )}
              </button>
            </div>
          </div>

          <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3">
            <p className="text-[12px] text-amber-500 leading-relaxed">
              Después de transferir, tocá el botón de abajo para subir el comprobante.
              Administración valida y acredita el pago apenas lo revise.
            </p>
          </div>

          <Button
            variant="gold"
            size="lg"
            className="w-full gap-2"
            onClick={() => {
              onOpenChange(false);
              onProceedToUploadProof(amount);
            }}
          >
            Ya transferí — subir comprobante
            <ChevronRight className="w-4 h-4" />
          </Button>

          <Button
            variant="outline"
            className="w-full"
            onClick={() => onOpenChange(false)}
          >
            Volver
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
};

export default PayByTransferDrawer;
