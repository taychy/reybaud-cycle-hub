import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, ShieldCheck, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { calculateFiscalNet, FISCAL_DOCUMENT_TYPES } from "@/lib/fiscal-comprobantes";
import { readArcaComprobantesXlsx, type ArcaImportPreview } from "@/lib/arca-comprobantes-import";
import { FiscalImportReconciliation } from "./FiscalImportReconciliation";

const money = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 2,
});

const shortDate = new Intl.DateTimeFormat("es-AR", { timeZone: "UTC" });

export function FiscalComprobantesLab() {
  const [importPreview, setImportPreview] = useState<ArcaImportPreview | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [importedFileName, setImportedFileName] = useState<string | null>(null);

  const importedTotals = useMemo(() => {
    if (!importPreview) return null;
    const facturas = importPreview.documents
      .filter((document) => document.clase === "factura")
      .reduce((sum, document) => sum + document.importeTotal, 0);
    const notasCredito = importPreview.documents
      .filter((document) => document.clase === "nota_credito")
      .reduce((sum, document) => sum + document.importeTotal, 0);
    return {
      facturas,
      notasCredito,
      neto: calculateFiscalNet(
        importPreview.documents.map((document) => ({
          clase: document.clase,
          importe_total: document.importeTotal,
        })),
      ),
    };
  }, [importPreview]);

  const handleHistoricalFile = async (file: File | undefined) => {
    if (!file) return;
    setIsReadingFile(true);
    setImportError(null);
    setImportPreview(null);
    setImportedFileName(file.name);
    try {
      const preview = await readArcaComprobantesXlsx(file);
      setImportPreview(preview);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "No se pudo leer el archivo de ARCA.");
    } finally {
      setIsReadingFile(false);
    }
  };

  const clearHistoricalFile = () => {
    setImportPreview(null);
    setImportError(null);
    setImportedFileName(null);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 flex gap-3">
        <ShieldCheck className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <p className="font-medium text-sm">Importación fiscal protegida</p>
          <p className="text-xs text-muted-foreground mt-1">
            Primero se valida y cruza todo el archivo. La importación solo guarda comprobantes históricos nuevos, vuelve a verificar duplicados en el servidor y nunca envía nada a ARCA.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4" />
            Importación histórica de ARCA
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-dashed p-4 space-y-3">
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">Subí el Excel de “Mis Comprobantes Emitidos”</p>
              <p className="text-xs text-muted-foreground">
                Primero se valida el archivo y después se cruza contra Reybaud para separar comprobantes nuevos, existentes y casos a revisar.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Label
                htmlFor="arca-history-file"
                className="inline-flex h-9 cursor-pointer items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
              >
                <Upload className="h-4 w-4 mr-2" />
                {isReadingFile ? "Leyendo archivo…" : "Seleccionar Excel"}
              </Label>
              <Input
                id="arca-history-file"
                type="file"
                accept=".xlsx"
                className="hidden"
                disabled={isReadingFile}
                onChange={(event) => void handleHistoricalFile(event.target.files?.[0])}
              />
              {importedFileName && <span className="text-xs text-muted-foreground break-all">{importedFileName}</span>}
              {(importPreview || importError) && (
                <Button type="button" variant="ghost" size="sm" onClick={clearHistoricalFile}>
                  Limpiar
                </Button>
              )}
            </div>
          </div>

          {importError && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 flex gap-2 text-sm">
              <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <span>{importError}</span>
            </div>
          )}

          {importPreview && importedTotals && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/20 p-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                <span><strong>CUIT detectado:</strong> {importPreview.cuitEmisor ?? "No detectado"}</span>
                <span><strong>Comprobantes válidos:</strong> {importPreview.documents.length}</span>
                <span><strong>Observaciones:</strong> {importPreview.issues.length}</span>
                <span><strong>Duplicados dentro del Excel:</strong> {importPreview.duplicates}</span>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Facturas del archivo</CardTitle></CardHeader>
                  <CardContent><p className="text-xl font-bold tabular-nums">{money.format(importedTotals.facturas)}</p></CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Notas de crédito</CardTitle></CardHeader>
                  <CardContent><p className="text-xl font-bold tabular-nums">-{money.format(importedTotals.notasCredito)}</p></CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Neto fiscal del archivo</CardTitle></CardHeader>
                  <CardContent><p className="text-xl font-bold tabular-nums">{money.format(importedTotals.neto)}</p></CardContent>
                </Card>
              </div>

              <div className="rounded-lg border overflow-hidden">
                <div className="grid grid-cols-[90px_1.2fr_1fr_1.4fr_120px] gap-3 bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
                  <span>Fecha</span>
                  <span>Comprobante</span>
                  <span>Número</span>
                  <span>Receptor</span>
                  <span className="text-right">Importe</span>
                </div>
                <div className="divide-y">
                  {importPreview.documents.slice(0, 12).map((document) => {
                    const info = FISCAL_DOCUMENT_TYPES[document.tipoComprobante];
                    const isCredit = document.clase === "nota_credito";
                    return (
                      <div
                        key={`${document.tipoComprobante}-${document.puntoVenta}-${document.numeroComprobante}`}
                        className="grid grid-cols-[90px_1.2fr_1fr_1.4fr_120px] gap-3 px-3 py-2 text-xs items-center"
                      >
                        <span>{shortDate.format(new Date(`${document.fechaEmision}T00:00:00Z`))}</span>
                        <span>{info.label}</span>
                        <span>{String(document.puntoVenta).padStart(4, "0")}-{String(document.numeroComprobante).padStart(8, "0")}</span>
                        <span className="truncate" title={document.clienteNombre ?? undefined}>{document.clienteNombre || "—"}</span>
                        <span className="text-right font-medium tabular-nums">{isCredit ? "−" : "+"}{money.format(document.importeTotal)}</span>
                      </div>
                    );
                  })}
                </div>
                {importPreview.documents.length > 12 && (
                  <div className="border-t px-3 py-2 text-xs text-muted-foreground">
                    Mostrando 12 de {importPreview.documents.length} comprobantes válidos.
                  </div>
                )}
              </div>

              {importPreview.issues.length > 0 ? (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    Filas que requieren revisión
                  </div>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    {importPreview.issues.slice(0, 8).map((issue) => (
                      <p key={`${issue.rowNumber}-${issue.reason}`}>Fila {issue.rowNumber}: {issue.reason}</p>
                    ))}
                    {importPreview.issues.length > 8 && <p>…y {importPreview.issues.length - 8} observaciones más.</p>}
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 flex gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                  El archivo pasó la validación. Revisá el cruce con Reybaud y confirmá la importación cuando todo esté correcto.
                </div>
              )}

              <FiscalImportReconciliation
                preview={importPreview}
                sourceFileName={importedFileName || "ARCA - Mis Comprobantes Emitidos.xlsx"}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
