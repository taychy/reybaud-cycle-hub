import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Search, Upload, Users, UserMinus, Trash2, Pencil, RefreshCw, Loader2, Download,
} from "lucide-react";

type Tipo = "lead" | "ex_alumno" | "evento_externo" | "manual" | "importado";

const TIPOS: { value: Tipo; label: string }[] = [
  { value: "lead", label: "Lead" },
  { value: "ex_alumno", label: "Ex alumno" },
  { value: "evento_externo", label: "Evento externo" },
  { value: "manual", label: "Manual" },
  { value: "importado", label: "Importado" },
];

interface Contact {
  id: string;
  email: string;
  nombre: string | null;
  apellido: string | null;
  telefono: string | null;
  tipo: Tipo;
  origen: string | null;
  tags: string[];
  notas: string | null;
  opt_in_marketing: boolean;
  opt_out_at: string | null;
  last_campaign_sent_at: string | null;
  created_at: string;
}

const emptyForm: Partial<Contact> & { tagsInput?: string } = {
  email: "",
  nombre: "",
  apellido: "",
  telefono: "",
  tipo: "lead",
  origen: "",
  tags: [],
  notas: "",
  opt_in_marketing: true,
  tagsInput: "",
};

export default function MarketingContactsManager() {
  const { toast } = useToast();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterTipo, setFilterTipo] = useState<string>("all");
  const [filterOpt, setFilterOpt] = useState<string>("all");
  const [filterTag, setFilterTag] = useState<string>("");

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<typeof emptyForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [importTipo, setImportTipo] = useState<Tipo>("importado");
  const [importTags, setImportTags] = useState("");
  const [importing, setImporting] = useState(false);

  const [deleting, setDeleting] = useState<Contact | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("marketing_contacts" as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(2000);
    if (error) toast({ title: "Error cargando contactos", description: error.message, variant: "destructive" });
    setContacts(((data as any) || []) as Contact[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const allTags = useMemo(() => {
    const s = new Set<string>();
    contacts.forEach((c) => (c.tags || []).forEach((t) => s.add(t)));
    return Array.from(s).sort();
  }, [contacts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contacts.filter((c) => {
      if (filterTipo !== "all" && c.tipo !== filterTipo) return false;
      if (filterOpt === "in" && !c.opt_in_marketing) return false;
      if (filterOpt === "out" && c.opt_in_marketing) return false;
      if (filterTag && !(c.tags || []).includes(filterTag)) return false;
      if (q) {
        const hay = `${c.email} ${c.nombre || ""} ${c.apellido || ""} ${c.origen || ""} ${(c.tags || []).join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [contacts, search, filterTipo, filterOpt, filterTag]);

  const stats = useMemo(() => {
    const total = contacts.length;
    const optIn = contacts.filter((c) => c.opt_in_marketing).length;
    const byTipo: Record<string, number> = {};
    contacts.forEach((c) => { byTipo[c.tipo] = (byTipo[c.tipo] || 0) + 1; });
    return { total, optIn, optOut: total - optIn, byTipo };
  }, [contacts]);

  const openNew = () => { setEditing({ ...emptyForm }); setShowForm(true); };
  const openEdit = (c: Contact) => {
    setEditing({
      ...c,
      tagsInput: (c.tags || []).join(", "),
    });
    setShowForm(true);
  };

  const save = async () => {
    const email = (editing.email || "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
      toast({ title: "Email inválido", variant: "destructive" });
      return;
    }
    const tags = (editing.tagsInput || "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    setSaving(true);
    const payload: any = {
      email,
      nombre: editing.nombre || null,
      apellido: editing.apellido || null,
      telefono: editing.telefono || null,
      tipo: editing.tipo || "manual",
      origen: editing.origen || null,
      tags,
      notas: editing.notas || null,
      opt_in_marketing: editing.opt_in_marketing ?? true,
    };
    let error: any;
    if ((editing as any).id) {
      ({ error } = await supabase.from("marketing_contacts" as any).update(payload).eq("id", (editing as any).id));
    } else {
      ({ error } = await supabase.from("marketing_contacts" as any).insert(payload));
    }
    setSaving(false);
    if (error) {
      toast({ title: "Error al guardar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: (editing as any).id ? "Contacto actualizado" : "Contacto creado" });
    setShowForm(false);
    setEditing(emptyForm);
    load();
  };

  const toggleOptIn = async (c: Contact, value: boolean) => {
    const { error } = await supabase
      .from("marketing_contacts" as any)
      .update({
        opt_in_marketing: value,
        opt_out_at: value ? null : new Date().toISOString(),
        opt_out_reason: value ? null : "manual desde panel",
      })
      .eq("id", c.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    setContacts((prev) => prev.map((p) => p.id === c.id ? { ...p, opt_in_marketing: value, opt_out_at: value ? null : new Date().toISOString() } : p));
  };

  const doDelete = async () => {
    if (!deleting) return;
    const { error } = await supabase.from("marketing_contacts" as any).delete().eq("id", deleting.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Contacto eliminado" });
    setDeleting(null);
    load();
  };

  const runSync = async (fn: "sync_ex_alumnos_to_marketing" | "sync_event_externals_to_marketing", label: string) => {
    setSyncing(fn);
    const { data, error } = await supabase.rpc(fn as any);
    setSyncing(null);
    if (error) {
      toast({ title: `Error al sincronizar ${label}`, description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: `Sincronización lista`, description: `Se sumaron ${data ?? 0} nuevos contactos (${label}).` });
    load();
  };

  const parseCsv = (text: string): { email: string; nombre?: string; apellido?: string; telefono?: string; tagsExtra?: string[] }[] => {
    // Soporta: pegar líneas con email[,nombre[,apellido[,telefono[,tags...]]]]
    // También: una columna sola de emails.
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return [];
    // Detectar header
    const first = lines[0].toLowerCase();
    const hasHeader = /email/.test(first) && /[,;\t]/.test(first);
    const rows = hasHeader ? lines.slice(1) : lines;
    return rows.map((row) => {
      const cols = row.split(/[,;\t]/).map((c) => c.trim());
      const email = (cols[0] || "").toLowerCase();
      return {
        email,
        nombre: cols[1] || undefined,
        apellido: cols[2] || undefined,
        telefono: cols[3] || undefined,
        tagsExtra: cols.slice(4).filter(Boolean),
      };
    }).filter((r) => r.email && r.email.includes("@"));
  };

  const doImport = async () => {
    const rows = parseCsv(importText);
    if (!rows.length) {
      toast({ title: "Nada que importar", description: "Pegá al menos un email válido.", variant: "destructive" });
      return;
    }
    const baseTags = importTags.split(",").map((t) => t.trim()).filter(Boolean);
    setImporting(true);
    const payload = rows.map((r) => ({
      email: r.email,
      nombre: r.nombre || null,
      apellido: r.apellido || null,
      telefono: r.telefono || null,
      tipo: importTipo,
      origen: `import ${new Date().toISOString().slice(0, 10)}`,
      tags: Array.from(new Set([...baseTags, ...(r.tagsExtra || [])])),
    }));
    // Upsert por email (ignorar duplicados, sin pisar opt-out)
    const { data, error } = await supabase
      .from("marketing_contacts" as any)
      .upsert(payload, { onConflict: "email", ignoreDuplicates: true })
      .select("id");
    setImporting(false);
    if (error) {
      toast({ title: "Error en importación", description: error.message, variant: "destructive" });
      return;
    }
    const inserted = (data as any[])?.length ?? 0;
    const dup = rows.length - inserted;
    toast({
      title: "Importación completa",
      description: `${inserted} nuevos · ${dup} ya existían (no se duplicaron).`,
    });
    setShowImport(false);
    setImportText("");
    setImportTags("");
    load();
  };

  const exportCsv = () => {
    const rows = filtered;
    const header = "email,nombre,apellido,telefono,tipo,tags,opt_in,origen,ultimo_envio\n";
    const body = rows.map((r) =>
      [
        r.email,
        r.nombre || "",
        r.apellido || "",
        r.telefono || "",
        r.tipo,
        (r.tags || []).join("|"),
        r.opt_in_marketing ? "si" : "no",
        r.origen || "",
        r.last_campaign_sent_at || "",
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")
    ).join("\n");
    const blob = new Blob([header + body], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `contactos-marketing-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="font-semibold flex items-center gap-2"><Users className="w-4 h-4" /> Base de contactos</div>
            <p className="text-xs text-muted-foreground">
              Leads, ex alumnos y participantes de eventos para enviar novedades. Separado de la base de alumnos activos.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={openNew}><Plus className="w-4 h-4 mr-1" />Nuevo contacto</Button>
            <Button size="sm" variant="outline" onClick={() => setShowImport(true)}><Upload className="w-4 h-4 mr-1" />Importar CSV</Button>
            <Button size="sm" variant="outline" disabled={syncing !== null} onClick={() => runSync("sync_ex_alumnos_to_marketing", "ex alumnos")}>
              {syncing === "sync_ex_alumnos_to_marketing" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
              Sumar ex-alumnos
            </Button>
            <Button size="sm" variant="outline" disabled={syncing !== null} onClick={() => runSync("sync_event_externals_to_marketing", "participantes externos")}>
              {syncing === "sync_event_externals_to_marketing" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
              Sumar participantes externos
            </Button>
            <Button size="sm" variant="ghost" onClick={exportCsv}><Download className="w-4 h-4 mr-1" />Exportar</Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <div className="rounded border p-2">Total <b className="block text-base">{stats.total}</b></div>
          <div className="rounded border p-2">Aceptan novedades <b className="block text-base text-emerald-500">{stats.optIn}</b></div>
          <div className="rounded border p-2">Dados de baja <b className="block text-base text-amber-500">{stats.optOut}</b></div>
          <div className="rounded border p-2">
            <div>Por tipo</div>
            <div className="flex flex-wrap gap-1 mt-1">
              {Object.entries(stats.byTipo).map(([t, n]) => (
                <Badge key={t} variant="outline" className="text-[10px]">{t}: {n}</Badge>
              ))}
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-[1fr_180px_180px_180px] gap-2 pt-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar email, nombre, tag, origen..." className="pl-9" />
          </div>
          <Select value={filterTipo} onValueChange={setFilterTipo}>
            <SelectTrigger><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los tipos</SelectItem>
              {TIPOS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterOpt} onValueChange={setFilterOpt}>
            <SelectTrigger><SelectValue placeholder="Opt-in" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Opt-in y baja</SelectItem>
              <SelectItem value="in">Solo aceptan novedades</SelectItem>
              <SelectItem value="out">Solo dados de baja</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterTag || "__all"} onValueChange={(v) => setFilterTag(v === "__all" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Tag" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">Todos los tags</SelectItem>
              {allTags.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="max-h-[60vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background border-b">
              <tr className="text-left">
                <th className="p-2 font-medium">Contacto</th>
                <th className="p-2 font-medium">Tipo</th>
                <th className="p-2 font-medium">Tags</th>
                <th className="p-2 font-medium">Último envío</th>
                <th className="p-2 font-medium">Acepta novedades</th>
                <th className="p-2 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr><td colSpan={6} className="p-6 text-center text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Cargando...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No hay contactos con esos filtros.</td></tr>
              ) : filtered.slice(0, 500).map((c) => (
                <tr key={c.id} className="hover:bg-muted/20">
                  <td className="p-2">
                    <div className="font-medium">{[c.nombre, c.apellido].filter(Boolean).join(" ") || "—"}</div>
                    <div className="text-xs text-muted-foreground">{c.email}</div>
                  </td>
                  <td className="p-2"><Badge variant="outline" className="capitalize">{c.tipo.replace("_", " ")}</Badge></td>
                  <td className="p-2">
                    <div className="flex flex-wrap gap-1">
                      {(c.tags || []).slice(0, 4).map((t) => <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>)}
                      {(c.tags || []).length > 4 && <span className="text-[10px] text-muted-foreground">+{c.tags.length - 4}</span>}
                    </div>
                  </td>
                  <td className="p-2 text-xs text-muted-foreground">
                    {c.last_campaign_sent_at ? new Date(c.last_campaign_sent_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="p-2">
                    <Switch checked={c.opt_in_marketing} onCheckedChange={(v) => toggleOptIn(c, v)} />
                  </td>
                  <td className="p-2 text-right">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(c)}><Pencil className="w-4 h-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => setDeleting(c)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length > 500 && (
          <div className="p-2 text-xs text-muted-foreground text-center border-t">
            Mostrando 500 de {filtered.length}. Refiná los filtros para ver el resto.
          </div>
        )}
      </Card>

      {/* Form alta/edición */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{(editing as any).id ? "Editar contacto" : "Nuevo contacto"}</DialogTitle>
            <DialogDescription>Estos contactos reciben campañas masivas (no transaccionales).</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Email *</Label>
              <Input value={editing.email || ""} onChange={(e) => setEditing({ ...editing, email: e.target.value })} placeholder="ejemplo@correo.com" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Nombre</Label>
                <Input value={editing.nombre || ""} onChange={(e) => setEditing({ ...editing, nombre: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Apellido</Label>
                <Input value={editing.apellido || ""} onChange={(e) => setEditing({ ...editing, apellido: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Teléfono</Label>
                <Input value={editing.telefono || ""} onChange={(e) => setEditing({ ...editing, telefono: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={(editing.tipo as string) || "manual"} onValueChange={(v) => setEditing({ ...editing, tipo: v as Tipo })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TIPOS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Origen</Label>
              <Input value={editing.origen || ""} onChange={(e) => setEditing({ ...editing, origen: e.target.value })} placeholder="Ej: form web, evento Bariloche, recomendación" />
            </div>
            <div className="space-y-1.5">
              <Label>Tags (separados por coma)</Label>
              <Input value={editing.tagsInput || ""} onChange={(e) => setEditing({ ...editing, tagsInput: e.target.value })} placeholder="bariloche, ruta, gravel" />
            </div>
            <div className="space-y-1.5">
              <Label>Notas internas</Label>
              <Textarea rows={2} value={editing.notas || ""} onChange={(e) => setEditing({ ...editing, notas: e.target.value })} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={editing.opt_in_marketing ?? true} onCheckedChange={(v) => setEditing({ ...editing, opt_in_marketing: v })} />
              <Label className="cursor-pointer">Acepta recibir novedades por mail</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import CSV */}
      <Dialog open={showImport} onOpenChange={setShowImport}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Importar contactos</DialogTitle>
            <DialogDescription>
              Pegá tus contactos. Una columna sola de emails, o varias columnas separadas por coma / punto y coma / tab:<br />
              <code className="text-xs">email, nombre, apellido, telefono, tag1, tag2...</code><br />
              Si la primera fila contiene "email", se trata como encabezado. Los duplicados se ignoran automáticamente.
            </DialogDescription>
          </DialogHeader>
          <div className="grid md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo asignado</Label>
              <Select value={importTipo} onValueChange={(v) => setImportTipo(v as Tipo)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TIPOS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Tags comunes (opcional)</Label>
              <Input value={importTags} onChange={(e) => setImportTags(e.target.value)} placeholder="ej: campana-2025, bariloche" />
            </div>
          </div>
          <Textarea
            rows={10}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder={`email,nombre,apellido\nnati@example.com,Natalia,Pérez\njuan@example.com,Juan,García`}
          />
          <div className="text-xs text-muted-foreground">
            Se detectaron <b>{parseCsv(importText).length}</b> emails válidos.
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImport(false)}>Cancelar</Button>
            <Button onClick={doImport} disabled={importing}>{importing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />}Importar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar contacto</AlertDialogTitle>
            <AlertDialogDescription>
              Vas a eliminar <b>{deleting?.email}</b>. Si la persona te pidió no recibir más mails, mejor desactivá "Acepta novedades" en lugar de borrarla, así no la volvés a importar por error.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete}><UserMinus className="w-4 h-4 mr-1" />Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
