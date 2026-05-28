import { useState, useRef, useEffect } from "react";
import { Search, ShoppingCart, Bell, ChevronRight, Tag, Flame, Star, Sparkles, Clock, Percent, ExternalLink, CalendarClock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import PreorderReserveDialog from "@/components/store/PreorderReserveDialog";
import BuyProductDialog from "@/components/store/BuyProductDialog";
import MisPreventas from "@/components/store/MisPreventas";

// Fallback images
import jerseyImg from "@/assets/store/jersey.jpg";
import bannerImg from "@/assets/store/banner-promo.jpg";

const STORE_URL = "https://ciclismoreybaud.mitiendanube.com/";

type StoreProduct = Tables<"store_products"> & {
  is_preorder?: boolean;
  preorder_status?: string;
  preorder_deadline?: string | null;
  preorder_total_units?: number | null;
  preorder_estimated_delivery?: string | null;
  preorder_description?: string | null;
  preorder_deposit_amount?: number | null;
  preorder_deposit_percent?: number | null;
  preorder_variants?: any;
  currency?: string | null;
};
type StoreCategory = Tables<"store_categories">;
type StoreBanner = Tables<"store_banners">;

const formatPrice = (n: number, cur: string = "ARS") =>
  (cur === "ARS" ? "$" : cur + " ") + n.toLocaleString("es-AR");

const tagColor = (tag: string) => {
  switch (tag?.toUpperCase()) {
    case "OFERTA": return "bg-primary text-primary-foreground";
    case "NUEVO": return "bg-accent text-accent-foreground";
    case "OUTLET": return "bg-gold-dark text-primary-foreground";
    case "ÚLTIMA UNIDAD": return "bg-destructive text-destructive-foreground";
    default: return "bg-muted text-muted-foreground";
  }
};

const ProductCard = ({
  product,
  onReserve,
  onBuy,
}: {
  product: StoreProduct;
  onReserve?: (p: StoreProduct) => void;
  onBuy?: (p: StoreProduct) => void;
}) => {
  const isPreorder = product.is_preorder && product.preorder_status === "abierta";
  const isInApp = (product as any).checkout_mode === "in_app" && !isPreorder;
  const isInteractive = isPreorder || isInApp;
  const Wrapper: any = isInteractive ? "div" : "a";
  const wrapperProps = isInteractive
    ? { className: `group flex flex-col rounded-xl border ${isPreorder ? "border-primary/40" : "border-border"} bg-card overflow-hidden transition-all hover:shadow-lg hover:shadow-primary/10` }
    : { href: STORE_URL, target: "_blank", rel: "noopener noreferrer", className: "group flex flex-col rounded-xl border border-border bg-card overflow-hidden transition-all hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10" };
  return (
    <Wrapper {...wrapperProps}>
      <div className="relative aspect-square bg-secondary overflow-hidden">
        <img
          src={product.image_url || jerseyImg}
          alt={product.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          loading="lazy"
        />
        {isPreorder ? (
          <span className="absolute top-2 left-2 text-[10px] font-heading font-bold uppercase px-2 py-0.5 rounded bg-primary text-primary-foreground">
            Preventa
          </span>
        ) : product.tag ? (
          <span className={`absolute top-2 left-2 text-[10px] font-heading font-bold uppercase px-2 py-0.5 rounded ${tagColor(product.tag)}`}>
            {product.tag}
          </span>
        ) : null}
        {product.discount && product.discount > 0 && (
          <span className="absolute top-2 right-2 text-[10px] font-heading font-bold bg-primary text-primary-foreground px-1.5 py-0.5 rounded">
            -{product.discount}%
          </span>
        )}
      </div>
      <div className="p-3 flex-1 flex flex-col gap-1">
        <p className="text-xs text-foreground font-medium line-clamp-2 leading-tight">{product.name}</p>
        {isPreorder && product.preorder_deadline && (
          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
            <CalendarClock className="w-3 h-3" /> hasta {new Date(product.preorder_deadline).toLocaleDateString("es-AR")}
          </p>
        )}
        <div className="mt-auto">
          {product.old_price && !isPreorder && (
            <p className="text-[10px] text-muted-foreground line-through">{formatPrice(product.old_price)}</p>
          )}
          <p className="text-sm font-heading font-bold text-foreground">{formatPrice(product.price, product.currency || "ARS")}</p>
          {isPreorder ? (
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); onReserve?.(product); }}
              className="mt-2 w-full text-[11px] font-heading font-bold uppercase tracking-wider bg-primary text-primary-foreground py-1.5 rounded hover:opacity-90 transition-opacity"
            >
              Reservar
            </button>
          ) : isInApp ? (
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); onBuy?.(product); }}
              className="mt-2 w-full text-[11px] font-heading font-bold uppercase tracking-wider bg-primary text-primary-foreground py-1.5 rounded hover:opacity-90 transition-opacity"
            >
              Comprar
            </button>
          ) : null}
        </div>
      </div>
    </Wrapper>
  );
};

const QUICK_ACCESS = [
  { label: "Ofertas", icon: Percent, color: "text-primary", filterTag: "OFERTA" },
  { label: "Combos", icon: Flame, color: "text-accent", filterTag: null },
  { label: "Top ventas", icon: Star, color: "text-gold", filterTag: null },
  { label: "Nuevos", icon: Sparkles, color: "text-cyan", filterTag: "NUEVO" },
  { label: "Últimas", icon: Clock, color: "text-destructive", filterTag: "ÚLTIMA UNIDAD" },
];

const TiendaSection = () => {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("Todos");
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [categories, setCategories] = useState<StoreCategory[]>([]);
  const [banners, setBanners] = useState<StoreBanner[]>([]);
  const [loading, setLoading] = useState(true);
  const [alumnoId, setAlumnoId] = useState<string | null>(null);
  const [alumnoInfo, setAlumnoInfo] = useState<{ nombre?: string; email?: string }>({});
  const [reserveProduct, setReserveProduct] = useState<StoreProduct | null>(null);
  const [buyProduct, setBuyProduct] = useState<StoreProduct | null>(null);
  const catRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const load = async () => {
      const [productsRes, categoriesRes, bannersRes, sess] = await Promise.all([
        supabase.from("store_products").select("*").eq("status", "active").order("featured_order", { ascending: true, nullsFirst: false }),
        supabase.from("store_categories").select("*").eq("active", true).order("sort_order"),
        supabase.from("store_banners").select("*").eq("active", true).order("sort_order").limit(1),
        supabase.auth.getUser(),
      ]);
      setProducts(productsRes.data || []);
      setCategories(categoriesRes.data || []);
      setBanners(bannersRes.data || []);
      const uid = sess.data.user?.id;
      if (uid) {
        const { data: al } = await supabase.from("alumnos").select("id, nombre, apellido, email").eq("user_id", uid).maybeSingle();
        setAlumnoId(al?.id || null);
        if (al) setAlumnoInfo({ nombre: `${al.nombre || ""} ${al.apellido || ""}`.trim(), email: al.email || undefined });
      }
      setLoading(false);
    };
    load();
  }, []);

  const handleReserve = (p: StoreProduct) => {
    if (!alumnoId) return;
    setReserveProduct(p);
  };

  const handleBuy = (p: StoreProduct) => {
    if (!alumnoId) return;
    setBuyProduct(p);
  };


  const filtered = products.filter((p) => {
    const matchCat = activeCategory === "Todos" || categories.find(c => c.id === p.category_id)?.name === activeCategory;
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const featured = products.filter((p) => p.featured).slice(0, 4);
  const banner = banners[0];

  const allCategories = [{ name: "Todos", icon: "🏷️" }, ...categories.map(c => ({ name: c.name, icon: c.icon }))];

  if (loading) {
    return (
      <div className="w-full max-w-md animate-fade-in flex items-center justify-center py-12">
        <div className="animate-pulse text-muted-foreground text-sm">Cargando tienda...</div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md animate-fade-in space-y-4 -mt-2">
      {/* Search bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar en la tienda..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-secondary border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 font-body"
          />
        </div>
        <button className="p-2.5 rounded-xl bg-secondary border border-border hover:border-primary/40 transition-colors">
          <ShoppingCart className="w-5 h-5 text-foreground" />
        </button>
      </div>

      {/* Categories */}
      <div ref={catRef} className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
        {allCategories.map((cat) => (
          <button
            key={cat.name}
            onClick={() => setActiveCategory(cat.name)}
            className={`shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-heading font-semibold transition-all whitespace-nowrap ${
              activeCategory === cat.name
                ? "bg-primary text-primary-foreground shadow-md shadow-primary/30"
                : "bg-secondary text-muted-foreground border border-border hover:border-primary/30"
            }`}
          >
            <span>{cat.icon}</span>
            {cat.name}
          </button>
        ))}
      </div>

      {/* Banner */}
      {banner && (
        <a href={banner.link_url || STORE_URL} target="_blank" rel="noopener noreferrer" className="block relative rounded-xl overflow-hidden group">
          <img src={banner.image_url || bannerImg} alt={banner.title} className="w-full h-40 object-cover group-hover:scale-105 transition-transform duration-500" />
          <div className="absolute inset-0 bg-gradient-to-r from-background/90 via-background/50 to-transparent flex flex-col justify-center px-5">
            {banner.subtitle && (
              <span className="text-[10px] font-heading font-bold uppercase tracking-widest text-primary">{banner.subtitle}</span>
            )}
            <h2 className="text-lg font-heading font-bold text-foreground leading-tight mt-1">{banner.title}</h2>
            {banner.button_text && (
              <span className="mt-2 inline-flex items-center gap-1 text-xs font-heading font-semibold text-primary">
                {banner.button_text} <ChevronRight className="w-3 h-3" />
              </span>
            )}
          </div>
        </a>
      )}

      {/* Promo strip */}
      <div className="flex items-center gap-2 rounded-lg bg-primary/10 border border-primary/20 px-4 py-2.5">
        <Tag className="w-4 h-4 text-primary shrink-0" />
        <p className="text-xs font-heading font-semibold text-primary flex-1">
          Ofertas de la semana · Hasta 50% OFF
        </p>
        <ChevronRight className="w-4 h-4 text-primary shrink-0" />
      </div>

      {/* Quick access */}
      <div className="flex justify-between gap-1">
        {QUICK_ACCESS.map((qa) => (
          <button
            key={qa.label}
            className="flex flex-col items-center gap-1.5 flex-1 py-2 group"
            onClick={() => {
              if (qa.filterTag) {
                setSearch(qa.filterTag);
              }
              setActiveCategory("Todos");
            }}
          >
            <div className="w-11 h-11 rounded-full bg-secondary border border-border flex items-center justify-center group-hover:border-primary/40 transition-colors">
              <qa.icon className={`w-5 h-5 ${qa.color}`} />
            </div>
            <span className="text-[10px] font-heading font-medium text-muted-foreground group-hover:text-foreground transition-colors">{qa.label}</span>
          </button>
        ))}
      </div>

      {/* Mis preventas */}
      <MisPreventas alumnoId={alumnoId} />

      {/* Featured products */}
      {activeCategory === "Todos" && !search && featured.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-heading font-bold uppercase tracking-wider text-foreground">Destacados</h3>
            <a href={STORE_URL} target="_blank" rel="noopener noreferrer" className="text-[10px] font-heading font-semibold text-primary flex items-center gap-0.5">
              Ver todos <ChevronRight className="w-3 h-3" />
            </a>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {featured.map((p) => (
              <ProductCard key={p.id} product={p} onReserve={handleReserve} onBuy={handleBuy} />
            ))}
          </div>
        </section>
      )}

      {/* Filtered product grid */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-heading font-bold uppercase tracking-wider text-foreground">
            {activeCategory === "Todos" && !search ? "Todos los productos" : search ? "Resultados" : activeCategory}
          </h3>
          <Badge variant="secondary" className="text-[10px] font-heading">{filtered.length} productos</Badge>
        </div>
        {filtered.length > 0 ? (
          <div className="grid grid-cols-2 gap-3">
            {filtered.map((p) => (
              <ProductCard key={p.id} product={p} onReserve={handleReserve} onBuy={handleBuy} />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">No hay productos en esta categoría.</p>
          </div>
        )}
      </section>

      {/* CTA to external store */}
      <a
        href={STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-3 w-full rounded-xl border border-primary/30 bg-primary/10 hover:bg-primary/20 px-6 py-4 transition-colors"
      >
        <ShoppingCart className="w-5 h-5 text-primary" />
        <span className="font-heading font-semibold text-primary uppercase tracking-wider text-sm">
          Ir a la tienda completa
        </span>
        <ExternalLink className="w-4 h-4 text-primary" />
      </a>

      <div className="h-4" />

      <PreorderReserveDialog
        open={!!reserveProduct}
        onOpenChange={(v) => !v && setReserveProduct(null)}
        product={reserveProduct as any}
        alumnoId={alumnoId}
      />
    </div>
  );
};

export default TiendaSection;
