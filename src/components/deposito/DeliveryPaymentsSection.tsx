import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Banknote, Paperclip, Upload, CheckCircle2, Clock, Trash2, Eye } from "lucide-react";
import { toast } from "sonner";
import { formatPrice } from "@/lib/currency";

const MONEDAS = ["ARS", "USD", "EUR"] as const;
const FORMAS_PAGO = [
  "Efectivo",
  "Transferencia",
  "Mercado Pago",
  "Tarjeta",
  "Cheque",
  "Otro",
];

interface DeliveryPayment {
  id: string;
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
  validado_at: string | null;
  created_at: string;
}

interface Props {
  mode: "auth" | "public";
  listId: string;
  publicToken?: string;
  clienteNombre: string;
  expectedMonto?: number | null;
  expectedMoneda?: string | null;
  expectedForma?: string | null;
}

const DeliveryPaymentsSection = ({
  mode,
  listId,
  publicToken,
  clienteNombre,
  expectedMonto,
  expectedMoneda,
  expectedForma,
}: Props) => {
  const [payments, setPayments] = useState<DeliveryPayment[]>([]);
  const [open, setOpen] = useState(false);

  const load = async () => {
    if (mode !== "auth") return;
    const { data } = await supabase
      .from("delivery_list_payments")
      .select("*")
      .eq("list_id", listId)
      .eq("cliente_nombre", clienteNombre)
      .order("created_at", { ascending: false });
    setPayments((data as any) || []);
  };

  useEffect(() => {
    load();
  }, [listId, clienteNombre, mode]);

  const totalCargado = payments.reduce((acc, p) => {
    acc[p.moneda] = (acc[p.moneda] || 0) + Number(p.monto);
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="mt-2 pt-2 border-t border-border/50 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Banknote className="w-3.5 h-3.5" />
          <span>Cobros</span>
          {mode === "auth" && payments.length > 0 && (
            <span className="text-foreground font-medium">
              {Object.entries(totalCargado).map(([m, v]) => formatPrice(v, m)).join(" · ")}
            </span>
          )}
        </div>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setOpen(true)}>
          <Banknote className="w-3 h-3 mr-1" /> Registrar cobro
        </Button>
      </div>

      {mode === "auth" && payments.length > 0 && (
        <ul className="space-y-1">
          {payments.map((p) => (
            <PaymentRow key={p.id} p={p} onChange={load} />
          ))}
        </ul>
      )}

      {expectedMonto != null && (
        <p className="text-[10px] text-muted-foreground italic">
          Esperado: {formatPrice(expectedMonto, expectedMoneda || "ARS")}
          {expectedForma ? ` · ${expectedForma}` : ""}
        </p>
      )}

      <PaymentDialog
        open={open}
        onOpenChange={setOpen}
        mode={mode}
        listId={listId}
        publicToken={publicToken}
        clienteNombre={clienteNombre}
        expectedMonto={expectedMonto}
        expectedMoneda={expectedMoneda}
        expectedForma={expectedForma}
        onSaved={load}
      />
    </div>
  );
};

const PaymentRow = ({ p, onChange }: { p: DeliveryPayment; onChange: () => void }) => {
  const [validating, setValidating] = useState(false);

  const openProof = async () => {
    if (!p.comprobante_path) return;
    const { data } = await supabase.storage
      .from("delivery-payments")
      .createSignedUrl(p.comprobante_path, 60 * 10);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
    else toast.error("No se pudo abrir el comprobante");
  };

  const toggleValidated = async () => {
    setValidating(true);
    const { data: userRes } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("delivery_list_payments")
      .update({
        validado: !p.validado,
        validado_at: !p.validado ? new Date().toISOString() : null,
        validado_por: !p.validado ? userRes.user?.id ?? null : null,
      })
      .eq("id", p.id);
    setValidating(false);
    if (error) return toast.error(error.message);
    onChange();
  };

  const remove = async () => {
    if (!confirm("¿Eliminar este cobro?")) return;
    const { error } = await supabase.from("delivery_list_payments").delete().eq("id", p.id);
    if (error) return toast.error(error.message);
    onChange();
  };

  return (
    <li className="rounded-md bg-secondary/40 p-2 text-xs space-y-0.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {p.validado ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />
          ) : (
            <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          )}
          <span className="font-semibold">{formatPrice(p.monto, p.moneda)}</span>
          <span className="text-muted-foreground truncate">· {p.forma_pago}</span>
          {p.origen === "public" && (
            <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4">Link público</Badge>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          {p.comprobante_path && (
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={openProof}>
              <Eye className="w-3 h-3" />
            </Button>
          )}
          <Button
            size="sm"
            variant={p.validado ? "ghost" : "outline"}
            className="h-6 px-1.5 text-[10px]"
            disabled={validating}
            onClick={toggleValidated}
          >
            {p.validado ? "Anular val." : "Validar"}
          </Button>
          <Button size="icon" variant="ghost" className="h-6 w-6 hover:text-destructive" onClick={remove}>
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </div>
      {(p.cargado_por_nombre || p.notas) && (
        <div className="text-[10px] text-muted-foreground pl-5">
          {p.cargado_por_nombre && <span>Cargó: {p.cargado_por_nombre}</span>}
          {p.cargado_por_nombre && p.notas && " · "}
          {p.notas && <span className="italic">{p.notas}</span>}
        </div>
      )}
    </li>
  );
};

const PaymentDialog = ({
  open, onOpenChange, mode, listId, publicToken, clienteNombre,
  expectedMonto, expectedMoneda, expectedForma, onSaved,
}: Props & { open: boolean; onOpenChange: (v: boolean) => void; onSaved: () => void }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [monto, setMonto] = useState("");
  const [moneda, setMoneda] = useState<string>(expectedMoneda || "ARS");
  const [formaPago, setFormaPago] = useState<string>(expectedForma || "Efectivo");
  const [notas, setNotas] = useState("");
  const [cargadoPor, setCargadoPor] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setMonto(expectedMonto != null ? String(expectedMonto) : "");
      setMoneda(expectedMoneda || "ARS");
      setFormaPago(expectedForma || "Efectivo");
      setNotas("");
      setCargadoPor("");
      setFile(null);
    }
  }, [open, expectedMonto, expectedMoneda, expectedForma]);

  const uploadComprobante = async (): Promise<{ path: string | null; failed: boolean }> => {
    if (!file) return { path: null, failed: false };
    const ext = file.name.split(".").pop() || "bin";
    const path = `${listId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from("delivery-payments")
      .upload(path, file, { upsert: false });
    if (error) {
      toast.error(`No se pudo subir la foto del comprobante: ${error.message}`);
      return { path: null, failed: true };
    }
    return { path, failed: false };
  };

  const save = async () => {
    const montoNum = parseFloat(monto);
    if (!montoNum || montoNum <= 0) {
      toast.error("Ingresá un monto válido");
      return;
    }
    if (!formaPago.trim()) {
      toast.error("Elegí una forma de pago");
      return;
    }
    setSaving(true);

    const { path: comprobante_path, failed } = await uploadComprobante();
    if (failed) {
      setSaving(false);
      return;
    }


    if (mode === "public") {
      const { error } = await supabase.rpc("delivery_add_payment_by_token", {
        p_token: publicToken!,
        p_cliente_nombre: clienteNombre,
        p_monto: montoNum,
        p_moneda: moneda,
        p_forma_pago: formaPago,
        p_comprobante_path: comprobante_path,
        p_notas: notas.trim() || null,
        p_cargado_por_nombre: cargadoPor.trim() || null,
      });
      setSaving(false);
      if (error) return toast.error(error.message);
    } else {
      const { data: userRes } = await supabase.auth.getUser();
      const { error } = await supabase.from("delivery_list_payments").insert({
        list_id: listId,
        cliente_nombre: clienteNombre,
        monto: montoNum,
        moneda,
        forma_pago: formaPago,
        monto_esperado: expectedMonto ?? null,
        moneda_esperada: expectedMoneda ?? null,
        forma_pago_esperada: expectedForma ?? null,
        comprobante_path,
        notas: notas.trim() || null,
        cargado_por_nombre: cargadoPor.trim() || userRes.user?.email || null,
        cargado_por_email: userRes.user?.email ?? null,
        cargado_por_user_id: userRes.user?.id ?? null,
        origen: "deposito",
      });
      setSaving(false);
      if (error) return toast.error(error.message);
    }
    toast.success("Cobro registrado. Admin recibirá alerta para validar.");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar cobro · {clienteNombre}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {expectedMonto != null && (
            <div className="rounded-md bg-secondary/50 p-2 text-xs">
              <span className="text-muted-foreground">Esperado: </span>
              <span className="font-semibold">{formatPrice(expectedMonto, expectedMoneda || "ARS")}</span>
              {expectedForma && <span className="text-muted-foreground"> · {expectedForma}</span>}
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Podés cargar un monto distinto si el cliente entregó otra cosa.
              </p>
            </div>
          )}
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <div className="space-y-1.5">
              <Label>Monto recibido</Label>
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>Moneda</Label>
              <Select value={moneda} onValueChange={setMoneda}>
                <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONEDAS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Forma de pago</Label>
            <Select value={formaPago} onValueChange={setFormaPago}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {FORMAS_PAGO.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {mode === "public" && (
            <div className="space-y-1.5">
              <Label>Tu nombre (quién entrega)</Label>
              <Input value={cargadoPor} onChange={(e) => setCargadoPor(e.target.value)} placeholder="Opcional" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Comprobante (foto o archivo)</Label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <Upload className="w-3.5 h-3.5 mr-1" />
              {file ? "Cambiar archivo" : "Subir foto/archivo"}
            </Button>
            {file && (
              <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
                <Paperclip className="w-3 h-3" /> {file.name}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Notas</Label>
            <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} placeholder="Opcional" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button variant="gold" onClick={save} disabled={saving}>
            {saving ? "Guardando..." : "Registrar cobro"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DeliveryPaymentsSection;
