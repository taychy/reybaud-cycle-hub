import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShoppingCart, ClipboardList, Inbox } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import StoreOrders from "./StoreOrders";
import StorePreorders from "./StorePreorders";

type Tab = "nuevos" | "pedidos" | "preventas";

// Estados que cuentan como "nuevo / por preparar"
const NUEVOS_STATUSES = ["pendiente", "pagado", "preparando"];

const StoreVentas = () => {
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab");
  const tab: Tab = raw === "preventas" ? "preventas" : raw === "pedidos" ? "pedidos" : "nuevos";

  const [nuevosCount, setNuevosCount] = useState<number | null>(null);

  useEffect(() => {
    let cancel = false;
    supabase
      .from("store_orders")
      .select("id", { count: "exact", head: true })
      .in("status", NUEVOS_STATUSES)
      .then(({ count }) => {
        if (!cancel) setNuevosCount(count ?? 0);
      });
    return () => {
      cancel = true;
    };
  }, [tab]);

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
        <TabsList className="grid grid-cols-3 w-full max-w-xl">
          <TabsTrigger value="nuevos" className="gap-2">
            <Inbox className="w-4 h-4" />
            <span>Nuevos</span>
            {nuevosCount != null && nuevosCount > 0 && (
              <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold">
                {nuevosCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="pedidos" className="gap-2">
            <ShoppingCart className="w-4 h-4" /> Pedidos
          </TabsTrigger>
          <TabsTrigger value="preventas" className="gap-2">
            <ClipboardList className="w-4 h-4" /> Preventas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="nuevos" className="mt-4">
          <StoreOrders
            restrictStatuses={NUEVOS_STATUSES}
            title="Nuevos pedidos"
            subtitle="Pedidos por revisar, cobrar o preparar. Cuando los marcás como enviado o entregado salen de esta vista."
          />
        </TabsContent>
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
