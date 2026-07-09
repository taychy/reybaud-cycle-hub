import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, GraduationCap, Plane, ShoppingBag, Wallet, Lock, Unlock, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { formatCurrency } from "@/lib/currency";

type Unidad = "escuela" | "viajes" | "tienda";

interface Totales {
  escuela: number; viajes: number; tienda: number;
  escuela_count: number; viajes_count: number; tienda_count: number;
}
interface DetalleRow {
  ref_id: string; alumno_nombre: string; monto: number; moneda: string; hora: string; descripcion: string;
}
interface Cierre {
  id: string;
  fecha: string;
  efectivo_escuela_sistema: number;
  efectivo_viajes_sistema: number;
  efectivo_tienda_sistema: number;
  efectivo_escuela_contado: number | null;
  efectivo_viajes_contado: number | null;
  efectivo_tienda_contado: number | null;
  diferencia_escuela: number | null;
  diferencia_viajes: number | null;
  diferencia_tienda: number | null;
  diferencia_total: number | null;
  notas: string | null;
  estado: string;
  cerrado_at: string | null;
}

const todayStr = () => format(new Date(), "yyyy-MM-dd");

export default function AdminCierreCaja() {
  const [fecha, setFecha] = useState(todayStr());
  const [totales, setTotales] = useState<Totales | null>(null);
  const [cierre, setCierre] = useState<Cierre | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [contado, setContado] = useState<Record<Unidad, string>>({ escuela: "", viajes: "", tienda: "" });
  const [notas, setNotas] = useState("");
  const [expanded, setExpanded] = useState<Record<Unidad, boolean>>({ escuela: false, viajes: false, tienda: false });
  const [detalles, setDetalles] = useState<Record<Unidad, DetalleRow[]>>({ escuela: [], viajes: [], tienda: [] });
  const [historial, setHistorial] = useState<Cierre[]>([]);

  const cerrado = cierre?.estado === "cerrado";

  async function loadAll() {
    setLoading(true);
    try {
      const [tRes, cRes, hRes] = await Promise.all([
        supabase.rpc("get_efectivo_del_dia", { p_fecha: fecha }),
        supabase.from("cierres_caja_diarios").select("*").eq("fecha", fecha).maybeSingle(),
        supabase.from("cierres_caja_diarios").select("*").order("fecha", { ascending: false }).limit(30),
      ]);
      if (tRes.error) throw tRes.error;
      const t = (tRes.data as any)?.[0] || tRes.data;
      setTotales(t || { escuela: 0, viajes: 0, tienda: 0, escuela_count: 0, viajes_count: 0, tienda_count: 0 });

      if (cRes.error && cRes.error.code !== "PGRST116") throw cRes.error;
      const c = cRes.data as Cierre | null;
      setCierre(c);
      setContado({
        escuela: c?.efectivo_escuela_contado != null ? String(c.efectivo_escuela_contado) : "",
        viajes: c?.efectivo_viajes_contado != null ? String(c.efectivo_viajes_contado) : "",
        tienda: c?.efectivo_tienda_contado != null ? String(c.efectivo_tienda_contado) : "",
      });
      setNotas(c?.notas || "");

      if (hRes.data) setHistorial(hRes.data as Cierre[]);
    } catch (e: any) {
      toast.error("Error al cargar", { description: e.message });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAll(); }, [fecha]);

  async function toggleDetalle(u: Unidad) {
    const willOpen = !expanded[u];
    setExpanded((p) => ({ ...p, [u]: willOpen }));
    if (willOpen && detalles[u].length === 0) {
      const { data, error } = await supabase.rpc("get_efectivo_detalle_del_dia", { p_fecha: fecha, p_unidad: u });
      if (error) { toast.error("Error detalle", { description: error.message }); return; }
      setDetalles((p) => ({ ...p, [u]: (data as any) || [] }));
    }
  }

  const totalSistema = (totales?.escuela ?? 0) + (totales?.viajes ?? 0) + (totales?.tienda ?? 0);
  const totalContado = (Number(contado.escuela) || 0) + (Number(contado.viajes) || 0) + (Number(contado.tienda) || 0);
  const diferenciaTotal = totalContado - totalSistema;

  const diffEscuela = contado.escuela === "" ? null : Number(contado.escuela) - (totales?.escuela ?? 0);
  const diffViajes = contado.viajes === "" ? null : Number(contado.viajes) - (totales?.viajes ?? 0);
  const diffTienda = contado.tienda === "" ? null : Number(contado.tienda) - (totales?.tienda ?? 0);

  async function guardar(cerrar: boolean) {
    if (!totales) return;
    setSaving(true);
    try {
      const payload: any = {
        fecha,
        efectivo_escuela_sistema: totales.escuela,
        efectivo_viajes_sistema: totales.viajes,
        efectivo_tienda_sistema: totales.tienda,
        efectivo_escuela_contado: contado.escuela === "" ? null : Number(contado.escuela),
        efectivo_viajes_contado: contado.viajes === "" ? null : Number(contado.viajes),
        efectivo_tienda_contado: contado.tienda === "" ? null : Number(contado.tienda),
        diferencia_escuela: diffEscuela,
        diferencia_viajes: diffViajes,
        diferencia_tienda: diffTienda,
        diferencia_total: (diffEscuela ?? 0) + (diffViajes ?? 0) + (diffTienda ?? 0),
        notas: notas || null,
      };
      if (cerrar) {
        const { data: u } = await supabase.auth.getUser();
        payload.estado = "cerrado";
        payload.cerrado_at = new Date().toISOString();
        payload.cerrado_por = u.user?.id;
      }
      const { error } = await supabase
        .from("cierres_caja_diarios")
        .upsert(payload, { onConflict: "fecha" });
      if (error) throw error;
      toast.success(cerrar ? "Caja cerrada" : "Guardado");
      loadAll();
    } catch (e: any) {
      toast.error("Error al guardar", { description: e.message });
    } finally {
      setSaving(false);
    }
  }

  async function reabrir() {
    if (!cierre) return;
    if (!confirm("¿Reabrir el cierre de este día?")) return;
    const { error } = await supabase
      .from("cierres_caja_diarios")
      .update({ estado: "abierto", cerrado_at: null, cerrado_por: null })
      .eq("id", cierre.id);
    if (error) { toast.error("Error", { description: error.message }); return; }
    toast.success("Cierre reabierto");
    loadAll();
  }

  const unidades: { key: Unidad; label: string; icon: any; sistema: number; count: number; diff: number | null }[] = [
    { key: "escuela", label: "Escuela", icon: GraduationCap, sistema: totales?.escuela ?? 0, count: totales?.escuela_count ?? 0, diff: diffEscuela },
    { key: "viajes", label: "Viajes / Eventos", icon: Plane, sistema: totales?.viajes ?? 0, count: totales?.viajes_count ?? 0, diff: diffViajes },
    { key: "tienda", label: "Tienda", icon: ShoppingBag, sistema: totales?.tienda ?? 0, count: totales?.tienda_count ?? 0, diff: diffTienda },
  ];

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wallet className="w-6 h-6" /> Cierre de caja (efectivo)
          </h1>
          <p className="text-sm text-muted-foreground">
            Arqueo nocturno. Contá el efectivo físico y compará con lo que registra el sistema.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-auto" />
          <Button variant="outline" size="icon" onClick={loadAll} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          {cerrado ? (
            <Badge variant="secondary" className="gap-1"><Lock className="w-3 h-3" /> Cerrado</Badge>
          ) : (
            <Badge variant="outline" className="gap-1"><Unlock className="w-3 h-3" /> Abierto</Badge>
          )}
        </div>
      </div>

      {loading && !totales ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            {unidades.map(({ key, label, icon: Icon, sistema, count, diff }) => (
              <Card key={key}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Icon className="w-4 h-4" /> {label}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Sistema ({count})</span>
                    <span className="font-mono font-semibold">{formatCurrency(sistema, "ARS")}</span>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Contado físico</Label>
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      placeholder="0"
                      disabled={cerrado}
                      value={contado[key]}
                      onChange={(e) => setContado((p) => ({ ...p, [key]: e.target.value }))}
                      className="font-mono"
                    />
                  </div>
                  <div className="flex justify-between items-center text-sm border-t pt-2">
                    <span className="text-muted-foreground">Diferencia</span>
                    <span className={`font-mono font-semibold ${diff == null ? "text-muted-foreground" : diff === 0 ? "text-green-600" : diff > 0 ? "text-amber-600" : "text-red-600"}`}>
                      {diff == null ? "—" : `${diff > 0 ? "+" : ""}${formatCurrency(diff, "ARS")}`}
                    </span>
                  </div>
                  <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => toggleDetalle(key)}>
                    {expanded[key] ? <ChevronUp className="w-3 h-3 mr-1" /> : <ChevronDown className="w-3 h-3 mr-1" />}
                    Ver detalle ({count})
                  </Button>
                  {expanded[key] && (
                    <div className="max-h-56 overflow-auto text-xs border rounded p-2 space-y-1 bg-muted/30">
                      {detalles[key].length === 0 ? (
                        <div className="text-muted-foreground text-center py-2">Sin movimientos</div>
                      ) : (
                        detalles[key].map((r) => (
                          <div key={r.ref_id} className="flex justify-between gap-2 border-b last:border-0 py-1">
                            <div className="flex-1 min-w-0">
                              <div className="truncate">{r.alumno_nombre}</div>
                              <div className="text-muted-foreground truncate">{r.descripcion} · {format(new Date(r.hora), "HH:mm")}</div>
                            </div>
                            <div className="font-mono">{formatCurrency(r.monto, r.moneda as any)}</div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Total del día</CardTitle></CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-3 text-sm">
              <div>
                <div className="text-muted-foreground">Sistema</div>
                <div className="font-mono text-lg font-bold">{formatCurrency(totalSistema, "ARS")}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Contado</div>
                <div className="font-mono text-lg font-bold">{formatCurrency(totalContado, "ARS")}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Diferencia</div>
                <div className={`font-mono text-lg font-bold ${diferenciaTotal === 0 ? "text-green-600" : diferenciaTotal > 0 ? "text-amber-600" : "text-red-600"}`}>
                  {diferenciaTotal > 0 ? "+" : ""}{formatCurrency(diferenciaTotal, "ARS")}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Notas del cierre</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                placeholder="Aclaraciones sobre diferencias, vueltos, faltantes, sobrantes..."
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                disabled={cerrado}
                rows={3}
              />
              <div className="flex flex-wrap gap-2 justify-end">
                {cerrado ? (
                  <Button variant="outline" onClick={reabrir}><Unlock className="w-4 h-4 mr-1" /> Reabrir</Button>
                ) : (
                  <>
                    <Button variant="outline" onClick={() => guardar(false)} disabled={saving}>
                      {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
                      Guardar borrador
                    </Button>
                    <Button onClick={() => guardar(true)} disabled={saving}>
                      <Lock className="w-4 h-4 mr-1" /> Cerrar caja del día
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Historial (últimos 30 cierres)</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground border-b">
                    <tr>
                      <th className="text-left py-2">Fecha</th>
                      <th className="text-right">Escuela</th>
                      <th className="text-right">Viajes</th>
                      <th className="text-right">Tienda</th>
                      <th className="text-right">Total</th>
                      <th className="text-right">Diferencia</th>
                      <th className="text-center">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historial.length === 0 ? (
                      <tr><td colSpan={7} className="text-center py-4 text-muted-foreground">Sin cierres registrados</td></tr>
                    ) : historial.map((h) => (
                      <tr key={h.id} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => setFecha(h.fecha)}>
                        <td className="py-2">{format(new Date(h.fecha + "T12:00:00"), "dd MMM yyyy", { locale: es })}</td>
                        <td className="text-right font-mono">{formatCurrency(h.efectivo_escuela_sistema, "ARS")}</td>
                        <td className="text-right font-mono">{formatCurrency(h.efectivo_viajes_sistema, "ARS")}</td>
                        <td className="text-right font-mono">{formatCurrency(h.efectivo_tienda_sistema, "ARS")}</td>
                        <td className="text-right font-mono font-semibold">
                          {formatCurrency((h.efectivo_escuela_sistema || 0) + (h.efectivo_viajes_sistema || 0) + (h.efectivo_tienda_sistema || 0), "ARS")}
                        </td>
                        <td className={`text-right font-mono ${h.diferencia_total == null ? "text-muted-foreground" : h.diferencia_total === 0 ? "text-green-600" : "text-red-600"}`}>
                          {h.diferencia_total == null ? "—" : `${h.diferencia_total > 0 ? "+" : ""}${formatCurrency(h.diferencia_total, "ARS")}`}
                        </td>
                        <td className="text-center">
                          {h.estado === "cerrado"
                            ? <Badge variant="secondary" className="gap-1"><Lock className="w-3 h-3" /> Cerrado</Badge>
                            : <Badge variant="outline">Abierto</Badge>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
