import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, Clock, Eye, ExternalLink, Banknote } from "lucide-react";
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
  origen: string;
  validado: boolean;
  created_at: string;
  delivery_lists: { titulo: string } | null;
}

const AdminDeliveryPayments = () => {
  const [rows, setRows] = useState<Row[]>([]);
  const [tab, setTab] = useState<"pendientes" | "validados">("pendientes");
  const [loading, setLoading] = useState(true);
  const [notesById, setNotesById] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("delivery_list_payments")
      .select("*, delivery_lists(titulo)")
      .eq("validado", tab === "validados")
      .order("created_at", { ascending: false })
      .limit(200);
    setLoading(false);
    if (error) return toast.error(error.message);
    setRows((data as any) || []);
  };

  useEffect(() => {
    load();
  }, [tab]);

  const openProof = async (path: string) => {
    const { data } = await supabase.storage
      .from("delivery-payments")
      .createSignedUrl(path, 60 * 10);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
    else toast.error("No se pudo abrir el comprobante");
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
      })
      .eq("id", row.id);
    if (error) return toast.error(error.message);
    toast.success("Cobro validado");
    load();
  };

  const revert = async (row: Row) => {
    const { error } = await supabase
      .from("delivery_list_payments")
      .update({ validado: false, validado_at: null, validado_por: null })
      .eq("id", row.id);
    if (error) return toast.error(error.message);
    toast.success("Validación revertida");
    load();
  };

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl flex items-center gap-2">
          <Banknote className="w-6 h-6 text-primary" /> Cobros de entrega
        </h1>
        <div className="flex gap-1 rounded-lg bg-secondary p-1">
          <Button
            size="sm"
            variant={tab === "pendientes" ? "default" : "ghost"}
            onClick={() => setTab("pendientes")}
          >
            Pendientes
          </Button>
          <Button
            size="sm"
            variant={tab === "validados" ? "default" : "ghost"}
            onClick={() => setTab("validados")}
          >
            Validados
          </Button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Cobros reportados por depósito o por el link público durante entregas. Validá cada uno una vez corroborado con caja / cuenta.
      </p>

      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando...</p>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            {tab === "pendientes" ? "No hay cobros pendientes de validar." : "Todavía no hay cobros validados."}
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
                <CardHeader className="pb-2 flex-row items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                      {r.cliente_nombre}
                      <Badge variant="secondary" className="text-[10px]">
                        {r.origen === "public" ? "Link público" : r.origen === "deposito" ? "Depósito" : "Admin"}
                      </Badge>
                      {r.validado ? (
                        <Badge className="text-[10px] bg-primary/20 text-primary">
                          <CheckCircle2 className="w-3 h-3 mr-1" /> Validado
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-amber-500 border-amber-500/50">
                          <Clock className="w-3 h-3 mr-1" /> Pendiente
                        </Badge>
                      )}
                    </CardTitle>
                    <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                      <Link
                        to={`/deposito/entregas/${r.list_id}`}
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
                  {r.notas && (
                    <p className="text-xs italic text-muted-foreground">"{r.notas}"</p>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    {r.comprobante_path && (
                      <Button size="sm" variant="outline" onClick={() => openProof(r.comprobante_path!)}>
                        <Eye className="w-3.5 h-3.5 mr-1" /> Ver comprobante
                      </Button>
                    )}
                    {!r.validado && (
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
                      </>
                    )}
                    {r.validado && (
                      <Button size="sm" variant="ghost" onClick={() => revert(r)}>
                        Revertir validación
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AdminDeliveryPayments;
