import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type GuestAge = "adult" | "child_4_9" | "under_4";
export type DinnerGuest = { name: string; category: GuestAge; is_cyclist?: boolean };
export type CyclistGuest = { name: string; category: GuestAge; lunch: boolean };

const ageChoices: { value: GuestAge; label: string }[] = [
  { value: "adult", label: "Adulto (10 años o más)" },
  { value: "child_4_9", label: "Niño de 4 a 9 años" },
  { value: "under_4", label: "Menor de 4 años" },
];
const ageSelector = (
  id: string, category: GuestAge, disabled: boolean,
  onChange: (category: GuestAge) => void,
) => <div className="space-y-1">
  <Label htmlFor={id} className="text-xs">Categoría de edad para la parrilla</Label>
  <select id={id} value={category} disabled={disabled} onChange={(e) => onChange(e.target.value as GuestAge)}
    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
    {ageChoices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
  </select>
</div>;

export default function EventRsvpGuests({
  cyclists, setCyclists, nonCyclists, setNonCyclists, mode, disabled,
}: {
  cyclists: CyclistGuest[];
  setCyclists: (value: CyclistGuest[]) => void;
  nonCyclists: DinnerGuest[];
  setNonCyclists: (value: DinnerGuest[]) => void;
  mode: "fondo_y_almuerzo" | "solo_fondo" | "solo_almuerzo";
  disabled: boolean;
}) {
  const cyclingAllowed = mode !== "solo_almuerzo";
  const lunchAllowed = mode !== "solo_fondo";
  const riderLunch = lunchAllowed && cyclingAllowed ? cyclists.filter((person) => person.lunch).length : 0;
  const meals = 1 + (lunchAllowed ? nonCyclists.length + riderLunch : 0);

  return <div className="space-y-4">
    {cyclingAllowed && <section className="rounded-lg border border-primary/40 p-4 space-y-3">
      <Label htmlFor="rsvp-cyclists">¿Cuántos amigos ciclistas querés invitar al fondo?</Label>
      <Input id="rsvp-cyclists" type="number" min={0} max={10} disabled={disabled} value={cyclists.length}
        onChange={(e) => {
          const n = Math.max(0, Math.min(10, Math.trunc(Number(e.target.value) || 0)));
          setCyclists(Array.from({ length: n }, (_, i) => cyclists[i] || { name: "", category: "adult", lunch: false }));
        }} />
      <p className="text-xs text-muted-foreground">
        <strong>Solicitud pendiente de aprobación de Claudio</strong> según nivel técnico y rendimiento.
        Hay solo 10 plazas aprobadas en total; esta solicitud no reserva una.
        Cada ciclista invitado aprobado paga $30.000 por el fondo, por separado de la parrilla.
      </p>
      {cyclists.map((person, index) => <div key={index} className="space-y-2 rounded-md border p-3">
        <Label htmlFor={`rsvp-cyclist-name-${index}`}>Amigo ciclista {index + 1}</Label>
        <Input id={`rsvp-cyclist-name-${index}`} placeholder="Nombre y apellido" maxLength={100} disabled={disabled} value={person.name}
          onChange={(e) => setCyclists(cyclists.map((item, i) => i === index ? { ...item, name: e.target.value } : item))} />
        {lunchAllowed && <label className="flex items-center gap-2 text-sm">
          <Checkbox disabled={disabled} checked={person.lunch}
            onCheckedChange={(checked) => setCyclists(cyclists.map((item, i) => i === index ? { ...item, lunch: checked === true } : item))} />
          También viene a la parrilla
        </label>}
        {lunchAllowed && person.lunch && ageSelector(`rsvp-cyclist-age-${index}`, person.category, disabled,
          (category) => setCyclists(cyclists.map((item, i) => i === index ? { ...item, category } : item)))}
      </div>)}
    </section>}
    {lunchAllowed && <section className="rounded-lg border border-accent/40 p-4 space-y-3">
      <Label htmlFor="rsvp-non-cyclists">¿Cuántos acompañantes no ciclistas vienen al almuerzo?</Label>
      <Input id="rsvp-non-cyclists" type="number" min={0} max={500} disabled={disabled} value={nonCyclists.length}
        onChange={(e) => {
          const n = Math.max(0, Math.min(500, Math.trunc(Number(e.target.value) || 0)));
          setNonCyclists(Array.from({ length: n }, (_, i) => nonCyclists[i] || { name: "", category: "adult" }));
        }} />
      <p className="text-xs text-muted-foreground">Sin límite comercial de cupos. Los amigos ciclistas se anotan arriba.</p>
      {nonCyclists.map((person, index) => <div key={index} className="space-y-2 rounded-md border p-3">
        <Label htmlFor={`rsvp-non-cyclist-name-${index}`}>Acompañante no ciclista {index + 1}</Label>
        <Input id={`rsvp-non-cyclist-name-${index}`} placeholder="Nombre y apellido" maxLength={100} disabled={disabled} value={person.name}
          onChange={(e) => setNonCyclists(nonCyclists.map((item, i) => i === index ? { ...item, name: e.target.value } : item))} />
        {ageSelector(`rsvp-non-cyclist-age-${index}`, person.category, disabled,
          (category) => setNonCyclists(nonCyclists.map((item, i) => i === index ? { ...item, category } : item)))}
      </div>)}
    </section>}
    <p className="text-sm text-muted-foreground">
      <strong>{cyclists.length}</strong> ciclista(s) invitado(s), pendientes de aprobación ·
      <strong> {lunchAllowed ? nonCyclists.length : 0}</strong> acompañante(s) no ciclistas
      {lunchAllowed ? ` · ${meals} comensal(es), incluyéndote` : ""}
    </p>
  </div>;
}
