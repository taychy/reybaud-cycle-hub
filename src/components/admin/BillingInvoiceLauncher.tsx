import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { FileText, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { InvoiceModal } from "@/pages/admin/billing/InvoiceModal";

export type InvoiceSource = {
  alumno_id: string;
  cliente_nombre: string;
  cliente_cuit?: string | null;
  concepto: string;
  monto: number;
  moneda?: string;
  referencia_tipo: "suscripcion" | "evento" | "pedido" | "pedido_tienda";
  referencia_id: string;
  segmento: "escuela" | "viajes" | "tienda";
  metodo_pago?: string | null;
  origen_registro?: string | null;
};


interface Emisor {
  id: string;
  nombre_fiscal: string;
  cuit: string;
  punto_venta: number;
  activo: boolean;
  tiene_credenciales?: boolean;
}


interface Props {
  source: InvoiceSource;
  /** Variant for the trigger button. */
  variant?: "icon" | "default";
  className?: string;
  onEmitted?: () => void;
}

/**
 * Botón + modal que asegura que exista un registro en `facturas` para el pago
 * (creándolo vía `auto-facturar` si hace falta) y abre el flujo AFIP.
 */
export function BillingInvoiceLauncher({ source, variant = "icon", className, onEmitted }: Props) {
  const [loading, setLoading] = useState(false);
  const [existingFactura, setExistingFactura] = useState<any | null>(null);
  const [checkingExisting, setCheckingExisting] = useState(true);
  const [emisores, setEmisores] = useState<Emisor[]>([]);
  const [modalFactura, setModalFactura] = useState<any | null>(null);

  const fetchExisting = useCallback(async () => {
    const { data } = await supabase
      .from("facturas")
      .select("id, estado, cae, cliente_nombre, cliente_cuit, condicion_fiscal, concepto, monto, emisor_id, alumno_id")
      .eq("referencia_tipo", source.referencia_tipo)
      .eq("referencia_id", source.referencia_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setExistingFactura(data || null);
    setCheckingExisting(false);
  }, [source.referencia_tipo, source.referencia_id]);

  useEffect(() => { fetchExisting(); }, [fetchExisting]);

  const handleClick = async () => {
    // Ya facturada con CAE → no-op
    if (existingFactura?.estado === "emitida" && existingFactura?.cae) {
      toast({
        title: "Ya facturada en AFIP",
        description: `CAE ${existingFactura.cae}`,
      });
      return;
    }

    setLoading(true);
    try {
      // Cargar emisores activos
      const { data: emisoresData, error: emErr } = await supabase
        .from("emisores_fiscales")
        .select("id, nombre_fiscal, cuit, punto_venta, activo, tiene_credenciales")
        .eq("activo", true);
      if (emErr) throw emErr;
      if (!emisoresData || emisoresData.length === 0) {
        toast({
          title: "Sin emisores activos",
          description: "Configurá al menos un emisor en /admin/facturacion → Emisores.",
          variant: "destructive",
        });
        return;
      }
      setEmisores(emisoresData as any);

      let factura = existingFactura;

      // Si no hay registro, lo creamos sin emitir (skipEmit) llamando auto-facturar
      if (!factura) {
        const { data, error } = await supabase.functions.invoke("auto-facturar", {
          body: {
            alumno_id: source.alumno_id,
            concepto: source.concepto,
            monto: source.monto,
            moneda: source.moneda ?? "ARS",
            referencia_tipo: source.referencia_tipo,
            referencia_id: source.referencia_id,
            segmento: source.segmento,
            metodo_pago: source.metodo_pago ?? undefined,
            origen_registro: source.origen_registro ?? undefined,
          },
        });

        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        // Volver a leer la factura recién creada
        const { data: nueva } = await supabase
          .from("facturas")
          .select("id, estado, cae, cliente_nombre, cliente_cuit, condicion_fiscal, concepto, monto, emisor_id, alumno_id")
          .eq("referencia_tipo", source.referencia_tipo)
          .eq("referencia_id", source.referencia_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        factura = nueva;
        setExistingFactura(nueva || null);

        // Si auto-facturar ya la emitió, listo
        if (data?.emitted) {
          toast({
            title: "Factura AFIP emitida",
            description: `N° ${data.numero_comprobante} — CAE ${data.cae}`,
          });
          onEmitted?.();
          return;
        }
      }

      if (!factura) {
        toast({
          title: "No se pudo preparar la factura",
          description: "Reintentá en unos segundos.",
          variant: "destructive",
        });
        return;
      }

      // Abrir modal AFIP con el registro ya creado
      setModalFactura({
        ...factura,
        alumno_id: (factura as any).alumno_id ?? source.alumno_id,
        cliente_nombre: factura.cliente_nombre || source.cliente_nombre,
        cliente_cuit: factura.cliente_cuit ?? source.cliente_cuit ?? null,
        condicion_fiscal: factura.condicion_fiscal || "consumidor_final",
        concepto: factura.concepto || source.concepto,
        monto: Number(factura.monto ?? source.monto),
      });
    } catch (err: any) {
      console.error("BillingInvoiceLauncher error:", err);
      toast({
        title: "Error al preparar factura",
        description: err?.message || "Intentá de nuevo.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const alreadyEmitted = existingFactura?.estado === "emitida" && !!existingFactura?.cae;

  if (variant === "icon") {
    return (
      <>
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={`h-7 w-7 ${className || ""}`}
                disabled={loading || checkingExisting}
                onClick={(e) => { e.stopPropagation(); handleClick(); }}
              >
                {loading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : alreadyEmitted ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <FileText className="w-3.5 h-3.5 text-purple-600" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {alreadyEmitted
                ? `Ya facturada · CAE ${existingFactura?.cae}`
                : "Generar factura AFIP"}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <InvoiceModal
          factura={modalFactura}
          emisores={emisores as any}
          open={!!modalFactura}
          onOpenChange={(o) => { if (!o) setModalFactura(null); }}
          onEmitted={() => { setModalFactura(null); fetchExisting(); onEmitted?.(); }}
        />
      </>
    );
  }

  return (
    <>
      <Button
        size="sm"
        variant={alreadyEmitted ? "outline" : "default"}
        disabled={loading || checkingExisting || alreadyEmitted}
        onClick={handleClick}
        className={className}
      >
        {loading ? (
          <Loader2 className="w-4 h-4 mr-1 animate-spin" />
        ) : (
          <FileText className="w-4 h-4 mr-1" />
        )}
        {alreadyEmitted ? "Facturada AFIP" : "Generar factura"}
      </Button>

      <InvoiceModal
        factura={modalFactura}
        emisores={emisores as any}
        open={!!modalFactura}
        onOpenChange={(o) => { if (!o) setModalFactura(null); }}
        onEmitted={() => { setModalFactura(null); fetchExisting(); onEmitted?.(); }}
      />
    </>
  );
}
