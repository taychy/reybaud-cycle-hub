import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { FileText, Search, Layers, Download, Mail, Loader2 } from "lucide-react";
import { formatPrice } from "@/lib/currency";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Emisor {
  id: string;
  nombre_fiscal: string;
  cuit: string;
  activo: boolean;
  punto_venta: number;
}

interface FacturaRow {
  id: string;
  cliente_nombre: string;
  cliente_cuit: string | null;
  condicion_fiscal: string;
  concepto: string;
  monto: number;
  moneda?: string | null;
  estado: string;
  emisor_id: string | null;
  numero_comprobante: string | null;
  fecha_emision: string | null;
  referencia_tipo: string;
  created_at: string;
  cae?: string | null;
  cae_vencimiento?: string | null;
  metodo_pago?: string | null;
  origen_registro?: string | null;
}

const METODO_LABELS: Record<string, string> = {
  mercadopago: "Mercado Pago",
  transferencia: "Transferencia",
  efectivo: "Efectivo",
  otro: "Otro",
};

// Agrupamiento de orígenes para los filtros visibles
const ORIGEN_APP_VALUES = ["autogestion", "automatico", "informado_alumno", "mp_link"];
const ORIGEN_ADMIN_VALUES = ["cargado_admin", "manual"];

const ORIGEN_LABELS: Record<string, string> = {
  autogestion: "App del alumno",
  automatico: "App · MP automático",
  informado_alumno: "App · informado por alumno",
  mp_link: "App · link MP",
  cargado_admin: "Cargado por admin",
  manual: "Manual",
};


interface Props {
  facturas: FacturaRow[];
  emisores: Emisor[];
  filterEstado?: string;
  enableBulk?: boolean;
  onGenerarFactura: (factura: FacturaRow) => void;
  onBulkRequest?: (rows: FacturaRow[]) => void;
}

function isFacturable(f: FacturaRow): boolean {
  if (f.estado === "sin_factura") return true;
  if (f.estado === "error") return true;
  if (f.estado === "emitida" && !f.cae) return true; // manual sin CAE
  return false;
}

function facturableKind(f: FacturaRow): "sin_factura" | "error" | "manual" | null {
  if (f.estado === "sin_factura") return "sin_factura";
  if (f.estado === "error") return "error";
  if (f.estado === "emitida" && !f.cae) return "manual";
  return null;
}

function getEstadoBadge(f: FacturaRow): { label: string; variant: "default" | "secondary" | "destructive" | "outline"; title?: string } {
  if (f.estado === "emitida") {
    if (f.cae) return { label: "Facturada AFIP", variant: "default", title: `CAE ${f.cae}` };
    return { label: "Manual · sin CAE", variant: "secondary", title: "Registro interno. No fue autorizada por AFIP." };
  }
  if (f.estado === "error") return { label: "Error", variant: "destructive" };
  return { label: "Sin facturar", variant: "outline" };
}

const REF_LABELS: Record<string, string> = {
  suscripcion: "Suscripción",
  pedido: "Producto",
  evento: "Evento",
  viaje: "Viaje",
  ajuste: "Ajuste",
  manual: "Manual",
};

export function BillingList({ facturas, emisores, filterEstado, enableBulk, onGenerarFactura, onBulkRequest }: Props) {
  const [search, setSearch] = useState("");
  const [estadoFilter, setEstadoFilter] = useState(filterEstado || "todos");
  const [emisorFilter, setEmisorFilter] = useState("todos");
  const [metodoFilter, setMetodoFilter] = useState("todos");
  const [origenFilter, setOrigenFilter] = useState("todos");
  const [monedaFilter, setMonedaFilter] = useState("todos");

  // Filtros configurables del bulk
  const [includeSinFactura, setIncludeSinFactura] = useState(true);
  const [includeError, setIncludeError] = useState(true);
  const [includeManual, setIncludeManual] = useState(true);

  const [busyId, setBusyId] = useState<string | null>(null);

  const handleDownload = async (id: string) => {
    setBusyId(id + ":pdf");
    try {
      const { data, error } = await supabase.functions.invoke("generate-factura-pdf", { body: { factura_id: id } });
      if (error) throw error;
      const url = (data as any)?.signed_url;
      if (!url) throw new Error("Sin URL");
      window.open(url, "_blank");
    } catch (e: any) {
      toast.error("Error al generar PDF", { description: e.message });
    } finally { setBusyId(null); }
  };

  const handleResend = async (id: string) => {
    setBusyId(id + ":mail");
    try {
      const { data, error } = await supabase.functions.invoke("send-factura-email", { body: { factura_id: id } });
      if (error || (data as any)?.error) throw new Error(error?.message || (data as any).error);
      toast.success("Email enviado al alumno");
    } catch (e: any) {
      toast.error("Error al enviar email", { description: e.message });
    } finally { setBusyId(null); }
  };


  // Monedas presentes en el dataset actual
  const monedasDisponibles = useMemo(() => {
    const set = new Set<string>();
    facturas.forEach((f) => set.add((f.moneda || "ARS").toUpperCase()));
    return Array.from(set).sort();
  }, [facturas]);

  const filtered = useMemo(() => {
    return facturas.filter((f) => {
      if (estadoFilter !== "todos" && f.estado !== estadoFilter) return false;
      if (emisorFilter !== "todos" && f.emisor_id !== emisorFilter) return false;
      if (monedaFilter !== "todos" && (f.moneda || "ARS").toUpperCase() !== monedaFilter) return false;
      if (metodoFilter !== "todos") {
        const m = (f.metodo_pago || "sin_dato").toLowerCase();
        if (metodoFilter === "sin_dato" ? !!f.metodo_pago : m !== metodoFilter) return false;
      }
      if (origenFilter !== "todos") {
        const o = f.origen_registro || "sin_dato";
        if (origenFilter === "sin_dato") {
          if (!!f.origen_registro) return false;
        } else if (origenFilter === "app") {
          if (!ORIGEN_APP_VALUES.includes(o)) return false;
        } else if (origenFilter === "admin") {
          if (!ORIGEN_ADMIN_VALUES.includes(o)) return false;
        }
      }
      if (search) {
        const q = search.toLowerCase();
        if (
          !f.cliente_nombre.toLowerCase().includes(q) &&
          !f.concepto.toLowerCase().includes(q) &&
          !(f.numero_comprobante || "").toLowerCase().includes(q)
        ) return false;
      }
      if (enableBulk) {
        const k = facturableKind(f);
        if (k === "sin_factura" && !includeSinFactura) return false;
        if (k === "error" && !includeError) return false;
        if (k === "manual" && !includeManual) return false;
      }
      return true;
    });
  }, [facturas, estadoFilter, emisorFilter, monedaFilter, metodoFilter, origenFilter, search, enableBulk, includeSinFactura, includeError, includeManual]);


  const emisorMap = new Map(emisores.map((e) => [e.id, e.nombre_fiscal]));
  const facturablesVisibles = filtered.filter(isFacturable);
  const allChecked = facturablesVisibles.length > 0 && facturablesVisibles.every((f) => selected.has(f.id));
  const selectedRows = facturablesVisibles.filter((f) => selected.has(f.id));
  const totalSelected = selectedRows.reduce((a, b) => a + Number(b.monto || 0), 0);

  const toggleAll = (checked: boolean) => {
    const next = new Set(selected);
    facturablesVisibles.forEach((f) => {
      if (checked) next.add(f.id);
      else next.delete(f.id);
    });
    setSelected(next);
  };

  const toggleOne = (id: string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(id); else next.delete(id);
    setSelected(next);
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar cliente, concepto..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={estadoFilter} onValueChange={setEstadoFilter}>
          <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Estado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="sin_factura">Sin facturar</SelectItem>
            <SelectItem value="emitida">Facturada AFIP / Manual</SelectItem>
            <SelectItem value="error">Error</SelectItem>
          </SelectContent>
        </Select>
        <Select value={emisorFilter} onValueChange={setEmisorFilter}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Emisor" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los emisores</SelectItem>
            {emisores.map((e) => <SelectItem key={e.id} value={e.id}>{e.nombre_fiscal}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={metodoFilter} onValueChange={setMetodoFilter}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Método de pago" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los métodos</SelectItem>
            <SelectItem value="mercadopago">Mercado Pago</SelectItem>
            <SelectItem value="transferencia">Transferencia</SelectItem>
            <SelectItem value="efectivo">Efectivo</SelectItem>
            <SelectItem value="otro">Otro</SelectItem>
            <SelectItem value="sin_dato">Sin dato</SelectItem>
          </SelectContent>
        </Select>
        <Select value={origenFilter} onValueChange={setOrigenFilter}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Origen" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los orígenes</SelectItem>
            <SelectItem value="app">App del alumno</SelectItem>
            <SelectItem value="admin">Cargado por admin</SelectItem>
            <SelectItem value="sin_dato">Sin dato</SelectItem>
          </SelectContent>
        </Select>
        <Select value={monedaFilter} onValueChange={setMonedaFilter}>
          <SelectTrigger className="w-full sm:w-32"><SelectValue placeholder="Moneda" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas las monedas</SelectItem>
            {monedasDisponibles.map((m) => (
              <SelectItem key={m} value={m}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>


      {/* Filtros de facturables */}
      {enableBulk && (
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground rounded-lg border border-dashed border-border px-3 py-2">
          <span className="font-medium">Mostrar facturables:</span>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <Checkbox checked={includeSinFactura} onCheckedChange={(v) => setIncludeSinFactura(!!v)} />
            <span>Sin facturar</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <Checkbox checked={includeError} onCheckedChange={(v) => setIncludeError(!!v)} />
            <span>Con error AFIP</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <Checkbox checked={includeManual} onCheckedChange={(v) => setIncludeManual(!!v)} />
            <span>Manual sin CAE</span>
          </label>
        </div>
      )}

      {/* Select all */}
      {enableBulk && facturablesVisibles.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
          <Checkbox checked={allChecked} onCheckedChange={(v) => toggleAll(!!v)} />
          <span>Seleccionar todas las visibles facturables ({facturablesVisibles.length})</span>
        </div>
      )}

      {/* List */}
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No hay registros</p>
      ) : (
        <div className="space-y-2 pb-20">
          {filtered.map((f) => {
            const badge = getEstadoBadge(f);
            const isAfip = f.estado === "emitida" && !!f.cae;
            const isManualSinCae = f.estado === "emitida" && !f.cae;
            const facturable = isFacturable(f);
            const isChecked = selected.has(f.id);
            const fecha = new Date(f.created_at).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" });

            return (
              <div key={f.id} className="rounded-xl border border-border bg-card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                {enableBulk && facturable && (
                  <Checkbox checked={isChecked} onCheckedChange={(v) => toggleOne(f.id, !!v)} className="shrink-0" />
                )}
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-foreground">{f.cliente_nombre}</p>
                    <Badge variant={badge.variant} className="text-[10px]" title={badge.title}>{badge.label}</Badge>
                    <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                      {REF_LABELS[f.referencia_tipo] || f.referencia_tipo}
                    </span>
                    {f.metodo_pago && (
                      <span className="text-[10px] text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded">
                        {METODO_LABELS[f.metodo_pago] || f.metodo_pago}
                        {f.origen_registro ? ` · ${ORIGEN_LABELS[f.origen_registro] || f.origen_registro}` : ""}
                      </span>
                    )}
                    {isManualSinCae && (
                      <span
                        className="text-[10px] text-yellow-600 bg-yellow-500/10 border border-yellow-500/30 px-1.5 py-0.5 rounded"
                        title="Podría haber sido facturado fuera del sistema. Revisá antes de emitir."
                      >
                        ⚠ revisar
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{f.concepto}</p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                    <span>{fecha}</span>
                    <span className="font-semibold text-foreground">{formatPrice(Number(f.monto || 0), (f.moneda || "ARS") as any)}</span>
                    {f.emisor_id && <span className="text-primary">{emisorMap.get(f.emisor_id) || "—"}</span>}
                    {f.numero_comprobante && <span>Nº {f.numero_comprobante}</span>}
                    {isAfip && f.cae && <span className="text-emerald-500">CAE {f.cae}</span>}
                  </div>
                </div>
                <div className="shrink-0">
                  {facturable ? (
                    <Button size="sm" onClick={() => onGenerarFactura(f)}>
                      <FileText className="w-4 h-4 mr-1" />
                      {isManualSinCae ? "Emitir en AFIP" : "Generar factura"}
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" disabled>
                      <FileText className="w-4 h-4 mr-1" /> Facturada AFIP
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Barra fija de bulk */}
      {enableBulk && selectedRows.length > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 rounded-2xl border border-border bg-card shadow-2xl px-4 py-3 flex items-center gap-4">
          <div className="text-sm">
            <span className="font-bold text-foreground">{selectedRows.length}</span>
            <span className="text-muted-foreground"> seleccionada(s) · </span>
            <span className="font-bold text-foreground">{formatPrice(totalSelected, "ARS")}</span>
          </div>
          <Button size="sm" onClick={() => onBulkRequest?.(selectedRows)}>
            <Layers className="w-4 h-4 mr-1" />
            Previsualizar y facturar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Limpiar
          </Button>
        </div>
      )}
    </div>
  );
}
