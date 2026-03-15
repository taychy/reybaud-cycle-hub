import { useState, useRef } from "react";
import { Search, ShoppingCart, Bell, ChevronRight, Tag, Flame, Star, Sparkles, Clock, Percent, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";

// Product images
import jerseyImg from "@/assets/store/jersey.jpg";
import nutritionImg from "@/assets/store/nutrition.jpg";
import bibImg from "@/assets/store/bib.jpg";
import comboImg from "@/assets/store/combo.jpg";
import glovesImg from "@/assets/store/gloves.jpg";
import helmetImg from "@/assets/store/helmet.jpg";
import sunglassesImg from "@/assets/store/sunglasses.jpg";
import bannerImg from "@/assets/store/banner-promo.jpg";

const STORE_URL = "https://ciclismoreybaud.mitiendanube.com/";

type Category = "Todos" | "Indumentaria" | "Camps" | "Nutrición" | "Repuestos" | "Outlet" | "Usados";

interface Product {
  id: string;
  name: string;
  price: number;
  oldPrice?: number;
  discount?: number;
  image: string;
  category: Category;
  tag?: "OFERTA" | "NUEVO" | "OUTLET" | "ÚLTIMA UNIDAD";
}

const CATEGORIES: { name: Category; icon: string }[] = [
  { name: "Todos", icon: "🏷️" },
  { name: "Indumentaria", icon: "👕" },
  { name: "Camps", icon: "⛺" },
  { name: "Nutrición", icon: "🥤" },
  { name: "Repuestos", icon: "🔧" },
  { name: "Outlet", icon: "🏷️" },
  { name: "Usados", icon: "♻️" },
];

const QUICK_ACCESS = [
  { label: "Ofertas", icon: Percent, color: "text-primary" },
  { label: "Combos", icon: Flame, color: "text-accent" },
  { label: "Top ventas", icon: Star, color: "text-gold" },
  { label: "Nuevos", icon: Sparkles, color: "text-cyan" },
  { label: "Últimas", icon: Clock, color: "text-destructive" },
];

const PRODUCTS: Product[] = [
  { id: "1", name: "Jersey Pro Team 2025", price: 45000, oldPrice: 55000, discount: 18, image: jerseyImg, category: "Indumentaria", tag: "NUEVO" },
  { id: "2", name: "Calza Bib Race", price: 38000, oldPrice: 48000, discount: 21, image: bibImg, category: "Indumentaria", tag: "OFERTA" },
  { id: "3", name: "Pack Energía x6", price: 12500, oldPrice: 15000, discount: 17, image: nutritionImg, category: "Nutrición", tag: "OFERTA" },
  { id: "4", name: "Combo Hidratación", price: 8900, image: comboImg, category: "Nutrición", tag: "NUEVO" },
  { id: "5", name: "Guantes Aero Pro", price: 18500, oldPrice: 22000, discount: 16, image: glovesImg, category: "Indumentaria" },
  { id: "6", name: "Casco Aero Elite", price: 95000, oldPrice: 120000, discount: 21, image: helmetImg, category: "Repuestos", tag: "OFERTA" },
  { id: "7", name: "Lentes Sport UV400", price: 32000, image: sunglassesImg, category: "Repuestos", tag: "NUEVO" },
  { id: "8", name: "Jersey Classic (prev.)", price: 22000, oldPrice: 45000, discount: 51, image: jerseyImg, category: "Outlet", tag: "OUTLET" },
  { id: "9", name: "Guantes usados talle M", price: 8000, oldPrice: 18500, discount: 57, image: glovesImg, category: "Usados", tag: "ÚLTIMA UNIDAD" },
  { id: "10", name: "Casco usado talle L", price: 45000, oldPrice: 95000, discount: 53, image: helmetImg, category: "Usados" },
];

const formatPrice = (n: number) =>
  "$" + n.toLocaleString("es-AR");

const tagColor = (tag: string) => {
  switch (tag) {
    case "OFERTA": return "bg-primary text-primary-foreground";
    case "NUEVO": return "bg-accent text-accent-foreground";
    case "OUTLET": return "bg-gold-dark text-primary-foreground";
    case "ÚLTIMA UNIDAD": return "bg-destructive text-destructive-foreground";
    default: return "bg-muted text-muted-foreground";
  }
};

const ProductCard = ({ product }: { product: Product }) => (
  <a
    href={STORE_URL}
    target="_blank"
    rel="noopener noreferrer"
    className="group flex flex-col rounded-xl border border-border bg-card overflow-hidden transition-all hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10"
  >
    <div className="relative aspect-square bg-secondary overflow-hidden">
      <img src={product.image} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
      {product.tag && (
        <span className={`absolute top-2 left-2 text-[10px] font-heading font-bold uppercase px-2 py-0.5 rounded ${tagColor(product.tag)}`}>
          {product.tag}
        </span>
      )}
      {product.discount && (
        <span className="absolute top-2 right-2 text-[10px] font-heading font-bold bg-primary text-primary-foreground px-1.5 py-0.5 rounded">
          -{product.discount}%
        </span>
      )}
    </div>
    <div className="p-3 flex-1 flex flex-col gap-1">
      <p className="text-xs text-foreground font-medium line-clamp-2 leading-tight">{product.name}</p>
      <div className="mt-auto">
        {product.oldPrice && (
          <p className="text-[10px] text-muted-foreground line-through">{formatPrice(product.oldPrice)}</p>
        )}
        <p className="text-sm font-heading font-bold text-foreground">{formatPrice(product.price)}</p>
      </div>
    </div>
  </a>
);

const TiendaSection = () => {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<Category>("Todos");
  const [cartCount] = useState(0);
  const catRef = useRef<HTMLDivElement>(null);

  const filtered = PRODUCTS.filter((p) => {
    const matchCat = activeCategory === "Todos" || p.category === activeCategory;
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const featured = PRODUCTS.filter((p) => p.tag === "OFERTA" || p.tag === "NUEVO").slice(0, 4);
  const byCategory = (cat: Category) => PRODUCTS.filter((p) => p.category === cat).slice(0, 4);

  return (
    <div className="w-full max-w-md animate-fade-in space-y-4 -mt-2">
      {/* 1️⃣ Search bar */}
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
        <button className="relative p-2.5 rounded-xl bg-secondary border border-border hover:border-primary/40 transition-colors">
          <ShoppingCart className="w-5 h-5 text-foreground" />
          {cartCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
              {cartCount}
            </span>
          )}
        </button>
        <button className="p-2.5 rounded-xl bg-secondary border border-border hover:border-primary/40 transition-colors">
          <Bell className="w-5 h-5 text-foreground" />
        </button>
      </div>

      {/* 2️⃣ Categories */}
      <div ref={catRef} className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
        {CATEGORIES.map((cat) => (
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

      {/* 3️⃣ Banner principal */}
      <a href={STORE_URL} target="_blank" rel="noopener noreferrer" className="block relative rounded-xl overflow-hidden group">
        <img src={bannerImg} alt="Promociones" className="w-full h-40 object-cover group-hover:scale-105 transition-transform duration-500" />
        <div className="absolute inset-0 bg-gradient-to-r from-background/90 via-background/50 to-transparent flex flex-col justify-center px-5">
          <span className="text-[10px] font-heading font-bold uppercase tracking-widest text-primary">Nuevas Colecciones</span>
          <h2 className="text-lg font-heading font-bold text-foreground leading-tight mt-1">Jersey Pro Team<br />2025</h2>
          <span className="mt-2 inline-flex items-center gap-1 text-xs font-heading font-semibold text-primary">
            Ver más <ChevronRight className="w-3 h-3" />
          </span>
        </div>
      </a>

      {/* 4️⃣ Promo strip */}
      <div className="flex items-center gap-2 rounded-lg bg-primary/10 border border-primary/20 px-4 py-2.5">
        <Tag className="w-4 h-4 text-primary shrink-0" />
        <p className="text-xs font-heading font-semibold text-primary flex-1">
          Ofertas de la semana · Hasta 50% OFF
        </p>
        <ChevronRight className="w-4 h-4 text-primary shrink-0" />
      </div>

      {/* 5️⃣ Quick access */}
      <div className="flex justify-between gap-1">
        {QUICK_ACCESS.map((qa) => (
          <button
            key={qa.label}
            className="flex flex-col items-center gap-1.5 flex-1 py-2 group"
            onClick={() => {
              if (qa.label === "Ofertas") setActiveCategory("Outlet");
              else if (qa.label === "Nuevos") setActiveCategory("Todos");
              else setActiveCategory("Todos");
            }}
          >
            <div className="w-11 h-11 rounded-full bg-secondary border border-border flex items-center justify-center group-hover:border-primary/40 transition-colors">
              <qa.icon className={`w-5 h-5 ${qa.color}`} />
            </div>
            <span className="text-[10px] font-heading font-medium text-muted-foreground group-hover:text-foreground transition-colors">{qa.label}</span>
          </button>
        ))}
      </div>

      {/* 6️⃣ Featured products */}
      {activeCategory === "Todos" && !search && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-heading font-bold uppercase tracking-wider text-foreground">Destacados</h3>
            <a href={STORE_URL} target="_blank" rel="noopener noreferrer" className="text-[10px] font-heading font-semibold text-primary flex items-center gap-0.5">
              Ver todos <ChevronRight className="w-3 h-3" />
            </a>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {featured.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}

      {/* 7️⃣ Filtered product grid */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-heading font-bold uppercase tracking-wider text-foreground">
            {activeCategory === "Todos" && !search ? "Todos los productos" : search ? `Resultados` : activeCategory}
          </h3>
          <Badge variant="secondary" className="text-[10px] font-heading">{filtered.length} productos</Badge>
        </div>
        {filtered.length > 0 ? (
          <div className="grid grid-cols-2 gap-3">
            {filtered.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">No hay productos en esta categoría.</p>
          </div>
        )}
      </section>

      {/* 8️⃣ Category sections */}
      {activeCategory === "Todos" && !search && (
        <>
          {(["Indumentaria", "Nutrición", "Outlet", "Usados"] as Category[]).map((cat) => {
            const items = byCategory(cat);
            if (items.length === 0) return null;
            return (
              <section key={cat} className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-heading font-bold uppercase tracking-wider text-foreground">
                    {cat === "Indumentaria" ? "Indumentaria destacada" : cat === "Nutrición" ? "Nutrición recomendada" : cat === "Usados" ? "Usados disponibles" : cat}
                  </h3>
                  <button onClick={() => setActiveCategory(cat)} className="text-[10px] font-heading font-semibold text-primary flex items-center gap-0.5">
                    Ver más <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
                <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
                  {items.map((p) => (
                    <div key={p.id} className="w-[140px] shrink-0">
                      <ProductCard product={p} />
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </>
      )}

      {/* 9️⃣ CTA to external store */}
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

      {/* Bottom spacing for nav */}
      <div className="h-4" />
    </div>
  );
};

export default TiendaSection;
