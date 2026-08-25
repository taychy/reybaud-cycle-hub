import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LayoutDashboard, TrendingUp } from "lucide-react";
import AdminDashboard from "./AdminDashboard";
import SuperAdminDashboard from "./SuperAdminDashboard";

/** Resumen operativo + Métricas (super_admin) unificados en tabs. */
const AdminResumen = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const tabParam = searchParams.get("tab") === "metricas" ? "metricas" : "operacion";

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      const { data: profile } = await supabase
        .from("admin_profiles")
        .select("role")
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (mounted) setIsSuperAdmin(profile?.role === "super_admin");
    })();
    return () => { mounted = false; };
  }, []);

  const tab = tabParam === "metricas" && !isSuperAdmin ? "operacion" : tabParam;

  const onTabChange = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value === "metricas") next.set("tab", "metricas");
    else next.delete("tab");
    setSearchParams(next, { replace: true });
  };

  if (!isSuperAdmin) return <AdminDashboard />;

  return (
    <Tabs value={tab} onValueChange={onTabChange} className="w-full space-y-4">
      <TabsList className="bg-secondary">
        <TabsTrigger value="operacion" className="gap-1.5">
          <LayoutDashboard className="w-4 h-4" /> Operación
        </TabsTrigger>
        <TabsTrigger value="metricas" className="gap-1.5">
          <TrendingUp className="w-4 h-4" /> Métricas
        </TabsTrigger>
      </TabsList>

      <TabsContent value="operacion" className="mt-0">
        <AdminDashboard />
      </TabsContent>
      <TabsContent value="metricas" className="mt-0">
        <SuperAdminDashboard />
      </TabsContent>
    </Tabs>
  );
};

export default AdminResumen;
