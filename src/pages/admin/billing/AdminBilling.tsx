import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings2, Clock, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ManualInvoiceButton } from "./ManualInvoiceButton";
import { TrayPendientes } from "./TrayPendientes";
import { TrayProblemas } from "./TrayProblemas";
import { TrayHistorial } from "./TrayHistorial";
import { useBillingCounts } from "./useBillingCounts";

interface Emisor {
  id: string;
  nombre_fiscal: string;
  cuit: string;
  punto_venta: number;
  activo: boolean;
  tiene_credenciales?: boolean;
  limite_anual_ars?: number | null;
}

type Tab = "pendientes" | "problemas" | "historial";

function Indicator({
  label, value, loading, icon: Icon, tone,
}: { label: string; value: number; loading?: boolean; icon: any; tone: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 flex-1 min-w-[150px]">
      <span className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", tone)}>
        <Icon className="w-4 h-4" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground truncate">{label}</p>
        <p className="text-lg font-bold tabular-nums leading-tight">
          {loading ? "…" : new Intl.NumberFormat("es-AR").format(value)}
        </p>
      </div>
    </div>
  );
}

export default function AdminBilling() {
  const [tab, setTab] = useState<Tab>("pendientes");
  const [emisores, setEmisores] = useState<Emisor[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const counts = useBillingCounts(refreshKey);

  const loadEmisores = useCallback(async () => {
    const { data } = await supabase
      .from("emisores_fiscales")
      .select("id, nombre_fiscal, cuit, punto_venta, activo, tiene_credenciales, limite_anual_ars")
      .order("created_at", { ascending: true });
    setEmisores((data as any[]) || []);
  }, []);

  useEffect(() => { loadEmisores(); }, [loadEmisores]);

  const onChanged = () => setRefreshKey((k) => k + 1);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-heading font-bold text-foreground">Facturación</h1>
          <p className="text-sm text-muted-foreground">Qué cobramos, qué falta facturar y qué necesita atención.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/admin/configuracion?tab=finanzas"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <Settings2 className="w-3.5 h-3.5" /> Configuración fiscal
          </Link>
          <ManualInvoiceButton emisores={emisores} onCreated={onChanged} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Indicator label="Pendientes de facturar" value={counts.pendientes} loading={counts.loading} icon={Clock} tone="bg-orange-500/10 text-orange-500" />
        <Indicator label="Con problemas" value={counts.problemas} loading={counts.loading} icon={AlertTriangle} tone="bg-red-500/10 text-red-500" />
        <Indicator label="Emitidas este mes" value={counts.emitidasMes} loading={counts.loading} icon={CheckCircle2} tone="bg-emerald-500/10 text-emerald-500" />
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="space-y-4">
        <TabsList className="bg-secondary">
          <TabsTrigger value="pendientes">Pendientes</TabsTrigger>
          <TabsTrigger value="problemas">Problemas</TabsTrigger>
          <TabsTrigger value="historial">Historial</TabsTrigger>
        </TabsList>

        <TabsContent value="pendientes" className="mt-0">
          {tab === "pendientes" && <TrayPendientes onChanged={onChanged} />}
        </TabsContent>
        <TabsContent value="problemas" className="mt-0">
          {tab === "problemas" && <TrayProblemas emisores={emisores} onChanged={onChanged} />}
        </TabsContent>
        <TabsContent value="historial" className="mt-0">
          {tab === "historial" && <TrayHistorial emisores={emisores} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
