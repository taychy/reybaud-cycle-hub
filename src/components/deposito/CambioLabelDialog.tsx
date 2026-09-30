import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Loader2, Printer, Tag } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  buildCambioLabelPreview,
  downloadCambioLabel,
  printCambioLabel,
  type CambioLabelData,
  type CambioLabelPreview,
  type CambioLabelSize,
} from "@/lib/cambioLabels";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: CambioLabelData | null;
}

const SIZES: { value: CambioLabelSize; label: string }[] = [
  { value: "50x40", label: "50 × 40 mm" },
  { value: "50x30", label: "50 × 30 mm" },
  { value: "40x30", label: "40 × 30 mm" },
];

const CambioLabelDialog = ({ open, onOpenChange, data }: Props) => {
  const { toast } = useToast();
  const [size, setSize] = useState<CambioLabelSize>("50x40");
  const [preview, setPreview] = useState<CambioLabelPreview | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !data) return;
    let cancelled = false;
    setLoading(true);
    buildCambioLabelPreview(data, size)
      .then((p) => {
        if (cancelled) {
          URL.revokeObjectURL(p.url);
          return;
        }
        setPreview((prev) => {
          if (prev) URL.revokeObjectURL(prev.url);
          return p;
        });
      })
      .catch((e: any) =>
        toast({ title: "No se pudo generar la etiqueta", description: e.message, variant: "destructive" }),
      )
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [open, data?.id, size]);

  useEffect(() => {
    if (!open) {
      setPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return null;
      });
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="w-4 h-4" /> Etiqueta de cambio
          </DialogTitle>
          <DialogDescription>
            Etiqueta para pegar en la bolsa del reemplazo antes de pasarlo a camioneta.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Tamaño Niimbot</span>
            <Select value={size} onValueChange={(v) => setSize(v as CambioLabelSize)}>
              <SelectTrigger className="w-[150px] h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SIZES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg border border-border bg-white p-2 min-h-[180px] flex items-center justify-center">
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            ) : preview ? (
              <img src={preview.url} alt={preview.title} className="max-w-full max-h-[260px] object-contain" />
            ) : null}
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button
              onClick={() => preview && printCambioLabel(preview, size)}
              disabled={!preview || loading}
            >
              <Printer className="w-4 h-4 mr-1" /> Imprimir
            </Button>
            <Button
              variant="outline"
              onClick={() => preview && downloadCambioLabel(preview)}
              disabled={!preview || loading}
            >
              <Download className="w-4 h-4 mr-1" /> Descargar PNG
            </Button>
          </div>

          <p className="text-[11px] text-muted-foreground">
            El QR identifica este cambio para los controles de camioneta. No reemplaza la etiqueta QR del producto.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CambioLabelDialog;
