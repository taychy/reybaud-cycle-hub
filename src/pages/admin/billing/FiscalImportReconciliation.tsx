import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Link2, Loader2, Store, WalletCards } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { ArcaImportPreview, ArcaImportedFiscalDocument } from "@/lib/arca-comprobantes-import";
import { FISCAL_DOCUMENT_TYPES, calculateFiscalNet } from "@/lib/fiscal-comprobantes";
import {
  normalizeCuit,
  reconcileArcaWithReybaud,
  type FiscalReconciliation,
  type ReybaudFiscalInvoiceLike,
} from "@/lib/fiscal-reconciliation";

interface Props {
  preview: ArcaImportPreview;
  sourceFileName: string;
}

interface EmisorContext {
  id: string;
  nombre_fiscal: string;
  cuit: string;
  punto_venta: number;
  activo: boolean;
}

interface BusinessLink {
  unidad: string;
  cuentaNombre: string;
}

interface HistoricalRow {
  id: string;
  tipo_comprobante: number;
  punto_venta: number;
  numero_comprobante: number;
  importe_total: number | string;
  fecha_emision: string;
}

interface ImportResult {
  batch_id?: string;
  source_total_documents?: number;
  imported_documents?: number;
  skipped_app_documents?: number;
  skipped_historical_documents?: number;
  source_neto_fiscal?: number;
  imported_neto_fiscal?: number;
}

type DetailKind = "new" | "existing" | "mismatch" | null;

const UNIT_LABELS: Record<string, string> = {
  suscripcion_escuela: "Suscripciones escuela",
  viaje_camp: "Viajes / Camps",
  evento: "Eventos",
  tienda: "Tienda",
  preventa: "Preventas",
  personalizado: "Personalizado",
  turnera: "Turnera",
  otro: "Otro",
};

const money = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 2,
});

const shortDate = new Intl.DateTimeFormat("es-AR", { timeZone: "UTC" });

function formatCuit(value: string): string {
  const digits = normalizeCuit(value);
  if (digits.length !== 11) return value;
  return `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}`;
}

function fiscalNumber(document: ArcaImportedFiscalDocument): string {
  return `${String(document.puntoVenta).padStart(4, "0")}-${String(document.numeroComprobante).padStart(8, "0")}`;
}

function historicalNumber(row: HistoricalRow): string {
  return `${String(row.punto_venta).padStart(5, "0")}-${String(row.numero_comprobante).padStart(8, "0")}`;
}

export function FiscalImportReconciliation({ preview, sourceFileName }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [emisor, setEmisor] = useState<EmisorContext | null>(null);
  const [businessLinks, setBusinessLinks] = useState<BusinessLink[]>([]);
  const [reconciliation, setReconciliation] = useState<FiscalReconciliation | null>(null);
  const [detailKind, setDetailKind] = useState<DetailKind>(null);
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      setEmisor(null);
      setBusinessLinks([]);
      setReconciliation(null);
      setDetailKind(null);
      setDbError(null);

      const cuitArchivo = normalizeCuit(preview.cuitEmisor);
      if (cuitArchivo.length !== 11) {
        setError("No se pudo identificar un CUIT válido en el archivo de ARCA.");
        setLoading(false);
        return;
      }

      const { data: emisoresData, error: emisoresError } = await supabase
        .from("emisores_fiscales")
        .select("id, nombre_fiscal, cuit, punto_venta, activo");

      if (cancelled) return;
      if (emisoresError) {
        setError(`No se pudieron consultar los emisores de Reybaud: ${emisoresError.message}`);
        setLoading(false);
        return;
      }

      const matches = ((emisoresData as EmisorContext[] | null) ?? []).filter(
        (item) => normalizeCuit(item.cuit) === cuitArchivo,
      );

      if (matches.length === 0) {
        setError(`El CUIT ${formatCuit(cuitArchivo)} no está configurado como emisor fiscal en Reybaud. No se puede continuar con la importación.`);
        setLoading(false);
        return;
      }

      if (matches.length > 1) {
        setError(`Hay más de un emisor fiscal en Reybaud con el CUIT ${formatCuit(cuitArchivo)}. Hay que resolver esa duplicación antes de importar.`);
        setLoading(false);
        return;
      }

      const selectedEmisor = matches[0];
      setEmisor(selectedEmisor);

      const [facturasRes, routingRes, cuentasRes, historicalRes] = await Promise.all([
        supabase
          .from("facturas")
          .select("id, tipo_comprobante, numero_comprobante, monto, cae, fecha_emision, estado")
          .eq("emisor_id", selectedEmisor.id)
          .eq("estado", "emitida")
          .not("cae", "is", null),
        supabase
          .from("cuenta_mp_routing" as any)
          .select("unidad_negocio, cuenta_mp_id, emisor_fiscal_id, activa")
          .eq("activa", true),
        supabase
          .from("cuentas_mp" as any)
          .select("id, nombre, emisor_fiscal_default_id, activa")
          .eq("activa", true),
        (supabase as any)
          .from("fiscal_historical_documents")
          .select("id, tipo_comprobante, punto_venta, numero_comprobante, importe_total, fecha_emision")
          .eq("emisor_id", selectedEmisor.id),
      ]);

      if (cancelled) return;
      if (facturasRes.error) {
        setError(`No se pudieron consultar las facturas existentes: ${facturasRes.error.message}`);
        setLoading(false);
        return;
      }

      const facturas = ((facturasRes.data as ReybaudFiscalInvoiceLike[] | null) ?? []).map((factura) => ({
        ...factura,
        source: "app" as const,
      }));

      let historical: ReybaudFiscalInvoiceLike[] = [];
      if (historicalRes.error) {
        setDbReady(false);
        setDbError("La estructura de importación histórica todavía no está disponible en Supabase. La revisión sigue funcionando, pero el botón de importar permanecerá bloqueado hasta aplicar la migración.");
      } else {
        setDbReady(true);
        historical = (((historicalRes.data as HistoricalRow[] | null) ?? []).map((row) => ({
          id: row.id,
          tipo_comprobante: row.tipo_comprobante,
          numero_comprobante: historicalNumber(row),
          monto: row.importe_total,
          fecha_emision: row.fecha_emision,
          source: "historical" as const,
        })));
      }

      setReconciliation(reconcileArcaWithReybaud(preview.documents, [...facturas, ...historical]));

      if (!routingRes.error && !cuentasRes.error) {
        const cuentas = ((cuentasRes.data as any[]) ?? []);
        const cuentaById = new Map(cuentas.map((cuenta) => [cuenta.id, cuenta]));
        const seen = new Set<string>();
        const links: BusinessLink[] = [];

        for (const route of ((routingRes.data as any[]) ?? [])) {
          const cuenta = cuentaById.get(route.cuenta_mp_id);
          if (!cuenta) continue;
          const effectiveEmisorId = route.emisor_fiscal_id || cuenta.emisor_fiscal_default_id;
          if (effectiveEmisorId !== selectedEmisor.id) continue;
          const key = `${route.unidad_negocio}:${route.cuenta_mp_id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          links.push({ unidad: route.unidad_negocio, cuentaNombre: cuenta.nombre });
        }

        setBusinessLinks(links);
      }

      setLoading(false);
    };

    void load();
    return () => { cancelled = true; };
  }, [preview, refreshKey]);

  const linkedUnits = useMemo(() => {
    const units = [...new Set(businessLinks.map((link) => link.unidad))];
    return units.map((unit) => UNIT_LABELS[unit] || unit);
  }, [businessLinks]);

  const netoNuevo = useMemo(() => {
    if (!reconciliation) return 0;
    return calculateFiscalNet(
      reconciliation.newDocuments.map((document) => ({
        clase: document.clase,
        importe_total: document.importeTotal,
      })),
    );
  }, [reconciliation]);

  const detail = useMemo(() => {
    if (!reconciliation || !detailKind) return null;
    if (detailKind === "new") {
      return {
        title: `Nuevos para importar (${reconciliation.newDocuments.length})`,
        rows: reconciliation.newDocuments.map((document) => ({ document, note: "Se importará como histórico ARCA" })),
      };
    }
    if (detailKind === "existing") {
      return {
        title: `Ya existen en Reybaud (${reconciliation.existingDocuments.length})`,
        rows: reconciliation.existingDocuments.map((item) => ({
          document: item.document,
          note: item.source === "historical" ? "Ya importado histórico · se omite" : "Factura Reybaud · se omite",
        })),
      };
    }
    return {
      title: `Requieren revisión (${reconciliation.mismatches.length})`,
      rows: reconciliation.mismatches.map((item) => ({ document: item.document, note: item.reason })),
    };
  }, [detailKind, reconciliation]);

  const canImport = Boolean(
    dbReady &&
    emisor &&
    reconciliation &&
    reconciliation.newDocuments.length > 0 &&
    reconciliation.mismatches.length === 0 &&
    preview.issues.length === 0 &&
    !importing,
  );

  const handleImport = async () => {
    if (!canImport || !emisor || !reconciliation) return;

    const confirmed = window.confirm(
      `Se importarán ${reconciliation.newDocuments.length} comprobantes históricos para ${emisor.nombre_fiscal}.\n\n` +
      `Los comprobantes que ya existen se volverán a verificar en el servidor y se omitirán.\n` +
      `Neto fiscal nuevo estimado: ${money.format(netoNuevo)}.\n\n¿Confirmás la importación?`,
    );
    if (!confirmed) return;

    setImporting(true);
    setImportResult(null);
    try {
      // Enviamos todos los comprobantes válidos del archivo. La RPC vuelve a verificar
      // cada identidad contra facturas operativas e históricos antes de insertar.
      const { data, error: rpcError } = await (supabase as any).rpc("import_fiscal_history", {
        p_emisor_id: emisor.id,
        p_source_filename: sourceFileName || "ARCA - Mis Comprobantes Emitidos.xlsx",
        p_source_cuit: preview.cuitEmisor,
        p_documents: preview.documents,
      });

      if (rpcError) throw rpcError;

      const result = (data ?? {}) as ImportResult;
      setImportResult(result);
      toast.success("Importación histórica completada", {
        description: `${result.imported_documents ?? 0} comprobantes nuevos guardados.`,
      });
      setRefreshKey((key) => key + 1);
    } catch (importError: any) {
      toast.error("No se pudo importar el histórico", {
        description: importError?.message || "La operación fue cancelada sin guardar cambios.",
      });
    } finally {
      setImporting(false);
    }
  };

  return (
    <Card className="border-sky-500/30">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Link2 className="h-4 w-4" />
          Cruce con Reybaud e histórico fiscal
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Buscando el emisor y comparando contra facturas e históricos ya guardados…
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 flex gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {!loading && !error && emisor && reconciliation && (
          <>
            <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                <span><strong>Emisor encontrado:</strong> {emisor.nombre_fiscal}</span>
                <span><strong>CUIT:</strong> {formatCuit(emisor.cuit)}</span>
                <span><strong>Punto de venta actual:</strong> {String(emisor.punto_venta).padStart(5, "0")}</span>
                <Badge variant={emisor.activo ? "default" : "secondary"}>{emisor.activo ? "Activo" : "Inactivo"}</Badge>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Store className="h-3.5 w-3.5" />
                <strong className="text-foreground">Unidades vinculadas:</strong>
                {linkedUnits.length > 0 ? linkedUnits.map((label) => <Badge key={label} variant="outline">{label}</Badge>) : <span>No se detectaron rutas activas.</span>}
              </div>

              {businessLinks.length > 0 && (
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <WalletCards className="h-3.5 w-3.5 mt-0.5" />
                  {businessLinks.map((link) => (
                    <span key={`${link.unidad}-${link.cuentaNombre}`} className="rounded border px-2 py-1">
                      {UNIT_LABELS[link.unidad] || link.unidad} → {link.cuentaNombre}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {dbError && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 flex gap-2 text-sm">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <span>{dbError}</span>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">En el archivo ARCA</p>
                <p className="text-2xl font-bold tabular-nums">{preview.documents.length}</p>
              </div>
              <button type="button" onClick={() => setDetailKind("new")} className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-left hover:bg-emerald-500/10 transition-colors">
                <p className="text-xs text-muted-foreground">Nuevos para importar</p>
                <p className="text-2xl font-bold tabular-nums text-emerald-600">{reconciliation.newDocuments.length}</p>
                <p className="text-xs text-emerald-700 mt-1">Ver detalle</p>
              </button>
              <button type="button" onClick={() => setDetailKind("existing")} className="rounded-lg border border-sky-500/30 bg-sky-500/5 p-3 text-left hover:bg-sky-500/10 transition-colors">
                <p className="text-xs text-muted-foreground">Ya existen en Reybaud</p>
                <p className="text-2xl font-bold tabular-nums text-sky-600">{reconciliation.existingDocuments.length}</p>
                <p className="text-xs text-sky-700 mt-1">Ver detalle</p>
              </button>
              <button type="button" onClick={() => setDetailKind("mismatch")} className={`rounded-lg border p-3 text-left transition-colors ${reconciliation.mismatches.length ? "border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10" : "hover:bg-muted/30"}`}>
                <p className="text-xs text-muted-foreground">Requieren revisión</p>
                <p className="text-2xl font-bold tabular-nums">{reconciliation.mismatches.length}</p>
                <p className="text-xs text-muted-foreground mt-1">Ver detalle</p>
              </button>
            </div>

            {detail && (
              <div className="rounded-lg border overflow-hidden">
                <div className="flex items-center justify-between gap-3 border-b bg-muted/30 px-3 py-2">
                  <p className="text-sm font-medium">{detail.title}</p>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setDetailKind(null)}>Cerrar detalle</Button>
                </div>
                {detail.rows.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">No hay comprobantes en esta categoría.</p>
                ) : (
                  <div className="relative max-h-[420px] overflow-auto">
                    <div className="min-w-[760px]">
                      <div className="sticky top-0 z-20 grid grid-cols-[90px_130px_130px_1fr_130px_1.4fr] gap-3 border-b bg-card px-3 py-2 text-xs font-medium text-muted-foreground shadow-sm">
                        <span>Fecha</span>
                        <span>Comprobante</span>
                        <span>Número</span>
                        <span>Receptor</span>
                        <span className="text-right">Importe</span>
                        <span>Resultado</span>
                      </div>
                      <div className="divide-y">
                        {detail.rows.map(({ document, note }) => {
                          const info = FISCAL_DOCUMENT_TYPES[document.tipoComprobante];
                          const isCredit = document.clase === "nota_credito";
                          return (
                            <div key={`${document.tipoComprobante}-${document.puntoVenta}-${document.numeroComprobante}`} className="grid grid-cols-[90px_130px_130px_1fr_130px_1.4fr] gap-3 px-3 py-2 text-xs items-center">
                              <span>{shortDate.format(new Date(`${document.fechaEmision}T00:00:00Z`))}</span>
                              <span>{info.label}</span>
                              <span>{fiscalNumber(document)}</span>
                              <span className="truncate" title={document.clienteNombre ?? undefined}>{document.clienteNombre || "—"}</span>
                              <span className="text-right font-medium tabular-nums">{isCredit ? "−" : "+"}{money.format(document.importeTotal)}</span>
                              <span className="text-muted-foreground">{note}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="rounded-lg border p-3 text-xs text-muted-foreground space-y-1">
              <p><strong className="text-foreground">Cómo se compara:</strong> tipo de comprobante + punto de venta + número de comprobante.</p>
              <p>La comparación incluye tanto facturas emitidas por Reybaud como históricos ARCA ya importados.</p>
              <p>Si la identidad fiscal coincide pero el importe no, la importación se bloquea para evitar guardar un conflicto.</p>
              <p><strong>Duplicados dentro del Excel:</strong> {preview.duplicates}. Esta cifra es distinta de “Ya existen en Reybaud”.</p>
            </div>

            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
              <div>
                <p className="font-medium text-sm">Resumen de importación</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Se importarán {reconciliation.newDocuments.length} comprobantes históricos. Se omitirán {reconciliation.existingDocuments.length} porque ya existen en Reybaud. Neto fiscal nuevo estimado: <strong className="text-foreground">{money.format(netoNuevo)}</strong>.
                </p>
              </div>
              <Button type="button" disabled={!canImport} onClick={() => void handleImport()} className="w-full sm:w-auto">
                {importing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Importando…</> : `Importar ${reconciliation.newDocuments.length} comprobantes`}
              </Button>
              {!dbReady && <p className="text-xs text-amber-700">El botón se habilitará cuando la migración fiscal esté disponible en Supabase.</p>}
              {preview.issues.length > 0 && <p className="text-xs text-amber-700">Hay observaciones en el archivo. Resolvelas antes de importar.</p>}
              {reconciliation.mismatches.length > 0 && <p className="text-xs text-amber-700">Hay comprobantes en conflicto. La importación está bloqueada.</p>}
              {dbReady && reconciliation.newDocuments.length === 0 && <p className="text-xs text-muted-foreground">No quedan comprobantes nuevos para importar.</p>}
            </div>

            {importResult && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 flex gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Importación completada.</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Nuevos guardados: {importResult.imported_documents ?? 0}. Omitidos porque ya estaban en facturas: {importResult.skipped_app_documents ?? 0}. Omitidos porque ya estaban en el histórico: {importResult.skipped_historical_documents ?? 0}. Neto incorporado: {money.format(Number(importResult.imported_neto_fiscal ?? 0))}.
                  </p>
                </div>
              </div>
            )}

            <div className="rounded-lg border border-sky-500/30 bg-sky-500/5 p-3 flex gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-sky-600 shrink-0 mt-0.5" />
              La importación histórica no modifica facturas operativas existentes y no envía ningún comprobante a ARCA.
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
