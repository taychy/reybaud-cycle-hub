import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShoppingCart, Package, Tag, Sparkles } from "lucide-react";
import StoreProducts from "./StoreProducts";
import StoreStock from "./StoreStock";
import StoreCategories from "./StoreCategories";
import StoreCampaigns from "./StoreCampaigns";

type Tab = "productos" | "stock" | "categorias" | "promociones";

/** Productos + Stock + Categorías + Promociones unificados en tabs. */
const StoreProductosStock = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get("tab");
  const tab: Tab =
    raw === "stock" ? "stock"
    : raw === "categorias" ? "categorias"
    : raw === "promociones" ? "promociones"
    : "productos";

  const onChange = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value === "productos") next.delete("tab");
    else next.set("tab", value);
    setSearchParams(next, { replace: true });
  };

  return (
    <Tabs value={tab} onValueChange={onChange} className="w-full space-y-4">
      <TabsList className="bg-secondary">
        <TabsTrigger value="productos" className="gap-1.5">
          <ShoppingCart className="w-4 h-4" /> Productos
        </TabsTrigger>
        <TabsTrigger value="stock" className="gap-1.5">
          <Package className="w-4 h-4" /> Stock
        </TabsTrigger>
        <TabsTrigger value="categorias" className="gap-1.5">
          <Tag className="w-4 h-4" /> Categorías
        </TabsTrigger>
        <TabsTrigger value="promociones" className="gap-1.5">
          <Sparkles className="w-4 h-4" /> Campañas
        </TabsTrigger>
      </TabsList>

      <TabsContent value="productos" className="mt-0"><StoreProducts /></TabsContent>
      <TabsContent value="stock" className="mt-0"><StoreStock /></TabsContent>
      <TabsContent value="categorias" className="mt-0"><StoreCategories /></TabsContent>
      <TabsContent value="promociones" className="mt-0"><StoreCampaigns /></TabsContent>
    </Tabs>
  );
};

export default StoreProductosStock;
