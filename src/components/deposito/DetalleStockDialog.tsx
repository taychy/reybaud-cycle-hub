import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { sortVariantSpecs } from "@/lib/variantSort";

interface VariantSpec {
  name: string;
  options: string[];
}

export interface StockProductDetail {
  id: string;
  name: string;
  stock: number | null;
  min_stock: number;
  variants: VariantSpec[] | null;
  variant_stock: Record<string, number> | null;
}

interface Props {
  product: StockProductDetail | null;
  onOpenChange: (open: boolean) => void;
}

const formatQuantity = (value: unknown) =>
  Number.isFinite(Number(value)) ? Number(value) : 0;

const DetalleStockDialog = ({ product, onOpenChange }: Props) => {
  const specs = sortVariantSpecs(product?.variants || []);
  const inventory = product?.variant_stock || {};
  const registeredTotal = specs.length > 0 && product?.variant_stock
    ? Object.values(inventory).reduce((sum, v) => sum + formatQuantity(v), 0)
    : formatQuantity(product?.stock);
  const mismatchedTotal = specs.length > 0 && product?.variant_stock &&
    registeredTotal !== formatQuantity(product.stock);
  const quantityFor = (selection: Record<string, string>) =>
    formatQuantity(inventory[specs.map((spec) => `${spec.name}:${selection[spec.name]}`).join("|")]);
  const [first, second] = specs;

  return (
    <Dialog open={!!product} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading uppercase tracking-wider leading-tight">
            {product?.name || "Detalle de stock"}
          </DialogTitle>
          <DialogDescription>Existencias registradas por talle y color en el sistema de depósito.</DialogDescription>
        </DialogHeader>
        {product && (
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3">
              <div>
                <p className="text-[11px] uppercase text-muted-foreground">Stock total registrado</p>
                <p className="text-3xl font-bold font-heading tabular-nums">{registeredTotal}</p>
              </div>
              <Badge variant="outline">{specs.length ? "Por variantes" : "Sin variantes"}</Badge>
            </div>

            {specs.length === 2 && (
              <div className="overflow-x-auto rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="whitespace-nowrap">{first.name}</TableHead>
                      {second.options.map((v) =>
                        <TableHead key={v} className="text-center whitespace-nowrap">{v}</TableHead>
                      )}
                      <TableHead className="text-center">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {first.options.map((a) => {
                      const total = second.options.reduce((sum, b) =>
                        sum + quantityFor({ [first.name]: a, [second.name]: b }), 0);
                      return (
                        <TableRow key={a}>
                          <TableCell className="font-semibold">{a}</TableCell>
                          {second.options.map((b) => {
                            const n = quantityFor({ [first.name]: a, [second.name]: b });
                            return <TableCell key={b} className={`text-center tabular-nums ${n === 0 ? "text-destructive" : ""}`}>{n}</TableCell>;
                          })}
                          <TableCell className="text-center font-semibold tabular-nums">{total}</TableCell>
                        </TableRow>
                      );
                    })}
                    <TableRow className="bg-muted/40 font-semibold">
                      <TableCell>Total</TableCell>
                      {second.options.map((b) =>
                        <TableCell key={b} className="text-center tabular-nums">
                          {first.options.reduce((sum, a) => sum + quantityFor({ [first.name]: a, [second.name]: b }), 0)}
                        </TableCell>
                      )}
                      <TableCell className="text-center tabular-nums">{registeredTotal}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            )}

            {specs.length === 1 && (
              <div className="rounded-lg border border-border overflow-hidden">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>{first.name}</TableHead><TableHead className="text-right">Unidades</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {first.options.map((v) => (
                      <TableRow key={v}>
                        <TableCell>{v}</TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">
                          {quantityFor({ [first.name]: v })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {(specs.length > 2 || (!specs.length && Object.keys(inventory).length > 0)) && (
              <div className="rounded-lg border border-border overflow-hidden">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Variante</TableHead><TableHead className="text-right">Unidades</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {Object.entries(inventory).sort(([a],[b]) => a.localeCompare(b, "es")).map(([v, n]) => (
                      <TableRow key={v}>
                        <TableCell className="text-xs">{v.replace(/\\|/g, " · ")}</TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">{formatQuantity(n)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {mismatchedTotal && (
              <p className="text-xs text-amber-400">
                Atención: el total del producto no coincide con la suma de las variantes. Revisar inventario.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Estas son cantidades registradas, no un conteo físico. Las devoluciones pendientes o movimientos sin conciliar pueden afectar la disponibilidad real.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default DetalleStockDialog;
