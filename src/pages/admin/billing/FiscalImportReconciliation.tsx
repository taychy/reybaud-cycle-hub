import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Link2, Loader2, Store, WalletCards } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import type { ArcaImportPreview } from "@/lib/arca-comprobantes-import";
import {
  normalizeCuit,
  reconcileArcaWithReybaud,
  type FiscalReconciliation,
  type ReybaudFiscalInvoiceLike,
} from "@/lib/fiscal-reconciliation";

interface Props {
  preview: ArcaImportPreview;
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

function formatCuit(value: string): string {
  const digits = normalizeCuit(value);
  if (digits.length !== 11) return value;
  return `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}`;
}

export function FiscalImportReconciliation({ preview }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [emisor, setEmisor] = useState<EmisorContext | null>(null);
  const [businessLinks, setBusinessLinks] = useState<BusinessLink[]>([]);
  const [reconciliation, setReconciliation] = useState<FiscalReconciliation | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      setEmisor(null);
      setBusinessLinks([]);
      setReconciliation(null);

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

      const [facturasRes, routingRes, cuentasRes] = await Promise.all([
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
      ]);

      if (cancelled) return;
      if (facturasRes.error) {
        setError(`No se pudieron consultar las facturas existentes: ${facturasRes.error.message}`);
        setLoading(false);
        return;
      }

      const facturas = (facturasRes.data as ReybaudFiscalInvoiceLike[] | null) ?? [];
      setReconciliation(reconcileArcaWithReybaud(preview.documents, facturas));

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
  }, [preview]);

  const linkedUnits = useMemo(() => {
    const units = [...new Set(businessLinks.map((link) => link.unidad))];
    return units.map((unit) => UNIT_LABELS[unit] || unit);
  }, [businessLinks]);

  return (
    <Card className="border-sky-500/30">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Link2 className="h-4 w-4" />
          Cruce con Reybaud — solo lectura
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Buscando el emisor y comparando contra las facturas ya emitidas…
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

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">En el archivo ARCA</p>
                <p className="text-2xl font-bold tabular-nums">{preview.documents.length}</p>
              </div>
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
                <p className="text-xs text-muted-foreground">Nuevos para importar</p>
                <p className="text-2xl font-bold tabular-nums text-emerald-600">{reconciliation.newDocuments.length}</p>
              </div>
              <div className="rounded-lg border border-sky-500/30 bg-sky-500/5 p-3">
                <p className="text-xs text-muted-foreground">Ya existen en Reybaud</p>
                <p className="text-2xl font-bold tabular-nums text-sky-600">{reconciliation.existingDocuments.length}</p>
              </div>
              <div className={`rounded-lg border p-3 ${reconciliation.mismatches.length ? "border-amber-500/30 bg-amber-500/5" : ""}`}>
                <p className="text-xs text-muted-foreground">Requieren revisión</p>
                <p className="text-2xl font-bold tabular-nums">{reconciliation.mismatches.length}</p>
              </div>
            </div>

            <div className="rounded-lg border p-3 text-xs text-muted-foreground space-y-1">
              <p><strong className="text-foreground">Cómo se compara:</strong> tipo de comprobante + punto de venta + número de comprobante.</p>
              <p>Si la identidad fiscal coincide pero el importe no, el registro se manda a revisión y no se considera duplicado seguro.</p>
              <p><strong>Duplicados dentro del Excel:</strong> {preview.duplicates}. Esta cifra es distinta de “Ya existen en Reybaud”.</p>
            </div>

            {reconciliation.mismatches.length > 0 && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  Comprobantes para revisar antes de importar
                </div>
                <div className="space-y-1 text-xs text-muted-foreground">
                  {reconciliation.mismatches.slice(0, 8).map((item) => (
                    <p key={`${item.document.tipoComprobante}-${item.document.puntoVenta}-${item.document.numeroComprobante}`}>
                      {String(item.document.puntoVenta).padStart(4, "0")}-{String(item.document.numeroComprobante).padStart(8, "0")}: {item.reason}
                    </p>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 flex gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              Este cruce es solo de lectura. Todavía no se guardó ni modificó ningún comprobante.
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
