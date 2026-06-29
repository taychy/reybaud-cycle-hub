import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShoppingCart, ClipboardList, Inbox } from "lucide-react";
import DepositoPedidos from "./DepositoPedidos";
import DepositoPreventas from "./DepositoPreventas";

type Tab = "nuevos" | "pedidos" | "preventas";

const NEW_ORDER_STATUSES = ["pendiente_pago", "pendiente_pago_efectivo", "pagado"];
const NEW_PREORDER_ESTADOS = ["pendiente_pago_sena", "reservada"];

const DepositoVentas = () => {
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab");
  const tab: Tab = raw === "pedidos" ? "pedidos" : raw === "preventas" ? "preventas" : "nuevos";

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
        <TabsList className="grid grid-cols-3 w-full max-w-2xl">
          <TabsTrigger value="nuevos" className="gap-2">
            <Inbox className="w-4 h-4" /> Nuevos
          </TabsTrigger>
          <TabsTrigger value="pedidos" className="gap-2">
            <ShoppingCart className="w-4 h-4" /> Pedidos
          </TabsTrigger>
          <TabsTrigger value="preventas" className="gap-2">
            <ClipboardList className="w-4 h-4" /> Preventas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="nuevos" className="mt-4 space-y-8">
          <DepositoPedidos restrictStatuses={NEW_ORDER_STATUSES} title="Nuevos pedidos" />
          <DepositoPreventas restrictEstados={NEW_PREORDER_ESTADOS} title="Nuevas preventas" />
        </TabsContent>
        <TabsContent value="pedidos" className="mt-4">
          <DepositoPedidos />
        </TabsContent>
        <TabsContent value="preventas" className="mt-4">
          <DepositoPreventas />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default DepositoVentas;
