import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { MainGoalCard } from "@/components/progress/MainGoalCard";
import { CoachFeedbackCard, type FeedbackRecord } from "@/components/progress/CoachFeedbackCard";
import { ChevronRight, ShoppingBag } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import jerseyImg from "@/assets/store/jersey.jpg";
import BuyProductDialog from "@/components/store/BuyProductDialog";

type StoreProduct = Tables<"store_products">;

const STORE_URL = "https://ciclismoreybaud.mitiendanube.com/";


const formatPrice = (n: number) => "$" + n.toLocaleString("es-AR");

interface Props {
  alumnoId: string;
  onGoToTienda?: () => void;
}



const HomeTrainingExtras = ({ alumnoId, onGoToTienda }: Props) => {
  const [feedback, setFeedback] = useState<FeedbackRecord[]>([]);
  const [featured, setFeatured] = useState<StoreProduct[]>([]);

  useEffect(() => {
    if (!alumnoId) return;

    (async () => {
      const { data: fbData } = await supabase
        .from("feedback_coach")
        .select("id, fecha, comentario, tipo, coach_id")
        .eq("alumno_id", alumnoId)
        .order("fecha", { ascending: false })
        .limit(3);

      if (fbData && fbData.length > 0) {
        const coachIds = [...new Set(fbData.map((f) => f.coach_id))];
        const { data: coaches } = await supabase
          .from("coaches")
          .select("id, nombre")
          .in("id", coachIds);

        setFeedback(
          fbData.map((f) => ({
            id: f.id,
            fecha: f.fecha,
            comentario: f.comentario,
            tipo: f.tipo || "general",
            coach: coaches?.find((c) => c.id === f.coach_id)
              ? { nombre: coaches.find((c) => c.id === f.coach_id)!.nombre }
              : null,
          }))
        );
      }

      const { data: prodData } = await supabase
        .from("store_products")
        .select("*")
        .eq("status", "active")
        .eq("featured", true)
        .order("featured_order", { ascending: true, nullsFirst: false })
        .limit(4);

      setFeatured(prodData || []);
    })();
  }, [alumnoId]);

  const goToTienda = () => {
    if (onGoToTienda) onGoToTienda();
  };


  return (
    <div className="space-y-4">
      <CoachFeedbackCard feedback={feedback} />

      <MainGoalCard alumnoId={alumnoId} />

      {/* Featured store products */}
      <div className="rounded-xl border border-border bg-card/80 backdrop-blur-sm p-5 space-y-4 shadow-lg shadow-black/20">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-heading font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <ShoppingBag className="w-4 h-4" /> Destacados en tienda
          </h2>
          <button
            onClick={goToTienda}
            className="text-[10px] font-heading font-semibold text-primary flex items-center gap-0.5 uppercase tracking-wider"
          >
            Ver tienda <ChevronRight className="w-3 h-3" />
          </button>
        </div>

        {featured.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Pronto vas a ver nuestros productos destacados acá.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {featured.map((p) => {
              const isPreorder = (p as any).is_preorder;
              const commonContent = (
                <>
                  <div className="relative aspect-square bg-secondary overflow-hidden">
                    <img
                      src={p.image_url || jerseyImg}
                      alt={p.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                    {isPreorder && (
                      <span className="absolute top-2 left-2 text-[10px] font-heading font-bold bg-primary text-primary-foreground px-1.5 py-0.5 rounded uppercase tracking-wider">
                        Preventa
                      </span>
                    )}
                    {p.discount && p.discount > 0 && (
                      <span className="absolute top-2 right-2 text-[10px] font-heading font-bold bg-primary text-primary-foreground px-1.5 py-0.5 rounded">
                        -{p.discount}%
                      </span>
                    )}
                  </div>
                  <div className="p-3 flex-1 flex flex-col gap-1">
                    <p className="text-xs text-foreground font-medium line-clamp-2 leading-tight">{p.name}</p>
                    <div className="mt-auto">
                      {p.old_price && (
                        <p className="text-[10px] text-muted-foreground line-through">{formatPrice(p.old_price)}</p>
                      )}
                      <p className="text-sm font-heading font-bold text-foreground">{formatPrice(p.price)}</p>
                    </div>
                  </div>
                </>
              );

              const className =
                "group flex flex-col rounded-xl border border-border bg-card overflow-hidden transition-all hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10";

              if (isPreorder) {
                return (
                  <Link key={p.id} to={`/preventa/${p.id}`} className={className}>
                    {commonContent}
                  </Link>
                );
              }

              return (
                <a
                  key={p.id}
                  href={STORE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={className}
                >
                  {commonContent}
                </a>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default HomeTrainingExtras;
