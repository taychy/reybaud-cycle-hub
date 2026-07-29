import { useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Package, Printer, X } from "lucide-react";
import { printImageBlobs } from "@/lib/printBlob";
import {
  downloadBlob,
  downloadPreviewsAsZip,
  type NiimbotPreviewItem,
} from "@/lib/niimbotLabels";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  previews: NiimbotPreviewItem[];
  title?: string;
  filenameHint?: string;
}

const NiimbotLabelPreviewDialog = ({
  open,
  onOpenChange,
  previews,
  title = "Vista previa de etiqueta",
  filenameHint,
}: Props) => {
  // Revocar object URLs solo al desmontar / cambiar de set de previews,
  // nunca al abrir (si no, el cleanup del efecto previo revoca las URLs
  // justo antes de mostrarlas y las <img> quedan cargando).
  useEffect(() => {
    return () => {
      previews.forEach((p) => URL.revokeObjectURL(p.url));
    };
  }, [previews]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-4 h-4" /> {title}
          </DialogTitle>
          <DialogDescription>
            {previews.length === 1
              ? "Revisá el diseño antes de descargar."
              : `${previews.length} etiquetas generadas. Descargá individualmente o todas en un ZIP.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {previews.map((p) => (
            <div
              key={p.filename}
              className="rounded-lg border border-border bg-muted/20 p-3 flex flex-col sm:flex-row gap-3 items-start"
            >
              <div className="w-full sm:w-56 shrink-0 bg-white rounded border border-border p-2 flex items-center justify-center">
                <img
                  src={p.url}
                  alt={p.sku}
                  className="max-w-full max-h-64 object-contain"
                />
              </div>
              <div className="flex-1 min-w-0 space-y-2">
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">
                    SKU
                  </div>
                  <div className="font-mono font-bold text-sm break-all">{p.sku}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">
                    Archivo
                  </div>
                  <div className="text-xs text-muted-foreground break-all">
                    {p.filename}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => printImageBlobs([p.blob])}>
                    <Printer className="w-4 h-4 mr-1" />
                    Imprimir
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => downloadBlob(p.blob, p.filename)}
                  >
                    <Download className="w-4 h-4 mr-1" />
                    Descargar PNG
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="secondary"
            onClick={() => printImageBlobs(previews.map((p) => p.blob))}
          >
            <Printer className="w-4 h-4 mr-1" />
            Imprimir {previews.length > 1 ? "todas" : ""}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="w-4 h-4 mr-1" />
            Cerrar sin descargar
          </Button>
          {previews.length > 1 && (
            <Button onClick={() => downloadPreviewsAsZip(previews, filenameHint)}>
              <Download className="w-4 h-4 mr-1" />
              Descargar todas (ZIP)
            </Button>
          )}
          {previews.length === 1 && (
            <Button
              onClick={() => downloadBlob(previews[0].blob, previews[0].filename)}
            >
              <Download className="w-4 h-4 mr-1" />
              Descargar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default NiimbotLabelPreviewDialog;
