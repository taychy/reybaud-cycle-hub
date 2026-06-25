import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, ArrowRight } from "lucide-react";
import logo from "@/assets/logo.png";

type Servicio = {
  id: string; slug: string; nombre: string; descripcion: string | null;
  duracion_minutos: number; precio: number | null; moneda: string; modalidad: string;
};

const BookingLanding = () => {
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("servicios_turnera")
        .select("id, slug, nombre, descripcion, duracion_minutos, precio, moneda, modalidad")
        .eq("activo", true)
        .order("nombre");
      setServicios((data as any[]) || []);
      setLoading(false);
    };
    load();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-3">
          <img src={logo} alt="Ciclismo Reybaud" className="w-8 h-8" />
          <h1 className="font-heading font-bold text-foreground text-sm uppercase tracking-wider">
            Reservar turno
          </h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-4">
        <div>
          <h2 className="text-xl font-heading font-bold text-foreground">Elegí un servicio</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Seleccioná la clase o servicio que querés reservar.
          </p>
        </div>

        {loading ? (
          <p className="text-muted-foreground text-sm">Cargando...</p>
        ) : servicios.length === 0 ? (
          <Card className="bg-card border-border">
            <CardContent className="p-6 text-center text-muted-foreground text-sm">
              No hay servicios disponibles por ahora.
            </CardContent>
          </Card>
        ) : (
          servicios.map((s) => (
            <Link key={s.id} to={`/reservar/${s.slug}`} className="block">
              <Card className="bg-card border-border hover:border-primary/60 transition-colors">
                <CardContent className="p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{s.nombre}</p>
                    {s.descripcion && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{s.descripcion}</p>
                    )}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <Badge variant="secondary" className="text-xs">
                        <Clock className="w-3 h-3 mr-1" /> {s.duracion_minutos} min
                      </Badge>
                      {s.precio != null && (
                        <Badge variant="outline" className="text-xs">
                          ${Number(s.precio).toLocaleString("es-AR")}
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-xs capitalize">{s.modalidad}</Badge>
                    </div>
                  </div>
                  <ArrowRight className="w-5 h-5 text-muted-foreground shrink-0" />
                </CardContent>
              </Card>
            </Link>
          ))
        )}
      </main>
    </div>
  );
};

export default BookingLanding;
