import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Pause, Play, Package, Search, Trash2 } from "lucide-react";
import { formatPrice } from "@/lib/currency";
import StorePromotions from "./StorePromotions";
import {
  applyCampaignItem,
  campaignStatus,
  CAMPAIGN_STATUS_LABEL,
  CAMPAIGN_PAYMENT_LABEL,
  mediosPagoLabel,
  urgencyText,
  type CampaignDiscountType,
  type CampaignPaymentMethod,
  type CampaignStatus,
  type StoreCampaign,
} from "@/lib/campaigns";


interface CampaignRow extends StoreCampaign {
  items_count?: number;
}

interface ProductRow {
  id: string;
  name: string;
  price: number;
  currency: string | null;
  category_id: string | null;
  image_url: string | null;
  variants: any;
  is_combo: boolean | null;
  combo_pricing_mode: string | null;
}

interface ItemRow {
  id: string;
  campaign_id: string;
  product_id: string;
  variant_keys: string[] | null;
  tipo: CampaignDiscountType;
  valor: number;
  activo: boolean;
}

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60);

const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

const statusVariant: Record<CampaignStatus, string> = {
  activa: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  programada: "bg-cyan-500/15 text-cyan-500 border-cyan-500/30",
  finalizada: "bg-muted text-muted-foreground border-border",
  pausada: "bg-amber-500/15 text-amber-500 border-amber-500/30",
};

const variantKeysOf = (variants: any): string[] => {
  const specs: { name: string; options: string[] }[] = Array.isArray(variants)
    ? variants.filter((v: any) => v?.name && Array.isArray(v?.options) && v.options.length)
    : [];
  if (!specs.length) return [];
  let combos: string[] = [""];
  for (const spec of specs) {
    const next: string[] = [];
    for (const base of combos) {
      for (const opt of spec.options) {
        next.push(base ? `${base}|${spec.name}:${opt}` : `${spec.name}:${opt}`);
      }
    }
    combos = next;
  }
  return combos;
};

const StoreCampaigns = () => {
  const { toast } = useToast();
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(true);

  // form campaña
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<Partial<CampaignRow>>({});
  const [saving, setSaving] = useState(false);

  // productos de campaña
  const [productsOpen, setProductsOpen] = useState(false);
  const [current, setCurrent] = useState<CampaignRow | null>(null);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [items, setItems] = useState<Record<string, ItemRow>>({});
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState("all");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [bulkPct, setBulkPct] = useState<string>("");
  const [variantDialog, setVariantDialog] = useState<ProductRow | null>(null);

  const load = async () => {
    const { data } = await supabase.from("store_campaigns").select("*").order("fecha_inicio", { ascending: false });
    const list = (data as any as CampaignRow[]) || [];
    if (list.length) {
      const { data: counts } = await supabase.from("store_campaign_items").select("campaign_id");
      const map: Record<string, number> = {};
      for (const r of (counts as any[]) || []) map[r.campaign_id] = (map[r.campaign_id] || 0) + 1;
      list.forEach((c) => (c.items_count = map[c.id] || 0));
    }
    setCampaigns(list);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openNew = () => {
    const now = new Date();
    const end = new Date(now.getTime() + 14 * 86400000);
    setForm({
      nombre: "",
      descripcion: "",
      fecha_inicio: now.toISOString(),
      fecha_fin: end.toISOString(),
      activa: false,
      badge_texto: "",
      mostrar_urgencia: true,
      medios_pago: ["mp", "efectivo"],
    });
    setFormOpen(true);
  };

  // En el formulario respetamos la selección tal cual (puede quedar vacía y bloquear el guardado).
  const formMedios: CampaignPaymentMethod[] = (form.medios_pago === undefined
    ? ["mp", "efectivo"]
    : (form.medios_pago || [])
  ).filter((m): m is CampaignPaymentMethod => m === "mp" || m === "efectivo");

  const toggleMedio = (m: CampaignPaymentMethod) => {
    setForm((f) => {
      const actuales = (f.medios_pago === undefined
        ? ["mp", "efectivo"]
        : (f.medios_pago || [])
      ).filter((x): x is CampaignPaymentMethod => x === "mp" || x === "efectivo");
      const next = actuales.includes(m) ? actuales.filter((x) => x !== m) : [...actuales, m];
      return { ...f, medios_pago: next };
    });
  };

  const saveCampaign = async () => {
    if (!form.nombre || !form.fecha_inicio || !form.fecha_fin) {
      toast({ title: "Faltan datos", description: "Nombre y fechas son obligatorios.", variant: "destructive" });
      return;
    }
    if (new Date(form.fecha_fin) <= new Date(form.fecha_inicio)) {
      toast({ title: "Fechas inválidas", description: "La fecha de fin debe ser posterior al inicio.", variant: "destructive" });
      return;
    }
    const medios = formMedios;
    if (!medios.length) {
      toast({ title: "Elegí una forma de pago", description: "La campaña tiene que aplicar al menos a Mercado Pago o a Efectivo.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload: any = {
      nombre: form.nombre,
      descripcion: form.descripcion || null,
      fecha_inicio: form.fecha_inicio,
      fecha_fin: form.fecha_fin,
      activa: form.activa ?? false,
      badge_texto: form.badge_texto || null,
      mostrar_urgencia: form.mostrar_urgencia ?? false,
      medios_pago: medios,
    };
    let error;
    if (form.id) {
      ({ error } = await supabase.from("store_campaigns").update(payload).eq("id", form.id));
    } else {
      payload.slug = `${slugify(form.nombre)}-${Date.now().toString(36).slice(-4)}`;
      ({ error } = await supabase.from("store_campaigns").insert(payload));
    }
    setSaving(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    setFormOpen(false);
    toast({ title: "Campaña guardada" });
    load();
  };

  const toggleActiva = async (c: CampaignRow) => {
    const { error } = await supabase.from("store_campaigns").update({ activa: !c.activa }).eq("id", c.id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    load();
  };



  const openProducts = async (c: CampaignRow) => {
    setCurrent(c);
    setProductsOpen(true);
    setSearch(""); setCat("all"); setSelected({}); setBulkPct("");
    const [prodRes, catRes, itemRes] = await Promise.all([
      supabase.from("store_products").select("id, name, price, currency, category_id, image_url, variants, is_combo, combo_pricing_mode").eq("status", "active").order("name"),
      supabase.from("store_categories").select("id, name").eq("active", true).order("sort_order"),
      supabase.from("store_campaign_items").select("*").eq("campaign_id", c.id),
    ]);
    setProducts((prodRes.data as any) || []);
    setCategories((catRes.data as any) || []);
    const map: Record<string, ItemRow> = {};
    for (const it of ((itemRes.data as any as ItemRow[]) || [])) map[it.product_id] = it;
    setItems(map);
  };

  const refreshItems = async (campaignId: string) => {
    const { data } = await supabase.from("store_campaign_items").select("*").eq("campaign_id", campaignId);
    const map: Record<string, ItemRow> = {};
    for (const it of ((data as any as ItemRow[]) || [])) map[it.product_id] = it;
    setItems(map);
  };

  const upsertItem = async (p: ProductRow, patch: Partial<ItemRow>) => {
    if (!current) return;
    const existing = items[p.id];
    if (existing) {
      const { error } = await supabase.from("store_campaign_items").update(patch as any).eq("id", existing.id);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    } else {
      const { error } = await supabase.from("store_campaign_items").insert({
        campaign_id: current.id,
        product_id: p.id,
        variant_keys: patch.variant_keys ?? null,
        tipo: patch.tipo ?? "porcentaje",
        valor: patch.valor ?? 0,
        activo: patch.activo ?? true,
      } as any);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    }
    await refreshItems(current.id);
    load();
  };

  const removeItem = async (p: ProductRow) => {
    const existing = items[p.id];
    if (!existing || !current) return;
    await supabase.from("store_campaign_items").delete().eq("id", existing.id);
    await refreshItems(current.id);
    load();
  };

  const applyBulk = async () => {
    if (!current) return;
    const pct = Number(bulkPct);
    if (!pct || pct <= 0 || pct > 100) {
      toast({ title: "Porcentaje inválido", variant: "destructive" });
      return;
    }
    const ids = Object.keys(selected).filter((k) => selected[k]);
    if (!ids.length) { toast({ title: "Elegí al menos un producto", variant: "destructive" }); return; }
    for (const id of ids) {
      const p = products.find((x) => x.id === id);
      if (p) await upsertItem(p, { tipo: "porcentaje", valor: pct, activo: true });
    }
    toast({ title: `Descuento del ${pct}% aplicado a ${ids.length} producto(s)` });
    setSelected({});
  };

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) =>
      (cat === "all" || p.category_id === cat) &&
      (!q || p.name.toLowerCase().includes(q))
    );
  }, [products, search, cat]);

  const previewProduct = useMemo(() => {
    const withItem = products.find((p) => items[p.id]);
    return withItem || null;
  }, [products, items]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold">Campañas</h1>
          <p className="text-sm text-muted-foreground">Promociones reutilizables con vigencia. Al terminar, los precios vuelven solos.</p>
        </div>
        <Button onClick={openNew}><Plus className="w-4 h-4 mr-1" /> Nueva campaña</Button>
      </div>

      {loading ? (
        <div className="animate-pulse text-muted-foreground">Cargando...</div>
      ) : (
        <div className="rounded-xl border border-border bg-card divide-y divide-border">
          {campaigns.map((c) => {
            const st = campaignStatus(c);
            return (
              <div key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-[200px]">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-foreground">{c.nombre}</p>
                    <span className={`text-[10px] font-heading font-bold uppercase px-2 py-0.5 rounded border ${statusVariant[st]}`}>
                      {CAMPAIGN_STATUS_LABEL[st]}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {new Date(c.fecha_inicio).toLocaleDateString("es-AR")} → {new Date(c.fecha_fin).toLocaleDateString("es-AR")}
                    {" · "}{c.items_count ?? 0} producto(s)
                    {` · Pago: ${mediosPagoLabel(c.medios_pago)}`}
                    {c.badge_texto ? ` · Badge: ${c.badge_texto}` : ""}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => openProducts(c)}>
                  <Package className="w-4 h-4 mr-1" /> Productos
                </Button>
                <Button variant="ghost" size="sm" onClick={() => toggleActiva(c)}>
                  {c.activa ? <><Pause className="w-4 h-4 mr-1" /> Pausar</> : <><Play className="w-4 h-4 mr-1" /> Activar</>}
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setForm({ ...c }); setFormOpen(true); }}>
                  <Pencil className="w-4 h-4" />
                </Button>
              </div>
            );
          })}
          {campaigns.length === 0 && (
            <div className="p-8 text-center text-muted-foreground text-sm">
              Todavía no hay campañas. Creá una (por ejemplo “Fin de Invierno”), elegí productos y activala cuando quieras.
            </div>
          )}
        </div>
      )}

      {/* Alta/edición de campaña */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar campaña" : "Nueva campaña"}</DialogTitle>
            <DialogDescription>Definí vigencia y presentación. Los descuentos se cargan después, por producto.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-heading uppercase text-muted-foreground">Nombre</label>
              <Input value={form.nombre || ""} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} placeholder="Fin de Invierno" />
            </div>
            <div>
              <label className="text-xs font-heading uppercase text-muted-foreground">Descripción (opcional)</label>
              <Textarea rows={2} value={form.descripcion || ""} onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-heading uppercase text-muted-foreground">Inicio</label>
                <Input type="datetime-local" value={form.fecha_inicio ? toLocalInput(form.fecha_inicio) : ""} onChange={(e) => setForm((f) => ({ ...f, fecha_inicio: new Date(e.target.value).toISOString() }))} />
              </div>
              <div>
                <label className="text-xs font-heading uppercase text-muted-foreground">Fin</label>
                <Input type="datetime-local" value={form.fecha_fin ? toLocalInput(form.fecha_fin) : ""} onChange={(e) => setForm((f) => ({ ...f, fecha_fin: new Date(e.target.value).toISOString() }))} />
              </div>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-sm font-medium">¿En qué formas de pago aplica el descuento?</p>
              <p className="text-xs text-muted-foreground mb-2">Con la otra forma de pago el producto se vende igual, al precio normal.</p>
              <div className="flex gap-2">
                {(["mp", "efectivo"] as CampaignPaymentMethod[]).map((m) => (
                  <Button
                    key={m}
                    type="button"
                    size="sm"
                    variant={formMedios.includes(m) ? "default" : "outline"}
                    onClick={() => toggleMedio(m)}
                  >
                    {CAMPAIGN_PAYMENT_LABEL[m]}
                  </Button>
                ))}
              </div>
              {formMedios.length === 0 && (
                <p className="text-xs text-destructive mt-2">Elegí al menos una forma de pago.</p>
              )}
            </div>
            <div>
              <label className="text-xs font-heading uppercase text-muted-foreground">Badge</label>
              <Input value={form.badge_texto || ""} onChange={(e) => setForm((f) => ({ ...f, badge_texto: e.target.value }))} placeholder="FIN DE INVIERNO" />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">Mostrar urgencia</p>
                <p className="text-xs text-muted-foreground">“Termina en X días” o “Hasta DD/MM”.</p>
              </div>
              <Switch checked={form.mostrar_urgencia ?? false} onCheckedChange={(v) => setForm((f) => ({ ...f, mostrar_urgencia: v }))} />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">Activa</p>
                <p className="text-xs text-muted-foreground">Sólo descuenta dentro del rango de fechas.</p>
              </div>
              <Switch checked={form.activa ?? false} onCheckedChange={(v) => setForm((f) => ({ ...f, activa: v }))} />
            </div>

            {/* Vista previa */}
            <div className="rounded-lg border border-border p-3">
              <p className="text-[10px] font-heading uppercase text-muted-foreground mb-2">Vista previa (ejemplo, no se guarda)</p>
              <div className="w-40 rounded-xl border border-border overflow-hidden">
                <div className="relative h-24 bg-secondary flex items-center justify-center text-xs text-muted-foreground">
                  Foto
                  {form.badge_texto && (
                    <span className="absolute top-1 left-1 text-[9px] font-heading font-bold uppercase px-1.5 py-0.5 rounded bg-primary text-primary-foreground">
                      {form.badge_texto}
                    </span>
                  )}
                  <span className="absolute top-1 right-1 text-[9px] font-heading font-bold bg-primary text-primary-foreground px-1 rounded">-30%</span>
                </div>
                <div className="p-2">
                  <p className="text-[11px]">Producto de ejemplo</p>
                  <p className="text-[10px] text-muted-foreground line-through">{formatPrice(100000)}</p>
                  <p className="text-sm font-heading font-bold text-primary">{formatPrice(70000)}</p>
                  {form.mostrar_urgencia && form.fecha_fin && (
                    <p className="text-[10px] text-primary">{urgencyText(form.fecha_fin)}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button>
              <Button onClick={saveCampaign} disabled={saving}>{saving ? "Guardando..." : "Guardar"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Productos de la campaña */}
      <Dialog open={productsOpen} onOpenChange={setProductsOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Productos · {current?.nombre}</DialogTitle>
            <DialogDescription>Elegí productos y su descuento. Podés aplicar el mismo % a varios y luego ajustar uno puntual.</DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Buscar producto..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={cat} onValueChange={setCat}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las categorías</SelectItem>
                {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input className="w-24" type="number" placeholder="% " value={bulkPct} onChange={(e) => setBulkPct(e.target.value)} />
            <Button variant="outline" onClick={applyBulk}>Aplicar % a seleccionados</Button>
          </div>

          <div className="rounded-lg border border-border divide-y divide-border max-h-[50vh] overflow-y-auto">
            {filteredProducts.map((p) => {
              const it = items[p.id];
              const preview = it ? applyCampaignItem(Number(p.price), it) : null;
              const comboFixed = p.is_combo && p.combo_pricing_mode === "fixed";
              return (
                <div key={p.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <input
                    type="checkbox"
                    className="w-4 h-4"
                    checked={!!selected[p.id]}
                    onChange={(e) => setSelected((s) => ({ ...s, [p.id]: e.target.checked }))}
                  />
                  <div className="flex-1 min-w-[160px]">
                    <p className="text-sm text-foreground">{p.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {formatPrice(Number(p.price), p.currency || "ARS")}
                      {preview != null && <> → <b className="text-primary">{formatPrice(preview, p.currency || "ARS")}</b></>}
                      {it?.variant_keys ? ` · ${it.variant_keys.length} talle(s)` : it ? " · todas las variantes" : ""}
                      {p.is_combo ? (comboFixed ? " · Combo precio fijo" : " · Combo suma") : ""}
                    </p>
                  </div>
                  {it ? (
                    <>
                      <Select value={it.tipo} onValueChange={(v) => upsertItem(p, { tipo: v as CampaignDiscountType })}>
                        <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="porcentaje">% descuento</SelectItem>
                          <SelectItem value="precio_fijo">Precio fijo</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        className="w-24 h-8 text-xs"
                        type="number"
                        defaultValue={it.valor}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (v !== Number(it.valor)) upsertItem(p, { valor: v });
                        }}
                      />
                      {variantKeysOf(p.variants).length > 0 && (
                        <Button variant="ghost" size="sm" className="text-xs" onClick={() => setVariantDialog(p)}>
                          Talles
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeItem(p)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => upsertItem(p, { tipo: "porcentaje", valor: Number(bulkPct) || 10 })}>
                      Agregar
                    </Button>
                  )}
                </div>
              );
            })}
            {filteredProducts.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">Sin resultados</div>}
          </div>

          {previewProduct && (
            <p className="text-[11px] text-muted-foreground">
              Regla anti doble descuento: en combos la campaña se aplica al combo como producto; los descuentos de sus componentes no se heredan.
            </p>
          )}
        </DialogContent>
      </Dialog>

      {/* Selección de talles/variantes */}
      <Dialog open={!!variantDialog} onOpenChange={(v) => !v && setVariantDialog(null)}>
        <DialogContent className="max-w-sm max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Talles / variantes</DialogTitle>
            <DialogDescription>Sin selección, la promo aplica a todas las variantes.</DialogDescription>
          </DialogHeader>
          {variantDialog && (() => {
            const it = items[variantDialog.id];
            const keys = variantKeysOf(variantDialog.variants);
            const sel = it?.variant_keys || null;
            return (
              <div className="space-y-2">
                <Button
                  variant={sel === null ? "default" : "outline"}
                  size="sm"
                  className="w-full"
                  onClick={() => upsertItem(variantDialog, { variant_keys: null })}
                >
                  Todas las variantes
                </Button>
                {keys.map((k) => {
                  const on = !!sel?.includes(k);
                  return (
                    <label key={k} className="flex items-center gap-2 text-sm px-2 py-1 rounded hover:bg-muted/40">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => {
                          const next = on ? (sel || []).filter((x) => x !== k) : [...(sel || []), k];
                          upsertItem(variantDialog, { variant_keys: next.length ? next : null });
                        }}
                      />
                      {k}
                    </label>
                  );
                })}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      <section className="border-t border-border pt-6">
        <StorePromotions />
      </section>
    </div>
  );
};

export default StoreCampaigns;
