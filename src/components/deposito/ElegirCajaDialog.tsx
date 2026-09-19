import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { CargaActiva } from "@/lib/camionetaSync";

interface Props {
  open: boolean;
  cargas: CargaActiva[];
  onSelect: (cargaId: string) => void;
  onClose: () => void;
}

/** Al marcar un pedido "en camioneta" hay que registrar en qué caja se puso. */
const ElegirCajaDialog = ({ open, cargas, onSelect, onClose }: Props) => (
  <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
    <DialogContent className="max-w-sm">
      <DialogHeader>
        <DialogTitle className="font-heading">¿En qué caja lo pusiste?</DialogTitle>
        <DialogDescription>
          Las cajas viajan juntas en la misma camioneta. Elegí dónde cargaste el pedido.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-2">
        {cargas.map((c) => (
          <Button
            key={c.id}
            variant="outline"
            className="w-full justify-start"
            onClick={() => onSelect(c.id)}
          >
            Caja {c.sede_nombre || "sin nombre"} · {c.estado === "en_ruta" ? "En ruta" : "Abierta"}
          </Button>
        ))}
      </div>
    </DialogContent>
  </Dialog>
);

export default ElegirCajaDialog;
