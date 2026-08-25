import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PackageCheck, AlertTriangle } from "lucide-react";
import SupplierOrders from "@/pages/SupplierOrders";
import AdminScanIncidents from "@/pages/admin/AdminScanIncidents";

const AdminControlMercaderia = ({ embedded = false }: { embedded?: boolean }) => {
  const [params, setParams] = useSearchParams();
  const initial = params.get("tab") === "incidentes" ? "incidentes" : "historial";
  const [tab, setTab] = useState(initial);

  const onChange = (v: string) => {
    setTab(v);
    if (embedded) return;
    const next = new URLSearchParams(params);
    next.set("tab", v);
    setParams(next, { replace: true });
  };

  return (
    <div className={embedded ? "space-y-4" : "p-4 md:p-6 space-y-4"}>
      {!embedded && (
        <div>
          <h1 className="text-2xl font-bold">Control de Mercadería</h1>
          <p className="text-sm text-muted-foreground">
            Historial de pedidos a proveedor recibidos e incidentes de escaneo en un solo lugar.
          </p>
        </div>
      )}


      <Tabs value={tab} onValueChange={onChange} className="w-full">
        <TabsList>
          <TabsTrigger value="historial" className="gap-2">
            <PackageCheck className="h-4 w-4" />
            Historial de controles
          </TabsTrigger>
          <TabsTrigger value="incidentes" className="gap-2">
            <AlertTriangle className="h-4 w-4" />
            Incidentes de escaneo
          </TabsTrigger>
        </TabsList>

        <TabsContent value="historial" className="mt-4">
          <SupplierOrders />
        </TabsContent>
        <TabsContent value="incidentes" className="mt-4">
          <AdminScanIncidents />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminControlMercaderia;
