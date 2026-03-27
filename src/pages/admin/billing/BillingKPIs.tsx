import { FileText, AlertCircle, CheckCircle2, Building2 } from "lucide-react";

interface Factura {
  estado: string;
  fecha_emision: string | null;
  emisor_id: string | null;
  created_at: string;
}

interface Emisor {
  id: string;
  nombre_fiscal: string;
}

interface Props {
  facturas: Factura[];
  emisores: Emisor[];
}

export function BillingKPIs({ facturas, emisores }: Props) {
  const today = new Date().toISOString().split("T")[0];

  const pagosHoy = facturas.filter(
    (f) => f.created_at.startsWith(today)
  ).length;

  const sinFacturar = facturas.filter((f) => f.estado === "sin_factura").length;

  const emitidasHoy = facturas.filter(
    (f) => f.estado === "emitida" && f.fecha_emision?.startsWith(today)
  ).length;

  const porEmisor = emisores.map((e) => ({
    nombre: e.nombre_fiscal,
    count: facturas.filter((f) => f.emisor_id === e.id && f.estado === "emitida").length,
  }));

  const kpis = [
    { label: "Pagos del día", value: pagosHoy, icon: FileText, color: "text-primary" },
    { label: "Sin facturar", value: sinFacturar, icon: AlertCircle, color: "text-orange-500" },
    { label: "Emitidas hoy", value: emitidasHoy, icon: CheckCircle2, color: "text-emerald-500" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {kpis.map((k) => (
        <div key={k.label} className="rounded-xl border border-border bg-card p-4 space-y-1">
          <div className="flex items-center gap-2">
            <k.icon className={`w-4 h-4 ${k.color}`} />
            <span className="text-xs text-muted-foreground">{k.label}</span>
          </div>
          <p className="text-2xl font-heading font-bold text-foreground">{k.value}</p>
        </div>
      ))}
      {porEmisor.map((e) => (
        <div key={e.nombre} className="rounded-xl border border-border bg-card p-4 space-y-1">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground truncate">{e.nombre}</span>
          </div>
          <p className="text-2xl font-heading font-bold text-foreground">{e.count}</p>
        </div>
      ))}
    </div>
  );
}
