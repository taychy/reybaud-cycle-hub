import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CalendarClock, Package, ShoppingBag } from "lucide-react";
import PreorderReserveDialog from "@/components/store/PreorderReserveDialog";
import { formatPrice } from "@/lib/currency";

const PublicPreorderPage = () => {
  const { productId } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [alumnoId, setAlumnoId] = useState<string | null>(null);
  const [reservedUnits, setReservedUnits] = useState<number>(0);
  const [openReserve, setOpenReserve] = useState(false);

  useEffect(() => {
    const load = async () => {
      const [pRes, sess] = await Promise.all([
        supabase.from("store_products").select("*").eq("id", productId!).maybeSingle(),
        supabase.auth.getUser(),
      ]);
      setProduct(pRes.data);
      const { data: r } = await supabase.rpc("get_preorder_reserved_units" as any, { p_product_id: productId });
      setReservedUnits(typeof r === "number" ? r : 0);
      const uid = sess.data.user?.id;
      if (uid) {
        const { data: al } = await supabase.from("alumnos").select("id").eq("user_id", uid).maybeSingle();
        setAlumnoId(al?.id || null);
      }
      setLoading(false);
    };
    if (productId) load();
  }, [productId]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">Cargando...</div>;
  }

  if (!product) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-center p-6">
        <div>
          <h1 className="text-xl font-heading font-bold mb-2">Preventa no disponible</h1>
          <p className="text-muted-foreground">Este producto no está activo o la preventa fue cerrada.</p>
          <Button className="mt-4" onClick={() => navigate("/")}>Ir al inicio</Button>
        </div>
      </div>
    );
  }

  const cupoRestante = product.preorder_total_units
    ? Math.max(0, product.preorder_total_units - reservedUnits)
    : null;

  const handleReserve = () => {
    if (!alumnoId) {
      navigate(`/?redirect=${encodeURIComponent(`/preventa/${productId}`)}`);
      return;
    }
    setOpenReserve(true);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 bg-background/90 backdrop-blur-sm border-b border-border">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Volver
          </button>
          <button
            onClick={() => navigate("/")}
            className="text-sm font-heading font-semibold text-primary uppercase tracking-wider"
          >
            Inicio
          </button>
        </div>
      </header>
      <div className="max-w-md mx-auto p-4 space-y-4">
        <div className="aspect-square rounded-xl overflow-hidden bg-secondary border border-border">
          {product.image_url ? (
            <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground">Sin imagen</div>
          )}
        </div>

        <div className="space-y-1">
          <span className="inline-block text-[10px] font-heading font-bold uppercase tracking-wider bg-primary text-primary-foreground px-2 py-0.5 rounded">
            Preventa
          </span>
          <h1 className="text-2xl font-heading font-bold">{product.name}</h1>
          <p className="text-3xl font-heading font-bold text-primary">
            {formatPrice(Number(product.price), product.currency || "ARS")}
          </p>
        </div>

        {product.preorder_description && (
          <p className="text-sm text-muted-foreground whitespace-pre-line">{product.preorder_description}</p>
        )}

        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-2 text-sm">
          {product.preorder_deadline && (
            <div className="flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-primary" />
              <span>Reservás hasta: <b>{new Date(product.preorder_deadline).toLocaleDateString("es-AR")}</b></span>
            </div>
          )}
          {product.preorder_estimated_delivery && (
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-primary" />
              <span>Entrega estimada: <b>{new Date(product.preorder_estimated_delivery).toLocaleDateString("es-AR")}</b></span>
            </div>
          )}
          {cupoRestante !== null && (
            <div className="text-xs text-muted-foreground">
              Cupo restante: <b className="text-foreground">{cupoRestante}</b> de {product.preorder_total_units}
            </div>
          )}
        </div>

        <Button onClick={handleReserve} className="w-full h-12 text-base" disabled={cupoRestante === 0}>
          <ShoppingBag className="w-5 h-5 mr-2" />
          {cupoRestante === 0 ? "Sin cupo" : alumnoId ? "Reservar mi unidad" : "Ingresar para reservar"}
        </Button>

        <p className="text-[11px] text-muted-foreground text-center">
          Tu cupo se confirma cuando validamos el pago de la seña.
        </p>
      </div>

      <PreorderReserveDialog
        open={openReserve}
        onOpenChange={setOpenReserve}
        product={product}
        alumnoId={alumnoId}
      />
    </div>
  );
};

export default PublicPreorderPage;
