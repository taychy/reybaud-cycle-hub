import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Search, ShoppingBag, MessageCircle } from "lucide-react";
import { formatPrice } from "@/lib/currency";
import { effectiveStock } from "@/lib/stock";
import { buildWhatsAppUrl } from "@/lib/contactInfo";

interface PubProduct {
  id: string;
  name: string;
  description: string | null;
  price: number;
  old_price: number | null;
  currency: string | null;
  image_url: string | null;
  tag: string | null;
  category_id: string | null;
  featured: boolean | null;
  stock: number | null;
  variant_stock: any;
}

interface PubCategory { id: string; name: string; icon: string | null }

const PublicStore = () => {
  const [products, setProducts] = useState<PubProduct[]>([]);
  const [categories, setCategories] = useState<PubCategory[]>([]);
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = "Tienda Reybaud | Indumentaria y accesorios de ciclismo";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "Indumentaria técnica y accesorios de ciclismo de la Escuela Reybaud. Mirá el catálogo y consultá disponibilidad por WhatsApp.");
  }, []);

  useEffect(() => {
    const load = async () => {
      const [pRes, cRes] = await Promise.all([
        supabase.from("store_products").select("id, name, description, price, old_price, currency, image_url, tag, category_id, featured, stock, variant_stock").eq("status", "active").order("featured", { ascending: false }),
        supabase.from("store_categories").select("id, name, icon").eq("active", true).order("sort_order"),
      ]);
      setProducts((pRes.data as any[]) || []);
      setCategories((cRes.data as any[]) || []);
      setLoading(false);
    };
    load();
  }, []);

  const filtered = useMemo(() => products.filter((p) => {
    if (cat !== "all" && p.category_id !== cat) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [products, cat, search]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="max-w-5xl mx-auto px-4 py-6 flex items-center gap-3">
          <ShoppingBag className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-xl md:text-2xl font-heading font-bold uppercase tracking-wide">Tienda Reybaud</h1>
            <p className="text-xs text-muted-foreground">Indumentaria y accesorios de ciclismo</p>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-5 space-y-5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar producto..."
            className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-secondary border border-border text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {[{ id: "all", name: "Todos", icon: "🏷️" }, ...categories].map((c) => (
            <button
              key={c.id}
              onClick={() => setCat(c.id)}
              className={`shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-heading font-semibold transition-all ${cat === c.id ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground border border-border hover:border-primary/30"}`}
            >
              <span>{c.icon}</span>{c.name}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground py-10 text-center">Cargando catálogo...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center">No hay productos disponibles.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {filtered.map((p) => {
              const st = effectiveStock(p);
              return (
                <Link key={p.id} to={`/tienda/producto/${p.id}`} className="group flex flex-col rounded-xl border border-border bg-card overflow-hidden hover:border-primary/40 transition-colors">
                  <div className="relative aspect-square bg-secondary overflow-hidden">
                    {p.image_url ? (
                      <img src={p.image_url} alt={`${p.name} - Tienda Reybaud`} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">Sin imagen</div>
                    )}
                    {p.tag && <span className="absolute top-2 left-2 text-[10px] font-heading font-bold uppercase px-2 py-0.5 rounded bg-primary text-primary-foreground">{p.tag}</span>}
                    {st <= 0 && <span className="absolute top-2 right-2 text-[10px] font-heading font-bold uppercase px-2 py-0.5 rounded bg-destructive text-destructive-foreground">Agotado</span>}
                  </div>
                  <div className="p-3 flex-1 flex flex-col gap-1">
                    <h2 className="text-xs font-medium leading-tight line-clamp-2">{p.name}</h2>
                    <div className="mt-auto">
                      {p.old_price ? <p className="text-[10px] text-muted-foreground line-through">{formatPrice(p.old_price, p.currency || "ARS")}</p> : null}
                      <p className="text-sm font-heading font-bold">{formatPrice(p.price, p.currency || "ARS")}</p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        <a
          href={buildWhatsAppUrl("Hola! Tengo una consulta sobre la tienda Reybaud.")}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/10 hover:bg-primary/20 px-6 py-4 transition-colors"
        >
          <MessageCircle className="w-5 h-5 text-primary" />
          <span className="font-heading font-semibold text-primary uppercase tracking-wider text-sm">Consultar por WhatsApp</span>
        </a>
        <div className="h-6" />
      </div>
    </main>
  );
};

export default PublicStore;
