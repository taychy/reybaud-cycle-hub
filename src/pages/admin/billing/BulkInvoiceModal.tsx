import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, AlertTriangle, CheckCircle2, XCircle, ShieldAlert } from "lucide-react";
import { formatPrice } from "@/lib/currency";

interface Emisor {
  id: string;
  nombre_fiscal: string;
  cuit: string;
  punto_venta: number;
  activo: boolean;
  cert_pem?: string | null;
  key_pem?: string | null;
  limite_anual_ars?: number | null;
}

export interface BulkFacturaRow {
  id: string;
  cliente_nombre: string;
  cliente_cuit: string | null;
  condicion_fiscal: string;
  concepto: string;
  monto: number;
  referencia_tipo?: string;
  kind?: "sin_factura" | "error" | "manual";
}

interface DraftRow extends BulkFacturaRow {
  selected: boolean;
  result?: { ok: true; cae: string; numero: string } | { ok: false; error: string };
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  rows: BulkFacturaRow[];
  emisores: Emisor[];
  onDone: () => void;
}

const CONDICIONES = [
  { value: "consumidor_final", label: "Consumidor Final" },
  { value: "monotributista", label: "Monotributista" },
  { value: "resp_inscripto", label: "Responsable Inscripto" },
  { value: "exento", label: "Exento" },
];

const REF_LABELS: Record<string, string> = {
  suscripcion: "Suscripción",
  pedido: "Producto",
  evento: "Evento",
  viaje: "Viaje",
  ajuste: "Ajuste",
  manual: "Manual",
};

function validateRow(d: DraftRow): string | null {
  if (!d.cliente_cuit?.trim()) return "Falta DNI/CUIT";
  if (!d.condicion_fiscal) return "Falta condición fiscal";
  if (!d.monto || Number(d.monto) <= 0) return "Monto inválido";
  return null;
}

export function BulkInvoiceModal({ open, onOpenChange, rows, emisores, onDone }: Props) {
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [emisorId, setEmisorId] = useState<string>("");
  const [cupo, setCupo] = useState<{ disponible: number | null; pct: number | null } | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [overrideCupo, setOverrideCupo] = useState(false);

  // Re-init drafts cuando se abre
  useEffect(() => {
    if (!open) return;
    setDrafts(rows.map((r) => ({ ...r, selected: true })));
    setProgress({ done: 0, total: 0 });
    setOverrideCupo(false);
  }, [open, rows]);

  // Autocompletar DNI faltantes desde alumnos
  useEffect(() => {
    if (!open) return;
    const faltantes = drafts.filter((d) => !d.cliente_cuit);
    if (faltantes.length === 0) return;
    (async () => {
      const nombres = Array.from(new Set(faltantes.map((d) => d.cliente_nombre.trim())));
      const { data } = await supabase
        .from("alumnos")
        .select("nombre, apellido, documento");
      if (!data) return;
      setDrafts((prev) =>
        prev.map((d) => {
          if (d.cliente_cuit) return d;
          const target = d.cliente_nombre.trim().toLowerCase();
          const match = (data as any[]).find((a) => {
            const full = `${a.nombre || ""} ${a.apellido || ""}`.trim().toLowerCase();
            return full === target;
          });
          if (match?.documento) return { ...d, cliente_cuit: match.documento };
          return d;
        })
      );
    })();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cargar cupo disponible cuando cambia emisor
  useEffect(() => {
    setOverrideCupo(false);
    if (!emisorId) { setCupo(null); return; }
    (async () => {
      const { data } = await supabase
        .from("emisor_facturado_anual" as any)
        .select("cupo_disponible, porcentaje_uso")
        .eq("emisor_id", emisorId)
        .maybeSingle();
      setCupo({
        disponible: (data as any)?.cupo_disponible ?? null,
        pct: (data as any)?.porcentaje_uso ?? null,
      });
    })();
  }, [emisorId]);

  const activos = useMemo(() => emisores.filter((e) => e.activo), [emisores]);
  const selectedEmisor = emisores.find((e) => e.id === emisorId);
  const emisorHasCerts = selectedEmisor ? !!(selectedEmisor.cert_pem && selectedEmisor.key_pem) : false;
  const emisorHasCuit = !!selectedEmisor?.cuit;
  const emisorHasPV = !!selectedEmisor?.punto_venta;
  const emisorValido = !!selectedEmisor && emisorHasCerts && emisorHasCuit && emisorHasPV;

  // Solo filas válidas pueden estar seleccionadas
  const validSelected = drafts.filter((d) => d.selected && !validateRow(d));
  const totalSel = validSelected.reduce((a, b) => a + Number(b.monto || 0), 0);
  const supera = cupo?.disponible != null && totalSel > cupo.disponible;
  const cupoOk = !supera || overrideCupo;

  const updateRow = (id: string, patch: Partial<DraftRow>) => {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  };

  const handleEmit = async () => {
    if (!emisorId) { toast.error("Seleccioná un emisor"); return; }
    if (!emisorValido) { toast.error("El emisor no está completo (CUIT / Punto de venta / Certificado AFIP)"); return; }
    if (validSelected.length === 0) { toast.error("No hay filas válidas seleccionadas"); return; }
    if (supera && !overrideCupo) { toast.error("Confirmá el override del cupo para continuar"); return; }


    setRunning(true);
    setProgress({ done: 0, total: validSelected.length });
    let okCount = 0;
    let errCount = 0;

    for (let i = 0; i < validSelected.length; i++) {
      const row = validSelected[i];
      try {
        // Actualizar datos del cliente
        await supabase.from("facturas").update({
          cliente_cuit: row.cliente_cuit?.trim() || null,
          condicion_fiscal: row.condicion_fiscal,
        } as any).eq("id", row.id);

        const { data, error } = await supabase.functions.invoke("emit-factura-afip", {
          body: {
            factura_id: row.id,
            emisor_id: emisorId,
            cliente_cuit: row.cliente_cuit?.trim() || null,
            condicion_fiscal: row.condicion_fiscal,
          },
        });

        if (error || data?.error) {
          let detail = data?.error || error?.message || "Error";
          try {
            const resp = (error as any)?.context?.response;
            if (resp) {
              const body = await resp.clone().json();
              if (body?.error) detail = body.error;
            }
          } catch { /* ignore */ }
          updateRow(row.id, { result: { ok: false, error: detail } });
          errCount++;
        } else {
          updateRow(row.id, { result: { ok: true, cae: data.cae, numero: data.numero_comprobante } });
          okCount++;
        }
      } catch (e: any) {
        updateRow(row.id, { result: { ok: false, error: e?.message || "Error inesperado" } });
        errCount++;
      }
      setProgress({ done: i + 1, total: validSelected.length });
    }

    setRunning(false);
    if (okCount > 0) toast.success(`${okCount} factura(s) emitidas en AFIP`);
    if (errCount > 0) toast.error(`${errCount} con error — revisá el detalle`);
    onDone();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !running && onOpenChange(v)}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading">Facturación masiva en AFIP</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Selector emisor + cupo */}
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Emisor fiscal</label>
              <Select value={emisorId} onValueChange={setEmisorId} disabled={running}>
                <SelectTrigger><SelectValue placeholder="Seleccionar emisor..." /></SelectTrigger>
                <SelectContent>
                  {activos.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.nombre_fiscal} — {e.cuit}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {emisorId && !emisorHasCerts && (
                <div className="flex items-center gap-1.5 text-yellow-500">
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <p className="text-xs">Sin certificado AFIP</p>
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Cupo del emisor (últ. 12 m)</label>
              <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
                {cupo?.disponible != null ? (
                  <>
                    <span className="text-muted-foreground">Disponible: </span>
                    <span className="font-semibold text-foreground">{formatPrice(cupo.disponible, "ARS")}</span>
                    {cupo.pct != null && (
                      <span className="text-muted-foreground"> · usado {cupo.pct.toFixed(1)}%</span>
                    )}
                  </>
                ) : (
                  <span className="text-muted-foreground">Sin tope configurado</span>
                )}
              </div>
            </div>
          </div>

          {/* Avisos del emisor */}
          {emisorId && !emisorValido && (
            <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/5 p-3 flex gap-2">
              <ShieldAlert className="w-4 h-4 text-yellow-600 mt-0.5 shrink-0" />
              <div className="text-xs">
                <p className="font-semibold text-yellow-700">El emisor no está listo para emitir</p>
                <ul className="text-muted-foreground list-disc ml-4 mt-1">
                  {!emisorHasCuit && <li>Falta CUIT</li>}
                  {!emisorHasPV && <li>Falta punto de venta</li>}
                  {!emisorHasCerts && <li>Falta certificado AFIP</li>}
                </ul>
              </div>
            </div>
          )}

          {supera && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-2">
              <div className="flex gap-2">
                <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                <div className="text-xs">
                  <p className="font-semibold text-destructive">El total seleccionado supera el cupo disponible</p>
                  <p className="text-muted-foreground">
                    Total: {formatPrice(totalSel, "ARS")} · Disponible: {formatPrice(cupo!.disponible!, "ARS")}
                  </p>
                  <p className="text-muted-foreground mt-1">
                    El cupo puede estar mal cargado o no aplicar (RI sin tope). Confirmá para continuar.
                  </p>
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs cursor-pointer pl-6">
                <input
                  type="checkbox"
                  checked={overrideCupo}
                  onChange={(e) => setOverrideCupo(e.target.checked)}
                />
                <span className="font-medium text-foreground">
                  Confirmo emitir aunque supere el cupo
                </span>
              </label>
            </div>
          )}

          {/* Tabla */}
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="p-2 text-left w-8">
                      <input
                        type="checkbox"
                        checked={drafts.length > 0 && drafts.every((d) => d.selected)}
                        onChange={(e) =>
                          setDrafts((prev) => prev.map((d) => ({ ...d, selected: e.target.checked })))
                        }
                      />
                    </th>
                    <th className="p-2 text-left">Cliente</th>
                    <th className="p-2 text-left">Origen</th>
                    <th className="p-2 text-left">DNI/CUIT</th>
                    <th className="p-2 text-left">Condición</th>
                    <th className="p-2 text-left">Concepto</th>
                    <th className="p-2 text-right">Monto</th>
                    <th className="p-2 text-left">Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  {drafts.map((d) => {
                    const validationErr = validateRow(d);
                    const isInvalid = !!validationErr;
                    const isManual = d.kind === "manual";
                    return (
                      <tr key={d.id} className={`border-t border-border ${isInvalid ? "bg-destructive/5" : isManual ? "bg-yellow-500/5" : ""}`}>
                        <td className="p-2 align-top">
                          <input
                            type="checkbox"
                            checked={d.selected && !isInvalid}
                            disabled={running || !!d.result || isInvalid}
                            onChange={(e) => updateRow(d.id, { selected: e.target.checked })}
                            title={isInvalid ? validationErr! : ""}
                          />
                        </td>
                        <td className="p-2 align-top font-medium text-foreground">
                          {d.cliente_nombre}
                          {isInvalid && (
                            <p className="text-[10px] text-destructive mt-0.5">{validationErr}</p>
                          )}
                          {isManual && !isInvalid && (
                            <p className="text-[10px] text-yellow-600 mt-0.5">⚠ Posible facturado fuera del sistema</p>
                          )}
                        </td>
                        <td className="p-2 align-top">
                          <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                            {REF_LABELS[d.referencia_tipo || "manual"] || d.referencia_tipo}
                          </span>
                        </td>
                        <td className="p-2 align-top">
                          <Input
                            value={d.cliente_cuit || ""}
                            onChange={(e) => updateRow(d.id, { cliente_cuit: e.target.value })}
                            placeholder="Sin DNI"
                            className="h-7 text-xs"
                            disabled={running || !!d.result}
                          />
                        </td>
                        <td className="p-2 align-top">
                          <Select
                            value={d.condicion_fiscal}
                            onValueChange={(v) => updateRow(d.id, { condicion_fiscal: v })}
                            disabled={running || !!d.result}
                          >
                            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {CONDICIONES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="p-2 align-top text-muted-foreground max-w-[200px] truncate" title={d.concepto}>
                          {d.concepto}
                        </td>
                        <td className="p-2 align-top text-right font-semibold text-foreground">
                          ${Number(d.monto).toLocaleString("es-AR")}
                        </td>
                        <td className="p-2 align-top">
                          {d.result?.ok === true && (
                            <Badge variant="default" className="gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              CAE {d.result.cae}
                            </Badge>
                          )}
                          {d.result?.ok === false && (
                            <Badge variant="destructive" className="gap-1 max-w-[200px]" title={d.result.error}>
                              <XCircle className="w-3 h-3" />
                              <span className="truncate">{d.result.error}</span>
                            </Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Resumen + acción */}
          <div className="flex items-center justify-between gap-3 pt-2 border-t border-border">
            <div className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{validSelected.length}</span> seleccionada(s) ·{" "}
              Total: <span className="font-semibold text-foreground">{formatPrice(totalSel, "ARS")}</span>
              {running && (
                <span className="ml-2">· Emitiendo {progress.done}/{progress.total}</span>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={running}>
                {drafts.some((d) => d.result) ? "Cerrar" : "Cancelar"}
              </Button>
              <Button
                onClick={handleEmit}
                disabled={running || validSelected.length === 0 || !emisorId || !emisorHasCerts}
              >
                {running ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Emitiendo...</>
                ) : (
                  `Emitir ${validSelected.length} en AFIP`
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
