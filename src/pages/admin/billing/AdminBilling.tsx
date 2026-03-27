import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BillingKPIs } from "./BillingKPIs";
import { BillingList } from "./BillingList";
import { BillingEmisores } from "./BillingEmisores";
import { InvoiceModal } from "./InvoiceModal";
import { ManualInvoiceButton } from "./ManualInvoiceButton";

interface Emisor {
  id: string;
  nombre_fiscal: string;
  cuit: string;
  punto_venta: number;
  activo: boolean;
  cert_pem?: string | null;
  key_pem?: string | null;
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
}

export default function AdminBilling() {
  const [facturas, setFacturas] = useState<FacturaRow[]>([]);
  const [emisores, setEmisores] = useState<Emisor[]>([]);
  const [loading, setLoading] = useState(true);
  const [invoiceTarget, setInvoiceTarget] = useState<FacturaRow | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const loadData = useCallback(async () => {
    const [facturasRes, emisoresRes] = await Promise.all([
      supabase
        .from("facturas")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("emisores_fiscales")
        .select("*")
        .order("created_at", { ascending: true }),
    ]);

    setFacturas((facturasRes.data as any[]) || []);
    setEmisores((emisoresRes.data as any[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleGenerarFactura = (factura: FacturaRow) => {
    setInvoiceTarget(factura);
    setModalOpen(true);
  };

  if (loading) {
    return <div className="animate-pulse text-muted-foreground text-center py-12">Cargando facturación...</div>;
  }

  const pendientes = facturas.filter((f) => f.estado === "sin_factura" || f.estado === "error");
  const historial = facturas.filter((f) => f.estado === "emitida");

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

      <Tabs defaultValue="pendientes" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pendientes">
            Pendientes {pendientes.length > 0 && `(${pendientes.length})`}
          </TabsTrigger>
          <TabsTrigger value="historial">
            Historial {historial.length > 0 && `(${historial.length})`}
          </TabsTrigger>
          <TabsTrigger value="todos">Todos</TabsTrigger>
          <TabsTrigger value="emisores">Emisores</TabsTrigger>
        </TabsList>

        <TabsContent value="pendientes">
          <BillingList
            facturas={pendientes}
            emisores={emisores}
            onGenerarFactura={handleGenerarFactura}
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
            onGenerarFactura={handleGenerarFactura}
          />
        </TabsContent>

        <TabsContent value="emisores">
          <BillingEmisores onDataChange={loadData} />
        </TabsContent>
      </Tabs>

      <InvoiceModal
        factura={invoiceTarget}
        emisores={emisores}
        open={modalOpen}
        onOpenChange={setModalOpen}
        onEmitted={loadData}
      />
    </div>
  );
}
