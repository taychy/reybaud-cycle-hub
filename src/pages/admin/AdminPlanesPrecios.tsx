import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Package, Tag, DollarSign } from "lucide-react";
import ManagePlanes from "./ManagePlanes";
import ManageDescuentos from "./ManageDescuentos";
import ManagePrecios from "./ManagePrecios";

type Tab = "planes" | "descuentos" | "precios";

/** Planes + Descuentos + Precios unificados en tabs. */
const AdminPlanesPrecios = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get("tab");
  const tab: Tab = raw === "descuentos" ? "descuentos" : raw === "precios" ? "precios" : "planes";

  const onChange = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value === "planes") next.delete("tab");
    else next.set("tab", value);
    setSearchParams(next, { replace: true });
  };

  return (
    <Tabs value={tab} onValueChange={onChange} className="w-full space-y-4">
      <TabsList className="bg-secondary">
        <TabsTrigger value="planes" className="gap-1.5">
          <Package className="w-4 h-4" /> Planes
        </TabsTrigger>
        <TabsTrigger value="descuentos" className="gap-1.5">
          <Tag className="w-4 h-4" /> Descuentos
        </TabsTrigger>
        <TabsTrigger value="precios" className="gap-1.5">
          <DollarSign className="w-4 h-4" /> Precios
        </TabsTrigger>
      </TabsList>

      <TabsContent value="planes" className="mt-0"><ManagePlanes /></TabsContent>
      <TabsContent value="descuentos" className="mt-0"><ManageDescuentos /></TabsContent>
      <TabsContent value="precios" className="mt-0"><ManagePrecios /></TabsContent>
    </Tabs>
  );
};

export default AdminPlanesPrecios;
