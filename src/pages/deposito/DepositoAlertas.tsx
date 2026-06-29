import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { AlertTriangle, Package, RefreshCw, Play, ClipboardList, ListChecks } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  useProcessTemplates,
  useMyInstances,
  startProcessInstance,
  ProcessTemplate,
} from "@/hooks/useProcesses";

interface Product {
  id: string;
  name: string;
  stock: number;
  min_stock: number;
}

const sb: any = supabase;

const DepositoAlertas = () => {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [admins, setAdmins] = useState<{ email: string; nombre: string }[]>([]);

  const { templates } = useProcessTemplates(false);
  const { instances, reload: reloadInstances } = useMyInstances(userId);

  const [launchTemplate, setLaunchTemplate] = useState<ProcessTemplate | null>(null);
  const [launchEmail, setLaunchEmail] = useState("");
  const [launching, setLaunching] = useState(false);

  const fetchAlerts = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("store_products")
      .select("id, name, stock, min_stock")
      .eq("status", "active")
      .order("stock", { ascending: true });
    setProducts((data || []).filter((p) => p.stock <= p.min_stock));
    setLoading(false);
  };

  useEffect(() => {
    fetchAlerts();
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id || null));
    sb.from("admin_profiles").select("email, first_name, last_name").in("status", ["active", "activo"])
      .then(({ data }: any) => {
        setAdmins((data || []).map((a: any) => ({
          email: a.email,
          nombre: `${a.first_name || ""} ${a.last_name || ""}`.trim() || a.email,
        })));
      });
  }, []);

  const openLaunch = (t: ProcessTemplate) => {
    setLaunchTemplate(t);
    setLaunchEmail(admins[0]?.email || "");
  };

  const launch = async () => {
    if (!launchTemplate || !userId) return;
    setLaunching(true);
    try {
      const id = await startProcessInstance({
        template_id: launchTemplate.id,
        iniciado_por: userId,
        destinatario_reporte_email: launchEmail || null,
      });
      setLaunchTemplate(null);
      navigate(`/deposito/procesos/${id}`);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLaunching(false);
    }
  };

  const sinStock = products.filter((p) => p.stock === 0);
  const stockBajo = products.filter((p) => p.stock > 0 && p.stock <= p.min_stock);

  return (
    <div className="space-y-8">
      {/* ====== STOCK ALERTS ====== */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-heading font-bold uppercase tracking-wider">Alertas de Stock</h1>
          <Button variant="outline" size="sm" onClick={fetchAlerts}>
            <RefreshCw className="w-4 h-4 mr-1" /> Actualizar
          </Button>
        </div>
        {loading ? (
          <div className="text-muted-foreground text-center py-8">Cargando...</div>
        ) : products.length === 0 ? (
          <Card className="border-border">
            <CardContent className="p-8 text-center">
              <Package className="w-10 h-10 mx-auto text-green-500 mb-2" />
              <h3 className="font-heading text-base font-bold">Todo en orden</h3>
              <p className="text-muted-foreground text-xs">No hay productos con stock bajo o sin stock.</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {sinStock.length > 0 && (
              <div className="space-y-2">
                <h2 className="text-sm font-heading font-bold uppercase tracking-wider text-destructive flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" /> Sin stock ({sinStock.length})
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {sinStock.map((p) => (
                    <Card key={p.id} className="border-destructive/30 bg-destructive/5">
                      <CardContent className="p-3 flex items-center justify-between">
                        <div>
                          <p className="font-medium text-sm">{p.name}</p>
                          <p className="text-xs text-muted-foreground">Mínimo: {p.min_stock}</p>
                        </div>
                        <Badge variant="destructive">0</Badge>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
            {stockBajo.length > 0 && (
              <div className="space-y-2">
                <h2 className="text-sm font-heading font-bold uppercase tracking-wider text-yellow-500 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" /> Stock bajo ({stockBajo.length})
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {stockBajo.map((p) => (
                    <Card key={p.id} className="border-yellow-500/30 bg-yellow-500/5">
                      <CardContent className="p-3 flex items-center justify-between">
                        <div>
                          <p className="font-medium text-sm">{p.name}</p>
                          <p className="text-xs text-muted-foreground">Mínimo: {p.min_stock}</p>
                        </div>
                        <Badge variant="outline" className="border-yellow-500 text-yellow-500">{p.stock}</Badge>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {/* ====== PROCESOS ====== */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <ListChecks className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-heading font-bold uppercase tracking-wider">Procesos guiados</h2>
        </div>

        {/* En curso */}
        {instances.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">En curso</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {instances.map((i) => {
                const tpl = templates.find((t) => t.id === i.template_id);
                return (
                  <Card key={i.id} className="border-primary/30 cursor-pointer hover:bg-muted/30" onClick={() => navigate(`/deposito/procesos/${i.id}`)}>
                    <CardContent className="p-3 flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">{tpl?.nombre || "Proceso"}</p>
                        <p className="text-xs text-muted-foreground">Iniciado {new Date(i.started_at).toLocaleString("es-AR")}</p>
                      </div>
                      <Badge variant="default">En curso</Badge>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* Iniciar nuevo */}
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Iniciar nuevo proceso</p>
          {templates.length === 0 ? (
            <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">No hay plantillas activas. Pedile al admin que las configure.</CardContent></Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {templates.map((t) => (
                <Card key={t.id} className="hover:border-primary cursor-pointer transition-colors" onClick={() => openLaunch(t)}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <ClipboardList className="w-4 h-4 text-primary" /> {t.nombre}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-xs text-muted-foreground line-clamp-2">{t.descripcion}</p>
                    <Button size="sm" className="mt-3 w-full"><Play className="w-3 h-3 mr-1" /> Iniciar</Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Launch dialog */}
      <Dialog open={!!launchTemplate} onOpenChange={(o) => !o && setLaunchTemplate(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Iniciar: {launchTemplate?.nombre}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{launchTemplate?.descripcion}</p>
            <div>
              <Label>Destinatario del reporte final</Label>
              {admins.length > 0 ? (
                <Select value={launchEmail} onValueChange={setLaunchEmail}>
                  <SelectTrigger><SelectValue placeholder="Elegí un admin" /></SelectTrigger>
                  <SelectContent>
                    {admins.map((a) => (
                      <SelectItem key={a.email} value={a.email}>{a.nombre} ({a.email})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input value={launchEmail} onChange={(e) => setLaunchEmail(e.target.value)} placeholder="email@ejemplo.com" />
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setLaunchTemplate(null)}>Cancelar</Button>
            <Button onClick={launch} disabled={launching}>{launching ? "Iniciando…" : "Iniciar proceso"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DepositoAlertas;
