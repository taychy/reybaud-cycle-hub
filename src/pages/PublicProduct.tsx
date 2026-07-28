import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, MessageCircle } from "lucide-react";
import { formatPrice } from "@/lib/currency";
import { effectiveStock, variantStockSum } from "@/lib/stock";
import { buildWhatsAppUrl } from "@/lib/contactInfo";
import { sortVariantValues } from "@/lib/variantSort";

interface PubProduct {
  id: string;
  name: string;
  description: string | null;
  price: number;
  old_price: number | null;
  currency: string | null;
  image_url: string | null;
  tag: string | null;
  stock: number | null;
  variant_stock: any;
}

const prettyVariant = (key: string) => key.split("|").map((p) => p.split(":").slice(1).join(":") || p).join(" · ");

const PublicProduct = () => {
  const { id } = useParams<{ id: string }>();
  const [p, setP] = useState<PubProduct | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("store_products")
        .select("id, name, description, price, old_price, currency, image_url, tag, stock, variant_stock")
        .eq("id", id as string)
        .eq("status", "active")
        .maybeSingle();
      setP((data as any) || null);
      setLoading(false);
    };
    if (id) load();
  }, [id]);

  useEffect(() => {
    if (p) {
      document.title = `${p.name} | Tienda Reybaud`;
      const meta = document.querySelector('meta[name="description"]');
      if (meta) meta.setAttribute("content", (p.description || p.name).slice(0, 155));
    }
  }, [p]);

  if (loading) return <main className="min-h-screen bg-background flex items-center justify-center text-muted-foreground text-sm">Cargando producto...</main>;

  if (!p) {
    return (
      <main className="min-h-screen bg-background flex flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-lg font-heading font-bold text-foreground">Producto no disponible</h1>
        <p className="text-sm text-muted-foreground">Puede que se haya agotado o dado de baja.</p>
        <Link to="/tienda" className="text-sm text-primary font-heading font-semibold">Ver la tienda</Link>
      </main>
    );
  }

  const total = effectiveStock(p);
  const hasVariants = variantStockSum(p.variant_stock) !== null;
  const variantEntries = hasVariants
    ? sortVariantValues(Object.keys(p.variant_stock as Record<string, number>)).map((k) => [k, Number((p.variant_stock as any)[k]) || 0] as [string, number])
    : [];

  const url = typeof window !== "undefined" ? window.location.href : "";

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-4 py-5 space-y-5">
        <Link to="/tienda" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-3.5 h-3.5" /> Volver a la tienda
        </Link>

        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="aspect-square md:aspect-[16/10] bg-secondary">
            {p.image_url ? (
              <img src={p.image_url} alt={`${p.name} - Tienda Reybaud`} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">Sin imagen</div>
            )}
          </div>
          <div className="p-5 space-y-3">
            {p.tag && <span className="text-[10px] font-heading font-bold uppercase px-2 py-0.5 rounded bg-primary text-primary-foreground">{p.tag}</span>}
            <h1 className="text-xl font-heading font-bold">{p.name}</h1>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-heading font-bold">{formatPrice(p.price, p.currency || "ARS")}</span>
              {p.old_price ? <span className="text-sm text-muted-foreground line-through">{formatPrice(p.old_price, p.currency || "ARS")}</span> : null}
            </div>
            {p.description && <p className="text-sm text-muted-foreground whitespace-pre-line">{p.description}</p>}

            {hasVariants ? (
              <div className="space-y-1.5 pt-2">
                <p className="text-xs font-heading uppercase text-muted-foreground">Disponibilidad</p>
                <div className="flex flex-wrap gap-1.5">
                  {variantEntries.map(([k, v]) => (
                    <span key={k} className={`text-[11px] px-2 py-1 rounded border ${v > 0 ? "border-border bg-secondary text-foreground" : "border-border bg-muted text-muted-foreground line-through"}`}>
                      {prettyVariant(k)}{v > 0 ? ` · ${v}` : ""}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">{total > 0 ? `${total} unidades disponibles` : "Sin stock por el momento"}</p>
            )}

            <a
              href={buildWhatsAppUrl(`Hola! Quiero consultar por "${p.name}" de la tienda Reybaud. ${url}`)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground px-6 py-3 font-heading font-semibold uppercase tracking-wider text-sm hover:opacity-90 transition-opacity"
            >
              <MessageCircle className="w-4 h-4" /> Consultar por WhatsApp
            </a>
          </div>
        </div>
        <div className="h-6" />
      </div>
    </main>
  );
};

export default PublicProduct;
