import { useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Upload, Users, UserPlus, Merge, AlertTriangle } from "lucide-react";

/* ------------------------------------------------------------------ */
/* Normalización de teléfono: misma lógica que el trigger de la base   */
/* ------------------------------------------------------------------ */
export function normalizarTelefonoAR(raw?: string | null): string | null {
  if (!raw) return null;
  let d = String(raw).replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("549")) d = d.slice(3);
  else if (d.startsWith("54")) d = d.slice(2);
  while (d.startsWith("0")) d = d.slice(1);
  if (d.length > 10) {
    for (let i = 2; i <= 4; i++) {
      if (d.length - i >= 8 && d.slice(i, i + 2) === "15") {
        const cand = d.slice(0, i) + d.slice(i + 2);
        if (cand.length === 10) { d = cand; break; }
      }
    }
  }
  if (d.length >= 10 && d.length <= 11) return "549" + d.slice(-10);
  return null;
}

/* ------------------------------------------------------------------ */
/* Parser CSV tolerante (comillas, comas y saltos dentro de campos)     */
/* ------------------------------------------------------------------ */
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') { inQuotes = true; continue; }
    if (ch === ",") { row.push(field); field = ""; continue; }
    if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; continue; }
    field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

interface ParsedContact {
  nombre: string;
  apellido: string;
  email: string | null;
  telefono: string | null;
  telNorm: string | null;
  etiquetasGoogle: string[];
}

type Decision = "nuevo" | "ya_existe_tel" | "ya_existe_email" | "es_alumno" | "descartado";

interface Analizado extends ParsedContact {
  decision: Decision;
  matchId?: string;
  matchLabel?: string;
}

const DECISION_META: Record<Decision, { label: string; color: string; desc: string }> = {
  nuevo: { label: "Nuevos", color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", desc: "Se crean como contacto nuevo" },
  es_alumno: { label: "Ya son alumnos", color: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30", desc: "Coinciden con una ficha de alumno: se completan los datos que falten, no se duplica" },
  ya_existe_tel: { label: "Repetidos por teléfono", color: "bg-amber-500/15 text-amber-400 border-amber-500/30", desc: "Ya están en la base con el mismo teléfono" },
  ya_existe_email: { label: "Repetidos por email", color: "bg-amber-500/15 text-amber-400 border-amber-500/30", desc: "Ya están en la base con el mismo email" },
  descartado: { label: "Sin datos útiles", color: "bg-muted text-muted-foreground border-border", desc: "Sin teléfono válido ni email: se ignoran" },
};

function pick(headers: string[], row: string[], candidates: RegExp[]): string {
  for (const re of candidates) {
    const idx = headers.findIndex((h) => re.test(h));
    if (idx >= 0 && (row[idx] || "").trim()) return row[idx].trim();
  }
  return "";
}

function pickAll(headers: string[], row: string[], re: RegExp): string[] {
  const out: string[] = [];
  headers.forEach((h, i) => {
    if (re.test(h) && (row[i] || "").trim()) out.push(row[i].trim());
  });
  return out;
}

export default function GoogleContactsImportDialog({
  open, onOpenChange, onImported,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImported?: () => void;
}) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [raw, setRaw] = useState("");
  const [analizando, setAnalizando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [analisis, setAnalisis] = useState<Analizado[] | null>(null);
  const [completarFaltantes, setCompletarFaltantes] = useState(true);
  const [tagExtra, setTagExtra] = useState("agenda-google");

  const resumen = useMemo(() => {
    const r: Record<Decision, number> = { nuevo: 0, es_alumno: 0, ya_existe_tel: 0, ya_existe_email: 0, descartado: 0 };
    (analisis || []).forEach((a) => { r[a.decision]++; });
    return r;
  }, [analisis]);

  const reset = () => { setRaw(""); setAnalisis(null); };

  const onFile = async (f: File) => {
    const text = await f.text();
    setRaw(text);
    setAnalisis(null);
  };

  const parseRaw = (text: string): ParsedContact[] => {
    const rows = parseCSV(text);
    if (rows.length < 2) return [];
    const headers = rows[0].map((h) => h.trim().toLowerCase());
    return rows.slice(1).map((row) => {
      const first = pick(headers, row, [/^first name$/, /^nombre$/, /^given name$/]);
      const middle = pick(headers, row, [/^middle name$/]);
      const last = pick(headers, row, [/^last name$/, /^apellido$/, /^family name$/]);
      const full = pick(headers, row, [/^name$/, /^file as$/, /^organization name$/]);
      let nombre = [first, middle].filter(Boolean).join(" ").trim();
      let apellido = last.trim();
      if (!nombre && !apellido && full) {
        const parts = full.trim().split(/\s+/);
        nombre = parts.shift() || "";
        apellido = parts.join(" ");
      }
      const email = (pickAll(headers, row, /e-?mail .*value|^email$|^e-mail$/)[0] || "").toLowerCase() || null;
      const telefono = pickAll(headers, row, /phone .*value|^phone$|^tel[eé]fono$|^celular$/)[0] || null;
      const etiquetasGoogle = (pick(headers, row, [/^labels$/, /group membership/]) || "")
        .split(/[:;]|\s\*\s/)
        .map((s) => s.trim())
        .filter((s) => s && !/^\*$/.test(s) && !/^my contacts$/i.test(s));
      return {
        nombre,
        apellido,
        email: email && email.includes("@") ? email : null,
        telefono,
        telNorm: normalizarTelefonoAR(telefono),
        etiquetasGoogle,
      };
    });
  };

  const analizar = async () => {
    const parsed = parseRaw(raw);
    if (!parsed.length) {
      toast({ title: "No pude leer el archivo", description: "Asegurate de exportar desde Google Contactos en formato CSV (Google o Outlook).", variant: "destructive" });
      return;
    }
    setAnalizando(true);
    try {
      const [{ data: contactos }, { data: alumnos }] = await Promise.all([
        supabase.from("marketing_contacts" as any).select("id, email, telefono, telefono_normalizado, nombre, apellido").limit(20000),
        supabase.from("alumnos" as any).select("id, nombre, apellido, email, telefono, emails_adicionales").limit(20000),
      ]);

      const porTel = new Map<string, { id: string; label: string }>();
      const porEmail = new Map<string, { id: string; label: string }>();
      ((contactos as any[]) || []).forEach((c) => {
        const label = `${c.nombre || ""} ${c.apellido || ""}`.trim() || c.email || c.telefono || "contacto";
        const tn = c.telefono_normalizado || normalizarTelefonoAR(c.telefono);
        if (tn && !porTel.has(tn)) porTel.set(tn, { id: c.id, label });
        if (c.email) porEmail.set(String(c.email).toLowerCase(), { id: c.id, label });
      });

      const alumnoPorTel = new Map<string, string>();
      const alumnoPorEmail = new Map<string, string>();
      ((alumnos as any[]) || []).forEach((a) => {
        const label = `${a.nombre || ""} ${a.apellido || ""}`.trim();
        const tn = normalizarTelefonoAR(a.telefono);
        if (tn && !alumnoPorTel.has(tn)) alumnoPorTel.set(tn, label);
        if (a.email) alumnoPorEmail.set(String(a.email).toLowerCase(), label);
        (a.emails_adicionales || []).forEach((e: string) => e && alumnoPorEmail.set(e.toLowerCase(), label));
      });

      const vistosTel = new Set<string>();
      const vistosEmail = new Set<string>();
      const result: Analizado[] = parsed.map((p) => {
        if (!p.telNorm && !p.email) return { ...p, decision: "descartado" as Decision };
        // duplicados dentro del mismo archivo
        if ((p.telNorm && vistosTel.has(p.telNorm)) || (p.email && vistosEmail.has(p.email))) {
          return { ...p, decision: "ya_existe_tel" as Decision, matchLabel: "duplicado dentro del archivo" };
        }
        if (p.telNorm) vistosTel.add(p.telNorm);
        if (p.email) vistosEmail.add(p.email);

        const alumnoLabel = (p.telNorm && alumnoPorTel.get(p.telNorm)) || (p.email && alumnoPorEmail.get(p.email)) || null;
        const mTel = p.telNorm ? porTel.get(p.telNorm) : undefined;
        const mMail = p.email ? porEmail.get(p.email) : undefined;

        if (alumnoLabel) {
          return { ...p, decision: "es_alumno", matchId: (mTel || mMail)?.id, matchLabel: alumnoLabel };
        }
        if (mTel) return { ...p, decision: "ya_existe_tel", matchId: mTel.id, matchLabel: mTel.label };
        if (mMail) return { ...p, decision: "ya_existe_email", matchId: mMail.id, matchLabel: mMail.label };
        return { ...p, decision: "nuevo" };
      });
      setAnalisis(result);
    } catch (e: any) {
      toast({ title: "Error analizando", description: e.message, variant: "destructive" });
    } finally {
      setAnalizando(false);
    }
  };

  const importar = async () => {
    if (!analisis) return;
    setImportando(true);
    let creados = 0, completados = 0, errores = 0;
    const tags = tagExtra.split(",").map((t) => t.trim()).filter(Boolean);

    try {
      const nuevos = analisis.filter((a) => a.decision === "nuevo");
      for (let i = 0; i < nuevos.length; i += 200) {
        const lote = nuevos.slice(i, i + 200).map((a) => ({
          email: a.email,
          nombre: a.nombre || null,
          apellido: a.apellido || null,
          telefono: a.telefono || null,
          tipo: "importado",
          origen: "Google Contactos",
          tags: Array.from(new Set([...tags, ...a.etiquetasGoogle])),
          opt_in_marketing: true,
        }));
        const { error } = await supabase.from("marketing_contacts" as any).insert(lote as any);
        if (error) errores += lote.length;
        else creados += lote.length;
      }

      if (completarFaltantes) {
        const aCompletar = analisis.filter((a) => a.matchId && (a.decision !== "nuevo" && a.decision !== "descartado"));
        for (const a of aCompletar) {
          const patch: Record<string, any> = {};
          if (a.telefono) patch.telefono = a.telefono;
          if (a.nombre) patch.nombre = a.nombre;
          if (a.apellido) patch.apellido = a.apellido;
          if (!Object.keys(patch).length) continue;
          const { data: actual } = await supabase
            .from("marketing_contacts" as any)
            .select("nombre, apellido, telefono, tags")
            .eq("id", a.matchId!)
            .maybeSingle();
          const cur: any = actual || {};
          const final: Record<string, any> = {};
          if (!cur.telefono && patch.telefono) final.telefono = patch.telefono;
          if (!cur.nombre && patch.nombre) final.nombre = patch.nombre;
          if (!cur.apellido && patch.apellido) final.apellido = patch.apellido;
          const nuevosTags = Array.from(new Set([...(cur.tags || []), ...tags]));
          if (nuevosTags.length !== (cur.tags || []).length) final.tags = nuevosTags;
          if (!Object.keys(final).length) continue;
          const { error } = await supabase.from("marketing_contacts" as any).update(final).eq("id", a.matchId!);
          if (error) errores++; else completados++;
        }
      }

      toast({
        title: "Importación terminada",
        description: `${creados} nuevos · ${completados} completados · ${errores ? `${errores} con error` : "sin errores"}`,
      });
      onImported?.();
      reset();
      onOpenChange(false);
    } finally {
      setImportando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" /> Importar agenda de Google
          </DialogTitle>
          <DialogDescription>
            Exportá tus contactos desde Google Contactos (Exportar → CSV de Google) y subí el archivo.
            Antes de guardar nada te muestro qué es nuevo y qué ya existe, para no duplicar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Archivo CSV</Label>
            <Input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
            />
            {raw && !analisis && (
              <p className="text-xs text-muted-foreground">Archivo cargado ({(raw.length / 1024).toFixed(0)} KB). Analizá para ver el detalle.</p>
            )}
          </div>

          {analisis && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {(Object.keys(DECISION_META) as Decision[]).map((k) => (
                  <Card key={k} className={`p-3 border ${DECISION_META[k].color}`}>
                    <div className="text-2xl font-bold">{resumen[k]}</div>
                    <div className="text-xs font-medium">{DECISION_META[k].label}</div>
                    <div className="text-[10px] opacity-70 leading-tight mt-1">{DECISION_META[k].desc}</div>
                  </Card>
                ))}
              </div>

              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <div className="text-sm font-medium">Completar datos faltantes en los repetidos</div>
                  <div className="text-xs text-muted-foreground">
                    Si el contacto ya existe pero no tiene teléfono o apellido, se completa con lo que trae Google. Nunca pisa datos ya cargados.
                  </div>
                </div>
                <Switch checked={completarFaltantes} onCheckedChange={setCompletarFaltantes} />
              </div>

              <div className="space-y-1">
                <Label>Etiquetas a aplicar</Label>
                <Input value={tagExtra} onChange={(e) => setTagExtra(e.target.value)} placeholder="agenda-google" />
              </div>

              <div className="rounded-lg border max-h-64 overflow-y-auto divide-y">
                {analisis.filter((a) => a.decision !== "descartado").slice(0, 300).map((a, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{`${a.nombre} ${a.apellido}`.trim() || a.email || a.telefono}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {[a.telefono, a.email].filter(Boolean).join(" · ")}
                        {a.matchLabel ? ` → ${a.matchLabel}` : ""}
                      </div>
                    </div>
                    <Badge variant="outline" className={`shrink-0 text-[10px] ${DECISION_META[a.decision].color}`}>
                      {a.decision === "nuevo" ? <UserPlus className="w-3 h-3 mr-1" /> : <Merge className="w-3 h-3 mr-1" />}
                      {DECISION_META[a.decision].label}
                    </Badge>
                  </div>
                ))}
                {analisis.filter((a) => a.decision !== "descartado").length > 300 && (
                  <div className="px-3 py-2 text-xs text-muted-foreground">…y más. Se importan todos igual.</div>
                )}
              </div>

              {resumen.descartado > 0 && (
                <div className="flex items-start gap-2 text-xs text-amber-400">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  {resumen.descartado} contactos no tienen teléfono válido ni email, se van a ignorar.
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
          {!analisis ? (
            <Button onClick={analizar} disabled={!raw || analizando}>
              {analizando ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Users className="w-4 h-4 mr-1" />}
              Analizar sin guardar
            </Button>
          ) : (
            <Button onClick={importar} disabled={importando}>
              {importando ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />}
              Importar {resumen.nuevo} nuevos
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
