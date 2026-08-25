import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Workflow, MapPin, ShieldCheck, ScrollText, Landmark } from "lucide-react";
import AdminProcesos from "./AdminProcesos";
import ManageSedes from "./ManageSedes";
import ManageAdmins from "./ManageAdmins";
import AuditLog from "./AuditLog";
import { BillingEmisores } from "./billing/BillingEmisores";
import { BillingCuentasMP } from "./billing/BillingCuentasMP";
import { BillingEmisorSummary } from "./billing/BillingEmisorSummary";
import { SyncMpFeesButton } from "./billing/SyncMpFeesButton";

type Tab = "procesos" | "sedes" | "admins" | "historial" | "finanzas";

/** Procesos + Sedes + Admins + Historial + Finanzas unificados en tabs. */
const AdminConfiguracion = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get("tab");
  const tab: Tab =
    raw === "sedes" ? "sedes"
    : raw === "admins" ? "admins"
    : raw === "historial" ? "historial"
    : raw === "finanzas" ? "finanzas"
    : "procesos";

  const [finanzasTab, setFinanzasTab] = useState<"emisores" | "mp">("emisores");
  const [summaryKey, setSummaryKey] = useState(0);

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
        <TabsTrigger value="finanzas" className="gap-1.5">
          <Landmark className="w-4 h-4" /> Finanzas
        </TabsTrigger>
        <TabsTrigger value="historial" className="gap-1.5">
          <ScrollText className="w-4 h-4" /> Historial
        </TabsTrigger>
      </TabsList>

      <TabsContent value="procesos" className="mt-0"><AdminProcesos /></TabsContent>
      <TabsContent value="sedes" className="mt-0"><ManageSedes /></TabsContent>
      <TabsContent value="admins" className="mt-0"><ManageAdmins /></TabsContent>
      <TabsContent value="historial" className="mt-0"><AuditLog /></TabsContent>

      <TabsContent value="finanzas" className="mt-0 space-y-4">
        <Tabs value={finanzasTab} onValueChange={(v) => setFinanzasTab(v as any)} className="space-y-4">
          <TabsList>
            <TabsTrigger value="emisores">Emisores fiscales</TabsTrigger>
            <TabsTrigger value="mp">Mercado Pago</TabsTrigger>
          </TabsList>

          <TabsContent value="emisores" className="mt-0 space-y-4">
            <BillingEmisorSummary refreshKey={summaryKey} />
            <BillingEmisores onDataChange={() => setSummaryKey((k) => k + 1)} />
          </TabsContent>

          <TabsContent value="mp" className="mt-0 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2 rounded-xl border border-border bg-card/50 px-3 py-2">
              <p className="text-xs text-muted-foreground">
                Mantenimiento: sincronizar comisiones de Mercado Pago de los últimos 90 días.
              </p>
              <SyncMpFeesButton />
            </div>
            <BillingCuentasMP />
          </TabsContent>
        </Tabs>
      </TabsContent>
    </Tabs>
  );
};

export default AdminConfiguracion;
