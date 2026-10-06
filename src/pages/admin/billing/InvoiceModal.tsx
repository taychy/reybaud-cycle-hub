import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ShieldAlert, Loader2 } from "lucide-react";
import { elegirEmisorSugerido, type EmisorSugerido } from "@/lib/invoiceEmisor";

interface Emisor {
  id: string;
  nombre_fiscal: string;
  cuit: string;
  punto_venta: number;
  activo: boolean;
  tiene_credenciales?: boolean;
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
  facturacion_cola_id?: string | null;
  segmento?: string | null;
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
  const [emisorId, setEmisorId] = useState<string>("");
  const [sugerido, setSugerido] = useState<EmisorSugerido | null>(null);
  const [resolviendo, setResolviendo] = useState(false);
  const [clienteCuit, setClienteCuit] = useState(factura?.cliente_cuit || "");
  const [condicion, setCondicion] = useState(factura?.condicion_fiscal || "consumidor_final");
  const [submitting, setSubmitting] = useState(false);

  // Emisor según el cobro (override > resuelto en cola > regla central). Nunca un default.
  useEffect(() => {
    if (!factura) return;
    let cancel = false;
    setEmisorId("");
    setSugerido(null);
    setResolviendo(true);
    (async () => {
      const activos = emisores.filter((e) => e.activo).map((e) => e.id);
      let cola: any = null;
      if (factura.facturacion_cola_id) {
        const { data } = await supabase
          .from("facturacion_cola")
          .select("emisor_override_id, emisor_resuelto_id, emisor_id, segmento, metodo_pago, cuenta_mp_id")
          .eq("id", factura.facturacion_cola_id)
          .maybeSingle();
        cola = data;
      }
      let resolver: any = null;
      if (!cola?.emisor_override_id && !cola?.emisor_resuelto_id) {
        const { data } = await supabase.rpc("resolver_emisor_facturacion" as any, {
          p_segmento: cola?.segmento ?? factura.segmento ?? null,
          p_metodo_pago: cola?.metodo_pago ?? null,
          p_cuenta_mp_id: cola?.cuenta_mp_id ?? null,
          p_emisor_explicito: cola?.emisor_id ?? null,
          p_override: null,
        } as any);
        resolver = data;
      }
      if (cancel) return;
      const s = elegirEmisorSugerido(cola, resolver, activos);
      setSugerido(s);
      setEmisorId(s.emisorId ?? "");
      setResolviendo(false);
    })();
    return () => { cancel = true; };
  }, [factura?.id, emisores]);

  // Cuando cambia la factura seleccionada, resetear y precargar DNI/CUIT desde alumno si falta
  useEffect(() => {
    if (!factura) return;
    setCondicion(factura.condicion_fiscal || "consumidor_final");
    setClienteCuit(factura.cliente_cuit || "");


    if (!factura.cliente_cuit) {
      (async () => {
        // 1) Preferir alumno_id si está disponible
        if (factura.alumno_id) {
          const { data } = await supabase
            .from("alumnos")
            .select("documento")
            .eq("id", factura.alumno_id)
            .maybeSingle();
          if (data?.documento) {
            setClienteCuit(data.documento);
            return;
          }
        }

        // 2) Fallback: buscar por nombre completo
        if (!factura.cliente_nombre) return;
        const nombre = factura.cliente_nombre.trim().toLowerCase();
        const parts = nombre.split(/\s+/).filter(Boolean);
        const first = parts[0] || "";
        const last = parts[parts.length - 1] || "";

        const { data } = await supabase
          .from("alumnos")
          .select("documento, nombre, apellido")
          .or(`nombre.ilike.%${first}%,apellido.ilike.%${last}%`)
          .limit(50);

        const match = (data || []).find((a: any) => {
          const full = `${a.nombre || ""} ${a.apellido || ""}`.trim().toLowerCase();
          return full === nombre;
        }) || (data || []).find((a: any) => {
          return (a.nombre || "").toLowerCase() === first && (a.apellido || "").toLowerCase() === last;
        });

        if (match?.documento) {
          setClienteCuit(match.documento);
        }
      })();
    }
  }, [factura?.id]);

  if (!factura) return null;

  const activeEmisores = emisores.filter((e) => e.activo);
  const selectedEmisor = emisores.find((e) => e.id === emisorId);
  const emisorHasCerts = selectedEmisor ? !!selectedEmisor.tiene_credenciales : false;

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
