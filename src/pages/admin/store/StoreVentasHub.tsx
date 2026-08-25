import { useSearchParams } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Boxes, Truck, Wallet } from "lucide-react";
import StoreVentas from "./StoreVentas";
import AdminEntregasCaja from "@/pages/admin/AdminEntregasCaja";
import AdminDeliveryPayments from "@/pages/admin/AdminDeliveryPayments";

/** Ventas + Entregas/Caja + Cobros de entrega.
 *  Las tabs internas de StoreVentas siguen usando ?tab=; acá sólo interceptamos
 *  los dos valores nuevos para no romper ese contrato. */
const HUB_TABS = ["entregas-caja", "cobros-entrega"] as const;

const StoreVentasHub = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get("tab") ?? "";
  const hubTab = (HUB_TABS as readonly string[]).includes(raw) ? raw : "ventas";

  const onChange = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value === "ventas") next.delete("tab");
    else next.set("tab", value);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="space-y-4">
      <Tabs value={hubTab} onValueChange={onChange}>
        <TabsList className="bg-secondary">
          <TabsTrigger value="ventas" className="gap-1.5">
            <Boxes className="w-4 h-4" /> Ventas
          </TabsTrigger>
          <TabsTrigger value="entregas-caja" className="gap-1.5">
            <Truck className="w-4 h-4" /> Entregas / Caja
          </TabsTrigger>
          <TabsTrigger value="cobros-entrega" className="gap-1.5">
            <Wallet className="w-4 h-4" /> Cobros de entrega
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {hubTab === "entregas-caja" ? (
        <AdminEntregasCaja />
      ) : hubTab === "cobros-entrega" ? (
        <AdminDeliveryPayments />
      ) : (
        <StoreVentas />
      )}
    </div>
  );
};

export default StoreVentasHub;
