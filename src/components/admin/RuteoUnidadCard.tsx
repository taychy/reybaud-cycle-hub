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

const UNIDADES: { unidad: string; label: string; rutaNormal: string }[] = [
  { unidad: "suscripcion_escuela", label: "Escuela", rutaNormal: "Claudio" },
  { unidad: "viaje_camp", label: "Viajes", rutaNormal: "Scarlett" },
  { unidad: "tienda", label: "Tienda", rutaNormal: "Scarlett" },
];

/** Ruteo manual de cobros por unidad: define a qué cuenta (y emisor) van los cobros nuevos. */
export function RuteoUnidadCard({ onChanged }: { onChanged?: () => void }) {
  const [rutas, setRutas] = useState<Record<string, RutaRow>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("unidad_routing" as any)
      .select("unidad, activa, cambiado_at, cambiado_por_email, cuentas_mp(nombre), emisores_fiscales(nombre_fiscal)");
    const map: Record<string, RutaRow> = {};
    for (const r of (data as any[]) || []) map[r.unidad] = r as RutaRow;
    setRutas(map);
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
      title: activa ? `Ruteo activado en ${label}` : `${label} volvió a su ruta normal`,
      description: activa
        ? "Los cobros nuevos de esta unidad se facturan con la ruta alternativa."
        : "Los cobros nuevos vuelven a la cuenta habitual. Lo ya cobrado no cambia.",
    });
    load();
    onChanged?.();
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Route className="w-4 h-4 text-primary" />
        <p className="text-sm font-semibold">Ruteo de cobros</p>
        <span className="text-xs text-muted-foreground">
          Define a qué cuenta entran los cobros nuevos de cada unidad y quién los factura. Manual, sin vencimiento.
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {UNIDADES.map(({ unidad, label, rutaNormal }) => {
          const r = rutas[unidad];
          const activa = !!r?.activa;
          return (
            <div key={unidad} className="rounded-lg border border-border/60 px-3 py-2 space-y-2">
              <p className="text-sm font-medium">{label}</p>
              {activa ? (
                <>
                  <p className="text-xs">
                    Ruta actual: <span className="font-medium">{r?.emisores_fiscales?.nombre_fiscal ?? "—"}</span>{" "}
                    <Badge variant="outline" className="text-[10px]">override manual</Badge>
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Cuenta: {r?.cuentas_mp?.nombre ?? "—"} · desde{" "}
                    {new Date(r!.cambiado_at).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "short" })}
                  </p>
                  <Button
                    size="sm" variant="outline" className="w-full"
                    disabled={busy === unidad}
                    onClick={() => cambiar(unidad, label, false)}
                  >
                    <ArrowLeftRight className="w-3.5 h-3.5 mr-1.5" />
                    Volver a ruta normal ({rutaNormal})
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">Ruta actual: {rutaNormal} (normal)</p>
                  <Button
                    size="sm" variant="outline" className="w-full"
                    disabled={busy === unidad}
                    onClick={() => cambiar(unidad, label, true)}
                  >
                    <ArrowLeftRight className="w-3.5 h-3.5 mr-1.5" />
                    Rutear a la cuenta alternativa
                  </Button>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
