import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Instagram, Facebook, CheckCircle2, XCircle, ExternalLink, Image as ImageIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Tarea {
  id: string;
  estado: string;
  fecha_clase: string | null;
  foto_url: string | null;
  notas: string | null;
  red_social: string | null;
  link_publicacion: string | null;
  publicado_at: string | null;
  created_at: string;
  coach_id: string | null;
  sede_id: string | null;
  coaches?: { nombre: string } | null;
  sedes?: { nombre: string } | null;
}

export default function AdminGestionRedes() {
  const { toast } = useToast();
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"pendiente" | "publicada" | "descartada">("pendiente");
  const [links, setLinks] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("redes_sociales_tareas")
      .select("*, coaches:coach_id(nombre), sedes:sede_id(nombre)")
      .eq("estado", tab)
      .order("created_at", { ascending: false });
    setTareas((data as any) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [tab]);

  const marcarPublicada = async (t: Tarea, red: string) => {
    const link = links[t.id] || null;
    const { data: { session } } = await supabase.auth.getSession();
    const { error } = await supabase
      .from("redes_sociales_tareas")
      .update({
        estado: "publicada",
        red_social: red,
        link_publicacion: link,
        publicado_at: new Date().toISOString(),
        publicado_por: session?.user.id || null,
      } as any)
      .eq("id", t.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Marcada como publicada" });
    load();
  };

  const descartar = async (t: Tarea) => {
    const { error } = await supabase
      .from("redes_sociales_tareas")
      .update({ estado: "descartada" } as any)
      .eq("id", t.id);
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    toast({ title: "Descartada" });
    load();
  };

  const reabrir = async (t: Tarea) => {
    const { error } = await supabase
      .from("redes_sociales_tareas")
      .update({ estado: "pendiente" } as any)
      .eq("id", t.id);
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold">Gestión de Redes</h1>
          <p className="text-sm text-muted-foreground">Fotos grupales subidas por coaches, listas para publicar.</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="pendiente">Pendientes</TabsTrigger>
          <TabsTrigger value="publicada">Publicadas</TabsTrigger>
          <TabsTrigger value="descartada">Descartadas</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : tareas.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No hay tareas en este estado.</CardContent></Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {tareas.map((t) => (
                <Card key={t.id} className="overflow-hidden">
                  {t.foto_url ? (
                    <a href={t.foto_url} target="_blank" rel="noreferrer" className="block bg-secondary aspect-video overflow-hidden">
                      <img src={t.foto_url} alt="" className="w-full h-full object-cover" />
                    </a>
                  ) : (
                    <div className="aspect-video bg-secondary flex items-center justify-center">
                      <ImageIcon className="w-8 h-8 text-muted-foreground" />
                    </div>
                  )}
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center justify-between gap-2">
                      <span>{t.coaches?.nombre || "Coach"}</span>
                      <Badge variant="outline" className="text-[10px]">{t.fecha_clase}</Badge>
                    </CardTitle>
                    {t.sedes?.nombre && (
                      <p className="text-xs text-muted-foreground">{t.sedes.nombre}</p>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {t.notas && <p className="text-xs text-muted-foreground italic">"{t.notas}"</p>}

                    {tab === "pendiente" && (
                      <>
                        <Input
                          placeholder="Link de publicación (opcional)"
                          value={links[t.id] || ""}
                          onChange={(e) => setLinks((p) => ({ ...p, [t.id]: e.target.value }))}
                          className="text-xs"
                        />
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" onClick={() => marcarPublicada(t, "instagram")}>
                            <Instagram className="w-3.5 h-3.5 mr-1" /> Instagram
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => marcarPublicada(t, "facebook")}>
                            <Facebook className="w-3.5 h-3.5 mr-1" /> Facebook
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => descartar(t)}>
                            <XCircle className="w-3.5 h-3.5 mr-1" /> Descartar
                          </Button>
                        </div>
                      </>
                    )}

                    {tab === "publicada" && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-xs">
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                          <span className="capitalize">{t.red_social || "—"}</span>
                          {t.link_publicacion && (
                            <a href={t.link_publicacion} target="_blank" rel="noreferrer" className="text-primary underline inline-flex items-center gap-1">
                              ver <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => reabrir(t)}>Reabrir</Button>
                      </div>
                    )}

                    {tab === "descartada" && (
                      <Button size="sm" variant="ghost" onClick={() => reabrir(t)}>Reabrir</Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
