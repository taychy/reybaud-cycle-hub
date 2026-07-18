import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Truck, UserRound, CalendarDays, Info, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import DeliveryPaymentsSection from "@/components/deposito/DeliveryPaymentsSection";

interface PublicItem {
  id: string;
  cliente_nombre: string;
  producto: string;
  variante: any;
  cantidad: number;
  notas: string | null;
  preparado: boolean;
  posicion: number;
  created_at: string;
}

interface PublicList {
  id: string;
  titulo: string;
  descripcion: string | null;
  fecha_entrega: string | null;
  estado: string;
  public_editable: boolean;
}

const formatVariant = (v: any): string | null => {
  if (!v) return null;
  if (typeof v === "string") return v;
  if (typeof v === "object") {
    const entries = Object.entries(v).filter(([, val]) => val != null && val !== "");
    if (entries.length === 0) return null;
    return entries.map(([k, val]) => `${k}: ${val}`).join(" · ");
  }
  return String(v);
};

const PublicDeliveryList = () => {
  const { token } = useParams<{ token: string }>();
  const [list, setList] = useState<PublicList | null>(null);
  const [items, setItems] = useState<PublicItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [search, setSearch] = useState("");

  const fetch = async () => {
    if (!token) return;
    const { data, error } = await supabase.rpc("delivery_get_by_token", { _token: token });
    if (error || !data) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    const payload = data as any;
    setList(payload.list);
    setItems(payload.items || []);
    setLoading(false);
  };

  useEffect(() => {
    fetch();
    const iv = setInterval(fetch, 15000);
    return () => clearInterval(iv);
  }, [token]);

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const byClient: Record<string, PublicItem[]> = {};
    items.forEach((it) => {
      if (q) {
        const hay = `${it.cliente_nombre} ${it.producto} ${formatVariant(it.variante) || ""}`.toLowerCase();
        if (!hay.includes(q)) return;
      }
      (byClient[it.cliente_nombre] ||= []).push(it);
    });
    return Object.entries(byClient).sort((a, b) => a[0].localeCompare(b[0]));
  }, [items, search]);

  const totals = useMemo(() => {
    const total = items.length;
    const prep = items.filter((i) => i.preparado).length;
    return { total, prep, pct: total ? Math.round((prep / total) * 100) : 0 };
  }, [items]);

  const toggle = async (item: PublicItem, checked: boolean) => {
    if (!list?.public_editable) return;
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, preparado: checked } : i)));
    const { data, error } = await supabase.rpc("delivery_toggle_item_by_token", {
      _token: token!,
      _item_id: item.id,
      _preparado: checked,
    });
    if (error || data === false) {
      toast.error("No se pudo actualizar");
      fetch();
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground animate-pulse">Cargando...</div>;
  }
  if (notFound || !list) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div>
          <Info className="w-8 h-8 mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-muted-foreground">Este link ya no está disponible.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/70">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-2">
          <Truck className="w-5 h-5 text-primary" />
          <span className="font-heading font-bold uppercase tracking-wider text-sm">Lista de entrega</span>
          {!list.public_editable && (
            <Badge variant="secondary" className="text-[10px] ml-auto">Solo lectura</Badge>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-4 space-y-4 pb-24">
        <div className="glass-card rounded-lg p-4 space-y-2">
          <h1 className="text-xl font-heading font-bold uppercase tracking-wider">{list.titulo}</h1>
          {list.descripcion && <p className="text-sm text-muted-foreground">{list.descripcion}</p>}
          {list.fecha_entrega && (
            <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
              <CalendarDays className="w-3 h-3" /> Entrega: {list.fecha_entrega}
            </p>
          )}
          <div className="pt-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span>Progreso total</span>
              <span className="font-medium text-foreground">{totals.prep}/{totals.total} · {totals.pct}%</span>
            </div>
            <div className="h-2 rounded bg-secondary overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${totals.pct}%` }} />
            </div>
          </div>
        </div>

        {items.length > 0 && (
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre o producto..."
              className="pl-9"
            />
          </div>
        )}


        {items.length === 0 ? (
          <div className="glass-card rounded-lg p-8 text-center text-sm text-muted-foreground">
            Todavía no hay ítems en esta lista.
          </div>
        ) : (
          <div className="space-y-3">
            {grouped.map(([cliente, its]) => {
              const total = its.length;
              const prep = its.filter((i) => i.preparado).length;
              const pct = Math.round((prep / total) * 100);
              const complete = prep === total;
              return (
                <div key={cliente} className={`glass-card rounded-lg p-3 border ${complete ? "border-primary/40" : "border-transparent"}`}>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <UserRound className="w-4 h-4 text-primary shrink-0" />
                      <span className="font-medium truncate">{cliente}</span>
                      {complete && <Badge className="text-[10px]">Listo</Badge>}
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">{prep}/{total}</span>
                  </div>
                  <div className="h-1 rounded bg-secondary overflow-hidden mb-2">
                    <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="space-y-1">
                    {its.map((it) => {
                      const variantText = formatVariant(it.variante);
                      return (
                        <label
                          key={it.id}
                          className={`flex items-start gap-2 p-2 rounded-md transition-colors ${
                            list.public_editable ? "cursor-pointer hover:bg-secondary/50" : "cursor-default"
                          } ${it.preparado ? "bg-primary/5" : ""}`}
                        >
                          <Checkbox
                            checked={it.preparado}
                            disabled={!list.public_editable}
                            onCheckedChange={(v) => toggle(it, !!v)}
                            className="mt-0.5"
                          />
                          <div className="flex-1 min-w-0">
                            <div className={`text-sm ${it.preparado ? "line-through text-muted-foreground" : ""}`}>
                              {it.cantidad > 1 && <span className="font-semibold mr-1">{it.cantidad}×</span>}
                              {it.producto}
                            </div>
                            {variantText && (
                              <div className="text-xs text-muted-foreground">{variantText}</div>
                            )}
                            {it.notas && (
                              <div className="text-xs text-muted-foreground italic">{it.notas}</div>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                  {list.public_editable && (
                    <DeliveryPaymentsSection
                      mode="public"
                      listId={list.id}
                      publicToken={token}
                      clienteNombre={cliente}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};

export default PublicDeliveryList;
