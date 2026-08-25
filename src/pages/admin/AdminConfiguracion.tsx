import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Workflow, MapPin, ShieldCheck, ScrollText } from "lucide-react";
import AdminProcesos from "./AdminProcesos";
import ManageSedes from "./ManageSedes";
import ManageAdmins from "./ManageAdmins";
import AuditLog from "./AuditLog";

type Tab = "procesos" | "sedes" | "admins" | "historial";

/** Procesos + Sedes + Admins + Historial unificados en tabs. */
const AdminConfiguracion = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get("tab");
  const tab: Tab =
    raw === "sedes" ? "sedes"
    : raw === "admins" ? "admins"
    : raw === "historial" ? "historial"
    : "procesos";

  const onChange = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value === "procesos") next.delete("tab");
    else next.set("tab", value);
    setSearchParams(next, { replace: true });
  };

  return (
    <Tabs value={tab} onValueChange={onChange} className="w-full space-y-4">
      <TabsList className="bg-secondary">
        <TabsTrigger value="procesos" className="gap-1.5">
          <Workflow className="w-4 h-4" /> Procesos
        </TabsTrigger>
        <TabsTrigger value="sedes" className="gap-1.5">
          <MapPin className="w-4 h-4" /> Sedes
        </TabsTrigger>
        <TabsTrigger value="admins" className="gap-1.5">
          <ShieldCheck className="w-4 h-4" /> Admins
        </TabsTrigger>
        <TabsTrigger value="historial" className="gap-1.5">
          <ScrollText className="w-4 h-4" /> Historial
        </TabsTrigger>
      </TabsList>

      <TabsContent value="procesos" className="mt-0"><AdminProcesos /></TabsContent>
      <TabsContent value="sedes" className="mt-0"><ManageSedes /></TabsContent>
      <TabsContent value="admins" className="mt-0"><ManageAdmins /></TabsContent>
      <TabsContent value="historial" className="mt-0"><AuditLog /></TabsContent>
    </Tabs>
  );
};

export default AdminConfiguracion;
