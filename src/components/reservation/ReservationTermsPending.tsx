// Condiciones pendientes en reservas cargadas por Administración.
// Una sola lógica de aceptación en servidor (_accept_reservation_terms):
//  - alumno con sesión: accept_my_reservation_terms
//  - enlace seguro: accept_reservation_terms_by_token (página /condiciones/:token)
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Link2, FileCheck2 } from "lucide-react";

export interface TermsSnapshot {
  politica_sena?: string;
  politica_cancelacion?: string;
  politica_pagos?: string;
  reglamento_texto?: string;
  reglamento_url?: string;
  version?: string;
}

export const termsLink = (token: string) => `${window.location.origin}/condiciones/${token}`;

const SECTIONS: [keyof TermsSnapshot, string][] = [
  ["politica_sena", "Seña"],
  ["politica_cancelacion", "Cancelación"],
  ["politica_pagos", "Pagos"],
  ["reglamento_texto", "Reglamento"],
];

export function TermsText({ terms }: { terms: TermsSnapshot }) {
  return (
    <div className="space-y-4 text-sm">
      {SECTIONS.filter(([k]) => terms[k]).map(([k, label]) => (
        <section key={k}>
          <h3 className="font-semibold mb-1">{label}</h3>
          <p className="whitespace-pre-line text-muted-foreground">{terms[k]}</p>
        </section>
      ))}
      {terms.reglamento_url && (
        <a href={terms.reglamento_url} target="_blank" rel="noopener noreferrer" className="underline text-primary">
          Ver reglamento completo
        </a>
      )}
      <p className="text-xs text-muted-foreground">Versión {terms.version || "1"}</p>
    </div>
  );
}

/** Aceptación con checkbox. `onAccept` devuelve error o null. */
export function TermsAcceptForm({ terms, onAccept }: { terms: TermsSnapshot; onAccept: (version: string) => Promise<string | null> }) {
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-border p-4"><TermsText terms={terms} /></div>
      <label className="flex items-start gap-2 text-sm">
        <Checkbox checked={checked} onCheckedChange={(v) => setChecked(v === true)} aria-label="Acepto las condiciones" />
        <span>Leí y acepto la política de seña, cancelación, pagos y el reglamento del viaje.</span>
      </label>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button className="w-full" disabled={!checked || busy} onClick={async () => {
        setBusy(true); setError(null);
        const e = await onAccept(terms.version || "1");
        if (e) setError(e);
        setBusy(false);
      }}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Aceptar condiciones"}
      </Button>
    </div>
  );
}

/** Banner en la reserva del alumno: muestra y acepta las condiciones. */
export function StudentTermsPendingBanner({ reservationId, eventId, onAccepted }: { reservationId: string; eventId: string; onAccepted: () => void }) {
  const { toast } = useToast();
  const [terms, setTerms] = useState<TermsSnapshot | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    supabase.rpc("event_terms_snapshot" as any, { p_event_id: eventId }).then(({ data }) => setTerms((data as any) ?? null));
  }, [eventId]);
  return (
    <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 space-y-3">
      <p className="text-sm font-medium">Condiciones pendientes</p>
      <p className="text-sm text-muted-foreground">Antes de pagar la seña tenés que leer y aceptar las condiciones del viaje.</p>
      {!open ? (
        <Button size="sm" onClick={() => setOpen(true)} disabled={!terms}><FileCheck2 className="w-4 h-4 mr-1" /> Leer y aceptar</Button>
      ) : terms && (
        <TermsAcceptForm terms={terms} onAccept={async (version) => {
          const { error } = await supabase.rpc("accept_my_reservation_terms" as any, { p_reservation_id: reservationId, p_version: version });
          if (error) return error.message;
          toast({ title: "Condiciones aceptadas" });
          onAccepted();
          return null;
        }} />
      )}
    </div>
  );
}

/** Estado visible para Administración + copiar/renovar enlace. */
export function AdminTermsBadge({ r, onChanged }: { r: any; onChanged?: () => void }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  if (r.terminos_pendientes) {
    const copy = async (e: React.MouseEvent) => {
      e.stopPropagation();
      setBusy(true);
      let token = r.terminos_token as string | null;
      const expired = !r.terminos_token_expires_at || new Date(r.terminos_token_expires_at) < new Date();
      if (!token || expired) {
        const { data, error } = await supabase.rpc("admin_renew_reservation_terms_link" as any, { p_reservation_id: r.id });
        if (error) { toast({ title: "No se pudo generar el enlace", description: error.message, variant: "destructive" }); setBusy(false); return; }
        token = (data as any)?.token; onChanged?.();
      }
      await navigator.clipboard?.writeText(termsLink(token!)).catch(() => {});
      toast({ title: "Enlace de condiciones copiado", description: "Válido 30 días y solo sirve para aceptar las condiciones." });
      setBusy(false);
    };
    return (
      <>
        <Badge variant="outline" className="ml-1.5 text-[9px] border-destructive/50 text-destructive">Condiciones pendientes</Badge>
        <button type="button" onClick={copy} disabled={busy} className="ml-1 inline-flex items-center text-[10px] underline text-muted-foreground" aria-label="Copiar enlace de condiciones">
          <Link2 className="w-3 h-3 mr-0.5" />enlace
        </button>
      </>
    );
  }
  if (r.terminos_aceptados_at) {
    const d = new Date(r.terminos_aceptados_at).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
    return <Badge variant="outline" className="ml-1.5 text-[9px] border-primary/40 text-primary" title={`Versión ${r.terminos_version_aceptada ?? "—"}`}>Condiciones aceptadas · {d}</Badge>;
  }
  return null;
}
