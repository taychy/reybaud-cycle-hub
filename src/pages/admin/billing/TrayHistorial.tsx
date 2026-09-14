import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, RefreshCw, Loader2, Download, Mail, CheckCircle2, RotateCcw, AlertTriangle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { formatPrice } from "@/lib/currency";
import { CreditNoteModal, type CreditNoteInvoice } from "./CreditNoteModal";

const PAGE_SIZE = 50;
const COLS =
  "id, cliente_nombre, concepto, monto, moneda, numero_comprobante, cae, fecha_emision, created_at, emisor_id, segmento, tipo_comprobante";

interface Row extends CreditNoteInvoice {
  concepto: string;
  cae: string | null;
  fecha_emision: string | null;
  created_at: string;
  segmento: string | null;
}

interface CreditRow {
  id: string;
  factura_origen_id: string;
  monto: number;
  estado: string;
  numero_comprobante: string | null;
  cae: string | null;
  fecha_emision: string | null;
  tipo_comprobante: number;
  letra_comprobante: string;
  error_detalle: string | null;
  created_at: string;
}

const SEGMENTO_LABEL: Record<string, string> = { escuela: "Escuela", viajes: "Viajes", tienda: "Tienda" };

export function TrayHistorial({ emisores }: { emisores: { id: string; nombre_fiscal: string }[] }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [creditNotes, setCreditNotes] = useState<Record<string, CreditRow[]>>({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [origen, setOrigen] = useState<"todos" | "escuela" | "viajes" | "tienda">("todos");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creditInvoice, setCreditInvoice] = useState<Row | null>(null);

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

  const fetchCreditNotes = useCallback(async (invoiceIds: string[]) => {
    if (invoiceIds.length === 0) return {} as Record<string, CreditRow[]>;
    const { data, error } = await supabase
      .from("notas_credito" as any)
      .select("id, factura_origen_id, monto, estado, numero_comprobante, cae, fecha_emision, tipo_comprobante, letra_comprobante, error_detalle, created_at")
      .in("factura_origen_id", invoiceIds)
      .order("created_at", { ascending: false });
    if (error) throw error;

    const grouped: Record<string, CreditRow[]> = {};
    ((data as any[]) || []).forEach((item) => {
      const row = { ...item, monto: Number(item.monto || 0) } as CreditRow;
      grouped[row.factura_origen_id] = [...(grouped[row.factura_origen_id] || []), row];
    });
    return grouped;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const page = await fetchPage(0);
      const notes = await fetchCreditNotes(page.map((r) => r.id));
      setRows(page);
      setCreditNotes(notes);
      setHasMore(page.length === PAGE_SIZE);
    } catch (e: any) {
      toast({ title: "Error al cargar historial", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [fetchPage, fetchCreditNotes]);

  useEffect(() => { load(); }, [load]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const page = await fetchPage(rows.length);
      const notes = await fetchCreditNotes(page.map((r) => r.id));
      setRows((prev) => [...prev, ...page]);
      setCreditNotes((prev) => ({ ...prev, ...notes }));
      setHasMore(page.length === PAGE_SIZE);
    } catch (e: any) {
      toast({ title: "Error al cargar más facturas", description: e.message, variant: "destructive" });
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
  const activeCreditAmount = (invoiceId: string) => (creditNotes[invoiceId] || [])
    .filter((n) => ["procesando", "enviando", "emitida"].includes(n.estado))
    .reduce((sum, n) => sum + Number(n.monto || 0), 0);

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
            const notes = creditNotes[f.id] || [];
            const acreditado = activeCreditAmount(f.id);
            const disponible = Math.max(0, Math.round((Number(f.monto) - acreditado) * 100) / 100);
            const canCredit = [1, 6, 11].includes(Number(f.tipo_comprobante)) && Boolean(f.emisor_id) && disponible > 0;

            return (
              <div key={f.id} className="rounded-xl border border-border bg-card p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
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

                  <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                    <div className="text-right mr-1">
                      <p className="text-sm font-bold tabular-nums">{formatPrice(f.monto, (f.moneda || "ARS") as any)}</p>
                      {acreditado > 0 && (
                        <p className="text-[10px] text-muted-foreground">Acreditado {formatPrice(acreditado, (f.moneda || "ARS") as any)} · disp. {formatPrice(disponible, (f.moneda || "ARS") as any)}</p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setCreditInvoice(f)}
                      disabled={!canCredit}
                      title={disponible <= 0 ? "La factura ya fue acreditada por completo" : "Emitir nota de crédito"}
                    >
                      <RotateCcw className="w-4 h-4 mr-1" /> Nota de crédito
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDownload(f.id)} disabled={busyId === f.id + ":pdf"}>
                      {busyId === f.id + ":pdf" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleResend(f.id)} disabled={busyId === f.id + ":mail"}>
                      {busyId === f.id + ":mail" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>

                {notes.length > 0 && (
                  <div className="border-t border-border/60 pt-2 space-y-1.5">
                    {notes.map((n) => (
                      <div key={n.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/20 px-2.5 py-2 text-xs">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">Nota de Crédito {n.letra_comprobante}</span>
                          {n.numero_comprobante && <span className="text-muted-foreground">N° {n.numero_comprobante}</span>}
                          {n.estado === "emitida" ? (
                            <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-500/30">Emitida</Badge>
                          ) : n.estado === "error" ? (
                            <Badge variant="outline" className="text-[10px] text-destructive border-destructive/30"><AlertTriangle className="w-3 h-3 mr-1" /> Error</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px]">Procesando</Badge>
                          )}
                          {n.error_detalle && <span className="text-destructive text-[10px]">{n.error_detalle}</span>}
                        </div>
                        <span className="font-semibold text-destructive">− {formatPrice(n.monto, (f.moneda || "ARS") as any)}</span>
                      </div>
                    ))}
                  </div>
                )}
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

      <CreditNoteModal
        open={Boolean(creditInvoice)}
        onOpenChange={(open) => !open && setCreditInvoice(null)}
        factura={creditInvoice}
        acreditado={creditInvoice ? activeCreditAmount(creditInvoice.id) : 0}
        onCompleted={load}
      />
    </div>
  );
}
