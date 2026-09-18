import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, BedDouble, Loader2 } from "lucide-react";
import { formatPrice } from "@/lib/currency";
import { previewPackageChange, applyPackageChange } from "@/lib/packageChangePreview";
import { resolveHistoricalPrice, recalcBalance, type StageLike } from "@/lib/lodgingChangeOnCancel";

export interface SharedLodgingOccupant {
  id: string;
  nombre: string;
  email: string | null;
  package_id: string | null;
  package_nombre: string;
  amount_total: number;
  amount_paid: number;
  currency: string;
  purchase_date: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  eventId: string;
  eventTitle?: string;
  cancelName: string;
  roomName: string;
  /** Participantes que quedan en el mismo alojamiento. */
  occupants: SharedLodgingOccupant[];
  /** Ejecuta la cancelación real (liberando la plaza). */
  onConfirm: (liberar: boolean) => Promise<void>;
}

interface PackageRow { id: string; nombre: string; }

export default function ResolveSharedLodgingDialog({
  open, onOpenChange, eventId, eventTitle, cancelName, roomName, occupants, onConfirm,
}: Props) {
  const { toast } = useToast();
  const [mode, setMode] = useState<"liberar" | "cambiar">("liberar");
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [stagesByPkg, setStagesByPkg] = useState<Record<string, StageLike[]>>({});
  const [targetByRes, setTargetByRes] = useState<Record<string, string>>({});
  const [motivo, setMotivo] = useState("");
  const [working, setWorking] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode("liberar"); setTargetByRes({}); setMotivo("");
    setLoading(true);
    (async () => {
      const { data: pkgs } = await supabase
        .from("event_packages")
        .select("id, nombre")
        .eq("event_id", eventId)
        .eq("activo", true)
        .order("sort_order");
      const rows = ((pkgs as any[]) || []) as PackageRow[];
      setPackages(rows);
      const ids = rows.map((p) => p.id);
      const extra = occupants.map((o) => o.package_id).filter(Boolean) as string[];
      const all = Array.from(new Set([...ids, ...extra]));
      if (all.length) {
        const { data: st } = await supabase
          .from("event_package_price_stages" as any)
          .select("id, package_id, nombre, precio, currency, vigente_desde, vigente_hasta")
          .in("package_id", all)
          .eq("activo", true);
        const map: Record<string, StageLike[]> = {};
        ((st as any[]) || []).forEach((s) => {
          (map[s.package_id] ||= []).push({
            id: s.id, nombre: s.nombre, precio: Number(s.precio), currency: s.currency,
            vigente_desde: s.vigente_desde, vigente_hasta: s.vigente_hasta,
          });
        });
        setStagesByPkg(map);
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, eventId]);

  const resolutions = useMemo(() => occupants.map((o) => {
    const target = targetByRes[o.id];
    if (!target || target === o.package_id) return { occupant: o, target: null as string | null, price: null as any };
    const price = resolveHistoricalPrice({
      purchaseDate: o.purchase_date,
      originStages: stagesByPkg[o.package_id || ""] || [],
      targetStages: stagesByPkg[target] || [],
      fallbackCurrency: o.currency,
    });
    return { occupant: o, target, price };
  }), [occupants, targetByRes, stagesByPkg]);

  const cambios = resolutions.filter((r) => r.target);
  const bloqueado = cambios.some((r) => r.price && r.price.ok === false);
  const canConfirm = mode === "liberar"
    ? true
    : cambios.length > 0 && !bloqueado && motivo.trim().length > 0;

  const notify = async (
    o: SharedLodgingOccupant, nuevoNombre: string, nuevoTotal: number, currency: string,
  ) => {
    const { total, paid, balance } = recalcBalance(nuevoTotal, o.amount_paid);
    const rows = [
      ["Alojamiento anterior", o.package_nombre],
      ["Alojamiento nuevo", nuevoNombre],
      ["Nuevo total", formatPrice(total, currency)],
      ["Abonado", formatPrice(paid, currency)],
      ["Saldo", formatPrice(balance, currency)],
    ];
    const html = `
      <p>Hola ${o.nombre},</p>
      <p>Te escribimos por un cambio en tu alojamiento${eventTitle ? ` en <strong>${eventTitle}</strong>` : ""}. Se liberó una plaza en la habitación que compartías y reorganizamos tu lugar.</p>
      <table style="border-collapse:collapse;font-size:14px">
        ${rows.map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#6b7280">${k}</td><td style="padding:4px 0"><strong>${v}</strong></td></tr>`).join("")}
      </table>
      <p>Tus pagos ya realizados se mantienen y el saldo quedó recalculado. Cualquier duda, respondé este mail.</p>`;
    const texto = `Hola ${o.nombre}. Cambio de alojamiento: ${o.package_nombre} → ${nuevoNombre}. `
      + `Nuevo total: ${formatPrice(total, currency)} · Abonado: ${formatPrice(paid, currency)} · Saldo: ${formatPrice(balance, currency)}.`;
    await supabase.functions.invoke("notify-reservation", {
      body: {
        reservation_id: o.id,
        tipo: "novedad",
        asunto: "Cambio de alojamiento en tu reserva",
        contenido_html: html,
        contenido_texto: texto,
        metadata: { origen: "cancelacion_alojamiento_compartido", paquete_anterior: o.package_nombre, paquete_nuevo: nuevoNombre },
        idempotency_key: `lodging-change-${o.id}-${Date.now()}`,
      },
    });
  };

  const confirm = async () => {
    setWorking(true);
    try {
      if (mode === "cambiar") {
        for (const r of cambios) {
          if (!r.target || !r.price || r.price.ok !== true) continue;
          const o = r.occupant;
          const precio = r.price.precio;
          const preview = await previewPackageChange(o.id, r.target, null, precio);
          if (preview.status === "no_posible" || !preview.revalidation_token) {
            throw new Error(`No se puede cambiar a ${o.nombre}: ${(preview.blockers || []).join(" · ") || "cambio no posible"}`);
          }
          const nuevoNombre = packages.find((p) => p.id === r.target)?.nombre || "Nuevo alojamiento";
          await applyPackageChange({
            reservationId: o.id,
            packageNuevoId: r.target,
            revalidationToken: preview.revalidation_token,
            overridePlazaLibre: true,
            adminNote: `Cambio por cancelación de ${cancelName} en ${roomName}. Etapa aplicada: ${r.price.stageNombre}. Motivo: ${motivo.trim()}`,
            priceOverride: precio,
          });
          await supabase.from("reservation_status_history" as any).insert({
            reservation_id: o.id,
            changed_by_role: "admin",
            note: `Alojamiento ${o.package_nombre} → ${nuevoNombre} por cancelación de ${cancelName}. Precio histórico etapa "${r.price.stageNombre}": ${formatPrice(precio, r.price.currency)}. Motivo: ${motivo.trim()}`,
          } as any);
          await notify(o, nuevoNombre, precio, r.price.currency);
        }
      }
      await onConfirm(true);
      toast({
        title: mode === "liberar" ? "Plaza liberada" : "Alojamiento reorganizado",
        description: mode === "liberar"
          ? "La plaza vuelve a estar disponible para la venta."
          : "Se aplicó el cambio de paquete y se envió el aviso por email.",
      });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "No se pudo completar", description: e.message, variant: "destructive" });
    } finally {
      setWorking(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!working) onOpenChange(o); }}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            <BedDouble className="w-4 h-4" /> Alojamiento compartido
          </DialogTitle>
          <DialogDescription>
            {cancelName} comparte <strong>{roomName}</strong> con {occupants.length} persona{occupants.length === 1 ? "" : "s"}.
            Antes de cancelar, decidí qué pasa con quienes quedan.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-2">
            {([
              ["liberar", "Liberar la plaza y volver a venderla", "Quienes quedan conservan su paquete y su precio."],
              ["cambiar", "Cambiar el alojamiento de quien queda", "Ej.: Doble → Individual. Se usa el precio de la misma etapa en la que compró."],
            ] as const).map(([value, title, desc]) => (
              <label key={value}
                className={`flex gap-3 rounded-lg border p-3 cursor-pointer ${mode === value ? "border-primary bg-primary/5" : "border-border/60"}`}>
                <input type="radio" className="mt-1" checked={mode === value} onChange={() => setMode(value)} />
                <span>
                  <span className="block text-sm font-medium">{title}</span>
                  <span className="block text-xs text-muted-foreground">{desc}</span>
                </span>
              </label>
            ))}
          </div>

          {mode === "cambiar" && (
            <div className="space-y-3">
              {loading && <div className="flex justify-center py-3"><Loader2 className="w-4 h-4 animate-spin" /></div>}
              {resolutions.map(({ occupant: o, target, price }) => (
                <div key={o.id} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{o.nombre}</span>
                    <Badge variant="outline" className="text-[10px]">{o.package_nombre}</Badge>
                  </div>
                  <div>
                    <Label className="text-xs">Nuevo alojamiento</Label>
                    <Select value={target || ""} onValueChange={(v) => setTargetByRes((s) => ({ ...s, [o.id]: v }))}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Mantener el actual" /></SelectTrigger>
                      <SelectContent>
                        {packages.filter((p) => p.id !== o.package_id).map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {price && price.ok === true && (
                    <div className="rounded bg-muted/40 p-2 text-xs space-y-0.5">
                      <div>Etapa aplicada: <strong>{price.stageNombre}</strong> (la misma en la que compró)</div>
                      <div>Nuevo total: <strong>{formatPrice(price.precio, price.currency)}</strong></div>
                      <div>
                        Abonado: {formatPrice(o.amount_paid, price.currency)} · Saldo:{" "}
                        <strong>{formatPrice(recalcBalance(price.precio, o.amount_paid).balance, price.currency)}</strong>
                      </div>
                    </div>
                  )}
                  {price && price.ok === false && (
                    <div className="flex items-start gap-2 text-xs text-destructive">
                      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {price.message}
                    </div>
                  )}
                </div>
              ))}
              <div>
                <Label className="text-xs">Motivo del cambio *</Label>
                <Textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ej.: se canceló su compañero de habitación" />
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={working}>Volver</Button>
          <Button onClick={confirm} disabled={!canConfirm || working}>
            {working ? <Loader2 className="w-4 h-4 animate-spin" /> : mode === "liberar" ? "Cancelar y liberar plaza" : "Aplicar cambios y cancelar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
