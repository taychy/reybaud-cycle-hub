import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { buildDuplicateIndex, DUPLICATE_REASON_LABEL, type DuplicateCandidate } from "@/lib/duplicateStudents";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Merge, Crown } from "lucide-react";
import { toast } from "sonner";

export interface MergeAlumnoRow extends DuplicateCandidate {
  created_at?: string | null;
  estado?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  alumnos: MergeAlumnoRow[];
  onMerged: () => void;
}

interface Group {
  key: string;
  members: MergeAlumnoRow[];
  reasons: string[];
}

const fullName = (a: MergeAlumnoRow) => `${a.nombre || ""} ${a.apellido || ""}`.trim() || "(sin nombre)";
const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" }) : "—";

export function MergeDuplicatesDialog({ open, onOpenChange, alumnos, onMerged }: Props) {
  const [principalByGroup, setPrincipalByGroup] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<{ group: Group; principal: MergeAlumnoRow } | null>(null);
  const [preview, setPreview] = useState<{ total: number; detalle: any[] } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [merging, setMerging] = useState(false);

  const groups = useMemo<Group[]>(() => {
    const candidates = alumnos.filter((a) => (a.estado || "") !== "fusionada");
    const idx = buildDuplicateIndex(candidates);
    const byId = new Map(candidates.map((a) => [a.id, a]));
    const seen = new Set<string>();
    const out: Group[] = [];
    idx.ids.forEach((id) => {
      if (seen.has(id)) return;
      const ids = [id, ...Array.from(idx.matches.get(id) || [])];
      ids.forEach((x) => seen.add(x));
      const members = ids.map((x) => byId.get(x)).filter(Boolean) as MergeAlumnoRow[];
      if (members.length < 2) return;
      members.sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""));
      const reasons = Array.from(
        new Set(ids.flatMap((x) => (idx.reasons.get(x) || []).map((r) => DUPLICATE_REASON_LABEL[r])))
      );
      out.push({ key: members.map((m) => m.id).sort().join("|"), members, reasons });
    });
    return out.sort((a, b) => fullName(a.members[0]).localeCompare(fullName(b.members[0])));
  }, [alumnos]);

  useEffect(() => {
    if (!open) return;
    setPrincipalByGroup((prev) => {
      const next = { ...prev };
      groups.forEach((g) => { if (!next[g.key]) next[g.key] = g.members[0].id; });
      return next;
    });
  }, [open, groups]);

  const openConfirm = async (group: Group) => {
    const principalId = principalByGroup[group.key] || group.members[0].id;
    const principal = group.members.find((m) => m.id === principalId)!;
    setConfirm({ group, principal });
    setPreview(null);
    setLoadingPreview(true);
    try {
      let total = 0;
      const detalle: any[] = [];
      for (const dup of group.members.filter((m) => m.id !== principalId)) {
        const { data, error } = await supabase.rpc("preview_merge_alumnos" as any, {
          _principal_id: principalId,
          _duplicado_id: dup.id,
        });
        if (error) throw error;
        const d: any = data;
        total += Number(d?.total_registros || 0);
        (d?.detalle || []).forEach((x: any) => detalle.push(x));
      }
      setPreview({ total, detalle });
    } catch (e: any) {
      toast.error(e.message || "No pudimos calcular la vista previa");
    } finally {
      setLoadingPreview(false);
    }
  };

  const doMerge = async () => {
    if (!confirm) return;
    setMerging(true);
    try {
      const dups = confirm.group.members.filter((m) => m.id !== confirm.principal.id);
      let movidos = 0;
      for (const dup of dups) {
        const { data, error } = await supabase.rpc("merge_alumnos" as any, {
          _principal_id: confirm.principal.id,
          _duplicado_id: dup.id,
        });
        if (error) throw error;
        movidos += Number((data as any)?.movidos || 0);
      }
      toast.success(`Fichas fusionadas en ${fullName(confirm.principal)} (${movidos} registros movidos)`);
      setConfirm(null);
      onMerged();
    } catch (e: any) {
      toast.error(e.message || "No pudimos fusionar las fichas");
    } finally {
      setMerging(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Merge className="w-4 h-4" />Fusionar fichas duplicadas</DialogTitle>
            <DialogDescription>
              Elegí la ficha principal (por defecto la más antigua). Al fusionar, suscripciones, pagos, cuenta corriente
              y todo el historial pasan a la ficha principal, y el email de la otra queda como email secundario.
            </DialogDescription>
          </DialogHeader>

          {groups.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No hay fichas duplicadas detectadas.</p>
          ) : (
            <div className="space-y-4">
              {groups.map((g) => {
                const principalId = principalByGroup[g.key] || g.members[0].id;
                return (
                  <div key={g.key} className="rounded-lg border border-border p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="font-medium text-foreground">{fullName(g.members[0])}</div>
                      <div className="flex gap-1 flex-wrap">
                        {g.reasons.map((r) => (
                          <Badge key={r} variant="outline" className="text-[10px] border-amber-500/50 text-amber-400">{r}</Badge>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      {g.members.map((m) => (
                        <label
                          key={m.id}
                          className={`flex items-center gap-2 rounded-md border p-2 cursor-pointer text-sm ${
                            m.id === principalId ? "border-primary bg-primary/5" : "border-border"
                          }`}
                        >
                          <input
                            type="radio"
                            name={`principal-${g.key}`}
                            checked={m.id === principalId}
                            onChange={() => setPrincipalByGroup((p) => ({ ...p, [g.key]: m.id }))}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate">{fullName(m)}</span>
                              {m.id === principalId && (
                                <Badge className="text-[10px] gap-0.5"><Crown className="w-2.5 h-2.5" />Principal</Badge>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">
                              {m.email || "sin email"} · {m.telefono || "sin teléfono"} · alta {fmtDate(m.created_at)}
                            </div>
                          </div>
                        </label>
                      ))}
                    </div>
                    <div className="flex justify-end">
                      <Button size="sm" onClick={() => openConfirm(g)}>
                        <Merge className="w-3.5 h-3.5 mr-1.5" />Fusionar
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirm} onOpenChange={(v) => !v && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar fusión</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  Se conserva la ficha de <strong>{confirm ? fullName(confirm.principal) : ""}</strong> ({confirm?.principal.email || "sin email"}).
                  Las demás fichas del grupo quedan marcadas como fusionadas y sus emails pasan a secundarios.
                </p>
                {loadingPreview ? (
                  <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-3.5 h-3.5 animate-spin" />Calculando qué se va a mover…</p>
                ) : preview ? (
                  <div className="rounded-md bg-muted/40 p-2 max-h-48 overflow-y-auto">
                    <p className="font-medium">{preview.total} registros se van a mover</p>
                    <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                      {preview.detalle.map((d: any, i: number) => (
                        <li key={i}>{String(d.tabla).replace("public.", "")}: {d.registros}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <p className="text-muted-foreground">Esta acción no se puede deshacer.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={merging}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); doMerge(); }} disabled={merging || loadingPreview}>
              {merging ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Fusionando…</> : "Fusionar fichas"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default MergeDuplicatesDialog;
