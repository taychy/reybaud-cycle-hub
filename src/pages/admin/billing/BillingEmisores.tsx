import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, ShieldCheck, ShieldAlert, Zap, GraduationCap, Plane, ShoppingBag, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { formatPrice } from "@/lib/currency";
import { MONOTRIBUTO_CATEGORIAS, getTopeByCategoria } from "@/lib/monotributo";

interface Emisor {
  id: string;
  nombre_fiscal: string;
  cuit: string;
  punto_venta: number;
  activo: boolean;
  cert_pem?: string | null;
  key_pem?: string | null;
  es_predeterminado?: boolean;
  facturacion_automatica?: boolean;
  limite_anual_ars?: number | null;
}

interface Facturado {
  emisor_id: string;
  facturado_anual: number;
  porcentaje_uso: number | null;
  cupo_disponible: number | null;
  limite_anual_ars: number | null;
}

type Segmento = "escuela" | "viajes" | "tienda";

interface SegmentoConfig {
  emisor_id: string;
  segmento: Segmento;
  habilitado: boolean;
}

const SEGMENTOS: { key: Segmento; label: string; icon: typeof GraduationCap }[] = [
  { key: "escuela", label: "Escuela", icon: GraduationCap },
  { key: "viajes", label: "Viajes", icon: Plane },
  { key: "tienda", label: "Tienda", icon: ShoppingBag },
];

interface BillingEmisoresProps {
  onDataChange?: () => void;
}

export function BillingEmisores({ onDataChange }: BillingEmisoresProps = {}) {
  const [emisores, setEmisores] = useState<Emisor[]>([]);
  const [facturados, setFacturados] = useState<Map<string, Facturado>>(new Map());
  const [configs, setConfigs] = useState<SegmentoConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Emisor | null>(null);
  const [form, setForm] = useState({
    nombre_fiscal: "",
    cuit: "",
    punto_venta: "1",
    cert_pem: "",
    key_pem: "",
    limite_anual_ars: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    const [emisoresRes, facturadosRes, configsRes] = await Promise.all([
      supabase.from("emisores_fiscales").select("*").order("created_at", { ascending: true }),
      supabase.from("emisor_facturado_anual" as any).select("*"),
      supabase.from("emisor_segmento_config" as any).select("emisor_id, segmento, habilitado"),
    ]);

    setEmisores((emisoresRes.data as any[]) || []);

    const map = new Map<string, Facturado>();
    ((facturadosRes.data as any[]) || []).forEach((f) => map.set(f.emisor_id, f));
    setFacturados(map);

    setConfigs(((configsRes.data as any[]) || []) as SegmentoConfig[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditing(null);
    setForm({ nombre_fiscal: "", cuit: "", punto_venta: "1", cert_pem: "", key_pem: "", limite_anual_ars: "" });
    setDialogOpen(true);
  };

  const openEdit = (e: Emisor) => {
    setEditing(e);
    setForm({
      nombre_fiscal: e.nombre_fiscal,
      cuit: e.cuit,
      punto_venta: String(e.punto_venta),
      cert_pem: e.cert_pem || "",
      key_pem: e.key_pem || "",
      limite_anual_ars: e.limite_anual_ars ? String(e.limite_anual_ars) : "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.nombre_fiscal.trim() || !form.cuit.trim()) {
      toast.error("Completá nombre fiscal y CUIT");
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        nombre_fiscal: form.nombre_fiscal.trim(),
        cuit: form.cuit.trim(),
        punto_venta: parseInt(form.punto_venta) || 1,
        cert_pem: form.cert_pem.trim() || null,
        key_pem: form.key_pem.trim() || null,
        limite_anual_ars: form.limite_anual_ars.trim() ? Number(form.limite_anual_ars) : null,
      };

      let emisorId = editing?.id;
      if (editing) {
        const { error } = await supabase
          .from("emisores_fiscales")
          .update(payload as any)
          .eq("id", editing.id);
        if (error) throw error;
        toast.success("Emisor actualizado");
      } else {
        const { data, error } = await supabase
          .from("emisores_fiscales")
          .insert(payload as any)
          .select("id")
          .single();
        if (error) throw error;
        emisorId = (data as any)?.id;
        // Sembrar las 3 configuraciones de segmento (deshabilitadas por defecto)
        if (emisorId) {
          await supabase.from("emisor_segmento_config" as any).insert(
            SEGMENTOS.map((s) => ({ emisor_id: emisorId, segmento: s.key, habilitado: false })) as any
          );
        }
        toast.success("Emisor creado");
      }

      setDialogOpen(false);
      await load();
      onDataChange?.();
    } catch (err) {
      console.error(err);
      toast.error("Error al guardar");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (emisor: Emisor) => {
    await supabase
      .from("emisores_fiscales")
      .update({ activo: !emisor.activo } as any)
      .eq("id", emisor.id);
    await load();
    onDataChange?.();
  };

  const toggleAutoFacturacion = async (emisor: Emisor) => {
    await supabase
      .from("emisores_fiscales")
      .update({ facturacion_automatica: !emisor.facturacion_automatica } as any)
      .eq("id", emisor.id);
    toast.success(emisor.facturacion_automatica ? "Facturación automática desactivada" : "Facturación automática activada");
    await load();
    onDataChange?.();
  };

  const toggleSegmento = async (emisorId: string, segmento: Segmento, current: boolean) => {
    const existing = configs.find((c) => c.emisor_id === emisorId && c.segmento === segmento);
    if (existing) {
      await supabase
        .from("emisor_segmento_config" as any)
        .update({ habilitado: !current } as any)
        .eq("emisor_id", emisorId)
        .eq("segmento", segmento);
    } else {
      await supabase.from("emisor_segmento_config" as any).insert({
        emisor_id: emisorId,
        segmento,
        habilitado: !current,
      } as any);
    }
    await load();
    onDataChange?.();
  };

  const isHabilitado = (emisorId: string, segmento: Segmento) =>
    configs.find((c) => c.emisor_id === emisorId && c.segmento === segmento)?.habilitado ?? false;

  const hasCerts = (e: Emisor) => !!(e.cert_pem && e.key_pem);

  // Alertas: segmentos sin emisor habilitado
  const segmentosSinEmisor = SEGMENTOS.filter(
    (s) => !configs.some((c) => c.segmento === s.key && c.habilitado)
  );

  if (loading) return <div className="text-muted-foreground text-center py-8">Cargando...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-heading font-semibold text-muted-foreground uppercase tracking-wider">
          Emisores fiscales ({emisores.length})
        </h3>
        <Button size="sm" onClick={openNew}>
          <Plus className="w-4 h-4 mr-1" /> Nuevo emisor
        </Button>
      </div>

      {/* Alertas de segmentos sin cobertura */}
      {emisores.length > 0 && segmentosSinEmisor.length > 0 && (
        <div className="rounded-xl border border-orange-500/30 bg-orange-500/5 p-3 flex gap-2">
          <AlertTriangle className="w-4 h-4 text-orange-500 mt-0.5 shrink-0" />
          <div className="text-xs">
            <p className="font-semibold text-orange-500">Segmentos sin emisor habilitado:</p>
            <p className="text-muted-foreground mt-0.5">
              {segmentosSinEmisor.map((s) => s.label).join(", ")}. Las facturas de estos segmentos quedarán pendientes.
            </p>
          </div>
        </div>
      )}

      {emisores.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          No hay emisores configurados. Agregá al menos uno para poder facturar.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {emisores.map((e) => {
            const fact = facturados.get(e.id);
            const usoPct = fact?.porcentaje_uso ?? null;
            const overLimit = usoPct !== null && usoPct >= 90;
            const warnLimit = usoPct !== null && usoPct >= 75 && usoPct < 90;

            return (
              <div
                key={e.id}
                className={`rounded-xl border p-4 space-y-3 transition-colors ${
                  e.activo ? "border-border bg-card" : "border-border/50 bg-card/50 opacity-60"
                }`}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground truncate">{e.nombre_fiscal}</p>
                    <p className="text-xs text-muted-foreground">CUIT: {e.cuit} · PV: {e.punto_venta}</p>
                    <div className="flex items-center gap-1 mt-1">
                      {hasCerts(e) ? (
                        <>
                          <ShieldCheck className="w-3.5 h-3.5 text-green-500" />
                          <span className="text-xs text-green-500">Certificado AFIP cargado</span>
                        </>
                      ) : (
                        <>
                          <ShieldAlert className="w-3.5 h-3.5 text-yellow-500" />
                          <span className="text-xs text-yellow-500">Sin certificado AFIP</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(e)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Switch checked={e.activo} onCheckedChange={() => toggleActive(e)} />
                  </div>
                </div>

                {/* Cupo anual */}
                {e.limite_anual_ars ? (
                  <div className="space-y-1 pt-2 border-t border-border">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Cupo anual</span>
                      <span className={`font-semibold ${overLimit ? "text-destructive" : warnLimit ? "text-orange-500" : "text-foreground"}`}>
                        {usoPct?.toFixed(1) ?? "0"}%
                      </span>
                    </div>
                    <Progress
                      value={Math.min(usoPct ?? 0, 100)}
                      className={overLimit ? "[&>div]:bg-destructive" : warnLimit ? "[&>div]:bg-orange-500" : ""}
                    />
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>{formatPrice(fact?.facturado_anual ?? 0, "ARS")}</span>
                      <span>de {formatPrice(e.limite_anual_ars, "ARS")}</span>
                    </div>
                    {fact?.cupo_disponible !== null && fact?.cupo_disponible !== undefined && (
                      <p className="text-[10px] text-muted-foreground">
                        Disponible: <span className="font-medium text-foreground">{formatPrice(fact.cupo_disponible, "ARS")}</span>
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="pt-2 border-t border-border">
                    <p className="text-[11px] text-muted-foreground">
                      Sin límite anual configurado. Editá el emisor para agregar el tope de tu categoría monotributo.
                    </p>
                  </div>
                )}

                {/* Auto-facturación */}
                {e.activo && (
                  <div className="flex items-center justify-between pt-2 border-t border-border">
                    <div className="flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Facturación automática</span>
                    </div>
                    <Switch
                      checked={!!e.facturacion_automatica}
                      onCheckedChange={() => toggleAutoFacturacion(e)}
                      disabled={!hasCerts(e)}
                    />
                  </div>
                )}
                {!hasCerts(e) && e.activo && (
                  <p className="text-[10px] text-yellow-500">
                    Cargá el certificado AFIP para habilitar facturación automática
                  </p>
                )}

                {/* Segmentos habilitados */}
                {e.activo && (
                  <div className="pt-2 border-t border-border space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Segmentos habilitados
                    </p>
                    <div className="grid grid-cols-3 gap-1.5">
                      {SEGMENTOS.map((seg) => {
                        const Icon = seg.icon;
                        const enabled = isHabilitado(e.id, seg.key);
                        return (
                          <button
                            key={seg.key}
                            onClick={() => toggleSegmento(e.id, seg.key, enabled)}
                            disabled={overLimit}
                            className={`flex flex-col items-center gap-0.5 py-2 px-1 rounded-lg border text-[10px] font-medium transition-colors ${
                              enabled
                                ? "border-primary/40 bg-primary/10 text-primary"
                                : "border-border bg-background text-muted-foreground hover:border-border/80"
                            } ${overLimit ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
                            title={overLimit ? "Cupo anual al límite" : enabled ? `Deshabilitar ${seg.label}` : `Habilitar ${seg.label}`}
                          >
                            <Icon className="w-3.5 h-3.5" />
                            <span>{seg.label}</span>
                          </button>
                        );
                      })}
                    </div>
                    {overLimit && (
                      <p className="text-[10px] text-destructive">
                        Este emisor superó el 90% del cupo. Deshabilitá segmentos o aumentá el límite.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">
              {editing ? "Editar emisor" : "Nuevo emisor fiscal"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Nombre fiscal</label>
              <Input
                placeholder="Ej: Juan Pérez"
                value={form.nombre_fiscal}
                onChange={(e) => setForm({ ...form, nombre_fiscal: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">CUIT</label>
              <Input
                placeholder="Ej: 20-12345678-9"
                value={form.cuit}
                onChange={(e) => setForm({ ...form, cuit: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Punto de venta</label>
                <Input
                  type="number"
                  min={1}
                  value={form.punto_venta}
                  onChange={(e) => setForm({ ...form, punto_venta: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Tope anual (ARS)</label>
                <Input
                  type="number"
                  min={0}
                  placeholder="Ej: 68000000"
                  value={form.limite_anual_ars}
                  onChange={(e) => setForm({ ...form, limite_anual_ars: e.target.value })}
                />
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground -mt-2">
              El tope anual es el límite de facturación de tu categoría monotributo. Dejalo vacío si no querés controlarlo.
            </p>

            <div className="border-t border-border pt-4 space-y-1">
              <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4" />
                Certificado digital AFIP
              </h4>
              <p className="text-xs text-muted-foreground">
                Pegá el contenido del certificado (.pem/.crt) y la clave privada (.key) para emitir facturas reales contra AFIP.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Certificado (.pem / .crt)</label>
              <Textarea
                placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
                rows={4}
                className="font-mono text-xs"
                value={form.cert_pem}
                onChange={(e) => setForm({ ...form, cert_pem: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Clave privada (.key)</label>
              <Textarea
                placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----"
                rows={4}
                className="font-mono text-xs"
                value={form.key_pem}
                onChange={(e) => setForm({ ...form, key_pem: e.target.value })}
              />
            </div>

            <Button className="w-full" disabled={submitting} onClick={handleSave}>
              {submitting ? "Guardando..." : editing ? "Actualizar" : "Crear emisor"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
