import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, GripVertical, Package, FileText } from "lucide-react";
import VariantsEditor from "./VariantsEditor";
import VariantStockEditor from "./VariantStockEditor";

export interface ComboItem {
  id?: string;
  combo_id?: string;
  component_product_id?: string | null;
  internal_name?: string | null;
  internal_variants?: any;
  internal_stock?: Record<string, number>;
  internal_price?: number | null;
  precio_individual?: number | null;
  obligatorio: boolean;
  sort_order: number;
}
interface Props {
  comboId: string;
  isPreorder?: boolean;
}

const ComboItemsEditor = ({ comboId, isPreorder = false }: Props) => {
  const [items, setItems] = useState<ComboItem[]>([]);
  const [productOptions, setProductOptions] = useState<{ id: string; name: string; price: number }[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const [iRes, pRes] = await Promise.all([
      supabase.from("store_combo_items" as any).select("*").eq("combo_id", comboId).order("sort_order"),
      supabase.from("store_products").select("id, name, price").neq("id", comboId).eq("status", "active").order("name"),
    ]);
    setItems(((iRes.data as any[]) || []) as ComboItem[]);
    setProductOptions((pRes.data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => { if (comboId) load(); }, [comboId]);

  const addReusable = async () => {
    const { data } = await supabase.from("store_combo_items" as any).insert({
      combo_id: comboId,
      component_product_id: productOptions[0]?.id || null,
      obligatorio: true,
      sort_order: items.length,
    }).select().single();
    if (data) setItems([...items, data as any]);
  };

  const addInternal = async () => {
    const { data } = await supabase.from("store_combo_items" as any).insert({
      combo_id: comboId,
      internal_name: "Nuevo componente",
      internal_variants: [],
      internal_stock: {},
      obligatorio: true,
      sort_order: items.length,
    }).select().single();
    if (data) setItems([...items, data as any]);
  };

  const updateItem = async (id: string, patch: Partial<ComboItem>) => {
    setItems((arr) => arr.map((it) => (it.id === id ? { ...it, ...patch } : it)));
    await supabase.from("store_combo_items" as any).update(patch as any).eq("id", id);
  };

  const removeItem = async (id: string) => {
    await supabase.from("store_combo_items" as any).delete().eq("id", id);
    setItems((arr) => arr.filter((it) => it.id !== id));
  };

  if (loading) return <div className="text-xs text-muted-foreground">Cargando componentes...</div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-heading uppercase text-muted-foreground">
          Componentes del combo
        </label>
        <div className="flex gap-1">
          {!isPreorder && (
            <Button type="button" size="sm" variant="outline" onClick={addReusable}>
              <Package className="w-3.5 h-3.5 mr-1" /> Producto existente
            </Button>
          )}
          <Button type="button" size="sm" variant="ghost" onClick={addInternal}>
            <FileText className="w-3.5 h-3.5 mr-1" /> Sub-ítem interno
          </Button>
        </div>
      </div>
      {isPreorder && (
        <p className="text-[11px] text-muted-foreground italic">
          Combo de preventa: los componentes son solo definitorios (nombre, precio y talles disponibles). El stock es ilimitado y se gobierna por el cupo total de la preventa.
        </p>
      )}

      {items.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground text-center">
          Sin componentes. Agregá uno arriba.
        </div>
      )}

      {items.map((item) => (
        <div key={item.id} className="rounded-lg border border-border p-3 space-y-2 bg-muted/10">
          <div className="flex items-center gap-2">
            <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" />
            {item.component_product_id !== null && item.component_product_id !== undefined ? (
              <>
                <Select
                  value={item.component_product_id || ""}
                  onValueChange={(v) => updateItem(item.id!, { component_product_id: v })}
                >
                  <SelectTrigger className="h-8 text-sm flex-1"><SelectValue placeholder="Elegir producto" /></SelectTrigger>
                  <SelectContent>
                    {productOptions.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-[10px] font-heading uppercase bg-primary/15 text-primary px-1.5 py-0.5 rounded">
                  Reusable
                </span>
              </>
            ) : (
              <>
                <Input
                  value={item.internal_name || ""}
                  onChange={(e) => updateItem(item.id!, { internal_name: e.target.value })}
                  placeholder="Nombre del sub-ítem"
                  className="h-8 text-sm flex-1"
                />
                <span className="text-[10px] font-heading uppercase bg-accent/15 text-accent px-1.5 py-0.5 rounded">
                  Interno
                </span>
              </>
            )}
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeItem(item.id!)}>
              <Trash2 className="w-4 h-4 text-destructive" />
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] uppercase text-muted-foreground">Precio individual</label>
              <Input
                type="number"
                value={item.precio_individual || ""}
                onChange={(e) => updateItem(item.id!, { precio_individual: e.target.value ? Number(e.target.value) : null })}
                placeholder="Si se vende suelto"
                className="h-8 text-sm"
              />
            </div>
            <div className="flex items-end gap-2">
              <label className="flex items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={item.obligatorio}
                  onChange={(e) => updateItem(item.id!, { obligatorio: e.target.checked })}
                />
                Obligatorio
              </label>
            </div>
          </div>
          {item.component_product_id === null && (
            <>
              <VariantsEditor
                value={item.internal_variants}
                onChange={(v) => updateItem(item.id!, { internal_variants: v })}
              />
              {!isPreorder && (
                <VariantStockEditor
                  variants={item.internal_variants}
                  stock={item.internal_stock || {}}
                  onChange={(s) => updateItem(item.id!, { internal_stock: s })}
                />
              )}
            </>
          )}
        </div>
      ))}
    </div>
  );
};

export default ComboItemsEditor;
