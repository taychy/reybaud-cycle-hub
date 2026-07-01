import { formatPrice } from "@/lib/currency";
import type { PackageChangePreview } from "@/lib/packageChangePreview";
import { statusColor, statusLabel } from "@/lib/packageChangePreview";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Info, XCircle, Home, ArrowRight } from "lucide-react";

interface Props {
  preview: PackageChangePreview | null;
  loading?: boolean;
}

export default function PackageChangePreviewCard({ preview, loading }: Props) {
  if (loading) {
    return <div className="text-xs text-muted-foreground animate-pulse">Calculando impacto…</div>;
  }
  if (!preview) return null;

  const pa = preview.package_actual;
  const pn = preview.package_nuevo;
  const currency = pn?.currency || "ARS";

  return (
    <div className="space-y-3 rounded-md border border-border bg-card/40 p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <Badge variant="outline" className={statusColor(preview.status)}>
          {statusLabel(preview.status)}
        </Badge>
        {preview.clasificacion && (
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {preview.clasificacion.replace(/_/g, " ")}
          </span>
        )}
      </div>

      {preview.status === "no_posible" && (
        <div className="space-y-1">
          {(preview.blockers || []).map((b, i) => (
            <p key={i} className="flex items-start gap-2 text-xs text-destructive">
              <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>{b}</span>
            </p>
          ))}
        </div>
      )}

      {pa && pn && preview.status !== "no_posible" && (
        <>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-xs">
            <div className="text-right">
              <p className="text-muted-foreground">Actual</p>
              <p className="font-medium">{pa.nombre}</p>
              <p className="text-muted-foreground">{formatPrice(pa.precio_pagado_reserva, currency as any)}</p>
            </div>
            <ArrowRight className="w-4 h-4 text-primary" />
            <div>
              <p className="text-muted-foreground">Nuevo</p>
              <p className="font-medium">{pn.nombre}</p>
              <p className="text-muted-foreground">
                {formatPrice(pn.precio_aplicable, currency as any)}
                {pn.etapa_vigente && <span className="ml-1 text-[10px]">({pn.etapa_vigente})</span>}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-border">
            <div>
              <p className="text-muted-foreground">Ya pagado</p>
              <p className="font-medium">{formatPrice(preview.amount_paid || 0, currency as any)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Diferencia</p>
              <p className={
                (preview.difference ?? 0) > 0 ? "text-amber-400 font-medium" :
                (preview.difference ?? 0) < 0 ? "text-emerald-400 font-medium" :
                "font-medium"
              }>
                {(preview.difference ?? 0) > 0 ? "+" : ""}
                {formatPrice(preview.difference || 0, currency as any)}
              </p>
            </div>
            {(preview.credit_to_create ?? 0) > 0 && (
              <div className="col-span-2">
                <p className="text-muted-foreground">Crédito a generar</p>
                <p className="text-emerald-400 font-medium">
                  {formatPrice(preview.credit_to_create!, currency as any)}
                </p>
              </div>
            )}
            {(preview.debit_to_create ?? 0) > 0 && (
              <div className="col-span-2">
                <p className="text-muted-foreground">Débito a cobrar</p>
                <p className="text-amber-400 font-medium">
                  {formatPrice(preview.debit_to_create!, currency as any)}
                </p>
              </div>
            )}
          </div>

          {preview.room_impact && (
            <div className="pt-2 border-t border-border text-xs space-y-1">
              <p className="flex items-center gap-1 text-muted-foreground">
                <Home className="w-3 h-3" /> Impacto en alojamiento
              </p>
              {(preview.room_impact.razones || []).length === 0 ? (
                <p className="text-emerald-400/80">Sin impacto en habitaciones</p>
              ) : (
                (preview.room_impact.razones || []).map((r, i) => (
                  <p key={i} className="text-amber-400/90">• {r}</p>
                ))
              )}
            </div>
          )}

          {(preview.warnings || []).length > 0 && (
            <div className="pt-2 border-t border-border space-y-1">
              {preview.warnings!.map((w, i) => (
                <p key={i} className="flex items-start gap-2 text-xs text-amber-400/90">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>{w}</span>
                </p>
              ))}
            </div>
          )}

          {preview.days_to_event != null && (
            <p className="flex items-center gap-1 text-[10px] text-muted-foreground pt-1 border-t border-border">
              <Info className="w-3 h-3" /> Faltan {preview.days_to_event} días para el evento
            </p>
          )}
        </>
      )}
    </div>
  );
}
