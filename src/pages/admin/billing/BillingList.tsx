import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FileText, Search } from "lucide-react";

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
  estado: string;
  emisor_id: string | null;
  numero_comprobante: string | null;
  fecha_emision: string | null;
  referencia_tipo: string;
  created_at: string;
  cae?: string | null;
  cae_vencimiento?: string | null;
}

interface Props {
  facturas: FacturaRow[];
  emisores: Emisor[];
  filterEstado?: string;
  onGenerarFactura: (factura: FacturaRow) => void;
}

// Devuelve el badge según el estado real: emitida + CAE => AFIP; emitida sin CAE => Manual sin CAE
function getEstadoBadge(f: FacturaRow): { label: string; variant: "default" | "secondary" | "destructive" | "outline"; title?: string } {
  if (f.estado === "emitida") {
    if (f.cae) {
      return { label: "Facturada AFIP", variant: "default", title: `CAE ${f.cae}` };
    }
    return { label: "Manual · sin CAE", variant: "secondary", title: "Registro interno. No fue autorizada por AFIP." };
  }
  if (f.estado === "error") return { label: "Error", variant: "destructive" };
  return { label: "Sin facturar", variant: "outline" };
}

const REF_LABELS: Record<string, string> = {
  suscripcion: "Suscripción",
  pedido: "Pedido",
  manual: "Manual",
};

export function BillingList({ facturas, emisores, filterEstado, onGenerarFactura }: Props) {
  const [search, setSearch] = useState("");
  const [estadoFilter, setEstadoFilter] = useState(filterEstado || "todos");
  const [emisorFilter, setEmisorFilter] = useState("todos");

  const filtered = facturas.filter((f) => {
    if (estadoFilter !== "todos" && f.estado !== estadoFilter) return false;
    if (emisorFilter !== "todos" && f.emisor_id !== emisorFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !f.cliente_nombre.toLowerCase().includes(q) &&
        !f.concepto.toLowerCase().includes(q) &&
        !(f.numero_comprobante || "").toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  const emisorMap = new Map(emisores.map((e) => [e.id, e.nombre_fiscal]));

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar cliente, concepto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={estadoFilter} onValueChange={setEstadoFilter}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="sin_factura">Sin facturar</SelectItem>
            <SelectItem value="emitida">Facturada</SelectItem>
            <SelectItem value="error">Error</SelectItem>
          </SelectContent>
        </Select>
        <Select value={emisorFilter} onValueChange={setEmisorFilter}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Emisor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los emisores</SelectItem>
            {emisores.map((e) => (
              <SelectItem key={e.id} value={e.id}>{e.nombre_fiscal}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No hay registros</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((f) => {
            const badge = ESTADO_BADGES[f.estado] || ESTADO_BADGES.sin_factura;
            const fecha = new Date(f.created_at).toLocaleDateString("es-AR", {
              day: "numeric", month: "short", year: "numeric",
            });

            return (
              <div
                key={f.id}
                className="rounded-xl border border-border bg-card p-4 flex flex-col sm:flex-row sm:items-center gap-3"
              >
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-foreground">{f.cliente_nombre}</p>
                    <Badge variant={badge.variant} className="text-[10px]">{badge.label}</Badge>
                    <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                      {REF_LABELS[f.referencia_tipo] || f.referencia_tipo}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{f.concepto}</p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{fecha}</span>
                    <span className="font-semibold text-foreground">
                      ${f.monto.toLocaleString("es-AR")}
                    </span>
                    {f.emisor_id && (
                      <span className="text-primary">
                        {emisorMap.get(f.emisor_id) || "—"}
                      </span>
                    )}
                    {f.numero_comprobante && (
                      <span>Nº {f.numero_comprobante}</span>
                    )}
                  </div>
                </div>
                <div className="shrink-0">
                  {f.estado === "sin_factura" || f.estado === "error" ? (
                    <Button size="sm" onClick={() => onGenerarFactura(f)}>
                      <FileText className="w-4 h-4 mr-1" /> Generar factura
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" disabled>
                      <FileText className="w-4 h-4 mr-1" /> Facturada
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
