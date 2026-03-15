import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Upload, FileSpreadsheet, Check, AlertTriangle } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface ImportRow {
  nombre: string;
  cantidad: number;
  tipo: "ingreso" | "egreso";
  motivo: string;
  matchedProductId?: string;
  matchedProductName?: string;
  currentStock?: number;
  status: "pending" | "matched" | "not_found" | "error";
  error?: string;
}

interface StockImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete: () => void;
}

const StockImportDialog = ({ open, onOpenChange, onImportComplete }: StockImportDialogProps) => {
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [step, setStep] = useState<"upload" | "preview" | "done">("upload");
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setRows([]);
    setStep("upload");
    setImporting(false);
  };

  const parseCSV = (text: string): string[][] => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    return lines.map((line) => {
      // Handle quoted fields
      const result: string[] = [];
      let current = "";
      let inQuotes = false;
      for (const char of line) {
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if ((char === "," || char === ";") && !inQuotes) {
          result.push(current.trim());
          current = "";
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    });
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const parsed = parseCSV(text);

    if (parsed.length < 2) {
      toast({ title: "El archivo debe tener al menos un encabezado y una fila de datos", variant: "destructive" });
      return;
    }

    const header = parsed[0].map((h) => h.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
    const nameIdx = header.findIndex((h) => h.includes("producto") || h.includes("nombre") || h.includes("name"));
    const qtyIdx = header.findIndex((h) => h.includes("cantidad") || h.includes("qty") || h.includes("quantity") || h.includes("stock"));
    const typeIdx = header.findIndex((h) => h.includes("tipo") || h.includes("type") || h.includes("movimiento"));
    const reasonIdx = header.findIndex((h) => h.includes("motivo") || h.includes("razon") || h.includes("reason"));

    if (nameIdx === -1 || qtyIdx === -1) {
      toast({
        title: "Columnas requeridas no encontradas",
        description: "El archivo debe tener columnas 'Producto' y 'Cantidad'. Opcionalmente 'Tipo' (ingreso/egreso) y 'Motivo'.",
        variant: "destructive",
      });
      return;
    }

    // Fetch products to match
    const { data: products } = await supabase
      .from("store_products")
      .select("id, name, stock")
      .eq("status", "active");

    const dataRows = parsed.slice(1);
    const importRows: ImportRow[] = dataRows
      .filter((r) => r[nameIdx]?.trim())
      .map((r) => {
        const nombre = r[nameIdx]?.trim() || "";
        const cantidad = parseInt(r[qtyIdx]) || 0;
        const tipoRaw = typeIdx >= 0 ? r[typeIdx]?.trim().toLowerCase() : "ingreso";
        const tipo: "ingreso" | "egreso" = tipoRaw === "egreso" ? "egreso" : "ingreso";
        const motivo = reasonIdx >= 0 ? r[reasonIdx]?.trim() || "Importación masiva" : "Importación masiva";

        // Try to match product by name (case insensitive, partial match)
        const matched = products?.find(
          (p) => p.name.toLowerCase() === nombre.toLowerCase()
        ) || products?.find(
          (p) => p.name.toLowerCase().includes(nombre.toLowerCase()) || nombre.toLowerCase().includes(p.name.toLowerCase())
        );

        if (!matched) {
          return { nombre, cantidad, tipo, motivo, status: "not_found" as const };
        }

        if (cantidad <= 0) {
          return { nombre, cantidad, tipo, motivo, status: "error" as const, error: "Cantidad inválida", matchedProductId: matched.id, matchedProductName: matched.name, currentStock: matched.stock };
        }

        if (tipo === "egreso" && matched.stock < cantidad) {
          return { nombre, cantidad, tipo, motivo, status: "error" as const, error: "Stock insuficiente", matchedProductId: matched.id, matchedProductName: matched.name, currentStock: matched.stock };
        }

        return { nombre, cantidad, tipo, motivo, status: "matched" as const, matchedProductId: matched.id, matchedProductName: matched.name, currentStock: matched.stock };
      });

    setRows(importRows);
    setStep("preview");
  };

  const handleImport = async () => {
    const validRows = rows.filter((r) => r.status === "matched");
    if (validRows.length === 0) {
      toast({ title: "No hay filas válidas para importar", variant: "destructive" });
      return;
    }

    setImporting(true);
    const { data: { session } } = await supabase.auth.getSession();
    let successCount = 0;
    let errorCount = 0;

    for (const row of validRows) {
      const stockNuevo = row.tipo === "ingreso"
        ? (row.currentStock || 0) + row.cantidad
        : (row.currentStock || 0) - row.cantidad;

      const { error: updateError } = await supabase
        .from("store_products")
        .update({ stock: stockNuevo } as any)
        .eq("id", row.matchedProductId!);

      if (updateError) {
        errorCount++;
        continue;
      }

      await supabase
        .from("stock_movements" as any)
        .insert({
          product_id: row.matchedProductId,
          tipo: row.tipo,
          cantidad: row.cantidad,
          stock_anterior: row.currentStock || 0,
          stock_nuevo: stockNuevo,
          motivo: row.motivo,
          registrado_por: session?.user?.id || null,
        } as any);

      successCount++;
    }

    setImporting(false);
    setStep("done");
    toast({
      title: "Importación completada",
      description: `${successCount} movimientos registrados${errorCount > 0 ? `, ${errorCount} errores` : ""}`,
    });
    onImportComplete();
  };

  const matchedCount = rows.filter((r) => r.status === "matched").length;
  const notFoundCount = rows.filter((r) => r.status === "not_found").length;
  const errorCount = rows.filter((r) => r.status === "error").length;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5" />
            Importar movimientos desde planilla
          </DialogTitle>
          <DialogDescription>
            Subí un archivo CSV con columnas: Producto, Cantidad, Tipo (ingreso/egreso), Motivo
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4">
            <div
              className="border-2 border-dashed border-muted-foreground/30 rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Hacé clic para seleccionar un archivo CSV</p>
              <p className="text-xs text-muted-foreground mt-1">Separador: coma (,) o punto y coma (;)</p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt"
              className="hidden"
              onChange={handleFile}
            />
            <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground space-y-1">
              <p className="font-medium">Formato esperado:</p>
              <code className="block">Producto,Cantidad,Tipo,Motivo</code>
              <code className="block">Jersey Team,10,ingreso,Reposición mensual</code>
              <code className="block">Casco Aero,2,egreso,Venta en local</code>
            </div>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-4">
            <div className="flex gap-2 flex-wrap">
              <Badge variant="default">{matchedCount} válidos</Badge>
              {notFoundCount > 0 && <Badge variant="destructive">{notFoundCount} no encontrados</Badge>}
              {errorCount > 0 && <Badge variant="outline" className="border-yellow-500 text-yellow-500">{errorCount} con error</Badge>}
            </div>

            <div className="max-h-[40vh] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Estado</TableHead>
                    <TableHead>Producto</TableHead>
                    <TableHead className="text-center">Tipo</TableHead>
                    <TableHead className="text-center">Cantidad</TableHead>
                    <TableHead>Motivo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, i) => (
                    <TableRow key={i} className={r.status === "not_found" || r.status === "error" ? "opacity-60" : ""}>
                      <TableCell>
                        {r.status === "matched" && <Check className="w-4 h-4 text-green-500" />}
                        {r.status === "not_found" && <AlertTriangle className="w-4 h-4 text-destructive" />}
                        {r.status === "error" && <AlertTriangle className="w-4 h-4 text-yellow-500" />}
                      </TableCell>
                      <TableCell>
                        <div>
                          <span className="font-medium">{r.matchedProductName || r.nombre}</span>
                          {r.status === "not_found" && <p className="text-xs text-destructive">No encontrado</p>}
                          {r.error && <p className="text-xs text-yellow-500">{r.error}</p>}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={r.tipo === "ingreso" ? "default" : "destructive"} className="text-xs">
                          {r.tipo}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">{r.cantidad}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.motivo}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {step === "done" && (
          <div className="text-center py-8">
            <Check className="w-12 h-12 mx-auto text-green-500 mb-3" />
            <p className="font-medium">Importación completada</p>
          </div>
        )}

        <DialogFooter>
          {step === "preview" && (
            <>
              <Button variant="outline" onClick={() => { reset(); }}>Cancelar</Button>
              <Button onClick={handleImport} disabled={importing || matchedCount === 0}>
                {importing ? "Importando..." : `Importar ${matchedCount} movimientos`}
              </Button>
            </>
          )}
          {step === "done" && (
            <Button onClick={() => { reset(); onOpenChange(false); }}>Cerrar</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default StockImportDialog;
