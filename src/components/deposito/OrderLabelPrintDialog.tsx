import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Printer, Download, FileText, Tag, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  buildPreorderLabelsPdf,
  preorderLabelsFilename,
  type PreorderLabelData,
} from "@/lib/preorderLabels";
import {
  buildOrderNiimbotPreviews,
  downloadOrderNiimbotPreviews,
  printOrderNiimbotPreviews,
  type OrderLabelPreview,
  type OrderNiimbotSize,
} from "@/lib/orderNiimbotLabels";
import { downloadFileBlob, printPdfBlob } from "@/lib/printBlob";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labels: PreorderLabelData[];
  title?: string;
}

const SIZES: { value: OrderNiimbotSize; label: string }[] = [
  { value: "50x40", label: "50 × 40 mm" },
  { value: "50x30", label: "50 × 30 mm" },
  { value: "40x30", label: "40 × 30 mm" },
];

const OrderLabelPrintDialog = ({ open, onOpenChange, labels, title }: Props) => {
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [size, setSize] = useState<OrderNiimbotSize>("50x40");
  const [previews, setPreviews] = useState<OrderLabelPreview[]>([]);
  const [tab, setTab] = useState("a4");

  // Regenerar previews Niimbot cuando cambia el tamaño o el set de etiquetas
  useEffect(() => {
    if (!open || tab !== "niimbot" || !labels.length) return;
    let cancelled = false;
    setBusy("preview");
    buildOrderNiimbotPreviews(labels, size)
      .then((items) => {
        if (cancelled) {
          items.forEach((i) => URL.revokeObjectURL(i.url));
          return;
        }
        setPreviews((prev) => {
          prev.forEach((p) => URL.revokeObjectURL(p.url));
          return items;
        });
      })
      .catch((e: any) =>
        toast({ title: "Error generando etiquetas", description: e.message, variant: "destructive" }),
      )
      .finally(() => !cancelled && setBusy(null));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tab, size, labels.map((l) => l.id).join(",")]);

  useEffect(() => {
    if (!open) {
      setPreviews((prev) => {
        prev.forEach((p) => URL.revokeObjectURL(p.url));
        return [];
      });
    }
  }, [open]);

  const run = async (key: string, fn: () => Promise<void>) => {
    try {
      setBusy(key);
      await fn();
    } catch (e: any) {
      toast({ title: "Error con la etiqueta", description: e.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const a4Print = () =>
    run("a4-print", async () => printPdfBlob(await buildPreorderLabelsPdf(labels)));
  const a4Download = () =>
    run("a4-dl", async () =>
      downloadFileBlob(await buildPreorderLabelsPdf(labels), preorderLabelsFilename(labels)),
    );

  const count = labels.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="w-4 h-4" /> {title || `Etiquetas (${count})`}
          </DialogTitle>
          <DialogDescription>
            Elegí el formato: hoja A4 (impresora común) o rollo Niimbot.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="a4"><FileText className="w-4 h-4 mr-1" /> A4</TabsTrigger>
            <TabsTrigger value="niimbot"><Tag className="w-4 h-4 mr-1" /> Niimbot</TabsTrigger>
          </TabsList>

          <TabsContent value="a4" className="space-y-3 pt-3">
            <p className="text-xs text-muted-foreground">
              4 etiquetas por hoja A4 apaisada, con QR de pago.
            </p>
            <div className="flex gap-2 flex-wrap">
              <Button onClick={a4Print} disabled={!!busy}>
                {busy === "a4-print" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Printer className="w-4 h-4 mr-1" />}
                Imprimir ahora
              </Button>
              <Button variant="outline" onClick={a4Download} disabled={!!busy}>
                <Download className="w-4 h-4 mr-1" /> Descargar PDF
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="niimbot" className="space-y-3 pt-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Tamaño del rollo</span>
              <Select value={size} onValueChange={(v) => setSize(v as OrderNiimbotSize)}>
                <SelectTrigger className="w-[150px] h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SIZES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {busy === "preview" ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Generando etiquetas…</div>
            ) : (
              <div className="grid grid-cols-2 gap-3 max-h-[45vh] overflow-y-auto">
                {previews.map((p) => (
                  <div key={p.id} className="rounded-lg border border-border bg-muted/20 p-2 space-y-2">
                    <div className="bg-white rounded p-1 flex items-center justify-center">
                      <img src={p.url} alt={p.title} className="max-w-full object-contain" />
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate">{p.title}</p>
                    <Button size="sm" variant="outline" className="w-full h-8"
                      onClick={() => downloadOrderNiimbotPreviews([p])}>
                      <Download className="w-3 h-3 mr-1" /> PNG
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2 flex-wrap">
              <Button
                disabled={!!busy || previews.length === 0}
                onClick={() => run("nb-print", () => printOrderNiimbotPreviews(previews, size))}
              >
                <Printer className="w-4 h-4 mr-1" /> Imprimir ahora
              </Button>
              <Button
                variant="outline"
                disabled={!!busy || previews.length === 0}
                onClick={() => run("nb-dl", () => downloadOrderNiimbotPreviews(previews))}
              >
                <Download className="w-4 h-4 mr-1" />
                {previews.length > 1 ? "Descargar ZIP" : "Descargar PNG"}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Para imprimir desde la app Niimbot, descargá los PNG e importalos como imagen.
            </p>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default OrderLabelPrintDialog;
