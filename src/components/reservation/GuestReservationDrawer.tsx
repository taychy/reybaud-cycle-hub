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
import { Loader2, ArrowRight, ArrowLeft, CreditCard, Upload, Copy } from "lucide-react";
import { parsePaymentPolicy, type EventPaymentPolicy } from "@/lib/eventPaymentPolicy";
import EventPaymentPolicyNotice from "@/components/event/EventPaymentPolicyNotice";
import { SharedRoomChoice, sharedRoomValid, type SharedRoomMode } from "./SharedRoomChoice";
import { fetchSharedRoomQuote, buildSharedRoomConsent, isQuoteReady, type SharedRoomQuote } from "@/lib/sharedRoomAssignment";

const BANK_INFO = {
  titular: "Scarlett Tayna Barros Silva",
  cvu: "0000003100065071427147",
  alias: "granfondo.tc",
};

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
  /** Paquete ya elegido en "Ver precios y paquetes": no se vuelve a pedir. */
  initialPackageId?: string | null;
  onPackageChange?: (id: string | null) => void;
}

export function GuestReservationDrawer({ open, onOpenChange, eventId, eventName, initialPackageId = null, onPackageChange }: Props) {
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
  const [metodo, setMetodo] = useState<"mp" | "transferencia" | "efectivo">("mp");
  const [declaresMethod, setDeclaresMethod] = useState(false);
  const [sharedQuote, setSharedQuote] = useState<SharedRoomQuote | null>(null);
  const [sharedMode, setSharedMode] = useState<SharedRoomMode>(null);
  const [sharedCompanion, setSharedCompanion] = useState("");
  const [sharedAccepted, setSharedAccepted] = useState(false);
  const [terms, setTerms] = useState(false);
  const [comprobante, setComprobante] = useState<File | null>(null);
  const [planInfo, setPlanInfo] = useState<{ nombre: string; sena_tipo: string; sena_valor: number; cantidad_cuotas: number } | null>(null);
  const [paymentPolicy, setPaymentPolicy] = useState<EventPaymentPolicy | null>(null);
  // Apertura controlada: sin Mercado Pago, seña por enlace externo y tarifas que exigen identidad verificada en servidor.
  const [controlled, setControlled] = useState(false);
  const [depositUrl, setDepositUrl] = useState<string | null>(null);
  const [verifiedOnlyIds, setVerifiedOnlyIds] = useState<string[]>([]);

  useEffect(() => {
    if (!open) { setStep(1); setPkgId(""); setComprobante(null); setTerms(false); setSharedMode(null); setSharedCompanion(""); setSharedAccepted(false); return; }
    (async () => {
      const [{ data }, { data: eventData }] = await Promise.all([
        supabase
          .from("event_packages")
          .select("id, nombre, descripcion, precio, currency, activo, sort_order")
          .eq("event_id", eventId)
          .eq("activo", true)
          .order("sort_order", { ascending: true }),
        supabase.from("events").select("metadata").eq("id", eventId).maybeSingle(),
      ]);
      setPaymentPolicy(parsePaymentPolicy((eventData as any)?.metadata));
      const declares = (eventData as any)?.metadata?.reservation_declared_payment === true;
      setDeclaresMethod(declares);
      if (declares) setMetodo("transferencia");
      const md = (eventData as any)?.metadata || {};
      const isControlled = md?.reservation_request?.mode === "pending_no_payment";
      setControlled(isControlled);
      if (isControlled) setMetodo("transferencia");
      setDepositUrl(typeof md?.payment_links?.deposit_url === "string" ? md.payment_links.deposit_url : null);
      setVerifiedOnlyIds(Array.isArray(md?.reservation_request?.packages) ? md.reservation_request.packages.filter((o: any) => o?.requires_alps === true).map((o: any) => String(o.id)) : []);
      const list = (data as Pkg[]) || [];
      setPackages(list);
      if (initialPackageId && list.some((p) => p.id === initialPackageId)) setPkgId(initialPackageId);
      if (list.length > 0) {
        const stages = await fetchPriceStages(list.map((p) => p.id));
        setStagesByPkg(stages);
      } else {
        setStagesByPkg({});
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, eventId]);

  useEffect(() => {
    if (open && pkgId) onPackageChange?.(pkgId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pkgId]);

  const priceFor = useMemo(() => {
    return (p: Pkg) => resolveActivePrice(Number(p.precio || 0), p.currency || "ARS", stagesByPkg[p.id]);
  }, [stagesByPkg]);

  const selectedPkg = packages.find((p) => p.id === pkgId);
  const usesExternalDepositLink = eventId === "e726408b-bf46-45d6-9678-dc426a2d8641" || (controlled && !!depositUrl);
  const needsVerifiedIdentity = !!selectedPkg && verifiedOnlyIds.includes(selectedPkg.id);
  const loginHref = `/?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`;

  useEffect(() => {
    setSharedQuote(null); setSharedMode(null); setSharedAccepted(false);
    if (!pkgId) return;
    let cancelled = false;
    fetchSharedRoomQuote(eventId, pkgId).then((q) => { if (!cancelled) setSharedQuote(q); });
    return () => { cancelled = true; };
  }, [pkgId, eventId]);
  const sharedApplies = !!sharedQuote?.applies;
  const sharedOk = sharedRoomValid(sharedQuote, sharedMode, sharedCompanion, sharedAccepted);
  const nextStep = (s: number) => (s === 1 ? (selectedPkg && !needsVerifiedIdentity ? (sharedApplies ? 3 : 4) : 2) : s === 2 ? (sharedApplies ? 3 : 4) : 4);
  const prevStep = (s: number) => (s === 4 ? (sharedApplies ? 3 : 2) : s - 1);

  // Plan de pagos del paquete elegido (solo para mostrar el resumen)
  useEffect(() => {
    setPlanInfo(null);
    if (!pkgId) return;
    let cancelled = false;
    (async () => {
      const activeStageId = (() => { const p = packages.find((x) => x.id === pkgId); return p ? priceFor(p).activeStage?.id ?? null : null; })();
      const base = () => supabase
        .from("event_package_payment_plans" as any)
        .select("nombre, sena_tipo, sena_valor, cantidad_cuotas")
        .eq("package_id", pkgId).eq("activo", true).is("archived_at", null)
        .order("version", { ascending: false }).limit(1);
      let { data } = activeStageId ? await base().eq("price_stage_id", activeStageId).maybeSingle() : { data: null as any };
      if (!data) ({ data } = await base().is("price_stage_id", null).maybeSingle());
      if (!cancelled && data) setPlanInfo({ ...(data as any), sena_valor: Number((data as any).sena_valor) });
    })();
    return () => { cancelled = true; };
  }, [pkgId, packages, priceFor]);
  // Seña según el plan (misma regla que create-guest-reservation/chargeNow.ts). null = sin seña → total.
  const senaFor = (total: number): number | null => {
    if (!planInfo) return null;
    const v = Number(planInfo.sena_valor || 0);
    const pct = planInfo.sena_tipo === "porcentaje_paquete" || planInfo.sena_tipo === "porcentaje";
    const s = Math.round((pct ? (total * v) / 100 : v) * 100) / 100;
    return s > 0 ? Math.min(s, total) : null;
  };
  const canNextFromStep1 = form.nombre && form.apellido && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email);
  const canNextFromStep2 = !!selectedPkg && !needsVerifiedIdentity;
  const canSubmit = terms && sharedOk && (metodo === "mp" || metodo === "efectivo" || (metodo === "transferencia" && (comprobante || declaresMethod)));

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
      if (sharedApplies) {
        payload.habitacion_compartida = {
          modo: sharedMode,
          acompanante_nombre: sharedMode === "acompanante" ? sharedCompanion.trim() : null,
          consentimiento: sharedMode === "asignacion" && sharedQuote && isQuoteReady(sharedQuote)
            ? buildSharedRoomConsent(sharedQuote, "invitado") : null,
        };
      }
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
          <SheetTitle>Reservar mi lugar</SheetTitle>
          <SheetDescription>{eventName} · Paso {step === 4 ? (sharedApplies ? 4 : 3) : step} de {sharedApplies ? 4 : 3}</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4 pb-24">
          {step === 1 && (
            <div className="space-y-3">
              {selectedPkg && (() => { const pr = priceFor(selectedPkg); return (
                <div className="p-4 rounded-xl border border-primary/40 bg-primary/5">
                  <div className="text-xs text-muted-foreground">Paquete elegido</div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <span className="font-semibold">{selectedPkg.nombre}</span>
                    <span className="font-bold text-primary">{fmtMoney(pr.precio, pr.currency)}</span>
                  </div>
                  {planInfo && (
                    <div className="text-xs text-muted-foreground mt-1">
                      Seña {fmtMoney(senaFor(pr.precio) ?? 0, pr.currency)}
                      {planInfo.cantidad_cuotas > 0 ? ` + ${planInfo.cantidad_cuotas} cuotas · ${planInfo.nombre}` : ""}
                    </div>
                  )}
                  <button type="button" className="mt-1 text-xs text-primary underline underline-offset-2" onClick={() => setStep(2)}>
                    Cambiar paquete
                  </button>
                </div>
              ); })()}
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
                {packages.map((p) => {
                  const pr = priceFor(p);
                  return (
                    <label key={p.id} className={`flex items-start gap-3 p-4 border rounded-xl cursor-pointer transition ${pkgId === p.id ? "border-primary bg-primary/5" : "border-border"}`}>
                      <RadioGroupItem value={p.id} className="mt-1" />
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold">{p.nombre}</span>
                          <span className="font-bold text-primary">{fmtMoney(pr.precio, pr.currency)}</span>
                        </div>
                        {pr.activeStage && (
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">{pr.activeStage.nombre}</div>
                        )}
                        {p.descripcion && <p className="text-xs text-muted-foreground mt-1 whitespace-pre-line">{p.descripcion}</p>}
                      </div>
                    </label>
                  );
                })}
              </RadioGroup>
              {needsVerifiedIdentity && (
                <div role="alert" className="mt-3 space-y-2 rounded-xl border border-primary bg-primary/5 p-4 text-sm">
                  <p className="font-semibold">Tarifa especial para participantes de La Conquista Alpina</p>
                  <p className="text-muted-foreground">Para aplicarla tenemos que verificar tu reserva de Alpes: no alcanza con escribir tu correo. Iniciá sesión con la cuenta de esa reserva, usá tu enlace personal o pedí reserva asistida. Si no participás de Alpes, elegí una tarifa Solo Maratona.</p>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild size="sm"><a href={loginHref}>Iniciar sesión</a></Button>
                    <Button asChild size="sm" variant="outline"><a href="https://wa.me/5491123881744?text=Hola%2C%20participo%20de%20La%20Conquista%20Alpina%20y%20quiero%20reservar%20Maratona" target="_blank" rel="noopener noreferrer">Reserva asistida</a></Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 3 && selectedPkg && (
            <SharedRoomChoice
              quote={sharedQuote}
              mode={sharedMode}
              onModeChange={setSharedMode}
              companion={sharedCompanion}
              onCompanionChange={setSharedCompanion}
              accepted={sharedAccepted}
              onAcceptedChange={setSharedAccepted}
            />
          )}

          {step === 4 && selectedPkg && (
            <div className="space-y-4">
              {(() => { const pr = priceFor(selectedPkg); const sena = senaFor(pr.precio); return (
              <div className="p-4 rounded-xl border bg-muted/30">
                <div className="text-xs text-muted-foreground mb-1">{sena != null ? "Seña a pagar ahora" : "Vas a pagar"}</div>
                <div className="text-2xl font-bold text-primary">{fmtMoney(sena ?? pr.precio, pr.currency)}</div>
                <div className="text-sm mt-1">{selectedPkg.nombre}</div>
                {sena != null && (
                  <div className="text-xs text-muted-foreground mt-1">
                    Total del paquete {fmtMoney(pr.precio, pr.currency)}
                    {planInfo && planInfo.cantidad_cuotas > 0 ? ` · saldo en ${planInfo.cantidad_cuotas} cuotas` : ""}
                  </div>
                )}
              </div>
              ); })()}
              <div>
                <Label>Método de pago</Label>
                <RadioGroup value={metodo} onValueChange={(v) => setMetodo(v as any)} className="mt-2">
                  {!declaresMethod && (
                    <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer">
                      <RadioGroupItem value="mp" /> <CreditCard className="w-4 h-4" /> Mercado Pago
                    </label>
                  )}
                  <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer">
                    <RadioGroupItem value="transferencia" /> <Upload className="w-4 h-4" /> {usesExternalDepositLink ? "Pago por link" : `Transferencia${declaresMethod ? "" : " (adjuntá comprobante)"}`}
                  </label>
                  {declaresMethod && (
                    <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer">
                      <RadioGroupItem value="efectivo" /> <CreditCard className="w-4 h-4" /> Efectivo
                    </label>
                  )}
                </RadioGroup>
                {declaresMethod && (
                  <p className="text-[11px] text-muted-foreground mt-2">{usesExternalDepositLink ? "Si elegís pago por link, primero registramos la reserva y te enviamos el link de la seña por email. El pago queda pendiente hasta que Administración verifique el comprobante." : "Elegir el medio no registra un pago: queda pendiente hasta que Administración lo verifique."}</p>
                )}
              </div>
              {paymentPolicy && <EventPaymentPolicyNotice policy={paymentPolicy} />}
              {metodo === "transferencia" && !usesExternalDepositLink && (
                <div className="space-y-3">
                  <div className="p-4 rounded-xl border bg-muted/30 space-y-3">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Datos para transferir</p>
                    <BankRow label="Titular" value={BANK_INFO.titular} />
                    <BankRow label="CVU" value={BANK_INFO.cvu} onCopy={() => { navigator.clipboard.writeText(BANK_INFO.cvu); toast.success("CVU copiado"); }} />
                    <BankRow label="Alias" value={BANK_INFO.alias} onCopy={() => { navigator.clipboard.writeText(BANK_INFO.alias); toast.success("Alias copiado"); }} />
                    <BankRow
                      label="Monto"
                      value={(() => { const pr = priceFor(selectedPkg); return fmtMoney(senaFor(pr.precio) ?? pr.precio, pr.currency); })()}
                      strong
                    />
                    <p className="text-[11px] text-muted-foreground pt-1 border-t">
                      Transferí el monto exacto y adjuntá el comprobante abajo. Te confirmamos por email cuando lo validemos.
                    </p>
                  </div>
                  <div>
                    <Label>Comprobante{declaresMethod ? " (opcional, podés enviarlo después)" : " *"}</Label>
                    <Input type="file" accept="image/*,application/pdf" onChange={(e) => setComprobante(e.target.files?.[0] || null)} />
                  </div>
                </div>
              )}
              <label className="flex items-start gap-2 text-sm">
                <Checkbox checked={terms} onCheckedChange={(v) => setTerms(!!v)} className="mt-1" />
                <span>
                  Acepto los{" "}
                  <a
                    href="/terminos-eventos"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline underline-offset-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    términos y condiciones del evento, política de cancelación y uso de datos personales
                  </a>
                  .
                </span>
              </label>
            </div>
          )}
        </div>

        <div className="fixed bottom-0 left-0 right-0 bg-background border-t p-4 flex gap-2">
          {step > 1 && <Button variant="outline" onClick={() => setStep(prevStep(step))} disabled={loading}><ArrowLeft className="w-4 h-4 mr-1" /> Atrás</Button>}
          {step < 4 && (
            <Button
              className="flex-1"
              disabled={step === 1 ? !canNextFromStep1 : step === 2 ? !canNextFromStep2 : !sharedOk}
              onClick={() => setStep(nextStep(step))}
            >Continuar <ArrowRight className="w-4 h-4 ml-1" /></Button>
          )}
          {step === 4 && (
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

function BankRow({ label, value, onCopy, strong }: { label: string; value: string; onCopy?: () => void; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-sm text-foreground break-all ${strong ? "font-bold" : ""}`}>{value}</div>
      </div>
      {onCopy && (
        <Button size="icon" variant="ghost" onClick={onCopy} className="shrink-0" type="button">
          <Copy className="w-4 h-4" />
        </Button>
      )}
    </div>
  );
}
