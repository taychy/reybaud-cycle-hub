import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { CampKey, SAN_LUIS_INTAKE_ENABLED, PRE_REGISTRATION_CONFIRMATION, sanLuisCamps, sanLuisPackages, preRegistrationSchema } from "@/lib/sanLuisPreRegistration";
import { submitSanLuisPreRegistration } from "@/lib/sanLuisPreRegistrationService";

export default function SanLuisPreRegistrationForm({ camp, packageId, onSelectionChange, submit = submitSanLuisPreRegistration }: {
  camp: CampKey; packageId: string; onSelectionChange: (camp: CampKey, packageId: string) => void;
  submit?: typeof submitSanLuisPreRegistration;
}) {
  const [fields, setFields] = useState({ firstName: "", lastName: "", email: "", phone: "", comment: "" });
  const [extraNight, setExtraNight] = useState(false);
  const [consent, setConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const selected = sanLuisPackages[camp].find(p => p.id === packageId);
  if (!selected) return null;
  const extra = camp === "full" && extraNight;
  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!SAN_LUIS_INTAKE_ENABLED || sending) return;
    const parsed = preRegistrationSchema.safeParse({ ...fields, camp, packageId, extraNight: extra, consent });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message || "Revisá los datos"); return; }
    setSending(true); setError("");
    try { await submit(parsed.data); setDone(true); }
    catch (e) { setError(e instanceof Error ? e.message : "No pudimos guardar tus datos."); }
    finally { setSending(false); }
  };
  if (done) return <div role="status" className="py-12 space-y-5"><CheckCircle2 className="h-12 w-12 text-accent" /><h3 className="text-3xl">¡Gracias por sumarte!</h3><p className="max-w-xl leading-relaxed">{PRE_REGISTRATION_CONFIRMATION}</p></div>;
  return <form onSubmit={send} className="space-y-6" aria-label="Quiero preinscribirme">
    <fieldset disabled={sending} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">{([
        ["firstName", "Nombre", "text", "given-name", 50], ["lastName", "Apellido", "text", "family-name", 50],
        ["email", "Email", "email", "email", 150], ["phone", "WhatsApp", "tel", "tel", 30],
      ] as const).map(([key, label, type, autoComplete, max]) => <div key={key} className="space-y-2"><Label htmlFor={`sl-${key}`}>{label} *</Label><Input id={`sl-${key}`} required type={type} autoComplete={autoComplete} maxLength={max} value={fields[key]} onChange={e => setFields({ ...fields, [key]: e.target.value })} className="h-12" /></div>)}</div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="sl-camp">Camp *</Label><select id="sl-camp" className="w-full h-12 rounded-md border border-input bg-background px-3 text-sm" value={camp} onChange={e => { const key = e.target.value as CampKey; setExtraNight(false); onSelectionChange(key, sanLuisPackages[key][3].id); }}><option value="full">Camp completo · 18–24 enero</option><option value="mini">Mini Camp · 21–24 enero</option></select></div>
        <div className="space-y-2"><Label htmlFor="sl-package">Alojamiento *</Label><select id="sl-package" className="w-full h-12 rounded-md border border-input bg-background px-3 text-sm" value={packageId} onChange={e => onSelectionChange(camp, e.target.value)}>{sanLuisPackages[camp].map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></div>
      </div>
      {camp === "full" && <div className="flex items-start gap-3"><Checkbox id="sl-night" checked={extraNight} onCheckedChange={v => setExtraNight(v === true)} /><Label htmlFor="sl-night" className="leading-relaxed">Me interesa la noche extra del domingo 17/01.<span className="block text-muted-foreground font-normal">Disponibilidad y precio pendientes. No se suma al importe.</span></Label></div>}
      <div className="space-y-2"><Label htmlFor="sl-comment">Comentario (opcional)</Label><Textarea id="sl-comment" maxLength={600} value={fields.comment} onChange={e => setFields({ ...fields, comment: e.target.value })} placeholder="Contanos si venís con alguien o tenés alguna consulta." /></div>
      <div className="flex items-start gap-3"><Checkbox id="sl-consent" checked={consent} onCheckedChange={v => setConsent(v === true)} /><Label htmlFor="sl-consent" className="leading-relaxed">Autorizo a Reybaud a contactarme por email o WhatsApp sobre esta preinscripción. *</Label></div>
      <div className="border-l-2 border-accent pl-4 space-y-1" aria-label="Resumen de elección"><p className="font-semibold">{sanLuisCamps[camp].label} · {selected.label}</p><p className="text-sm">{sanLuisCamps[camp].dates} · {sanLuisCamps[camp].nights} noches</p><p className="text-accent font-semibold">ARS {selected.price.toLocaleString("es-AR")} estimados / ciclista</p>{extra && <p className="text-sm">Noche 17/01: interés, sin precio confirmado</p>}</div>
      {!SAN_LUIS_INTAKE_ENABLED && <p id="sl-intake-notice" className="text-sm text-muted-foreground">Estamos terminando de confirmar tarifas y disponibilidad. Todavía no recibimos preinscripciones.</p>}
      {error && <p role="alert" className="text-destructive leading-relaxed">{error}</p>}
      <Button type="submit" className="w-full sm:w-auto min-h-12" disabled={!SAN_LUIS_INTAKE_ENABLED || sending} aria-describedby={!SAN_LUIS_INTAKE_ENABLED ? "sl-intake-notice" : undefined}>{sending ? <><Loader2 className="h-4 w-4 animate-spin" /> Procesando…</> : "Quiero preinscribirme"}</Button>
    </fieldset>
  </form>;
}