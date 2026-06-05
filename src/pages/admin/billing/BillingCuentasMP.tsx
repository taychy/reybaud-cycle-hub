import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Pencil, Trash2, Wallet, Route, AlertTriangle, Eye, EyeOff, Copy } from "lucide-react";
import { toast } from "sonner";

function SecretField({ label, value }: { label: string; value: string }) {
  const [shown, setShown] = useState(false);
  const masked = value.length <= 8 ? "••••••••" : `${value.slice(0, 4)}••••${value.slice(-4)}`;
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <span className="text-muted-foreground shrink-0">{label}:</span>
      <code className="text-xs font-mono truncate min-w-0 flex-1" title={shown ? value : masked}>
        {shown ? value : masked}
      </code>
      <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => setShown((s) => !s)}>
        {shown ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
      </Button>
      <Button
        size="icon" variant="ghost" className="h-6 w-6 shrink-0"
        onClick={() => { navigator.clipboard.writeText(value); toast.success("Copiado"); }}
      >
        <Copy className="h-3 w-3" />
      </Button>
    </div>
  );
}


type Modo = "test" | "prod";
type Unidad =
  | "suscripcion_escuela" | "viaje_camp" | "evento" | "tienda"
  | "preventa" | "personalizado" | "turnera" | "otro";

const UNIDADES: { value: Unidad; label: string }[] = [
  { value: "suscripcion_escuela", label: "Suscripciones escuela" },
  { value: "viaje_camp", label: "Viajes / Camps" },
  { value: "evento", label: "Eventos" },
  { value: "tienda", label: "Tienda" },
  { value: "preventa", label: "Preventas" },
  { value: "personalizado", label: "Personalizado" },
  { value: "turnera", label: "Turnera" },
  { value: "otro", label: "Otro" },
];

interface CuentaMP {
  id: string;
  nombre: string;
  slug: string;
  secret_name_token: string;
  secret_name_pubkey: string | null;
  secret_name_webhook: string | null;
  emisor_fiscal_default_id: string | null;
  modo: Modo;
  activa: boolean;
  es_default_global: boolean;
  limite_mensual_ars: number | null;
  notas: string | null;
}

interface Routing {
  id: string;
  unidad_negocio: Unidad;
  cuenta_mp_id: string;
  emisor_fiscal_id: string | null;
  activa: boolean;
  prioridad: number;
  notas: string | null;
}

interface Emisor { id: string; nombre_fiscal: string; cuit: string; activo: boolean; }

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 32);

export function BillingCuentasMP() {
  const [cuentas, setCuentas] = useState<CuentaMP[]>([]);
  const [rutas, setRutas] = useState<Routing[]>([]);
  const [emisores, setEmisores] = useState<Emisor[]>([]);
  const [loading, setLoading] = useState(true);

  const [cuentaModalOpen, setCuentaModalOpen] = useState(false);
  const [editingCuenta, setEditingCuenta] = useState<Partial<CuentaMP> | null>(null);

  const [rutaModalOpen, setRutaModalOpen] = useState(false);
  const [editingRuta, setEditingRuta] = useState<Partial<Routing> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [cRes, rRes, eRes] = await Promise.all([
      supabase.from("cuentas_mp" as any).select("*").order("created_at", { ascending: true }),
      supabase.from("cuenta_mp_routing" as any).select("*").order("unidad_negocio").order("prioridad"),
      supabase.from("emisores_fiscales").select("id, nombre_fiscal, cuit, activo").order("nombre_fiscal"),
    ]);
    setCuentas((cRes.data as any) || []);
    setRutas((rRes.data as any) || []);
    setEmisores((eRes.data as any) || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  /* ---------- Cuentas ---------- */
  const openNewCuenta = () => {
    setEditingCuenta({
      nombre: "", slug: "", secret_name_token: "", secret_name_pubkey: "",
      secret_name_webhook: "", modo: "prod", activa: true, es_default_global: false,
      emisor_fiscal_default_id: null, limite_mensual_ars: null, notas: "",
    });
    setCuentaModalOpen(true);
  };

  const openEditCuenta = (c: CuentaMP) => {
    setEditingCuenta({ ...c });
    setCuentaModalOpen(true);
  };

  const saveCuenta = async () => {
    if (!editingCuenta?.nombre || !editingCuenta?.slug || !editingCuenta?.secret_name_token) {
      toast.error("Nombre, slug y nombre del secret del token son obligatorios");
      return;
    }
    const payload: any = {
      nombre: editingCuenta.nombre,
      slug: editingCuenta.slug,
      secret_name_token: editingCuenta.secret_name_token,
      secret_name_pubkey: editingCuenta.secret_name_pubkey || null,
      secret_name_webhook: editingCuenta.secret_name_webhook || null,
      emisor_fiscal_default_id: editingCuenta.emisor_fiscal_default_id || null,
      modo: editingCuenta.modo || "prod",
      activa: editingCuenta.activa ?? true,
      es_default_global: editingCuenta.es_default_global ?? false,
      limite_mensual_ars: editingCuenta.limite_mensual_ars ?? null,
      notas: editingCuenta.notas || null,
    };
    const q = editingCuenta.id
      ? supabase.from("cuentas_mp" as any).update(payload).eq("id", editingCuenta.id)
      : supabase.from("cuentas_mp" as any).insert(payload);
    const { error } = await q;
    if (error) { toast.error(error.message); return; }
    toast.success("Cuenta guardada");
    setCuentaModalOpen(false);
    setEditingCuenta(null);
    load();
  };

  const deleteCuenta = async (id: string) => {
    if (!confirm("¿Eliminar esta cuenta MP? Se eliminarán también sus rutas asociadas.")) return;
    const { error } = await supabase.from("cuentas_mp" as any).delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Cuenta eliminada");
    load();
  };

  /* ---------- Rutas ---------- */
  const openNewRuta = () => {
    setEditingRuta({
      unidad_negocio: "suscripcion_escuela", cuenta_mp_id: "", emisor_fiscal_id: null,
      activa: true, prioridad: 100, notas: "",
    });
    setRutaModalOpen(true);
  };

  const openEditRuta = (r: Routing) => {
    setEditingRuta({ ...r });
    setRutaModalOpen(true);
  };

  const saveRuta = async () => {
    if (!editingRuta?.unidad_negocio || !editingRuta?.cuenta_mp_id) {
      toast.error("Unidad de negocio y cuenta MP son obligatorios");
      return;
    }
    const payload: any = {
      unidad_negocio: editingRuta.unidad_negocio,
      cuenta_mp_id: editingRuta.cuenta_mp_id,
      emisor_fiscal_id: editingRuta.emisor_fiscal_id || null,
      activa: editingRuta.activa ?? true,
      prioridad: editingRuta.prioridad ?? 100,
      notas: editingRuta.notas || null,
    };
    const q = editingRuta.id
      ? supabase.from("cuenta_mp_routing" as any).update(payload).eq("id", editingRuta.id)
      : supabase.from("cuenta_mp_routing" as any).insert(payload);
    const { error } = await q;
    if (error) { toast.error(error.message); return; }
    toast.success("Regla de ruteo guardada");
    setRutaModalOpen(false);
    setEditingRuta(null);
    load();
  };

  const deleteRuta = async (id: string) => {
    if (!confirm("¿Eliminar esta regla de ruteo?")) return;
    const { error } = await supabase.from("cuenta_mp_routing" as any).delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Regla eliminada");
    load();
  };

  const cuentaName = (id: string) => cuentas.find((c) => c.id === id)?.nombre || "—";
  const emisorName = (id: string | null) =>
    id ? emisores.find((e) => e.id === id)?.nombre_fiscal || "—" : "—";

  if (loading) {
    return <div className="animate-pulse text-muted-foreground text-center py-12">Cargando cuentas MP...</div>;
  }

  return (
    <div className="space-y-8">
      <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 flex gap-2 text-sm">
        <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
        <div>
          <strong>Fase 1:</strong> podés cargar las cuentas y definir el ruteo por unidad de negocio.
          Los cobros siguen usando la configuración actual (legacy) hasta que activemos la Fase 2.
        </div>
      </div>

      {/* Sección A — Cuentas MP */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-heading font-semibold flex items-center gap-2">
              <Wallet className="h-5 w-5" /> Cuentas de Mercado Pago
            </h2>
            <p className="text-sm text-muted-foreground">
              Cada cuenta apunta a un set de secrets (token / public key / webhook) y, opcionalmente, a un emisor fiscal default.
            </p>
          </div>
          <Button onClick={openNewCuenta} size="sm">
            <Plus className="h-4 w-4 mr-1" /> Nueva cuenta
          </Button>
        </div>

        {cuentas.length === 0 ? (
          <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
            No hay cuentas MP cargadas. Agregá la primera.
          </CardContent></Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {cuentas.map((c) => (
              <Card key={c.id} className={!c.activa ? "opacity-60" : ""}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        {c.nombre}
                        {c.es_default_global && <Badge variant="default">Default global</Badge>}
                        <Badge variant={c.modo === "prod" ? "secondary" : "outline"}>
                          {c.modo.toUpperCase()}
                        </Badge>
                        {!c.activa && <Badge variant="destructive">Inactiva</Badge>}
                      </CardTitle>
                      <CardDescription className="font-mono text-xs mt-1">{c.slug}</CardDescription>
                    </div>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEditCuenta(c)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => deleteCuenta(c.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="text-sm space-y-1 min-w-0">
                  <SecretField label="Token" value={c.secret_name_token} />
                  {c.secret_name_pubkey && <SecretField label="Pub key" value={c.secret_name_pubkey} />}
                  {c.secret_name_webhook && <SecretField label="Webhook" value={c.secret_name_webhook} />}

                  <div>
                    <span className="text-muted-foreground">Emisor default:</span>{" "}
                    {emisorName(c.emisor_fiscal_default_id)}
                  </div>
                  {c.limite_mensual_ars != null && (
                    <div><span className="text-muted-foreground">Límite mensual:</span> ARS {c.limite_mensual_ars.toLocaleString("es-AR")}</div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Sección B — Ruteo */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-heading font-semibold flex items-center gap-2">
              <Route className="h-5 w-5" /> Ruteo por unidad de negocio
            </h2>
            <p className="text-sm text-muted-foreground">
              Definí qué cuenta MP cobra cada tipo de operación. La regla activa con menor prioridad gana.
            </p>
          </div>
          <Button onClick={openNewRuta} size="sm" disabled={cuentas.length === 0}>
            <Plus className="h-4 w-4 mr-1" /> Nueva regla
          </Button>
        </div>

        {rutas.length === 0 ? (
          <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
            No hay reglas de ruteo. Agregá una para asignar cuentas a unidades de negocio.
          </CardContent></Card>
        ) : (
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Unidad de negocio</TableHead>
                  <TableHead>Cuenta MP</TableHead>
                  <TableHead>Emisor (override)</TableHead>
                  <TableHead>Prioridad</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rutas.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{UNIDADES.find((u) => u.value === r.unidad_negocio)?.label}</TableCell>
                    <TableCell>{cuentaName(r.cuenta_mp_id)}</TableCell>
                    <TableCell className="text-muted-foreground">{emisorName(r.emisor_fiscal_id)}</TableCell>
                    <TableCell>{r.prioridad}</TableCell>
                    <TableCell>
                      {r.activa ? <Badge variant="default">Activa</Badge> : <Badge variant="outline">Inactiva</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" onClick={() => openEditRuta(r)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => deleteRuta(r.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        )}
      </section>

      {/* Modal cuenta */}
      <Dialog open={cuentaModalOpen} onOpenChange={setCuentaModalOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingCuenta?.id ? "Editar cuenta MP" : "Nueva cuenta MP"}</DialogTitle>
            <DialogDescription>
              Los tokens reales se guardan como secrets de la backend. Acá solo se referencian por nombre.
            </DialogDescription>
          </DialogHeader>
          {editingCuenta && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Nombre</Label>
                  <Input
                    value={editingCuenta.nombre || ""}
                    onChange={(e) => {
                      const nombre = e.target.value;
                      setEditingCuenta((p) => ({
                        ...p!,
                        nombre,
                        slug: p?.id ? p.slug : slugify(nombre),
                        secret_name_token: p?.id
                          ? p.secret_name_token
                          : `MP_ACCESS_TOKEN_${slugify(nombre).toUpperCase()}`,
                      }));
                    }}
                    placeholder="Cuenta Juan"
                  />
                </div>
                <div>
                  <Label>Slug</Label>
                  <Input
                    value={editingCuenta.slug || ""}
                    onChange={(e) => setEditingCuenta((p) => ({ ...p!, slug: slugify(e.target.value) }))}
                    placeholder="juan"
                  />
                </div>
              </div>

              <div>
                <Label>Secret name — Access Token *</Label>
                <Input
                  value={editingCuenta.secret_name_token || ""}
                  onChange={(e) => setEditingCuenta((p) => ({ ...p!, secret_name_token: e.target.value }))}
                  placeholder="MP_ACCESS_TOKEN_JUAN"
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Nombre del secret en backend. Cargalo antes en Configuración → Secrets.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Secret name — Public Key</Label>
                  <Input
                    value={editingCuenta.secret_name_pubkey || ""}
                    onChange={(e) => setEditingCuenta((p) => ({ ...p!, secret_name_pubkey: e.target.value }))}
                    placeholder="MP_PUBLIC_KEY_JUAN"
                    className="font-mono text-sm"
                  />
                </div>
                <div>
                  <Label>Secret name — Webhook</Label>
                  <Input
                    value={editingCuenta.secret_name_webhook || ""}
                    onChange={(e) => setEditingCuenta((p) => ({ ...p!, secret_name_webhook: e.target.value }))}
                    placeholder="MP_WEBHOOK_SECRET_JUAN"
                    className="font-mono text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Modo</Label>
                  <Select
                    value={editingCuenta.modo || "prod"}
                    onValueChange={(v) => setEditingCuenta((p) => ({ ...p!, modo: v as Modo }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="prod">Producción</SelectItem>
                      <SelectItem value="test">Test</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Límite mensual ARS (opcional)</Label>
                  <Input
                    type="number"
                    value={editingCuenta.limite_mensual_ars ?? ""}
                    onChange={(e) => setEditingCuenta((p) => ({
                      ...p!,
                      limite_mensual_ars: e.target.value ? Number(e.target.value) : null,
                    }))}
                    placeholder="ej: 2000000"
                  />
                </div>
              </div>

              <div>
                <Label>Emisor fiscal default (opcional)</Label>
                <Select
                  value={editingCuenta.emisor_fiscal_default_id || "none"}
                  onValueChange={(v) => setEditingCuenta((p) => ({
                    ...p!,
                    emisor_fiscal_default_id: v === "none" ? null : v,
                  }))}
                >
                  <SelectTrigger><SelectValue placeholder="Sin emisor default" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin emisor default</SelectItem>
                    {emisores.filter((e) => e.activo).map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.nombre_fiscal} ({e.cuit})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Notas</Label>
                <Textarea
                  value={editingCuenta.notas || ""}
                  onChange={(e) => setEditingCuenta((p) => ({ ...p!, notas: e.target.value }))}
                  rows={2}
                />
              </div>

              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <Label>Cuenta activa</Label>
                  <p className="text-xs text-muted-foreground">Si está inactiva, no se usa para cobrar.</p>
                </div>
                <Switch
                  checked={!!editingCuenta.activa}
                  onCheckedChange={(v) => setEditingCuenta((p) => ({ ...p!, activa: v }))}
                />
              </div>

              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <Label>Default global</Label>
                  <p className="text-xs text-muted-foreground">Se usa cuando no hay regla de ruteo para la operación.</p>
                </div>
                <Switch
                  checked={!!editingCuenta.es_default_global}
                  onCheckedChange={(v) => setEditingCuenta((p) => ({ ...p!, es_default_global: v }))}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCuentaModalOpen(false)}>Cancelar</Button>
            <Button onClick={saveCuenta}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal ruta */}
      <Dialog open={rutaModalOpen} onOpenChange={setRutaModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingRuta?.id ? "Editar regla de ruteo" : "Nueva regla de ruteo"}</DialogTitle>
            <DialogDescription>
              Asociá una unidad de negocio a una cuenta MP. Opcionalmente forzá un emisor fiscal distinto al default de la cuenta.
            </DialogDescription>
          </DialogHeader>
          {editingRuta && (
            <div className="space-y-3">
              <div>
                <Label>Unidad de negocio</Label>
                <Select
                  value={editingRuta.unidad_negocio}
                  onValueChange={(v) => setEditingRuta((p) => ({ ...p!, unidad_negocio: v as Unidad }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {UNIDADES.map((u) => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Cuenta MP</Label>
                <Select
                  value={editingRuta.cuenta_mp_id || ""}
                  onValueChange={(v) => setEditingRuta((p) => ({ ...p!, cuenta_mp_id: v }))}
                >
                  <SelectTrigger><SelectValue placeholder="Elegir cuenta" /></SelectTrigger>
                  <SelectContent>
                    {cuentas.filter((c) => c.activa).map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.nombre} ({c.slug})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Emisor fiscal (override opcional)</Label>
                <Select
                  value={editingRuta.emisor_fiscal_id || "none"}
                  onValueChange={(v) => setEditingRuta((p) => ({
                    ...p!,
                    emisor_fiscal_id: v === "none" ? null : v,
                  }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Usar default de la cuenta</SelectItem>
                    {emisores.filter((e) => e.activo).map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.nombre_fiscal} ({e.cuit})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Prioridad</Label>
                  <Input
                    type="number"
                    value={editingRuta.prioridad ?? 100}
                    onChange={(e) => setEditingRuta((p) => ({ ...p!, prioridad: Number(e.target.value) }))}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Menor = gana primero</p>
                </div>
                <div className="flex flex-col">
                  <Label>Activa</Label>
                  <div className="mt-3">
                    <Switch
                      checked={!!editingRuta.activa}
                      onCheckedChange={(v) => setEditingRuta((p) => ({ ...p!, activa: v }))}
                    />
                  </div>
                </div>
              </div>

              <div>
                <Label>Notas</Label>
                <Textarea
                  value={editingRuta.notas || ""}
                  onChange={(e) => setEditingRuta((p) => ({ ...p!, notas: e.target.value }))}
                  rows={2}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRutaModalOpen(false)}>Cancelar</Button>
            <Button onClick={saveRuta}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
