import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { ArrowLeftRight, Route } from "lucide-react";

interface RutaRow {
  unidad: string;
  activa: boolean;
  cambiado_at: string;
  cambiado_por_email: string | null;
  cuentas_mp: { nombre: string } | null;
  emisores_fiscales: { nombre_fiscal: string } | null;
}
interface NormalRow {
  unidad_negocio: string;
  cuentas_mp: { nombre: string } | null;
  emisores_fiscales: { nombre_fiscal: string } | null;
}

const UNIDADES: { unidad: string; label: string; detalle: string }[] = [
  { unidad: "suscripcion_escuela", label: "Escuela", detalle: "Suscripciones, turnera, clases, asesorías y programas" },
  { unidad: "viaje_camp", label: "Viajes / Eventos", detalle: "Viajes, camps y eventos" },
  { unidad: "tienda", label: "Tienda", detalle: "Tienda y preventas" },
];

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "short" });

/** Ruteo de cobros por unidad: ruta normal u override manual a Josilene (cuenta y emisor juntos). */
export function RuteoUnidadCard({ onChanged }: { onChanged?: () => void }) {
  const [rutas, setRutas] = useState<Record<string, RutaRow>>({});
  const [normales, setNormales] = useState<Record<string, NormalRow>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data }, { data: base }] = await Promise.all([
      supabase.from("unidad_routing" as any)
        .select("unidad, activa, cambiado_at, cambiado_por_email, cuentas_mp(nombre), emisores_fiscales(nombre_fiscal)"),
      supabase.from("cuenta_mp_routing" as any)
        .select("unidad_negocio, prioridad, cuentas_mp(nombre), emisores_fiscales(nombre_fiscal)")
        .eq("activa", true).order("prioridad"),
    ]);
    const map: Record<string, RutaRow> = {};
    for (const r of (data as any[]) || []) map[r.unidad] = r as RutaRow;
    const nm: Record<string, NormalRow> = {};
    for (const r of (base as any[]) || []) if (!nm[r.unidad_negocio]) nm[r.unidad_negocio] = r as NormalRow;
    setRutas(map);
    setNormales(nm);
  }, []);

  useEffect(() => { load(); }, [load]);

  const cambiar = async (unidad: string, label: string, activa: boolean) => {
    setBusy(unidad);
    const { error } = await supabase.rpc("set_unidad_routing" as any, { p_unidad: unidad, p_activa: activa });
    setBusy(null);
    if (error) {
      toast({ title: "No se pudo cambiar el ruteo", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: activa ? `${label} derivado a Josilene` : `${label} volvió a su ruta normal`,
      description: "Aplica a los cobros nuevos desde ahora. Lo ya cobrado mantiene su cuenta y emisor.",
    });
    load();
    onChanged?.();
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Route className="w-4 h-4 text-primary" />
        <p className="text-sm font-semibold">Ruteo de cobros</p>
        <span className="text-xs text-muted-foreground">
          Cuenta que recibe los cobros nuevos y emisor que los factura. Siempre cambian juntos.
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {UNIDADES.map(({ unidad, label, detalle }) => {
          const r = rutas[unidad];
          const n = normales[unidad];
          const override = !!r?.activa;
          const cuenta = override ? r?.cuentas_mp?.nombre : n?.cuentas_mp?.nombre;
          const emisor = override ? r?.emisores_fiscales?.nombre_fiscal : n?.emisores_fiscales?.nombre_fiscal;
          const normalCorta = n?.cuentas_mp?.nombre ?? "ruta normal";
          return (
            <div key={unidad} className="rounded-lg border border-border/60 px-3 py-2 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">{label}</p>
                <Badge variant={override ? "default" : "outline"} className="text-[10px]">
                  {override ? "Override Josilene" : "Ruta normal"}
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground">{detalle}</p>
              <p className="text-xs">Cuenta MP destino: <span className="font-medium">{cuenta ?? "Sin configurar"}</span></p>
              <p className="text-xs">Emisor fiscal: <span className="font-medium">{emisor ?? "Sin configurar"}</span></p>
              <p className="text-[11px] text-muted-foreground">
                {r?.cambiado_at ? `Vigente desde ${fmt(r.cambiado_at)}${r.cambiado_por_email ? ` · ${r.cambiado_por_email}` : ""}` : "Sin cambios de ruteo"}
              </p>
              <Button
                size="sm" variant="outline" className="w-full"
                disabled={busy === unidad}
                onClick={() => cambiar(unidad, label, !override)}
              >
                <ArrowLeftRight className="w-3.5 h-3.5 mr-1.5" />
                {override ? `Volver a ruta normal (${normalCorta})` : "Derivar a Josilene"}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
