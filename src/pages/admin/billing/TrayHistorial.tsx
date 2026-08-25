import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, RefreshCw, Loader2, Download, Mail, CheckCircle2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { formatPrice } from "@/lib/currency";

const PAGE_SIZE = 50;
const COLS =
  "id, cliente_nombre, concepto, monto, moneda, numero_comprobante, cae, fecha_emision, created_at, emisor_id, segmento";

interface Row {
  id: string;
  cliente_nombre: string;
  concepto: string;
  monto: number;
  moneda: string | null;
  numero_comprobante: string | null;
  cae: string | null;
  fecha_emision: string | null;
  created_at: string;
  emisor_id: string | null;
  segmento: string | null;
}

const SEGMENTO_LABEL: Record<string, string> = { escuela: "Escuela", viajes: "Viajes", tienda: "Tienda" };

export function TrayHistorial({ emisores }: { emisores: { id: string; nombre_fiscal: string }[] }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [origen, setOrigen] = useState<"todos" | "escuela" | "viajes" | "tienda">("todos");
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const fetchPage = useCallback(
    async (from: number) => {
      let q = supabase
        .from("facturas")
        .select(COLS)
        .eq("estado", "emitida")
        .not("cae", "is", null)
        .order("created_at", { ascending: false })
        .range(from, from + PAGE_SIZE - 1);
      if (origen !== "todos") q = q.eq("segmento", origen);
      if (debounced) q = q.ilike("cliente_nombre", `%${debounced}%`);
      const { data, error } = await q;
      if (error) throw error;
      return ((data as any[]) || []).map((r) => ({ ...r, monto: Number(r.monto || 0) })) as Row[];
    },
    [origen, debounced],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const page = await fetchPage(0);
      setRows(page);
      setHasMore(page.length === PAGE_SIZE);
    } catch (e: any) {
      toast({ title: "Error al cargar historial", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [fetchPage]);

  useEffect(() => { load(); }, [load]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const page = await fetchPage(rows.length);
      setRows((prev) => [...prev, ...page]);
      setHasMore(page.length === PAGE_SIZE);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleDownload = async (id: string) => {
    setBusyId(id + ":pdf");
    try {
      const { data, error } = await supabase.functions.invoke("generate-factura-pdf", { body: { factura_id: id } });
      if (error) throw error;
      const url = (data as any)?.signed_url;
      if (!url) throw new Error("Sin URL");
      window.open(url, "_blank");
    } catch (e: any) {
      toast({ title: "Error al generar PDF", description: e.message, variant: "destructive" });
    } finally { setBusyId(null); }
  };

  const handleResend = async (id: string) => {
    setBusyId(id + ":mail");
    try {
      const { data, error } = await supabase.functions.invoke("send-factura-email", { body: { factura_id: id } });
      if (error || (data as any)?.error) throw new Error(error?.message || (data as any).error);
      toast({ title: "Email enviado al cliente" });
    } catch (e: any) {
      toast({ title: "Error al enviar email", description: e.message, variant: "destructive" });
    } finally { setBusyId(null); }
  };

  const emisorName = (id: string | null) => emisores.find((e) => e.id === id)?.nombre_fiscal;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar cliente..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={origen} onValueChange={(v: any) => setOrigen(v)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="escuela">Escuela</SelectItem>
            <SelectItem value="viajes">Viajes</SelectItem>
            <SelectItem value="tienda">Tienda</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Actualizar
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-8">Cargando historial...</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">Todavía no hay facturas emitidas.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((f) => {
            const fecha = new Date(f.fecha_emision || f.created_at).toLocaleDateString("es-AR", {
              day: "numeric", month: "short", year: "numeric", timeZone: "America/Argentina/Buenos_Aires",
            });
            return (
              <div key={f.id} className="rounded-xl border border-border bg-card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-foreground">{f.cliente_nombre}</p>
                    <Badge className="text-[10px] gap-1"><CheckCircle2 className="w-3 h-3" /> Facturada</Badge>
                    {f.numero_comprobante && (
                      <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        N° {f.numero_comprobante}
                      </span>
                    )}
                    {f.segmento && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded border border-border text-muted-foreground">
                        {SEGMENTO_LABEL[f.segmento] || f.segmento}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{f.concepto}</p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                    <span>{fecha}</span>
                    {emisorName(f.emisor_id) && <span>{emisorName(f.emisor_id)}</span>}
                    {f.cae && <span className="opacity-60">CAE {f.cae}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <p className="text-sm font-bold tabular-nums mr-1">{formatPrice(f.monto, (f.moneda || "ARS") as any)}</p>
                  <Button size="sm" variant="ghost" onClick={() => handleDownload(f.id)} disabled={busyId === f.id + ":pdf"}>
                    {busyId === f.id + ":pdf" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleResend(f.id)} disabled={busyId === f.id + ":mail"}>
                    {busyId === f.id + ":mail" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            );
          })}

          {hasMore && (
            <div className="pt-2 text-center">
              <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null} Cargar más
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
