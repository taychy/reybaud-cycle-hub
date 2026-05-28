import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { CalendarClock, Package, CreditCard, AlertCircle } from "lucide-react";
import { formatPrice } from "@/lib/currency";

interface Product {
  id: string;
  name: string;
  price: number;
  currency?: string | null;
  image_url: string | null;
  preorder_deposit_amount: number | null;
  preorder_deposit_percent: number | null;
  preorder_total_units: number | null;
  preorder_deadline: string | null;
  preorder_estimated_delivery: string | null;
  preorder_variants: any;
  preorder_description: string | null;
  is_combo?: boolean | null;
  combo_pricing_mode?: string | null;
  combo_price?: number | null;
}

interface ComboItem {
  id: string;
  component_product_id: string | null;
  internal_name: string | null;
  internal_variants: any;
  internal_price: number | null;
  precio_individual: number | null;
  obligatorio: boolean;
  sort_order: number;
  // resolved
  display_name?: string;
  variant_specs?: { name: string; options: string[] }[];
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  product: Product | null;
  alumnoId: string | null;
}

const PreorderReserveDialog = ({ open, onOpenChange, product, alumnoId }: Props) => {
  const { toast } = useToast();
  const [cantidad, setCantidad] = useState(1);
  const [variante, setVariante] = useState<Record<string, string>>({});
  const [formaPago, setFormaPago] = useState<string>("mercadopago");
  const [notas, setNotas] = useState("");
  const [reservedUnits, setReservedUnits] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  // combo state
  const [modalidad, setModalidad] = useState<"combo" | "split">("combo");
  const [comboItems, setComboItems] = useState<ComboItem[]>([]);
  const [comboVariants, setComboVariants] = useState<Record<string, Record<string, string>>>({}); // key -> {var:val}
  const [splitSelected, setSplitSelected] = useState<Record<string, boolean>>({});

  const moneda = product?.currency || "ARS";
  const isCombo = !!product?.is_combo;

  const variantSpecs: { name: string; options: string[] }[] = Array.isArray(product?.preorder_variants)
    ? (product?.preorder_variants as any[]).filter((v) => v?.name && Array.isArray(v?.options) && v.options.length > 0)
    : [];

  useEffect(() => {
    if (!open || !product) return;
    setCantidad(1);
    setVariante({});
    setFormaPago("mercadopago");
    setNotas("");
    setModalidad("combo");
    setComboVariants({});
    setSplitSelected({});

    supabase.rpc("get_preorder_reserved_units" as any, { p_product_id: product.id }).then(({ data }) => {
      setReservedUnits(typeof data === "number" ? data : 0);
    });

    if (product.is_combo) {
      (async () => {
        const { data: items } = await supabase
          .from("store_combo_items" as any)
          .select("*")
          .eq("combo_id", product.id)
          .order("sort_order");
        const resolved: ComboItem[] = [];
        for (const it of (items || []) as any[]) {
          let display = it.internal_name || "";
          let specs: { name: string; options: string[] }[] = Array.isArray(it.internal_variants) ? it.internal_variants : [];
          if (it.component_product_id) {
            const { data: cp } = await supabase
              .from("store_products")
              .select("name, variants, preorder_variants")
              .eq("id", it.component_product_id)
              .maybeSingle();
            display = cp?.name || "Componente";
            const v = (cp as any)?.variants?.length ? (cp as any).variants : (cp as any)?.preorder_variants || [];
            specs = Array.isArray(v) ? v.filter((s: any) => s?.name && Array.isArray(s?.options) && s.options.length > 0) : [];
          }
          resolved.push({ ...it, display_name: display, variant_specs: specs });
        }
        setComboItems(resolved);
        // default: all mandatory selected in split
        const sel: Record<string, boolean> = {};
        resolved.forEach((r) => { sel[r.id] = r.obligatorio; });
        setSplitSelected(sel);
      })();
    } else {
      setComboItems([]);
    }
  }, [open, product]);

  const cupoRestante = product?.preorder_total_units
    ? product.preorder_total_units - (reservedUnits || 0)
    : null;
  const cupoOk = cupoRestante == null || cupoRestante >= cantidad;
  const deadlinePass = product?.preorder_deadline
    ? new Date(product.preorder_deadline).getTime() < Date.now()
    : false;

  // ─── Cálculos ───
  const priceCombo = useMemo(() => {
    if (!product) return 0;
    if (!isCombo) return Number(product.price);
    if (product.combo_pricing_mode === "fixed" && product.combo_price != null) {
      return Number(product.combo_price);
    }
    const sum = comboItems.reduce((acc, it) => acc + Number(it.precio_individual || it.internal_price || 0), 0);
    // Fallback al precio del producto si no hay componentes cargados o suman 0
    return sum > 0 ? sum : Number(product.price || 0);
  }, [product, isCombo, comboItems]);


  const priceSplit = useMemo(() => {
    return comboItems
      .filter((it) => splitSelected[it.id])
      .reduce((acc, it) => acc + Number(it.precio_individual || it.internal_price || 0), 0);
  }, [comboItems, splitSelected]);

  const unitPrice = isCombo ? (modalidad === "combo" ? priceCombo : priceSplit) : Number(product?.price || 0);
  const total = unitPrice * cantidad;

  const senaUnit = useMemo(() => {
    if (!product) return 0;
    if (product.preorder_deposit_amount) return Number(product.preorder_deposit_amount);
    if (product.preorder_deposit_percent)
      return Math.round(unitPrice * (Number(product.preorder_deposit_percent) / 100));
    return Math.round(unitPrice * 0.3);
  }, [product, unitPrice]);

  const senaRaw = senaUnit * cantidad;
  const sena = Math.min(senaRaw, total);
  const senaCapped = senaRaw > total;
  const saldo = Math.max(0, total - sena);

  const handleSubmit = async () => {
    if (!product || !alumnoId) return;
    if (deadlinePass) {
      toast({ title: "Preventa cerrada", description: "La fecha límite ya pasó.", variant: "destructive" });
      return;
    }
    if (!cupoOk) {
      toast({ title: "Sin cupo suficiente", description: `Quedan ${cupoRestante} unidades.`, variant: "destructive" });
      return;
    }

    // Validar variantes
    if (!isCombo) {
      for (const spec of variantSpecs) {
        if (!variante[spec.name]) {
          toast({ title: "Falta elegir variante", description: `Seleccioná ${spec.name}.`, variant: "destructive" });
          return;
        }
      }
    } else {
      const activeItems = comboItems.filter((it) =>
        modalidad === "combo" ? it.obligatorio : splitSelected[it.id]
      );
      if (modalidad === "split" && activeItems.length === 0) {
        toast({ title: "Elegí al menos una prenda", variant: "destructive" });
        return;
      }
      for (const it of activeItems) {
        for (const spec of it.variant_specs || []) {
          if (!comboVariants[it.id]?.[spec.name]) {
            toast({ title: `Falta variante en ${it.display_name}`, description: `Elegí ${spec.name}.`, variant: "destructive" });
            return;
          }
        }
      }
    }

    // Build items[] payload
    const itemsPayload = isCombo
      ? comboItems
          .filter((it) => (modalidad === "combo" ? it.obligatorio : splitSelected[it.id]))
          .map((it) => ({
            combo_item_id: it.id,
            component_product_id: it.component_product_id,
            nombre: it.display_name,
            precio: Number(it.precio_individual || it.internal_price || 0),
            variante: comboVariants[it.id] || {},
          }))
      : [];

    setLoading(true);
    const { data: inserted, error } = await supabase
      .from("store_preorders" as any)
      .insert({
        alumno_id: alumnoId,
        product_id: product.id,
        cantidad,
        variante: isCombo ? {} : variante,
        producto_nombre: product.name,
        precio_unitario: unitPrice,
        moneda,
        sena_monto: sena,
        precio_total: total,
        saldo_pendiente: saldo,
        estado: "pendiente_pago_sena",
        estado_pago_sena: formaPago === "mercadopago" ? "pendiente" : "pendiente_verificacion",
        forma_pago_sena: formaPago,
        notas: notas || null,
        modalidad: isCombo ? modalidad : "individual",
        items: itemsPayload,
      } as any)
      .select("id")
      .single();

    if (error || !inserted) {
      setLoading(false);
      toast({ title: "Error", description: error?.message || "No se pudo crear", variant: "destructive" });
      return;
    }

    if (formaPago === "mercadopago") {
      try {
        const { data: pref, error: prefErr } = await supabase.functions.invoke("create-preorder-mp-preference", {
          body: { preorder_id: (inserted as any).id },
        });
        if (prefErr) throw prefErr;
        const url = (pref as any)?.init_point || (pref as any)?.sandbox_init_point;
        if (url) {
          window.location.href = url;
          return;
        }
        throw new Error("No se recibió URL de pago");
      } catch (e: any) {
        setLoading(false);
        toast({
          title: "Reserva creada, pero falló iniciar MP",
          description: `Podés reintentar desde "Mis preventas". ${e.message || ""}`,
        });
        onOpenChange(false);
        return;
      }
    }

    setLoading(false);
    toast({ title: "Reserva creada", description: "Tu cupo se confirma cuando validemos la seña." });
    onOpenChange(false);
  };

  if (!product) return null;

  const renderItemVariants = (it: ComboItem) => (
    <div className="space-y-2 mt-2">
      {(it.variant_specs || []).map((spec) => (
        <div key={spec.name}>
          <label className="text-[10px] font-heading uppercase text-muted-foreground">{spec.name}</label>
          <Select
            value={comboVariants[it.id]?.[spec.name] || ""}
            onValueChange={(v) =>
              setComboVariants((p) => ({ ...p, [it.id]: { ...(p[it.id] || {}), [spec.name]: v } }))
            }
          >
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={`Elegí ${spec.name}`} /></SelectTrigger>
            <SelectContent>
              {spec.options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      ))}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading">{product.name}</DialogTitle>
          <DialogDescription>{isCombo ? "Reserva en preventa (combo)" : "Reserva en preventa"}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {product.preorder_description && (
            <p className="text-sm text-muted-foreground">{product.preorder_description}</p>
          )}

          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-1 text-xs">
            {product.preorder_deadline && (
              <div className="flex items-center gap-2">
                <CalendarClock className="w-3.5 h-3.5 text-primary" />
                <span>Hasta: <b>{new Date(product.preorder_deadline).toLocaleDateString("es-AR")}</b></span>
              </div>
            )}
            {product.preorder_estimated_delivery && (
              <div className="flex items-center gap-2">
                <Package className="w-3.5 h-3.5 text-primary" />
                <span>Entrega estimada: <b>{new Date(product.preorder_estimated_delivery).toLocaleDateString("es-AR")}</b></span>
              </div>
            )}
            {cupoRestante !== null && (
              <div>Cupo restante: <b>{cupoRestante}</b> de {product.preorder_total_units}</div>
            )}
          </div>

          <div>
            <label className="text-xs font-heading uppercase text-muted-foreground">Cantidad</label>
            <Input type="number" min={1} value={cantidad} onChange={(e) => setCantidad(Math.max(1, Number(e.target.value)))} />
          </div>

          {isCombo ? (
            <Tabs value={modalidad} onValueChange={(v) => setModalidad(v as any)}>
              <TabsList className="grid grid-cols-2 w-full">
              <TabsContent value="combo" className="space-y-2 mt-3">
                <p className="text-[11px] text-muted-foreground">
                  Reservás todas las prendas del combo. {product.combo_pricing_mode === "fixed" ? "Precio fijo de combo." : "Suma de los precios individuales."}
                </p>
                {comboItems.length === 0 && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-[11px] text-destructive flex items-start gap-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>Este combo aún no tiene componentes cargados. Pedile al admin que los configure antes de reservar.</span>
                  </div>
                )}
                {comboItems.map((it) => (
                  <div key={it.id} className="rounded-md border border-border p-2 bg-card">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">
                        {it.display_name}
                        {!it.obligatorio && <span className="ml-1 text-[10px] text-muted-foreground">(opcional)</span>}
                      </span>
                      <span className="text-xs text-muted-foreground">{formatPrice(Number(it.precio_individual || it.internal_price || 0), moneda)}</span>
                    </div>
                    {it.obligatorio && renderItemVariants(it)}
                  </div>
                ))}
              </TabsContent>

                  </div>
                ))}
              </TabsContent>
              <TabsContent value="split" className="space-y-2 mt-3">
                <p className="text-[11px] text-muted-foreground">Elegí solo las prendas que querés llevar.</p>
                {comboItems.map((it) => (
                  <div key={it.id} className="rounded-md border border-border p-2 bg-card">
                    <div className="flex justify-between items-center gap-2">
                      <label className="flex items-center gap-2 flex-1 cursor-pointer">
                        <Checkbox
                          checked={!!splitSelected[it.id]}
                          onCheckedChange={(v) => setSplitSelected((p) => ({ ...p, [it.id]: !!v }))}
                        />
                        <span className="text-sm font-medium">{it.display_name}</span>
                      </label>
                      <span className="text-xs text-muted-foreground">{formatPrice(Number(it.precio_individual || it.internal_price || 0), moneda)}</span>
                    </div>
                    {splitSelected[it.id] && renderItemVariants(it)}
                  </div>
                ))}
              </TabsContent>
            </Tabs>
          ) : variantSpecs.length > 0 ? (
            variantSpecs.map((spec) => (
              <div key={spec.name}>
                <label className="text-xs font-heading uppercase text-muted-foreground">{spec.name}</label>
                <Select value={variante[spec.name] || ""} onValueChange={(v) => setVariante((p) => ({ ...p, [spec.name]: v }))}>
                  <SelectTrigger><SelectValue placeholder={`Elegí ${spec.name}`} /></SelectTrigger>
                  <SelectContent>
                    {spec.options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ))
          ) : (
            <p className="text-[11px] text-muted-foreground italic">Este producto no requiere selección de variante.</p>
          )}

          <div>
            <label className="text-xs font-heading uppercase text-muted-foreground">Forma de pago de la seña</label>
            <Select value={formaPago} onValueChange={setFormaPago}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mercadopago">Mercado Pago (online)</SelectItem>
                <SelectItem value="transferencia">Transferencia bancaria</SelectItem>
                <SelectItem value="efectivo">Efectivo</SelectItem>
                <SelectItem value="otro">Otro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {formaPago !== "mercadopago" && (
            <div>
              <label className="text-xs font-heading uppercase text-muted-foreground">Notas (opcional)</label>
              <Textarea rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Aclaraciones, comprobante, etc." />
            </div>
          )}

          <div className="rounded-lg border border-border p-3 space-y-1 text-sm">
            <div className="flex justify-between text-muted-foreground"><span>Precio unitario</span><span>{formatPrice(unitPrice, moneda)}</span></div>
            <div className="flex justify-between text-muted-foreground"><span>Total</span><span>{formatPrice(total, moneda)}</span></div>
            <div className="flex justify-between font-heading text-primary"><span>Seña a pagar ahora</span><span>{formatPrice(sena, moneda)}</span></div>
            <div className="flex justify-between text-xs text-muted-foreground"><span>Saldo al retirar</span><span>{formatPrice(saldo, moneda)}</span></div>
            {senaCapped && (
              <div className="flex items-center gap-1 text-[11px] text-destructive pt-1">
                <AlertCircle className="w-3 h-3" />
                Seña configurada mayor al total. Ajustada al 100%.
              </div>
            )}
          </div>

          <p className="text-[11px] text-muted-foreground">
            Tu cupo se confirma cuando validemos el pago de la seña. La seña no se reembolsa una vez que la preventa entra en producción; podés cancelar antes y queda como saldo a favor.
          </p>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={loading || !cupoOk || deadlinePass || (isCombo && unitPrice <= 0)}>
              {formaPago === "mercadopago" ? <CreditCard className="w-4 h-4 mr-1" /> : null}
              {loading ? "Procesando..." : formaPago === "mercadopago" ? "Reservar y pagar" : "Reservar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PreorderReserveDialog;
