import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Copy, MessageCircle } from "lucide-react";
import { formatVariante } from "@/lib/productQr";

/** No enviar a teléfonos cuya nacionalización sea ambigua. */
const numeroWhatsappAR = (raw?: string | null): string | null => {
  let n = (raw || "").replace(/\D/g, "");
  if (n.startsWith("00")) n = n.slice(2);
  if (n.startsWith("549") && n.length === 13) return n;
  if (n.startsWith("54") && n.length === 12) return "549" + n.slice(2);
  if (n.length === 10 && !n.startsWith("0")) return "549" + n;
  return null;
};
type TipoAviso = "estado" | "recordatorio_devolucion";
export type CambioParaAviso = {
  id: string;
  estado: string;
  tipo?: string | null;
  recibido_en?: string | null;
  reemplazo_estado?: string | null;
  preparado_at?: string | null;
  reemplazo_canal_entrega?: string | null;
  reemplazo_despachado_at?: string | null;
  reemplazo_entregado_at?: string | null;
  variante_origen?: Record<string, any> | null;
  variante_destino?: Record<string, any> | null;
  alumnos?: { nombre?: string | null; apellido?: string | null; telefono?: string | null } | null;
  producto?: { name?: string | null } | null;
};
interface Props {
  cambio: CambioParaAviso;
  tipo: TipoAviso;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRegistered?: () => void;
}
const elaborarMensaje = (c: CambioParaAviso, tipo: TipoAviso): string => {
  const nombre = c.alumnos?.nombre?.trim() || "¿cómo estás?";
  const producto = (c.producto?.name || "tu prenda").trim();
  const original = formatVariante(c.variante_origen) || "tu prenda original";
  const nuevo = formatVariante(c.variante_destino) || "la prenda de reemplazo";
  const esSustitucion = c.tipo === "sustitucion_falta_stock";
  const recibida = esSustitucion || !!c.recibido_en;
  const preparada = !!c.preparado_at || ["enviado","entregado"].includes(c.reemplazo_estado || "");
  const entregada = !!c.reemplazo_entregado_at;
  const enviadaMoto = c.reemplazo_canal_entrega === "moto" && !!c.reemplazo_despachado_at;
  const hola = "Hola " + nombre + ", ¿cómo estás? Te escribimos de Reybaud por el cambio de " + producto + ".";
  if (tipo === "recordatorio_devolucion") {
    return hola + "\n\nTe queríamos recordar que todavía necesitamos recibir la prenda que vas a devolver (" + original + "). "
      + (entregada ? "El reemplazo (" + nuevo + ") ya fue entregado. Solo nos queda recibir la prenda anterior para cerrar el cambio."
         : enviadaMoto ? "El reemplazo (" + nuevo + ") fue enviado por moto. La devolución de la prenda original sigue pendiente."
         : preparada ? "Ya tenemos separado el reemplazo (" + nuevo + "), y nos queda coordinar su entrega y recibir la prenda original."
         : "Cuando puedas acercarla, seguimos con la preparación del reemplazo.")
      + "\n\nAvisanos cuándo podés traerla. ¡Gracias!";
  }
  if (entregada && recibida) return hola + "\n\n¡Ya tenemos el cambio completo! Recibiste el reemplazo (" + nuevo + ") y registramos la devolución. ¡Gracias!";
  if (entregada && !recibida) return hola + "\n\nYa te entregamos el reemplazo (" + nuevo + "). Solo nos queda recibir la prenda original (" + original + ") para cerrar el cambio. ¿Nos avisás cuándo podés enviarla?";
  if (enviadaMoto) return hola + "\n\nTu reemplazo (" + nuevo + ") fue enviado por moto. Te pedimos que nos confirmes cuando lo recibas." + (!recibida ? " La devolución de la prenda original (" + original + ") continúa pendiente." : "") + " ¡Gracias!";
  if (recibida && preparada) return hola + "\n\nYa recibimos la devolución y tenemos preparado tu reemplazo (" + nuevo + "). Nos ponemos de acuerdo para la entrega. ¡Gracias!";
  if (preparada) return hola + "\n\nYa tenemos separado tu reemplazo (" + nuevo + "). Vamos a coordinar su entrega." + (!recibida ? " La prenda original (" + original + ") sigue pendiente de devolución, y podés mandarla después." : "") + " ¡Gracias!";
  if (recibida) return hola + "\n\nYa recibimos la prenda que devolviste (" + original + "). Estamos preparando el reemplazo (" + nuevo + ") y te vamos a avisar cuando esté listo.";
  return hola + "\n\nTu cambio está aprobado. Estamos esperando recibir la prenda original (" + original + ") para completar el proceso. Te vamos a avisar los próximos pasos. ¡Gracias!";
};
export default function CambioAvisoDialog({ cambio, tipo, open, onOpenChange, onRegistered }: Props) {
  const { toast } = useToast();
  const [mensaje, setMensaje] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const numero = numeroWhatsappAR(cambio.alumnos?.telefono);
  useEffect(() => { if (open) { setMensaje(elaborarMensaje(cambio, tipo)); setAbierto(false); } }, [open, cambio, tipo]);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(mensaje);
      setAbierto(true);
      toast({ title: "Mensaje copiado", description: "Podés pegarlo en el canal que prefieras." });
    } catch { toast({ title: "No se pudo copiar el texto", variant: "destructive" }); }
  };
  const abrirWhatsapp = () => {
    if (!numero) return;
    window.open("https://wa.me/" + numero + "?text=" + encodeURIComponent(mensaje), "_blank", "noopener,noreferrer");
    setAbierto(true);
    toast({ title: "WhatsApp abierto", description: "No se envió automáticamente. Confirmá el envío en WhatsApp." });
  };
  const confirmarEnvio = async () => {
    if (!abierto) return;
    setGuardando(true);
    const { error } = await supabase.rpc("registrar_aviso_cambio" as any, {
      p_cambio_id: cambio.id, p_tipo: tipo, p_canal: numero ? "whatsapp" : "manual", p_mensaje: mensaje,
    });
    setGuardando(false);
    if (error) { toast({ title: "No se pudo registrar el aviso", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Aviso registrado", description: "Se guardó tu confirmación del envío." });
    onRegistered?.();
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{tipo === "estado" ? "Avisar estado del cambio" : "Recordar devolución pendiente"}</DialogTitle>
          <DialogDescription>Revisá el texto antes de enviarlo. WhatsApp nunca envía el mensaje solo.</DialogDescription>
        </DialogHeader>
        <Textarea className="min-h-[180px]" value={mensaje} onChange={(e) => setMensaje(e.target.value)} />
        {!numero && <p className="text-xs text-amber-400">No encontramos un número argentino válido. Copiá el mensaje y elegí el contacto manualmente.</p>}
        <div className="flex flex-wrap gap-2">
          {numero && <Button onClick={abrirWhatsapp} size="sm"><MessageCircle className="w-4 h-4 mr-1" /> Abrir WhatsApp</Button>}
          <Button variant="outline" onClick={copiar} size="sm"><Copy className="w-4 h-4 mr-1" /> Copiar</Button>
        </div>
        {abierto && <div className="space-y-2 border-t pt-3">
          <p className="text-xs text-muted-foreground">¿Ya lo enviaste? Confirmá únicamente después de pulsar Enviar en tu mensajería.</p>
          <Button size="sm" onClick={confirmarEnvio} disabled={guardando}>{guardando ? "Guardando…" : "Sí, ya lo envié · registrar"}</Button>
        </div>}
      </DialogContent>
    </Dialog>
  );
}