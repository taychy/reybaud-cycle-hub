import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { FileText, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { InvoiceModal } from "@/pages/admin/billing/InvoiceModal";
import { isFacturaEmitida, edgeFunctionErrorMessage } from "@/lib/billingInvoiceLink";

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
  /** Fila exacta de `facturacion_cola` que originó este pago (vínculo determinístico). */
  facturacion_cola_id?: string | null;
};

const FACTURA_COLS =
  "id, estado, cae, cliente_nombre, cliente_cuit, condicion_fiscal, concepto, monto, emisor_id, alumno_id, facturacion_cola_id";

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
  /**
   * Estado ya conocido de la factura (evita 1 query por fila en listados).
   * `null` significa "sé que no existe factura".
   */
  existingFactura?: { id: string; estado: string | null; cae: string | null } | null;
}

/**
 * Botón + modal que asegura que exista un registro en `facturas` para el pago
 * (creándolo vía `auto-facturar` si hace falta) y abre el flujo AFIP.
 */
export function BillingInvoiceLauncher({ source, variant = "icon", className, onEmitted, existingFactura: preknown }: Props) {
  const [loading, setLoading] = useState(false);
  const [existingFactura, setExistingFactura] = useState<any | null>(preknown ?? null);
  // Si el listado ya nos pasó el estado, no consultamos al renderizar.
  const [checkingExisting, setCheckingExisting] = useState(preknown === undefined);
  const [emisores, setEmisores] = useState<Emisor[]>([]);
  const [modalFactura, setModalFactura] = useState<any | null>(null);

  const fetchExisting = useCallback(async () => {
    let query = supabase.from("facturas").select(FACTURA_COLS);
    if (source.facturacion_cola_id) {
      query = query.eq("facturacion_cola_id", source.facturacion_cola_id);
    } else {
      query = query
        .eq("referencia_tipo", source.referencia_tipo)
        .eq("referencia_id", source.referencia_id);
    }
    const { data } = await query.order("created_at", { ascending: false }).limit(1).maybeSingle();
    setExistingFactura(data || null);
    setCheckingExisting(false);
    return (data as any) || null;
  }, [source.facturacion_cola_id, source.referencia_tipo, source.referencia_id]);

  useEffect(() => {
    if (preknown !== undefined) {
      setExistingFactura(preknown);
      setCheckingExisting(false);
      return;
    }
    fetchExisting();
  }, [fetchExisting, preknown]);

  const handleClick = async () => {
    // Ya facturada con CAE → no-op
    if (isFacturaEmitida(existingFactura)) {
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
          description: "Configurá al menos un emisor en Configuración → Finanzas → Emisores fiscales.",
          variant: "destructive",
        });
        return;
      }
      setEmisores(emisoresData as any);

      // Si el estado vino precargado del listado, buscamos la fila completa ahora.
      let factura = existingFactura?.concepto ? existingFactura : await fetchExisting();

      // Si no hay registro, lo creamos sin emitir llamando auto-facturar
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
            facturacion_cola_id: source.facturacion_cola_id ?? undefined,
          },
        });

        if (error || data?.error) {
          throw new Error(await edgeFunctionErrorMessage(error, data));
        }


        // Volver a leer la factura recién creada (por vínculo exacto si lo hay)
        factura = await fetchExisting();

        // Si auto-facturar ya la emitió, listo
        if (data?.emitted) {
          toast({
            title: "Factura AFIP emitida",
            description: data?.cae ? `CAE ${data.cae}` : "Emitida correctamente.",
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

  const alreadyEmitted = isFacturaEmitida(existingFactura);

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
