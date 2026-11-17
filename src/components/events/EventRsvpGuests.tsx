import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Minus, Plus, Users, Bike } from "lucide-react";

export type GuestAge = "adult" | "child_4_9" | "under_4";
export type DinnerGuest = { name: string; category: GuestAge; is_cyclist?: boolean };
// Todos los amigos ciclistas son adultos; solo los no ciclistas tienen categorías infantiles.
export type CyclistGuest = { name: string; category: "adult"; lunch: boolean };

const ageChoices: { value: GuestAge; label: string; description: string; cost: string; guestLabel: string }[] = [
  { value: "adult", label: "Adultos", description: "", cost: "$40.000", guestLabel: "Adulto" },
  { value: "child_4_9", label: "Niños", description: "De 4 a 9 años", cost: "$20.000", guestLabel: "Niño/a" },
  { value: "under_4", label: "Menores de 4", description: "Hasta 3 años", cost: "Sin cargo", guestLabel: "Menor de 4" },
];

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

  const changeCategoryCount = (category: GuestAge, requested: number) => {
    const otherCount = nonCyclists.filter((person) => person.category !== category).length;
    const nextCount = Math.max(0, Math.min(500 - otherCount - riderLunch, Math.trunc(requested) || 0));
    const existing = nonCyclists.filter((person) => person.category === category);
    const selected = [
      ...existing.slice(0, nextCount),
      ...Array.from({ length: Math.max(0, nextCount - existing.length) }, () => ({ name: "", category })),
    ];
    setNonCyclists(ageChoices.flatMap((group) =>
      group.value === category ? selected : nonCyclists.filter((person) => person.category === group.value)
    ));
  };

  return <div className="space-y-5">
    {cyclingAllowed && <section className="rounded-xl border border-primary/30 bg-primary/5 p-4 sm:p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Bike className="h-5 w-5 text-primary" aria-hidden="true" />
        <h3 className="font-semibold text-base">Amigos ciclistas invitados</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        ¿Querés invitar a alguien a pedalear? Antes debe consultar con Claudio, que evaluará su nivel técnico y rendimiento.
        Hay <strong>10 cupos para invitados aprobados</strong> en total.
      </p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Label htmlFor="rsvp-cyclists" className="text-sm font-medium">Cantidad de amigos ciclistas</Label>
        <Input
          id="rsvp-cyclists" aria-label="Cantidad de amigos ciclistas invitados"
          className="w-24 text-center text-base font-semibold"
          type="number" min={0} max={10} disabled={disabled} value={cyclists.length}
          onChange={(e) => {
            const n = Math.max(0, Math.min(10, Math.trunc(Number(e.target.value) || 0)));
            setCyclists(Array.from({ length: n }, (_, i) => cyclists[i] || { name: "", category: "adult", lunch: false }));
          }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Cada amigo ciclista aprobado paga $30.000 por el fondo. <strong>No queda aprobado por completar este formulario.</strong>
      </p>
      {cyclists.map((person, index) => <div key={index} className="space-y-3 rounded-lg border border-border bg-card p-3">
        <Label htmlFor={`rsvp-cyclist-name-${index}`}>Amigo ciclista {index + 1} · nombre y apellido</Label>
        <Input
          id={`rsvp-cyclist-name-${index}`} placeholder="Nombre y apellido" maxLength={100}
          disabled={disabled} value={person.name}
          onChange={(e) => setCyclists(cyclists.map((item, i) => i === index ? { ...item, name: e.target.value } : item))}
        />
        {lunchAllowed && <label className="flex items-center gap-2 text-sm">
          <Checkbox
            disabled={disabled} checked={person.lunch}
            onCheckedChange={(checked) => setCyclists(cyclists.map((item, i) => i === index ? { ...item, lunch: checked === true } : item))}
          />
          También viene a la parrilla
        </label>}
        {lunchAllowed && person.lunch && <p className="text-xs font-medium text-accent">
          Parrilla de adulto: $40.000 por persona. No hace falta indicar edad.
        </p>}
      </div>)}
    </section>}
    {lunchAllowed && <section className="rounded-xl border border-accent/30 bg-accent/5 p-4 sm:p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Users className="h-5 w-5 text-accent" aria-hidden="true" />
        <h3 className="font-semibold text-base">Acompañantes que no pedalean</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        ¿Cuántas personas te acompañan <strong>solo a la parrilla</strong>? Indicá por separado los adultos y los niños.
        Vos ya estás incluido como titular adulto.
      </p>
      <div className="space-y-3">
        {ageChoices.map((choice) => {
          const people = nonCyclists.filter((person) => person.category === choice.value);
          return <div key={choice.value} className="rounded-lg border border-border bg-card p-3 sm:p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold text-sm">{choice.label}{choice.description && <span className="font-normal text-muted-foreground"> · {choice.description}</span>}</div>
                <div className="text-xs text-accent font-medium">{choice.cost} por persona</div>
              </div>
              <div className="flex items-center gap-1" role="group" aria-label={`Cantidad de ${choice.label.toLowerCase()}`}>
                <Button
                  type="button" size="icon" variant="outline" className="h-9 w-9"
                  disabled={disabled || people.length === 0}
                  onClick={() => changeCategoryCount(choice.value, people.length - 1)}
                  aria-label={`Quitar un acompañante de ${choice.label.toLowerCase()}`}
                ><Minus className="w-4 h-4" /></Button>
                <Input
                  aria-label={`Cantidad de ${choice.label.toLowerCase()}`}
                  type="number" inputMode="numeric" min={0} max={500} disabled={disabled}
                  className="h-9 w-16 text-center text-base font-semibold px-1"
                  value={people.length}
                  onChange={(e) => changeCategoryCount(choice.value, Number(e.target.value))}
                />
                <Button
                  type="button" size="icon" variant="outline" className="h-9 w-9"
                  disabled={disabled || nonCyclists.length + riderLunch >= 500}
                  onClick={() => changeCategoryCount(choice.value, people.length + 1)}
                  aria-label={`Agregar un acompañante de ${choice.label.toLowerCase()}`}
                ><Plus className="w-4 h-4" /></Button>
              </div>
            </div>
            {people.length > 0 && <div className="grid gap-2 border-t border-border pt-3">
              <p className="text-xs text-muted-foreground">Completá los nombres de este grupo:</p>
              {people.map((person, index) => {
                const originalIndex = nonCyclists.indexOf(person);
                return <div className="space-y-1" key={originalIndex}>
                  <Label className="text-xs" htmlFor={`rsvp-dinner-${choice.value}-${index}`}>
                    {choice.guestLabel} {index + 1} · nombre y apellido
                  </Label>
                  <Input
                    id={`rsvp-dinner-${choice.value}-${index}`} placeholder="Nombre y apellido"
                    maxLength={100} disabled={disabled} value={person.name}
                    onChange={(e) => setNonCyclists(nonCyclists.map((item, i) => i === originalIndex ? { ...item, name: e.target.value } : item))}
                  />
                </div>;
              })}
            </div>}
          </div>;
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Los acompañantes no ciclistas no tienen cupo comercial. Los amigos ciclistas que también comen se cuentan automáticamente, sin anotarlos dos veces.
      </p>
    </section>}
    <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm">
      <p><strong>{cyclists.length}</strong> ciclista(s) invitado(s) pendiente(s) de aprobación</p>
      {lunchAllowed && <p className="mt-1"><strong>{meals}</strong> persona(s) para la parrilla, incluyéndote
        {nonCyclists.some((person) => person.category !== "adult") && " (con niños)"}
      </p>}
    </div>
  </div>;
}
