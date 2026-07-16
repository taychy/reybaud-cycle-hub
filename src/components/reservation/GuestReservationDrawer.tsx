import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchPriceStages, resolveActivePrice, type PriceStage } from "@/lib/priceStages";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Loader2, ArrowRight, ArrowLeft, CreditCard, Upload } from "lucide-react";

interface Pkg {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  currency: string | null;
  activo: boolean;
  sort_order: number | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
  eventName: string;
}

export function GuestReservationDrawer({ open, onOpenChange, eventId, eventName }: Props) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [packages, setPackages] = useState<Pkg[]>([]);
  const [stagesByPkg, setStagesByPkg] = useState<Record<string, PriceStage[]>>({});
  const [pkgId, setPkgId] = useState<string>("");
  // Datos personales
  const [form, setForm] = useState({
    nombre: "", apellido: "", email: "", telefono: "",
    documento: "", fecha_nacimiento: "",
    contacto_emergencia_nombre: "", contacto_emergencia_telefono: "",
  });
  const [metodo, setMetodo] = useState<"mp" | "transferencia">("mp");
  const [terms, setTerms] = useState(false);
  const [comprobante, setComprobante] = useState<File | null>(null);

  useEffect(() => {
    if (!open) { setStep(1); setPkgId(""); setComprobante(null); setTerms(false); return; }
    (async () => {
      const { data } = await supabase
        .from("event_packages")
        .select("id, nombre, descripcion, precio, currency, activo, sort_order")
        .eq("event_id", eventId)
        .eq("activo", true)
        .order("sort_order", { ascending: true });
      const list = (data as Pkg[]) || [];
      setPackages(list);
      if (list.length > 0) {
        const stages = await fetchPriceStages(list.map((p) => p.id));
        setStagesByPkg(stages);
      } else {
        setStagesByPkg({});
      }
    })();
  }, [open, eventId]);

  const priceFor = useMemo(() => {
    return (p: Pkg) => resolveActivePrice(Number(p.precio || 0), p.currency || "ARS", stagesByPkg[p.id]);
  }, [stagesByPkg]);

  const selectedPkg = packages.find((p) => p.id === pkgId);
  const canNextFromStep1 = form.nombre && form.apellido && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email);
  const canNextFromStep2 = !!selectedPkg;
  const canSubmit = terms && (metodo === "mp" || (metodo === "transferencia" && comprobante));

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).split(",")[1] || "");
      r.onerror = rej;
      r.readAsDataURL(file);
    });

  const handleSubmit = async () => {
    if (!selectedPkg) return;
    setLoading(true);
    try {
      let payload: any = {
        event_id: eventId, package_id: selectedPkg.id,
        ...form, metodo_pago: metodo, accepted_terms: terms,
      };
      if (metodo === "transferencia" && comprobante) {
        payload.comprobante_base64 = await fileToBase64(comprobante);
        payload.comprobante_filename = comprobante.name;
        payload.comprobante_mime = comprobante.type;
      }
      const { data, error } = await supabase.functions.invoke("create-guest-reservation", { body: payload });
      if (error || !data?.ok) throw new Error(data?.error || error?.message || "Error");
      if (data.mode === "mp" && data.init_point) {
        window.location.href = data.init_point;
      } else {
        toast.success("Recibimos tu reserva. Te enviamos los próximos pasos por email.");
        onOpenChange(false);
        window.location.href = `/mi-reserva/${data.access_token}`;
      }
    } catch (e: any) {
      toast.error(e.message || "No se pudo procesar la reserva");
    } finally {
      setLoading(false);
    }
  };

  const fmtMoney = (n: number, cur: string) => {
    const sym = cur === "USD" ? "USD " : cur === "EUR" ? "EUR " : "$";
    return `${sym}${Number(n || 0).toLocaleString("es-AR")}`;
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[95vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Reservar como invitado</SheetTitle>
          <SheetDescription>{eventName} · Paso {step} de 3</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4 pb-24">
          {step === 1 && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Nombre *</Label><Input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} /></div>
                <div><Label>Apellido *</Label><Input value={form.apellido} onChange={(e) => setForm({ ...form, apellido: e.target.value })} /></div>
              </div>
              <div><Label>Email *</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Teléfono</Label><Input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} /></div>
                <div><Label>Documento</Label><Input value={form.documento} onChange={(e) => setForm({ ...form, documento: e.target.value })} /></div>
              </div>
              <div><Label>Fecha de nacimiento</Label><Input type="date" value={form.fecha_nacimiento} onChange={(e) => setForm({ ...form, fecha_nacimiento: e.target.value })} /></div>
              <div className="pt-2 border-t">
                <p className="text-xs text-muted-foreground mb-2">Contacto de emergencia</p>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Nombre</Label><Input value={form.contacto_emergencia_nombre} onChange={(e) => setForm({ ...form, contacto_emergencia_nombre: e.target.value })} /></div>
                  <div><Label>Teléfono</Label><Input value={form.contacto_emergencia_telefono} onChange={(e) => setForm({ ...form, contacto_emergencia_telefono: e.target.value })} /></div>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-2">
              {packages.length === 0 && <p className="text-sm text-muted-foreground">No hay paquetes disponibles.</p>}
              <RadioGroup value={pkgId} onValueChange={setPkgId}>
                {packages.map((p) => (
                  <label key={p.id} className={`flex items-start gap-3 p-4 border rounded-xl cursor-pointer transition ${pkgId === p.id ? "border-primary bg-primary/5" : "border-border"}`}>
                    <RadioGroupItem value={p.id} className="mt-1" />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">{p.nombre}</span>
                        <span className="font-bold text-primary">{fmtMoney(p.precio, p.currency || "ARS")}</span>
                      </div>
                      {p.descripcion && <p className="text-xs text-muted-foreground mt-1 whitespace-pre-line">{p.descripcion}</p>}
                    </div>
                  </label>
                ))}
              </RadioGroup>
            </div>
          )}

          {step === 3 && selectedPkg && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border bg-muted/30">
                <div className="text-xs text-muted-foreground mb-1">Vas a pagar</div>
                <div className="text-2xl font-bold text-primary">{fmtMoney(selectedPkg.precio, selectedPkg.currency || "ARS")}</div>
                <div className="text-sm mt-1">{selectedPkg.nombre}</div>
              </div>
              <div>
                <Label>Método de pago</Label>
                <RadioGroup value={metodo} onValueChange={(v) => setMetodo(v as any)} className="mt-2">
                  <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer">
                    <RadioGroupItem value="mp" /> <CreditCard className="w-4 h-4" /> Mercado Pago
                  </label>
                  <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer">
                    <RadioGroupItem value="transferencia" /> <Upload className="w-4 h-4" /> Transferencia (adjuntá comprobante)
                  </label>
                </RadioGroup>
              </div>
              {metodo === "transferencia" && (
                <div>
                  <Label>Comprobante</Label>
                  <Input type="file" accept="image/*,application/pdf" onChange={(e) => setComprobante(e.target.files?.[0] || null)} />
                </div>
              )}
              <label className="flex items-start gap-2 text-sm">
                <Checkbox checked={terms} onCheckedChange={(v) => setTerms(!!v)} className="mt-1" />
                <span>Acepto los términos y condiciones del evento, política de cancelación y uso de datos personales.</span>
              </label>
            </div>
          )}
        </div>

        <div className="fixed bottom-0 left-0 right-0 bg-background border-t p-4 flex gap-2">
          {step > 1 && <Button variant="outline" onClick={() => setStep(step - 1)} disabled={loading}><ArrowLeft className="w-4 h-4 mr-1" /> Atrás</Button>}
          {step < 3 && (
            <Button
              className="flex-1"
              disabled={step === 1 ? !canNextFromStep1 : !canNextFromStep2}
              onClick={() => setStep(step + 1)}
            >Continuar <ArrowRight className="w-4 h-4 ml-1" /></Button>
          )}
          {step === 3 && (
            <Button className="flex-1" disabled={!canSubmit || loading} onClick={handleSubmit}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <CreditCard className="w-4 h-4 mr-1" />}
              {metodo === "mp" ? "Pagar con Mercado Pago" : "Enviar reserva"}
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
