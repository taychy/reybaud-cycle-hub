import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Truck, Users, PackageCheck } from "lucide-react";
import SupplierOrders from "@/pages/SupplierOrders";
import StoreSuppliers from "./StoreSuppliers";
import AdminControlMercaderia from "@/pages/admin/AdminControlMercaderia";

type Tab = "pedidos" | "proveedores" | "control";

/** Pedidos a proveedor + Proveedores + Control de mercadería unificados. */
const StorePedidosProveedorHub = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get("tab");
  const tab: Tab =
    raw === "proveedores" ? "proveedores" : raw === "control" ? "control" : "pedidos";

  const onChange = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value === "pedidos") next.delete("tab");
    else next.set("tab", value);
    setSearchParams(next, { replace: true });
  };

  return (
    <Tabs value={tab} onValueChange={onChange} className="w-full space-y-4">
      <TabsList className="bg-secondary">
        <TabsTrigger value="pedidos" className="gap-1.5">
          <Truck className="w-4 h-4" /> Pedidos
        </TabsTrigger>
        <TabsTrigger value="proveedores" className="gap-1.5">
          <Users className="w-4 h-4" /> Proveedores
        </TabsTrigger>
        <TabsTrigger value="control" className="gap-1.5">
          <PackageCheck className="w-4 h-4" /> Control de mercadería
        </TabsTrigger>
      </TabsList>

      <TabsContent value="pedidos" className="mt-0"><SupplierOrders /></TabsContent>
      <TabsContent value="proveedores" className="mt-0"><StoreSuppliers /></TabsContent>
      <TabsContent value="control" className="mt-0"><AdminControlMercaderia embedded /></TabsContent>
    </Tabs>
  );
};

export default StorePedidosProveedorHub;
