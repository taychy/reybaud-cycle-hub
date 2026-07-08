import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BillingKPIs } from "./BillingKPIs";
import { BillingList } from "./BillingList";
import { BillingEmisores } from "./BillingEmisores";
import { BillingCuentasMP } from "./BillingCuentasMP";
import { PendingPaymentsList } from "./PendingPaymentsList";
import { BillingEmisorSummary } from "./BillingEmisorSummary";
import { InvoiceModal } from "./InvoiceModal";
import { ManualInvoiceButton } from "./ManualInvoiceButton";
import { SyncMpFeesButton } from "./SyncMpFeesButton";
import { BulkInvoiceModal, BulkFacturaRow } from "./BulkInvoiceModal";

interface Emisor {
  id: string;
  nombre_fiscal: string;
  cuit: string;
  punto_venta: number;
  activo: boolean;
  tiene_credenciales?: boolean;
  limite_anual_ars?: number | null;
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
  referencia_id: string | null;
  created_at: string;
  cae?: string | null;
}

export default function AdminBilling() {
  const [facturas, setFacturas] = useState<FacturaRow[]>([]);
  const [emisores, setEmisores] = useState<Emisor[]>([]);
  const [loading, setLoading] = useState(true);
  const [invoiceTarget, setInvoiceTarget] = useState<FacturaRow | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkRows, setBulkRows] = useState<BulkFacturaRow[]>([]);
  const [summaryKey, setSummaryKey] = useState(0);

  const loadData = useCallback(async () => {
    const [facturasRes, emisoresRes] = await Promise.all([
      supabase.from("facturas").select("*").order("created_at", { ascending: false }).limit(500),
      supabase.from("emisores_fiscales").select("id, nombre_fiscal, cuit, punto_venta, activo, tiene_credenciales, limite_anual_ars").order("created_at", { ascending: true }),
    ]);
    setFacturas((facturasRes.data as any[]) || []);
    setEmisores((emisoresRes.data as any[]) || []);
    setSummaryKey((k) => k + 1);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleGenerarFactura = (factura: FacturaRow) => {
    setInvoiceTarget(factura);
    setModalOpen(true);
  };

  const handleBulkRequest = (rows: FacturaRow[]) => {
    setBulkRows(rows.map((r) => {
      const kind: "sin_factura" | "error" | "manual" =
        r.estado === "sin_factura" ? "sin_factura"
        : r.estado === "error" ? "error"
        : "manual";
      return {
        id: r.id,
        cliente_nombre: r.cliente_nombre,
        cliente_cuit: r.cliente_cuit,
        condicion_fiscal: r.condicion_fiscal || "consumidor_final",
        concepto: r.concepto,
        monto: r.monto,
        referencia_tipo: r.referencia_tipo,
        kind,
      };
    }));
    setBulkOpen(true);
  };

  if (loading) {
    return <div className="animate-pulse text-muted-foreground text-center py-12">Cargando facturación...</div>;
  }

  // Set de referencias que YA tienen una factura emitida con CAE (para deduplicar placeholders huérfanos)
  const refsConCAE = new Set<string>();
  facturas.forEach((f) => {
    if (f.estado === "emitida" && f.cae && f.referencia_id) {
      refsConCAE.add(`${f.referencia_tipo}:${f.referencia_id}`);
    }
  });

  const pendientes = facturas.filter((f) => {
    const isPending = f.estado === "sin_factura" || f.estado === "error" || (f.estado === "emitida" && !f.cae);
    if (!isPending) return false;
    // Ocultar si ya hay otra factura emitida con CAE para el mismo cobro
    if (f.referencia_id && refsConCAE.has(`${f.referencia_tipo}:${f.referencia_id}`)) return false;
    return true;
  });
  const historial = facturas.filter((f) => f.estado === "emitida" && f.cae);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-heading font-bold text-foreground">Facturación</h1>
          <p className="text-sm text-muted-foreground">Gestión de facturas y emisores fiscales</p>
        </div>
        <ManualInvoiceButton emisores={emisores} onCreated={loadData} />
      </div>

      <BillingKPIs facturas={facturas} emisores={emisores} />

      <BillingEmisorSummary refreshKey={summaryKey} />

      <Tabs defaultValue="pagos_sin_facturar" className="space-y-4">
        <TabsList>
          <TabsTrigger
            value="pagos_sin_facturar"
            title="Pagos cobrados que todavía no tienen factura creada en el sistema"
          >
            Cobros a facturar
          </TabsTrigger>
          <TabsTrigger
            value="pendientes"
            title="Facturas ya creadas en el sistema pero aún sin CAE emitido en AFIP"
          >
            Sin emitir en AFIP {pendientes.length > 0 && `(${pendientes.length})`}
          </TabsTrigger>
          <TabsTrigger
            value="historial"
            title="Facturas con CAE ya emitido en AFIP"
          >
            Emitidas {historial.length > 0 && `(${historial.length})`}
          </TabsTrigger>
          <TabsTrigger value="todos">Todas</TabsTrigger>
          <TabsTrigger value="emisores">Emisores</TabsTrigger>
          <TabsTrigger value="cuentas_mp">Cuentas MP</TabsTrigger>
        </TabsList>

        <TabsContent value="pagos_sin_facturar">
          <PendingPaymentsList />
        </TabsContent>

        <TabsContent value="pendientes">
          <BillingList
            facturas={pendientes}
            emisores={emisores}
            enableBulk
            onGenerarFactura={handleGenerarFactura}
            onBulkRequest={handleBulkRequest}
          />
        </TabsContent>

        <TabsContent value="historial">
          <BillingList
            facturas={historial}
            emisores={emisores}
            filterEstado="emitida"
            onGenerarFactura={handleGenerarFactura}
          />
        </TabsContent>

        <TabsContent value="todos">
          <BillingList
            facturas={facturas}
            emisores={emisores}
            enableBulk
            onGenerarFactura={handleGenerarFactura}
            onBulkRequest={handleBulkRequest}
          />
        </TabsContent>

        <TabsContent value="emisores">
          <BillingEmisores onDataChange={loadData} />
        </TabsContent>

        <TabsContent value="cuentas_mp">
          <BillingCuentasMP />
        </TabsContent>
      </Tabs>

      <InvoiceModal
        factura={invoiceTarget}
        emisores={emisores}
        open={modalOpen}
        onOpenChange={setModalOpen}
        onEmitted={loadData}
      />

      <BulkInvoiceModal
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        rows={bulkRows}
        emisores={emisores}
        onDone={loadData}
      />
    </div>
  );
}
