import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShoppingCart, ClipboardList } from "lucide-react";
import StoreOrders from "./StoreOrders";
import StorePreorders from "./StorePreorders";

type Tab = "pedidos" | "preventas";

const StoreVentas = () => {
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab");
  const tab: Tab = raw === "preventas" ? "preventas" : "pedidos";

  const handleChange = (v: string) => {
    const next = new URLSearchParams(params);
    next.set("tab", v);
    setParams(next, { replace: true });
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-heading font-bold uppercase tracking-wider">Ventas</h1>
        <p className="text-sm text-muted-foreground">
          Pedidos de la tienda y preventas con seña.
        </p>
      </div>

      <Tabs value={tab} onValueChange={handleChange} className="w-full">
        <TabsList className="grid grid-cols-2 w-full max-w-md">
          <TabsTrigger value="pedidos" className="gap-2">
            <ShoppingCart className="w-4 h-4" /> Pedidos
          </TabsTrigger>
          <TabsTrigger value="preventas" className="gap-2">
            <ClipboardList className="w-4 h-4" /> Preventas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pedidos" className="mt-4">
          <StoreOrders />
        </TabsContent>
        <TabsContent value="preventas" className="mt-4">
          <StorePreorders />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default StoreVentas;
