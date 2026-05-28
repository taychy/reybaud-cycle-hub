import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ShieldAlert, Loader2 } from "lucide-react";

interface Emisor {
  id: string;
  nombre_fiscal: string;
  cuit: string;
  punto_venta: number;
  activo: boolean;
  cert_pem?: string | null;
  key_pem?: string | null;
}

interface FacturaRow {
  id: string;
  cliente_nombre: string;
  cliente_cuit: string | null;
  condicion_fiscal: string;
  concepto: string;
  monto: number;
  emisor_id: string | null;
  alumno_id?: string | null;
}

interface Props {
  factura: FacturaRow | null;
  emisores: Emisor[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEmitted: () => void;
}

const CONDICIONES = [
  { value: "consumidor_final", label: "Consumidor Final" },
  { value: "monotributista", label: "Monotributista" },
  { value: "resp_inscripto", label: "Responsable Inscripto" },
  { value: "exento", label: "Exento" },
];

export function InvoiceModal({ factura, emisores, open, onOpenChange, onEmitted }: Props) {
  const [emisorId, setEmisorId] = useState<string>(factura?.emisor_id || "");
  const [clienteCuit, setClienteCuit] = useState(factura?.cliente_cuit || "");
  const [condicion, setCondicion] = useState(factura?.condicion_fiscal || "consumidor_final");
  const [submitting, setSubmitting] = useState(false);

  // Cuando cambia la factura seleccionada, resetear y precargar DNI/CUIT desde alumno si falta
  useEffect(() => {
    if (!factura) return;
    setEmisorId(factura.emisor_id || "");
    setCondicion(factura.condicion_fiscal || "consumidor_final");
    setClienteCuit(factura.cliente_cuit || "");

    if (!factura.cliente_cuit && factura.cliente_nombre) {
      // Buscar documento del alumno por nombre completo (case-insensitive)
      (async () => {
        const nombre = factura.cliente_nombre.trim();
        const { data } = await supabase
          .from("alumnos")
          .select("documento, nombre, apellido")
          .or(`nombre.ilike.${nombre},apellido.ilike.${nombre}`)
          .limit(20);

        const match = (data || []).find((a: any) => {
          const full = `${a.nombre || ""} ${a.apellido || ""}`.trim().toLowerCase();
          return full === nombre.toLowerCase() || (a.nombre || "").toLowerCase() === nombre.toLowerCase();
        }) || (data || [])[0];

        if (match?.documento) {
          setClienteCuit(match.documento);
        }
      })();
    }
  }, [factura?.id]);

  if (!factura) return null;

  const activeEmisores = emisores.filter((e) => e.activo);
  const selectedEmisor = emisores.find((e) => e.id === emisorId);
  const emisorHasCerts = selectedEmisor ? !!(selectedEmisor.cert_pem && selectedEmisor.key_pem) : false;

  const handleEmit = async () => {
    if (!emisorId) {
      toast.error("Seleccioná un emisor fiscal");
      return;
    }

    if (!emisorHasCerts) {
      toast.error("El emisor seleccionado no tiene certificado AFIP configurado");
      return;
    }

    setSubmitting(true);
    try {
      // First update client data on the factura
      await supabase
        .from("facturas")
        .update({
          cliente_cuit: clienteCuit.trim() || null,
          condicion_fiscal: condicion,
        } as any)
        .eq("id", factura.id);

      // Call AFIP edge function
      const { data, error } = await supabase.functions.invoke("emit-factura-afip", {
        body: {
          factura_id: factura.id,
          emisor_id: emisorId,
          cliente_cuit: clienteCuit.trim() || null,
          condicion_fiscal: condicion,
        },
      });

      if (error) {
        // Try to extract the real error message from the function response body
        let detail = error.message;
        try {
          const resp = (error as any)?.context?.response;
          if (resp) {
            const body = await resp.clone().json();
            if (body?.error) detail = body.error;
          }
        } catch { /* ignore */ }
        toast.error(detail || "Error al emitir la factura contra AFIP");
        return;
      }

      if (data?.error) {
        toast.error(data.error);
        return;
      }

      toast.success(
        `Factura emitida: N° ${data.numero_comprobante} — CAE: ${data.cae}`
      );
      onOpenChange(false);
      onEmitted();
    } catch (err: any) {
      console.error("Error emitting invoice:", err);
      toast.error(err?.message || "Error al emitir la factura contra AFIP");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">Generar factura AFIP</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1">
            <p className="text-sm font-semibold text-foreground">{factura.cliente_nombre}</p>
            <p className="text-xs text-muted-foreground">{factura.concepto}</p>
            <p className="text-lg font-heading font-bold text-primary">
              ${factura.monto.toLocaleString("es-AR")}
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">DNI / CUIT del cliente</label>
            <Input
              placeholder="Ej: 20-12345678-9 o DNI 12345678"
              value={clienteCuit}
              onChange={(e) => setClienteCuit(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Dejalo vacío para Consumidor Final sin identificar
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Condición fiscal</label>
            <Select value={condicion} onValueChange={setCondicion}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONDICIONES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Emisor fiscal</label>
            {activeEmisores.length === 0 ? (
              <p className="text-xs text-destructive">No hay emisores activos. Configuralos en la pestaña Emisores.</p>
            ) : (
              <>
                <Select value={emisorId} onValueChange={setEmisorId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar emisor..." />
                  </SelectTrigger>
                  <SelectContent>
                    {activeEmisores.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.nombre_fiscal} — {e.cuit}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {emisorId && !emisorHasCerts && (
                  <div className="flex items-center gap-1.5 text-yellow-500">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <p className="text-xs">Este emisor no tiene certificado AFIP. Configuralo en Emisores.</p>
                  </div>
                )}
              </>
            )}
          </div>

          <Button
            className="w-full"
            disabled={submitting || activeEmisores.length === 0 || !emisorHasCerts}
            onClick={handleEmit}
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Emitiendo contra AFIP...
              </>
            ) : (
              "Emitir factura AFIP"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
