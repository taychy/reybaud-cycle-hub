import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Pencil, Trash2, Copy, Star, Eye, EyeOff } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ImageUpload from "@/components/ImageUpload";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

interface Product {
  id: string;
  name: string;
  description: string | null;
  category_id: string | null;
  price: number;
  old_price: number | null;
  discount: number | null;
  image_url: string | null;
  stock: number;
  min_stock: number;
  status: string;
  tag: string | null;
  featured: boolean;
  featured_order: number | null;
}

interface Category {
  id: string;
  name: string;
}

const TAGS = ["NUEVO", "OFERTA", "OUTLET", "ÚLTIMA UNIDAD", "COMBO", "TOP"];

const StoreProducts = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [editProduct, setEditProduct] = useState<Partial<Product> | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const load = async () => {
    const [pRes, cRes] = await Promise.all([
      supabase.from("store_products").select("*").order("created_at", { ascending: false }),
      supabase.from("store_categories").select("id, name").order("sort_order"),
    ]);
    setProducts((pRes.data as any[]) || []);
    setCategories((cRes.data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = products.filter((p) => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterCat !== "all" && p.category_id !== filterCat) return false;
    if (filterStatus !== "all" && p.status !== filterStatus) return false;
    return true;
  });

  const openCreate = () => {
    setEditProduct({ name: "", price: 0, stock: 0, min_stock: 5, status: "active", featured: false });
    setDialogOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditProduct({ ...p });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!editProduct?.name || !editProduct.price) {
      toast({ title: "Error", description: "Nombre y precio son obligatorios.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      name: editProduct.name,
      description: editProduct.description || null,
      category_id: editProduct.category_id || null,
      price: editProduct.price,
      old_price: editProduct.old_price || null,
      discount: editProduct.discount || null,
      image_url: editProduct.image_url || null,
      stock: editProduct.stock ?? 0,
      min_stock: editProduct.min_stock ?? 5,
      status: editProduct.status || "active",
      tag: editProduct.tag || null,
      featured: editProduct.featured || false,
      featured_order: editProduct.featured_order || null,
    };

    if (editProduct.id) {
      await supabase.from("store_products").update(payload as any).eq("id", editProduct.id);
      toast({ title: "Producto actualizado" });
    } else {
      await supabase.from("store_products").insert(payload as any);
      toast({ title: "Producto creado" });
    }
    setSaving(false);
    setDialogOpen(false);
    load();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await supabase.from("store_products").delete().eq("id", deleteId);
    toast({ title: "Producto eliminado" });
    setDeleteId(null);
    load();
  };

  const handleDuplicate = async (p: Product) => {
    const { id, ...rest } = p;
    await supabase.from("store_products").insert({ ...rest, name: `${rest.name} (copia)` } as any);
    toast({ title: "Producto duplicado" });
    load();
  };

  const toggleFeatured = async (p: Product) => {
    await supabase.from("store_products").update({ featured: !p.featured } as any).eq("id", p.id);
    load();
  };

  const toggleVisibility = async (p: Product) => {
    const newStatus = p.status === "active" ? "hidden" : "active";
    await supabase.from("store_products").update({ status: newStatus } as any).eq("id", p.id);
    load();
  };

  const getCategoryName = (id: string | null) => categories.find((c) => c.id === id)?.name || "—";

  const tagColor = (tag: string) => {
    switch (tag) {
      case "OFERTA": return "bg-primary/20 text-primary";
      case "NUEVO": return "bg-accent/20 text-accent";
      case "OUTLET": return "bg-gold-dark/20 text-gold";
      case "ÚLTIMA UNIDAD": return "bg-destructive/20 text-destructive";
      default: return "bg-muted text-muted-foreground";
    }
  };

  if (loading) return <div className="animate-pulse text-muted-foreground">Cargando productos...</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-heading font-bold">Productos</h1>
        <Button onClick={openCreate}><Plus className="w-4 h-4 mr-1" /> Crear producto</Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar producto..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={filterCat} onValueChange={setFilterCat}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Categoría" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Estado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="active">Activo</SelectItem>
            <SelectItem value="hidden">Oculto</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="px-4 py-3 text-left font-heading text-xs uppercase">Imagen</th>
              <th className="px-4 py-3 text-left font-heading text-xs uppercase">Nombre</th>
              <th className="px-4 py-3 text-left font-heading text-xs uppercase hidden md:table-cell">Categoría</th>
              <th className="px-4 py-3 text-right font-heading text-xs uppercase">Precio</th>
              <th className="px-4 py-3 text-center font-heading text-xs uppercase hidden md:table-cell">Stock</th>
              <th className="px-4 py-3 text-center font-heading text-xs uppercase hidden lg:table-cell">Etiqueta</th>
              <th className="px-4 py-3 text-center font-heading text-xs uppercase">Estado</th>
              <th className="px-4 py-3 text-right font-heading text-xs uppercase">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((p) => (
              <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-2">
                  <div className="w-10 h-10 rounded bg-secondary overflow-hidden">
                    {p.image_url ? <img src={p.image_url} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">—</div>}
                  </div>
                </td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{p.name}</span>
                    {p.featured && <Star className="w-3.5 h-3.5 text-gold fill-gold" />}
                  </div>
                </td>
                <td className="px-4 py-2 hidden md:table-cell text-muted-foreground">{getCategoryName(p.category_id)}</td>
                <td className="px-4 py-2 text-right">
                  <span className="font-heading font-bold">${p.price.toLocaleString("es-AR")}</span>
                  {p.old_price && <span className="text-xs text-muted-foreground line-through ml-1">${p.old_price.toLocaleString("es-AR")}</span>}
                </td>
                <td className="px-4 py-2 text-center hidden md:table-cell">
                  <span className={p.stock <= p.min_stock ? "text-destructive font-bold" : ""}>{p.stock}</span>
                </td>
                <td className="px-4 py-2 text-center hidden lg:table-cell">
                  {p.tag ? <span className={`text-[10px] font-heading font-bold uppercase px-2 py-0.5 rounded ${tagColor(p.tag)}`}>{p.tag}</span> : "—"}
                </td>
                <td className="px-4 py-2 text-center">
                  <span className={`text-[10px] font-heading font-bold uppercase px-2 py-0.5 rounded ${p.status === "active" ? "bg-green-500/20 text-green-400" : "bg-muted text-muted-foreground"}`}>
                    {p.status === "active" ? "Activo" : "Oculto"}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleFeatured(p)} title="Destacado"><Star className={`w-4 h-4 ${p.featured ? "text-gold fill-gold" : "text-muted-foreground"}`} /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleVisibility(p)} title="Visibilidad">{p.status === "active" ? <EyeOff className="w-4 h-4 text-muted-foreground" /> : <Eye className="w-4 h-4 text-muted-foreground" />}</Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(p)}><Pencil className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDuplicate(p)}><Copy className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteId(p.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="p-8 text-center text-muted-foreground">No hay productos</div>}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editProduct?.id ? "Editar producto" : "Crear producto"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-heading uppercase text-muted-foreground">Nombre *</label>
              <Input value={editProduct?.name || ""} onChange={(e) => setEditProduct((p) => ({ ...p, name: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-heading uppercase text-muted-foreground">Descripción</label>
              <Input value={editProduct?.description || ""} onChange={(e) => setEditProduct((p) => ({ ...p, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-heading uppercase text-muted-foreground">Categoría</label>
                <Select value={editProduct?.category_id || "none"} onValueChange={(v) => setEditProduct((p) => ({ ...p, category_id: v === "none" ? null : v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin categoría</SelectItem>
                    {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-heading uppercase text-muted-foreground">Etiqueta</label>
                <Select value={editProduct?.tag || "none"} onValueChange={(v) => setEditProduct((p) => ({ ...p, tag: v === "none" ? null : v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Ninguna</SelectItem>
                    {TAGS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-heading uppercase text-muted-foreground">Precio *</label>
                <Input type="number" value={editProduct?.price || 0} onChange={(e) => setEditProduct((p) => ({ ...p, price: Number(e.target.value) }))} />
              </div>
              <div>
                <label className="text-xs font-heading uppercase text-muted-foreground">Precio anterior</label>
                <Input type="number" value={editProduct?.old_price || ""} onChange={(e) => setEditProduct((p) => ({ ...p, old_price: e.target.value ? Number(e.target.value) : null }))} />
              </div>
              <div>
                <label className="text-xs font-heading uppercase text-muted-foreground">Descuento %</label>
                <Input type="number" value={editProduct?.discount || ""} onChange={(e) => setEditProduct((p) => ({ ...p, discount: e.target.value ? Number(e.target.value) : null }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-heading uppercase text-muted-foreground">Stock</label>
                <Input type="number" value={editProduct?.stock ?? 0} onChange={(e) => setEditProduct((p) => ({ ...p, stock: Number(e.target.value) }))} />
              </div>
              <div>
                <label className="text-xs font-heading uppercase text-muted-foreground">Stock mínimo</label>
                <Input type="number" value={editProduct?.min_stock ?? 5} onChange={(e) => setEditProduct((p) => ({ ...p, min_stock: Number(e.target.value) }))} />
              </div>
            </div>
            <div>
              <label className="text-xs font-heading uppercase text-muted-foreground">Imagen</label>
              <ImageUpload
                value={editProduct?.image_url || null}
                onChange={(url) => setEditProduct((p) => ({ ...p, image_url: url }))}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving}>{saving ? "Guardando..." : "Guardar"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar producto?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default StoreProducts;
