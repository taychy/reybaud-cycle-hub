import { useSearchParams } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Receipt, Wallet } from "lucide-react";
import AdminPayments from "./AdminPayments";
import AdminCierreCaja from "./AdminCierreCaja";

/** Pagos + Cierre de caja unificados. La tab "cierre" se resuelve acá;
 *  cualquier otro valor de ?tab= lo maneja AdminPayments internamente. */
const AdminPagosHub = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const isCierre = searchParams.get("tab") === "cierre";

  const onChange = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value === "cierre") next.set("tab", "cierre");
    else next.delete("tab");
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="space-y-4">
      <Tabs value={isCierre ? "cierre" : "pagos"} onValueChange={onChange}>
        <TabsList className="bg-secondary">
          <TabsTrigger value="pagos" className="gap-1.5">
            <Receipt className="w-4 h-4" /> Pagos
          </TabsTrigger>
          <TabsTrigger value="cierre" className="gap-1.5">
            <Wallet className="w-4 h-4" /> Cierre
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {isCierre ? <AdminCierreCaja /> : <AdminPayments />}
    </div>
  );
};

export default AdminPagosHub;
