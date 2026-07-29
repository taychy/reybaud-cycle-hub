import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Link, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CheckCircle2,
  Clock,
  Eye,
  ExternalLink,
  Banknote,
  ArrowLeft,
  XCircle,
  ImageOff,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { formatPrice } from "@/lib/currency";

interface Row {
  id: string;
  list_id: string;
  cliente_nombre: string;
  monto: number;
  moneda: string;
  forma_pago: string;
  monto_esperado: number | null;
  moneda_esperada: string | null;
  forma_pago_esperada: string | null;
  comprobante_path: string | null;
  notas: string | null;
  cargado_por_nombre: string | null;
  cargado_por_email: string | null;
  origen: string;
  validado: boolean;
  validado_at: string | null;
  validado_notas: string | null;
  rechazado: boolean;
  rechazado_at: string | null;
  rechazado_motivo: string | null;
  created_at: string;
  delivery_lists: { titulo: string } | null;
}

type Tab = "pendientes" | "validados" | "rechazados";

const AdminDeliveryPayments = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [tab, setTab] = useState<Tab>("pendientes");
  const [loading, setLoading] = useState(true);
  const [notesById, setNotesById] = useState<Record<string, string>>({});
  const [detail, setDetail] = useState<Row | null>(null);
  const [detailUrl, setDetailUrl] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<Row | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const load = async () => {
    setLoading(true);
    let query = supabase
      .from("delivery_list_payments")
      .select("*, delivery_lists(titulo)")
      .order("created_at", { ascending: false })
      .limit(200);
    if (tab === "rechazados") query = query.eq("rechazado", true);
    else query = query.eq("rechazado", false).eq("validado", tab === "validados");
    const { data, error } = await query;
    setLoading(false);
    if (error) return toast.error(error.message);
    setRows((data as any) || []);
  };

  useEffect(() => {
    load();
  }, [tab]);

  const signedUrl = async (path: string) => {
    const { data } = await supabase.storage
      .from("delivery-payments")
      .createSignedUrl(path, 60 * 10);
    return data?.signedUrl || null;
  };

  const openProof = async (path: string) => {
    const url = await signedUrl(path);
    if (url) window.open(url, "_blank");
    else toast.error("No se pudo abrir el comprobante");
  };

  const openDetail = async (row: Row) => {
    setDetail(row);
    setDetailUrl(null);
    if (row.comprobante_path) setDetailUrl(await signedUrl(row.comprobante_path));
  };

  const validate = async (row: Row) => {
    const { data: userRes } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("delivery_list_payments")
      .update({
        validado: true,
        validado_at: new Date().toISOString(),
        validado_por: userRes.user?.id ?? null,
        validado_notas: notesById[row.id]?.trim() || null,
        rechazado: false,
        rechazado_at: null,
        rechazado_por: null,
        rechazado_motivo: null,
      })
      .eq("id", row.id);
    if (error) return toast.error(error.message);
    toast.success("Cobro validado");
    setDetail(null);
    load();
  };

  const confirmReject = async () => {
    if (!rejecting) return;
    if (!rejectReason.trim()) return toast.error("Contá brevemente por qué lo rechazás");
    const { data: userRes } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("delivery_list_payments")
      .update({
        rechazado: true,
        rechazado_at: new Date().toISOString(),
        rechazado_por: userRes.user?.id ?? null,
        rechazado_motivo: rejectReason.trim(),
        validado: false,
        validado_at: null,
        validado_por: null,
      })
      .eq("id", rejecting.id);
    if (error) return toast.error(error.message);
    toast.success("Cobro rechazado");
    setRejecting(null);
    setRejectReason("");
    setDetail(null);
    load();
  };

  const revert = async (row: Row) => {
    const { error } = await supabase
      .from("delivery_list_payments")
      .update({
        validado: false,
        validado_at: null,
        validado_por: null,
        rechazado: false,
        rechazado_at: null,
        rechazado_por: null,
        rechazado_motivo: null,
      })
      .eq("id", row.id);
    if (error) return toast.error(error.message);
    toast.success("Volvió a pendientes");
    setDetail(null);
    load();
  };

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-4">
      <Button variant="ghost" size="sm" className="-ml-2" onClick={() => navigate(-1)}>
        <ArrowLeft className="w-4 h-4 mr-1" /> Volver
      </Button>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="font-heading text-2xl flex items-center gap-2">
          <Banknote className="w-6 h-6 text-primary" /> Cobros de entrega
        </h1>
        <div className="flex gap-1 rounded-lg bg-secondary p-1">
          {(["pendientes", "validados", "rechazados"] as Tab[]).map((t) => (
            <Button
              key={t}
              size="sm"
              variant={tab === t ? "default" : "ghost"}
              onClick={() => setTab(t)}
              className="capitalize"
            >
              {t}
            </Button>
          ))}
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Cobros reportados por depósito o por el link público durante entregas. Tocá una tarjeta para ver el
        detalle y la foto del comprobante, y validá o rechazá cada uno.
      </p>

      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando...</p>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            {tab === "pendientes"
              ? "No hay cobros pendientes de validar."
              : tab === "validados"
                ? "Todavía no hay cobros validados."
                : "No hay cobros rechazados."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const diff =
              r.monto_esperado != null &&
              r.moneda === r.moneda_esperada &&
              Number(r.monto) !== Number(r.monto_esperado);
            return (
              <Card key={r.id}>
                <CardHeader
                  className="pb-2 flex-row items-start justify-between gap-2 cursor-pointer"
                  onClick={() => openDetail(r)}
                >
                  <div className="min-w-0">
                    <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                      {r.cliente_nombre}
                      <Badge variant="secondary" className="text-[10px]">
                        {r.origen === "public" ? "Link público" : r.origen === "deposito" ? "Depósito" : "Admin"}
                      </Badge>
                      {r.rechazado ? (
                        <Badge variant="destructive" className="text-[10px]">
                          <XCircle className="w-3 h-3 mr-1" /> Rechazado
                        </Badge>
                      ) : r.validado ? (
                        <Badge className="text-[10px] bg-primary/20 text-primary">
                          <CheckCircle2 className="w-3 h-3 mr-1" /> Validado
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-amber-500 border-amber-500/50">
                          <Clock className="w-3 h-3 mr-1" /> Pendiente
                        </Badge>
                      )}
                      {r.comprobante_path ? (
                        <Badge variant="outline" className="text-[10px]">
                          <Eye className="w-3 h-3 mr-1" /> Con foto
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">
                          <ImageOff className="w-3 h-3 mr-1" /> Sin comprobante
                        </Badge>
                      )}
                    </CardTitle>
                    <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                      <Link
                        to={`/deposito/entregas/${r.list_id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="hover:underline inline-flex items-center gap-0.5"
                      >
                        <ExternalLink className="w-3 h-3" />
                        {r.delivery_lists?.titulo || "Lista"}
                      </Link>
                      <span>·</span>
                      <span>{new Date(r.created_at).toLocaleString("es-AR")}</span>
                      {r.cargado_por_nombre && (
                        <>
                          <span>·</span>
                          <span>Cargó: {r.cargado_por_nombre}</span>
                        </>
                      )}
                      <span className="inline-flex items-center gap-0.5 text-primary">
                        <Search className="w-3 h-3" /> Ver detalle
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-heading text-xl">{formatPrice(r.monto, r.moneda)}</div>
                    <div className="text-xs text-muted-foreground">{r.forma_pago}</div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-2">
                  {(r.monto_esperado != null || r.forma_pago_esperada) && (
                    <div className={`text-xs rounded-md p-2 ${diff ? "bg-amber-500/10 text-amber-600" : "bg-secondary/50 text-muted-foreground"}`}>
                      Esperado:{" "}
                      {r.monto_esperado != null
                        ? formatPrice(r.monto_esperado, r.moneda_esperada || r.moneda)
                        : "—"}
                      {r.forma_pago_esperada ? ` · ${r.forma_pago_esperada}` : ""}
                      {diff && " · No coincide con el monto cargado"}
                    </div>
                  )}
                  {r.notas && <p className="text-xs italic text-muted-foreground">"{r.notas}"</p>}
                  {r.rechazado && r.rechazado_motivo && (
                    <p className="text-xs text-destructive">Motivo del rechazo: {r.rechazado_motivo}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    {r.comprobante_path && (
                      <Button size="sm" variant="outline" onClick={() => openProof(r.comprobante_path!)}>
                        <Eye className="w-3.5 h-3.5 mr-1" /> Ver comprobante
                      </Button>
                    )}
                    {!r.validado && !r.rechazado && (
                      <>
                        <Textarea
                          className="flex-1 min-w-[200px]"
                          rows={1}
                          placeholder="Nota interna (opcional)"
                          value={notesById[r.id] || ""}
                          onChange={(e) => setNotesById((prev) => ({ ...prev, [r.id]: e.target.value }))}
                        />
                        <Button size="sm" variant="gold" onClick={() => validate(r)}>
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Validar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive border-destructive/50 hover:bg-destructive/10"
                          onClick={() => {
                            setRejecting(r);
                            setRejectReason("");
                          }}
                        >
                          <XCircle className="w-3.5 h-3.5 mr-1" /> Rechazar
                        </Button>
                      </>
                    )}
                    {(r.validado || r.rechazado) && (
                      <Button size="sm" variant="ghost" onClick={() => revert(r)}>
                        Volver a pendientes
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Detalle */}
      <Dialog open={!!detail} onOpenChange={(v) => !v && setDetail(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{detail?.cliente_nombre}</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-xs text-muted-foreground">Monto cobrado</div>
                  <div className="font-heading text-lg">{formatPrice(detail.monto, detail.moneda)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Esperado</div>
                  <div className="font-heading text-lg">
                    {detail.monto_esperado != null
                      ? formatPrice(detail.monto_esperado, detail.moneda_esperada || detail.moneda)
                      : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Forma de pago</div>
                  <div>{detail.forma_pago}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Origen</div>
                  <div>
                    {detail.origen === "public"
                      ? "Link público"
                      : detail.origen === "deposito"
                        ? "Depósito"
                        : "Admin"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Lista</div>
                  <div>{detail.delivery_lists?.titulo || "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Fecha</div>
                  <div>{new Date(detail.created_at).toLocaleString("es-AR")}</div>
                </div>
                <div className="col-span-2">
                  <div className="text-xs text-muted-foreground">Cargó</div>
                  <div>
                    {detail.cargado_por_nombre || "—"}
                    {detail.cargado_por_email ? ` · ${detail.cargado_por_email}` : ""}
                  </div>
                </div>
              </div>

              {detail.notas && (
                <div className="rounded-md bg-secondary/50 p-2 text-xs italic">"{detail.notas}"</div>
              )}
              {detail.validado_notas && (
                <div className="rounded-md bg-secondary/50 p-2 text-xs">
                  Nota interna: {detail.validado_notas}
                </div>
              )}
              {detail.rechazado_motivo && (
                <div className="rounded-md bg-destructive/10 text-destructive p-2 text-xs">
                  Motivo del rechazo: {detail.rechazado_motivo}
                </div>
              )}

              <div>
                <div className="text-xs text-muted-foreground mb-1">Comprobante / foto</div>
                {!detail.comprobante_path ? (
                  <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
                    Este cobro se cargó sin foto de comprobante.
                  </div>
                ) : detailUrl ? (
                  /\.(pdf)$/i.test(detail.comprobante_path) ? (
                    <Button variant="outline" size="sm" onClick={() => window.open(detailUrl, "_blank")}>
                      <Eye className="w-3.5 h-3.5 mr-1" /> Abrir PDF
                    </Button>
                  ) : (
                    <button type="button" onClick={() => window.open(detailUrl, "_blank")}>
                      <img
                        src={detailUrl}
                        alt={`Comprobante de cobro de ${detail.cliente_nombre}`}
                        className="rounded-md max-h-72 w-auto border"
                      />
                    </button>
                  )
                ) : (
                  <p className="text-xs text-muted-foreground">Cargando comprobante...</p>
                )}
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            {detail && !detail.validado && !detail.rechazado && (
              <>
                <Button
                  variant="outline"
                  className="text-destructive border-destructive/50 hover:bg-destructive/10"
                  onClick={() => {
                    setRejecting(detail);
                    setRejectReason("");
                  }}
                >
                  <XCircle className="w-4 h-4 mr-1" /> Rechazar
                </Button>
                <Button variant="gold" onClick={() => validate(detail)}>
                  <CheckCircle2 className="w-4 h-4 mr-1" /> Validar
                </Button>
              </>
            )}
            {detail && (detail.validado || detail.rechazado) && (
              <Button variant="ghost" onClick={() => revert(detail)}>
                Volver a pendientes
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rechazo */}
      <Dialog open={!!rejecting} onOpenChange={(v) => !v && setRejecting(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Rechazar cobro · {rejecting?.cliente_nombre}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            El cobro deja de contar en la caja y queda registrado el motivo para que depósito lo corrija.
          </p>
          <Textarea
            rows={3}
            placeholder="Ej: no figura el ingreso en la cuenta / falta comprobante / monto incorrecto"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejecting(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmReject}>
              Rechazar cobro
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminDeliveryPayments;
