import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Users, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { Tables } from "@/integrations/supabase/types";

type Alumno = Tables<"alumnos">;

const CoachAlumnos = () => {
  const navigate = useNavigate();
  const [alumnos, setAlumnos] = useState<Alumno[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [coachGrupos, setCoachGrupos] = useState<string[]>([]);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return; // ProtectedRoute handles redirect

      const { data: coach } = await supabase
        .from("coaches")
        .select("grupos")
        .eq("user_id", session.user.id)
        .single();

      const grupos = coach?.grupos || [];
      setCoachGrupos(grupos);

      if (grupos.length > 0) {
        const { data } = await supabase
          .from("alumnos")
          .select("*")
          .in("grupo", grupos)
          .eq("estado", "activo")
          .order("nombre");
        setAlumnos(data || []);
      }
      setLoading(false);
    };
    init();
  }, [navigate]);

  const filtered = alumnos.filter(a =>
    `${a.nombre} ${a.apellido || ""}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background p-4 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate("/coach")}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-xl font-heading font-bold text-foreground">Mis Alumnos</h1>
      </div>

      {coachGrupos.length > 0 && (
        <div className="flex gap-2 mb-4 flex-wrap">
          {coachGrupos.map(g => (
            <Badge key={g} variant="secondary">{g}</Badge>
          ))}
        </div>
      )}

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar alumno..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {loading ? (
        <p className="text-center text-muted-foreground py-8">Cargando...</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No se encontraron alumnos</p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground mb-2">{filtered.length} alumno{filtered.length !== 1 ? "s" : ""}</p>
          {filtered.map(a => (
            <Card key={a.id}>
              <CardContent className="p-3 flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground">{a.nombre} {a.apellido || ""}</p>
                  <p className="text-sm text-muted-foreground">{a.email}</p>
                </div>
                <Badge variant="outline">{a.grupo}</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default CoachAlumnos;
