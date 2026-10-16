import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { UserPlus, Sparkles, AlertTriangle } from "lucide-react";
import { formatPrice } from "@/lib/currency";
import { SHARED_ROOM_CONSENT_TEXT, isQuoteReady, type SharedRoomQuote } from "@/lib/sharedRoomAssignment";

export type SharedRoomMode = "acompanante" | "asignacion" | null;

interface Props {
  quote: SharedRoomQuote | null;
  mode: SharedRoomMode;
  onModeChange: (m: SharedRoomMode) => void;
  companion: string;
  onCompanionChange: (v: string) => void;
  accepted: boolean;
  onAcceptedChange: (v: boolean) => void;
}

/** Paso «Alojamiento» de la habitación doble: acompañante propio o pedido de asignación. */
export function SharedRoomChoice({ quote, mode, onModeChange, companion, onCompanionChange, accepted, onAcceptedChange }: Props) {
  const ok = isQuoteReady(quote) ? quote : null;
  const blocked = quote && quote.applies && quote.blocked;
  const opt = (active: boolean) =>
    `rounded-xl border p-3 text-left ${active ? "border-primary bg-primary/10" : "border-border bg-card hover:border-primary/40"}`;
  return (
    <div className="space-y-3">
      <h4 className="font-heading font-semibold text-sm text-foreground">Habitación doble</h4>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={opt(mode === "acompanante")} onClick={() => { onModeChange("acompanante"); onAcceptedChange(false); }}>
          <UserPlus className="w-4 h-4 text-primary mb-1" />
          <p className="text-sm font-semibold">Viajo con acompañante</p>
          <p className="text-[11px] text-muted-foreground">Indico su nombre</p>
        </button>
        <button type="button" disabled={!!blocked} className={`${opt(mode === "asignacion")} disabled:opacity-50`} onClick={() => onModeChange("asignacion")}>
          <Sparkles className="w-4 h-4 text-primary mb-1" />
          <p className="text-sm font-semibold">Asígnenme uno</p>
          <p className="text-[11px] text-muted-foreground">Reybaud busca acompañante</p>
        </button>
      </div>

      {mode === "acompanante" && (
        <div className="space-y-1">
          <Input value={companion} onChange={(e) => onCompanionChange(e.target.value)} placeholder="Nombre y apellido del acompañante" maxLength={120} />
          <p className="text-[11px] text-muted-foreground">La vinculación de ambas reservas la confirma Administración.</p>
        </div>
      )}

      {blocked && (
        <p className="flex items-start gap-2 text-xs text-destructive">
          <AlertTriangle className="w-4 h-4 shrink-0" /> La asignación no está disponible: falta el importe de habitación individual en el sistema.
        </p>
      )}

      {mode === "asignacion" && ok && (
        <>
          <div className="rounded-lg border border-border/50 bg-card/50 p-3 text-xs space-y-1">
            <div className="flex justify-between"><span className="text-muted-foreground">Habitación individual hoy</span><span className="font-semibold">{formatPrice(ok.single_price, ok.currency)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Diferencia a abonar si no se completa</span><span className="font-semibold text-primary">{formatPrice(ok.difference, ok.currency)}</span></div>
          </div>
          <label className="flex items-start gap-3 p-3 rounded-xl border border-primary/30 bg-primary/5 cursor-pointer">
            <Checkbox checked={accepted} onCheckedChange={(v) => onAcceptedChange(v === true)} className="mt-0.5" />
            <span className="text-sm text-foreground leading-snug">{SHARED_ROOM_CONSENT_TEXT}</span>
          </label>
        </>
      )}
    </div>
  );
}

export function sharedRoomValid(quote: SharedRoomQuote | null, mode: SharedRoomMode, companion: string, accepted: boolean): boolean {
  if (!quote || !quote.applies) return true;
  if (mode === "acompanante") return companion.trim().length >= 3;
  if (mode === "asignacion") return !quote.blocked && accepted;
  return false;
}
