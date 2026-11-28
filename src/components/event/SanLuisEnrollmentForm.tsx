import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { CampKey, SAN_LUIS_INTAKE_ENABLED, sanLuisCamps, sanLuisPackages } from "@/lib/sanLuisPreRegistration";
import { EnrollmentAttendee, enrollmentEstimatedTotal, enrollmentSchema } from "@/lib/sanLuisEnrollment";
import { EnrollmentReceipt, submitSanLuisEnrollment } from "@/lib/sanLuisEnrollmentService";
import { formatPrice } from "@/lib/currency";

const emptyPerson = (): EnrollmentAttendee => ({ firstName: "", lastName: "" });

export default function SanLuisEnrollmentForm({ camp, packageId, onSelectionChange, submit = submitSanLuisEnrollment }: {
  camp: CampKey;
  packageId: string;
  onSelectionChange: (camp: CampKey, packageId: string) => void;
  submit?: typeof submitSanLuisEnrollment;
}) {
  const [contact, setContact] = useState({ email: "", phone: "", comment: "", website: "" });
  const [attendees, setAttendees] = useState<EnrollmentAttendee[]>([emptyPerson()]);
  const [extraNight, setExtraNight] = useState(false);
  const [contactConsent, setContactConsent] = useState(false);
  const [finalConditionsAccepted, setFinalConditionsAccepted] = useState(false);
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const [done, setDone] = useState<EnrollmentReceipt | null>(null);
  const [error, setError] = useState("");
  const selected = sanLuisPackages[camp].find(p => p.id === packageId);
  if (!selected) return null;
  const extra = camp === "full" && extraNight;
  const total = enrollmentEstimatedTotal(camp, packageId, attendees.length);

  const updatePerson = (index: number, key: keyof EnrollmentAttendee, value: string) => {
    setAttendees(prev => prev.map((person, i) => i === index ? { ...person, [key]: value } : person));
  };
  const changePeople = (count: number) => {
    setAttendees(prev => Array.from({ length: count }, (_, i) => prev[i] ?? emptyPerson()));
  };
  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!SAN_LUIS_INTAKE_ENABLED || sendingRef.current) return;
    const parsed = enrollmentSchema.safeParse({
      ...contact, camp, packageId, peopleCount: attendees.length, attendees,
      extraNight: extra, contactConsent, finalConditionsAccepted,
    });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message || "Revisá los datos"); return; }
    sendingRef.current = true;
    setSending(true);
    setError("");
    try {
      const receipt = await submit(parsed.data);
      setDone(receipt);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos guardar tu solicitud.");
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  if (done) return <div role="status" className="py-10 space-y-5">
    <CheckCircle2 className="h-12 w-12 text-accent" />
    <h3 className="text-3xl">{done.duplicate ? "Ya tenemos tu solicitud" : "Solicitud recibida"}</h3>
    {done.reference && <p className="text-lg">Referencia: <strong className="text-accent">{done.reference}</strong></p>}
    <p className="max-w-xl leading-relaxed">{done.duplicate
      ? "Ya existe una solicitud con este email para este camp. La conservamos sin duplicar personas ni cobros; administración la revisará antes de cualquier paso."
      : "Administración revisará disponibilidad, alojamiento y precio. Esto no confirma una reserva, no bloquea un cupo y no genera ningún cobro."}</p>
    {!done.duplicate && <div className="border-l-2 border-accent pl-4 text-sm space-y-1">
      <p>{sanLuisCamps[camp].label} · {done.packageName ?? selected.label}</p>
      <p>{done.peopleCount ?? attendees.length} {(done.peopleCount ?? attendees.length) === 1 ? "persona" : "personas"} · {formatPrice(done.estimatedTotal ?? total, done.currency ?? "ARS")} ARS estimados</p>
      <p className="text-muted-foreground">Precio y condiciones finales sujetos a confirmación y aceptación antes de pagar.</p>
    </div>}
  </div>;

  return <form onSubmit={send} className="space-y-6" aria-label="Solicitar inscripción">
    <fieldset disabled={sending} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="sle-camp">Camp *</Label><select id="sle-camp" className="w-full h-12 rounded-md border border-input bg-background px-3 text-sm" value={camp} onChange={e => { const key = e.target.value as CampKey; setExtraNight(false); onSelectionChange(key, sanLuisPackages[key][3].id); }}><option value="full">Camp completo · 18–24 enero</option><option value="mini">Mini Camp · 21–24 enero</option></select></div>
        <div className="space-y-2"><Label htmlFor="sle-package">Alojamiento *</Label><select id="sle-package" className="w-full h-12 rounded-md border border-input bg-background px-3 text-sm" value={packageId} onChange={e => onSelectionChange(camp, e.target.value)}>{sanLuisPackages[camp].map(p => <option key={p.id} value={p.id}>{p.label} · {formatPrice(p.price, "ARS")}</option>)}</select></div>
      </div>
      <div className="space-y-2"><Label htmlFor="sle-people">Cantidad de personas *</Label><select id="sle-people" className="w-full sm:w-48 h-12 rounded-md border border-input bg-background px-3 text-sm" value={attendees.length} onChange={e => changePeople(Number(e.target.value))}>{[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n} {n === 1 ? "persona" : "personas"}</option>)}</select><p className="text-xs text-muted-foreground">Una sola solicitud para el grupo; cada persona queda identificada una única vez.</p></div>
      <div className="space-y-4">
        {attendees.map((person, index) => <div key={index} className="space-y-3 rounded-lg border border-border p-4">
          <p className="text-sm font-semibold">{index === 0 ? "Titular de la solicitud" : `Persona ${index + 1}`}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor={`sle-first-${index}`}>{index === 0 ? "Nombre *" : `Nombre de la persona ${index + 1} *`}</Label><Input id={`sle-first-${index}`} required autoComplete={index === 0 ? "given-name" : "off"} maxLength={50} value={person.firstName} onChange={e => updatePerson(index, "firstName", e.target.value)} className="h-12" /></div>
            <div className="space-y-2"><Label htmlFor={`sle-last-${index}`}>{index === 0 ? "Apellido *" : `Apellido de la persona ${index + 1} *`}</Label><Input id={`sle-last-${index}`} required autoComplete={index === 0 ? "family-name" : "off"} maxLength={50} value={person.lastName} onChange={e => updatePerson(index, "lastName", e.target.value)} className="h-12" /></div>
          </div>
        </div>)}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="sle-email">Email de contacto *</Label><Input id="sle-email" required type="email" autoComplete="email" maxLength={150} value={contact.email} onChange={e => setContact({ ...contact, email: e.target.value })} className="h-12" /></div>
        <div className="space-y-2"><Label htmlFor="sle-phone">WhatsApp de contacto *</Label><Input id="sle-phone" required type="tel" autoComplete="tel" maxLength={30} value={contact.phone} onChange={e => setContact({ ...contact, phone: e.target.value })} className="h-12" /></div>
      </div>
      {camp === "full" && <div className="flex items-start gap-3"><Checkbox id="sle-night" checked={extraNight} onCheckedChange={v => setExtraNight(v === true)} /><Label htmlFor="sle-night" className="leading-relaxed">Nos interesa la noche extra del domingo 17/01.<span className="block text-muted-foreground font-normal">Disponibilidad y precio a confirmar. No se suma al importe ni se cobra.</span></Label></div>}
      <div className="space-y-2"><Label htmlFor="sle-comment">Comentario (opcional)</Label><Textarea id="sle-comment" maxLength={600} value={contact.comment} onChange={e => setContact({ ...contact, comment: e.target.value })} placeholder="Distribución de habitaciones, necesidades o consultas para la revisión." /></div>
      <div className="hidden" aria-hidden="true"><Label htmlFor="sle-website">No completar</Label><Input id="sle-website" tabIndex={-1} autoComplete="off" value={contact.website} onChange={e => setContact({ ...contact, website: e.target.value })} /></div>
      <div className="space-y-4 rounded-lg bg-secondary/40 p-4">
        <div className="flex items-start gap-3"><Checkbox id="sle-privacy" checked={contactConsent} onCheckedChange={v => setContactConsent(v === true)} /><Label htmlFor="sle-privacy" className="leading-relaxed">Leí y acepto la política de privacidad, y autorizo a Reybaud a contactarme sobre esta solicitud. *</Label></div>
        <p className="text-xs text-muted-foreground">Podés consultar la <Link to="/politica-privacidad" className="underline" target="_blank">política de privacidad</Link>. Los datos se usan para gestionar esta solicitud, no para envíos masivos.</p>
        <div className="flex items-start gap-3"><Checkbox id="sle-conditions" checked={finalConditionsAccepted} onCheckedChange={v => setFinalConditionsAccepted(v === true)} /><Label htmlFor="sle-conditions" className="leading-relaxed">Entiendo que esto es solo una solicitud: no confirma reserva, cupo ni precio. Antes de cualquier pago deberé recibir y aceptar el precio final y las condiciones definitivas. *</Label></div>
      </div>
      <div role="region" className="border-l-2 border-accent pl-4 space-y-1" aria-label="Resumen de solicitud"><p className="font-semibold">{sanLuisCamps[camp].label} · {selected.label}</p><p className="text-sm">{sanLuisCamps[camp].dates} de 2027 · {attendees.length} {attendees.length === 1 ? "persona" : "personas"}</p><p className="text-accent font-semibold">{formatPrice(total, "ARS")} ARS estimados en total</p><p className="text-xs text-muted-foreground">{formatPrice(selected.price, "ARS")} por ciclista · sujeto a confirmación de administración antes de pagar</p>{extra && <p className="text-sm">Noche 17/01: interés, precio a confirmar</p>}</div>
      {!SAN_LUIS_INTAKE_ENABLED && <p id="sle-intake-notice" className="text-sm text-muted-foreground">La recepción de solicitudes está pausada. Todavía no podés enviar este formulario.</p>}
      {error && <p role="alert" className="text-destructive leading-relaxed">{error}</p>}
      <Button type="submit" className="w-full sm:w-auto min-h-12" disabled={!SAN_LUIS_INTAKE_ENABLED || sending} aria-describedby={!SAN_LUIS_INTAKE_ENABLED ? "sle-intake-notice" : undefined}>{sending ? <><Loader2 className="h-4 w-4 animate-spin" /> Enviando…</> : "Solicitar inscripción"}</Button>
    </fieldset>
  </form>;
}
