import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Search, Eye, QrCode, Printer } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatPrice } from "@/lib/currency";
import { printPreorderLabels, printSinglePreorderLabel, type PreorderLabelData } from "@/lib/preorderLabels";

const ESTADOS = [
  "pendiente_pago_sena",
  "reservada",
  "en_produccion",
  "lista_para_retirar",
  "entregada",
  "cancelada",
  "vencida",
];

const estadoColor = (e: string) => {
  switch (e) {
    case "reservada": return "bg-cyan/20 text-cyan";
    case "en_produccion": return "bg-primary/20 text-primary";
    case "lista_para_retirar": return "bg-gold-dark/20 text-gold";
    case "entregada": return "bg-green-500/20 text-green-400";
    case "cancelada":
    case "vencida": return "bg-destructive/20 text-destructive";
    default: return "bg-muted text-muted-foreground";
  }
};

const labelEstado = (e: string) => e.replace(/_/g, " ");

interface Props {
  restrictEstados?: string[];
  title?: string;
}

const DepositoPreventas = ({ restrictEstados, title = "Preventas" }: Props = {}) => {
  const [rows, setRows] = useState<any[]>([]);
  const [alumnos, setAlumnos] = useState<Record<string, any>>({});
  const [sedes, setSedes] = useState<Record<string, any>>({});
  const [search, setSearch] = useState("");
  const [filterEstado, setFilterEstado] = useState("all");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [printing, setPrinting] = useState(false);
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("store_preorders")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Error cargando preventas", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }
    const list = data || [];
    setRows(list);
    const ids = Array.from(new Set(list.map((r: any) => r.alumno_id).filter(Boolean)));
    if (ids.length) {
      const { data: als } = await supabase
        .from("alumnos")
        .select("id, nombre, apellido, email, telefono, dni")
        .in("id", ids);
      const map: Record<string, any> = {};
      (als || []).forEach((a: any) => { map[a.id] = a; });
      setAlumnos(map);
    }
    const sedeIds = Array.from(new Set(list.map((r: any) => r.sede_retiro_id).filter(Boolean)));
    if (sedeIds.length) {
      const { data: sds } = await supabase.from("sedes").select("id, nombre").in("id", sedeIds);
      const sm: Record<string, any> = {};
      (sds || []).forEach((s: any) => { sm[s.id] = s; });
      setSedes(sm);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const updateEstado = async (id: string, estado: string) => {
    const { error } = await supabase.from("store_preorders").update({ estado } as any).eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Estado actualizado" });
    setRows((prev) => prev.map((r: any) => (r.id === id ? { ...r, estado } : r)));
    if (selected?.id === id) setSelected((s: any) => ({ ...s, estado }));
  };

  const nombreAlumno = (id: string, row?: any) => {
    if (row?.alumno_nombre) return row.alumno_nombre;
    const a = alumnos[id];
    if (!a) return row?.alumno_email || "—";
    return `${a.nombre || ""} ${a.apellido || ""}`.trim() || a.email || "—";
  };

  const filtered = rows.filter((r) => {
    if (restrictEstados && !restrictEstados.includes(r.estado)) return false;
    if (filterEstado !== "all" && r.estado !== filterEstado) return false;
    if (search) {
      const s = search.toLowerCase();
      const nom = nombreAlumno(r.alumno_id, r).toLowerCase();
      const prod = (r.producto_nombre || "").toLowerCase();
      if (!nom.includes(s) && !prod.includes(s)) return false;
    }
    return true;
  });

  const toLabelData = (r: any): PreorderLabelData => {
    const a = alumnos[r.alumno_id];
    const sede = r.sede_retiro_id ? sedes[r.sede_retiro_id] : null;
    return {
      id: r.id,
      alumno_id: r.alumno_id,
      short_number: r.id.slice(0, 8).toUpperCase(),
      producto_nombre: r.producto_nombre,
      cantidad: r.cantidad,
      variante: r.variante,
      items: r.items,
      precio_total: r.precio_total,
      sena_monto: r.sena_monto || 0,
      saldo_pendiente: r.saldo_pendiente || 0,
      moneda: r.moneda,
      estado_pago_sena: r.estado_pago_sena,
      entrega_metodo: r.entrega_metodo,
      sede_nombre: sede?.nombre || null,
      envio_direccion: r.envio_direccion,
      envio_contacto: r.envio_contacto,
      envio_notas: r.envio_notas,
      alumno_nombre: r.alumno_nombre || (a ? `${a.nombre || ""} ${a.apellido || ""}`.trim() : null),
      alumno_email: r.alumno_email || a?.email,
      alumno_telefono: r.alumno_telefono || a?.telefono,
      created_at: r.created_at,
    };
  };

  const printOne = async (r: any) => {
    try {
      setPrinting(true);
      await printSinglePreorderLabel(toLabelData(r));
    } catch (e: any) {
      toast({ title: "Error al generar etiqueta", description: e.message, variant: "destructive" });
    } finally {
      setPrinting(false);
    }
  };

  const printBulk = async () => {
    const list = filtered.filter((r) => selectedIds.has(r.id)).map(toLabelData);
    if (!list.length) return;
    try {
      setPrinting(true);
      await printPreorderLabels(list);
    } catch (e: any) {
      toast({ title: "Error al generar etiquetas", description: e.message, variant: "destructive" });
    } finally {
      setPrinting(false);
    }
  };

  const toggleId = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const allFilteredSelected = filtered.length > 0 && filtered.every((r) => selectedIds.has(r.id));
  const toggleAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filtered.forEach((r) => next.delete(r.id));
      } else {
        filtered.forEach((r) => next.add(r.id));
      }
      return next;
    });
  };

  const selectedCount = useMemo(
    () => filtered.filter((r) => selectedIds.has(r.id)).length,
    [filtered, selectedIds],
  );

  if (loading) return <div className="animate-pulse text-muted-foreground">Cargando preventas...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-heading font-bold">{title}</h1>
        {selectedCount > 0 && (
          <Button onClick={printBulk} disabled={printing} className="gap-2">
            <Printer className="w-4 h-4" /> Imprimir etiquetas ({selectedCount})
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar por cliente o producto..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={filterEstado} onValueChange={setFilterEstado}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Estado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {ESTADOS.map((e) => <SelectItem key={e} value={e}>{labelEstado(e)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {filtered.length > 0 && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground px-1">
            <Checkbox checked={allFilteredSelected} onCheckedChange={toggleAll} />
            Seleccionar todas ({filtered.length})
          </label>
        )}
        {filtered.map((r) => (
          <div key={r.id} className="rounded-xl border border-border bg-card p-3 space-y-2">
            <div className="flex items-start gap-2">
              <Checkbox
                className="mt-1"
                checked={selectedIds.has(r.id)}
                onCheckedChange={() => toggleId(r.id)}
              />
              <div className="flex-1 min-w-0">
                <div className="font-heading font-bold text-sm leading-tight">{r.producto_nombre}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{nombreAlumno(r.alumno_id, r)} · x{r.cantidad}</div>
                <div className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString("es-AR")}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-heading font-bold text-sm">{formatPrice(r.precio_total, r.moneda)}</div>
                <span className={`inline-block mt-1 text-[10px] font-heading font-bold uppercase px-2 py-0.5 rounded ${estadoColor(r.estado)}`}>
                  {labelEstado(r.estado)}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Select value={r.estado} onValueChange={(v) => updateEstado(r.id, v)}>
                <SelectTrigger className="h-9 flex-1 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ESTADOS.map((e) => <SelectItem key={e} value={e}>{labelEstado(e)}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" className="h-9" onClick={() => setSelected(r)}>
                <Eye className="w-4 h-4 mr-1" /> Ver
              </Button>
              <Button variant="outline" size="sm" className="h-9" onClick={() => printOne(r)} disabled={printing}>
                <QrCode className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground text-sm">No hay preventas</div>
        )}
      </div>

      <div className="hidden md:block rounded-xl border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="px-3 py-3 w-8">
                <Checkbox checked={allFilteredSelected} onCheckedChange={toggleAll} />
              </th>
              <th className="px-4 py-3 text-left font-heading text-xs uppercase">Producto</th>
              <th className="px-4 py-3 text-left font-heading text-xs uppercase">Cliente</th>
              <th className="px-4 py-3 text-center font-heading text-xs uppercase">Cant.</th>
              <th className="px-4 py-3 text-right font-heading text-xs uppercase">Total</th>
              <th className="px-4 py-3 text-center font-heading text-xs uppercase">Estado</th>
              <th className="px-4 py-3 text-left font-heading text-xs uppercase hidden md:table-cell">Fecha</th>
              <th className="px-4 py-3 text-right font-heading text-xs uppercase">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((r) => (
              <tr key={r.id} className="hover:bg-muted/30">
                <td className="px-3 py-2">
                  <Checkbox checked={selectedIds.has(r.id)} onCheckedChange={() => toggleId(r.id)} />
                </td>
                <td className="px-4 py-2">{r.producto_nombre}</td>
                <td className="px-4 py-2 text-foreground">{nombreAlumno(r.alumno_id, r)}</td>
                <td className="px-4 py-2 text-center">{r.cantidad}</td>
                <td className="px-4 py-2 text-right font-heading font-bold">{formatPrice(r.precio_total, r.moneda)}</td>
                <td className="px-4 py-2 text-center">
                  <span className={`text-[10px] font-heading font-bold uppercase px-2 py-0.5 rounded ${estadoColor(r.estado)}`}>
                    {labelEstado(r.estado)}
                  </span>
                </td>
                <td className="px-4 py-2 text-muted-foreground hidden md:table-cell">{new Date(r.created_at).toLocaleDateString("es-AR")}</td>
                <td className="px-4 py-2">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelected(r)} title="Ver"><Eye className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 bg-cyan/10 hover:bg-cyan/20 text-cyan" onClick={() => printOne(r)} disabled={printing} title="Etiqueta con QR"><QrCode className="w-4 h-4" /></Button>
                    <Select value={r.estado} onValueChange={(v) => updateEstado(r.id, v)}>
                      <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ESTADOS.map((e) => <SelectItem key={e} value={e}>{labelEstado(e)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="p-8 text-center text-muted-foreground">No hay preventas</div>}
      </div>

      <Sheet open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{selected?.producto_nombre}</SheetTitle>
          </SheetHeader>
          {selected && (
            <div className="space-y-4 mt-4 text-sm">
              <Button onClick={() => printOne(selected)} disabled={printing} className="w-full gap-2">
                <QrCode className="w-4 h-4" /> Imprimir etiqueta
              </Button>
              <div className="grid grid-cols-2 gap-3">
                <div><span className="text-muted-foreground">Cliente:</span> <div className="font-medium">{selected.alumno_nombre || nombreAlumno(selected.alumno_id, selected)}</div></div>
                <div><span className="text-muted-foreground">Teléfono:</span> <div className="font-medium">{selected.alumno_telefono || alumnos[selected.alumno_id]?.telefono || "—"}</div></div>
                <div><span className="text-muted-foreground">Email:</span> <div className="font-medium break-all">{selected.alumno_email || alumnos[selected.alumno_id]?.email || "—"}</div></div>
                <div><span className="text-muted-foreground">DNI:</span> <div className="font-medium">{selected.alumno_dni || alumnos[selected.alumno_id]?.dni || "—"}</div></div>
                <div><span className="text-muted-foreground">Cantidad:</span> <div className="font-medium">{selected.cantidad}</div></div>
                <div><span className="text-muted-foreground">Modalidad:</span> <div className="font-medium">{selected.modalidad || "—"}</div></div>
                <div><span className="text-muted-foreground">Seña:</span> <div className="font-medium">{formatPrice(selected.sena_monto, selected.moneda)}</div></div>
                <div><span className="text-muted-foreground">Saldo:</span> <div className="font-medium">{formatPrice(selected.saldo_pendiente, selected.moneda)}</div></div>
                <div><span className="text-muted-foreground">Pago seña:</span> <div className="font-medium">{selected.estado_pago_sena}</div></div>
                <div>
                  <span className="text-muted-foreground">Entrega:</span>
                  <div className="font-medium">
                    {selected.entrega_metodo === "retiro_sede" || selected.entrega_metodo === "retiro"
                      ? `Retiro · ${sedes[selected.sede_retiro_id]?.nombre || "sede a confirmar"}`
                      : selected.entrega_metodo === "envio" || selected.entrega_metodo === "envio_moto"
                        ? "Envío"
                        : (selected.entrega_metodo || "—")}
                  </div>
                </div>
              </div>

              {selected.variante && Object.keys(selected.variante).length > 0 && (
                <div>
                  <h3 className="text-xs font-heading uppercase text-muted-foreground mb-1">Variante</h3>
                  <div className="rounded-lg border border-border p-2">
                    {Object.entries(selected.variante).map(([k, v]) => (
                      <div key={k} className="flex justify-between"><span className="text-muted-foreground">{k}</span><span className="font-medium">{String(v)}</span></div>
                    ))}
                  </div>
                </div>
              )}

              {selected.items && Array.isArray(selected.items) && selected.items.length > 0 && (
                <div>
                  <h3 className="text-xs font-heading uppercase text-muted-foreground mb-1">Componentes del combo</h3>
                  <div className="divide-y divide-border rounded-lg border border-border">
                    {selected.items.map((it: any, i: number) => (
                      <div key={i} className="px-3 py-2">
                        <div className="font-medium">{it.producto_nombre || it.nombre || `Item ${i + 1}`}</div>
                        {it.variante && (
                          <div className="text-xs text-muted-foreground">
                            {Object.entries(it.variante).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selected.envio_direccion && (
                <div>
                  <h3 className="text-xs font-heading uppercase text-muted-foreground mb-1">Envío</h3>
                  <div className="rounded-lg border border-border p-2 space-y-1">
                    <div>{selected.envio_direccion}</div>
                    {selected.envio_contacto && <div className="text-xs text-muted-foreground">Contacto: {selected.envio_contacto}</div>}
                    {selected.envio_notas && <div className="text-xs text-muted-foreground">{selected.envio_notas}</div>}
                  </div>
                </div>
              )}

              {selected.notas && (
                <div>
                  <h3 className="text-xs font-heading uppercase text-muted-foreground mb-1">Notas</h3>
                  <div className="rounded-lg border border-border p-2 text-muted-foreground">{selected.notas}</div>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default DepositoPreventas;
