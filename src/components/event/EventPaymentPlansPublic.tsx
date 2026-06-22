import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, CalendarDays, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatPrice } from "@/lib/currency";

interface PlanInstallment {
  numero: number;
  descripcion: string | null;
  monto_tipo: string;
  monto_valor: number;
  fecha_vencimiento: string | null;
}

interface Plan {
  id: string;
  nombre: string;
  sena_tipo: string;
  sena_valor: number;
  cantidad_cuotas: number;
  installments: PlanInstallment[];
}

interface Pkg {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  currency: string;
  plan: Plan | null;
}


const fmtDate = (d?: string | null) => {
  if (!d) return "";
  const [y, m, dd] = d.split("-");
  return `${dd}/${m}/${y}`;
};

const computeAmount = (tipo: string, valor: number, total: number, sena: number = 0) => {
  if (tipo === "porcentaje") return Math.round((valor / 100) * total);
  if (tipo === "porcentaje_saldo") return Math.round((valor / 100) * Math.max(total - sena, 0));
  return valor;
};

const EventPaymentPlansPublic = ({ eventId }: { eventId: string }) => {
  const [packages, setPackages] = useState<Pkg[]>([]);
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: pkgs } = await supabase
        .from("event_packages" as any)
        .select("id, nombre, descripcion, precio, currency")
        .eq("event_id", eventId)
        .eq("activo", true)
        .order("sort_order", { ascending: true });

      const pkgList = (pkgs as any[]) || [];
      if (pkgList.length === 0) { setLoading(false); return; }

      const enriched: Pkg[] = await Promise.all(pkgList.map(async (p: any) => {
        const { data: plan } = await supabase
          .from("event_package_payment_plans" as any)
          .select("id, nombre, sena_tipo, sena_valor, cantidad_cuotas")
          .eq("package_id", p.id)
          .is("archived_at", null)
          .eq("activo", true)
          .order("version", { ascending: false })
          .limit(1)
          .maybeSingle();
        const base = { id: p.id, nombre: p.nombre, descripcion: p.descripcion ?? null, precio: Number(p.precio), currency: p.currency };
        if (!plan) return { ...base, plan: null };
        const { data: insts } = await supabase
          .from("event_package_payment_plan_installments" as any)
          .select("numero, descripcion, monto_tipo, monto_valor, fecha_vencimiento")
          .eq("plan_id", (plan as any).id)
          .order("numero", { ascending: true });
        return {
          ...base,
          plan: {
            ...(plan as any),
            sena_valor: Number((plan as any).sena_valor),
            installments: ((insts as any[]) || []).map((i) => ({ ...i, monto_valor: Number(i.monto_valor) })),
          } as Plan,
        };
      }));


      setPackages(enriched);
      setLoading(false);
    })();
  }, [eventId]);

  if (loading || packages.length === 0) return null;

  return (
    <div className="glass-card rounded-xl p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Wallet className="w-4 h-4 text-primary" />
        <h3 className="font-heading font-semibold text-sm text-foreground">Paquetes y plan de pagos</h3>
      </div>
      <div className="space-y-2">
        {packages.map((pkg) => {
          const sena = pkg.plan ? computeAmount(pkg.plan.sena_tipo, pkg.plan.sena_valor, pkg.precio) : 0;
          const cuotas = pkg.plan?.installments ?? [];
          const minCuota = cuotas.length
            ? Math.min(...cuotas.map((c) => computeAmount(c.monto_tipo, c.monto_valor, pkg.precio, sena)))
            : 0;
          const open = !!openIds[pkg.id];
          return (
            <div key={pkg.id} className="border border-border/50 rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setOpenIds((s) => ({ ...s, [pkg.id]: !s[pkg.id] }))}
                className="w-full px-3 py-2.5 flex items-center justify-between text-left hover:bg-muted/30 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{pkg.nombre}</p>
                  {pkg.plan ? (
                    <p className="text-xs text-muted-foreground">
                      Seña <span className="text-primary font-semibold">{formatPrice(sena, pkg.currency)}</span>
                      {cuotas.length > 0 && (
                        <> + {cuotas.length} cuota{cuotas.length > 1 ? "s" : ""} desde <span className="text-foreground font-medium">{formatPrice(minCuota, pkg.currency)}</span></>
                      )}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Total <span className="text-primary font-semibold">{formatPrice(pkg.precio, pkg.currency)}</span>
                    </p>
                  )}
                </div>
                {open ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
              </button>
              {open && (
                <div className="px-3 py-2.5 border-t border-border/40 bg-muted/20 space-y-2 text-xs">
                  {pkg.descripcion && (
                    <div className="space-y-1">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-heading">Incluye</p>
                      <p className="text-foreground/90 whitespace-pre-wrap leading-relaxed">{pkg.descripcion}</p>
                    </div>
                  )}
                  {pkg.plan && (
                    <div className="space-y-1.5 pt-1">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-heading">Plan de pagos</p>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Seña al reservar</span>
                        <span className="font-semibold text-primary">{formatPrice(sena, pkg.currency)}</span>
                      </div>
                      {cuotas.map((c) => (
                        <div key={c.numero} className="flex items-center justify-between">
                          <span className="text-muted-foreground flex items-center gap-1.5">
                            <CalendarDays className="w-3 h-3" />
                            {c.descripcion || `Cuota ${c.numero}`}
                            {c.fecha_vencimiento && <span className="text-[10px] opacity-70">· vence {fmtDate(c.fecha_vencimiento)}</span>}
                          </span>
                          <span className="text-foreground font-medium">{formatPrice(computeAmount(c.monto_tipo, c.monto_valor, pkg.precio), pkg.currency)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="pt-1.5 border-t border-border/40 flex items-center justify-between font-semibold">
                    <span>Total</span>
                    <span>{formatPrice(pkg.precio, pkg.currency)}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Podés pagar con Mercado Pago, transferencia o efectivo. La seña confirma tu lugar.
      </p>
    </div>
  );
};

export default EventPaymentPlansPublic;

