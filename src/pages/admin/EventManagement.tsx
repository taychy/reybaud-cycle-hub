import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Search, Save, Copy, ExternalLink, Users, Trophy, Pencil, Check, X, Download, Trash2, Ruler } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Participant {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  team_name: string;
  checked_in_at: string;
  score: number | null;
  time_result: string | null;
  time_value: number | null;
  position: number | null;
  staff_feedback: string | null;
  public_access_token: string;
}

const EventManagement = () => {
  const { toast } = useToast();
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    score: string;
    time_result: string;
    position: string;
    staff_feedback: string;
  }>({ score: "", time_result: "", position: "", staff_feedback: "" });
  const [saving, setSaving] = useState(false);
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editTeamValue, setEditTeamValue] = useState("");

  const eventUrl = "https://reybaud-app.com/eventos/record-de-la-hora";

  const fetchParticipants = async () => {
    const { data, error } = await supabase
      .from("event_participants")
      .select("*")
      .eq("event_slug", "record-de-la-hora")
      .order("checked_in_at", { ascending: true });

    if (!error && data) setParticipants(data as Participant[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchParticipants();
  }, []);

  const filtered = participants
    .filter((p) => {
      const q = search.toLowerCase();
      return (
        p.first_name.toLowerCase().includes(q) ||
        p.last_name.toLowerCase().includes(q) ||
        p.email.toLowerCase().includes(q) ||
        (p.team_name || "").toLowerCase().includes(q)
      );
    })
    .sort((a, b) => (b.time_value ?? 0) - (a.time_value ?? 0));

  const deleteParticipant = async (id: string) => {
    const { error } = await supabase.from("event_participants").delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: "No se pudo eliminar.", variant: "destructive" });
    } else {
      toast({ title: "Eliminado", description: "Participante eliminado." });
      fetchParticipants();
    }
  };

  const startEdit = (p: Participant) => {
    setEditingId(p.id);
    setEditForm({
      score: p.score?.toString() ?? "",
      time_result: p.time_result ?? "",
      position: p.position?.toString() ?? "",
      staff_feedback: p.staff_feedback ?? "",
    });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setSaving(true);

    const { error } = await supabase
      .from("event_participants")
      .update({
        score: editForm.score ? parseFloat(editForm.score) : null,
        time_result: editForm.time_result || null,
        position: editForm.position ? parseInt(editForm.position) : null,
        staff_feedback: editForm.staff_feedback || null,
        results_updated_at: new Date().toISOString(),
      } as any)
      .eq("id", editingId);

    if (error) {
      toast({ title: "Error", description: "No se pudo guardar.", variant: "destructive" });
    } else {
      toast({ title: "Guardado", description: "Resultados actualizados." });
      setEditingId(null);
      fetchParticipants();
    }
    setSaving(false);
  };

  const saveTeamName = async (p: Participant) => {
    const { error } = await supabase
      .from("event_participants")
      .update({ team_name: editTeamValue.trim() || "Sin equipo" } as any)
      .eq("id", p.id);
    if (!error) {
      toast({ title: "Equipo actualizado" });
      setEditingTeamId(null);
      fetchParticipants();
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(eventUrl);
    toast({ title: "Link copiado", description: eventUrl });
  };

  const downloadQrPdf = () => {
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(eventUrl)}&format=png`;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const w = 595, h = 842; // A4 approx in px at 72dpi
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);

      ctx.fillStyle = "#121212";
      ctx.font = "bold 28px Arial";
      ctx.textAlign = "center";
      ctx.fillText("RECORD DE LA HORA", w / 2, 100);

      ctx.fillStyle = "#666666";
      ctx.font = "16px Arial";
      ctx.fillText("01/03/2026 – 08:00 – KDT, Palermo", w / 2, 135);

      const qrSize = 300;
      ctx.drawImage(img, (w - qrSize) / 2, 180, qrSize, qrSize);

      ctx.fillStyle = "#E8832A";
      ctx.font = "bold 14px Arial";
      ctx.fillText("Escaneá el QR para registrarte", w / 2, 510);

      ctx.fillStyle = "#333333";
      ctx.font = "12px Arial";
      ctx.fillText(eventUrl, w / 2, 540);

      ctx.fillStyle = "#999999";
      ctx.font = "11px Arial";
      ctx.fillText("Ciclismo Reybaud", w / 2, 580);

      const link = document.createElement("a");
      link.download = "QR-Record-de-la-Hora.pdf";
      // Use image/png as a simple printable download
      link.download = "QR-Record-de-la-Hora.png";
      link.href = canvas.toDataURL("image/png");
      link.click();
    };
    img.src = qrUrl;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold uppercase tracking-wider">
            Record de la Hora
          </h1>
          <p className="text-sm text-muted-foreground">
            01/03/2026 – 08:00 – KDT, Palermo • {participants.length} participantes
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={copyLink}>
            <Copy className="w-4 h-4 mr-1" /> Copiar link
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={eventUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-4 h-4 mr-1" /> Abrir evento
            </a>
          </Button>
        </div>
      </div>

      {/* QR Code & Link */}
      <div className="glass-card rounded-lg p-5 space-y-4">
        <p className="text-sm font-medium text-foreground">📱 QR y link del evento</p>
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(eventUrl)}&bgcolor=1a1a2e&color=E8832A&format=png`}
            alt="QR del evento"
            className="w-48 h-48 rounded-lg border border-border"
          />
          <div className="flex-1 space-y-3 text-center sm:text-left">
            <p className="text-xs text-muted-foreground">Escaneá o compartí este link:</p>
            <code className="text-xs text-primary break-all block bg-secondary/30 p-2 rounded">{eventUrl}</code>
            <Button variant="outline" size="sm" onClick={copyLink} className="w-full sm:w-auto">
              <Copy className="w-4 h-4 mr-1" /> Copiar link
            </Button>
            <Button variant="outline" size="sm" onClick={downloadQrPdf} className="w-full sm:w-auto">
              <Download className="w-4 h-4 mr-1" /> Descargar QR para imprimir
            </Button>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nombre, email o equipo..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Participants list */}
      {loading ? (
        <div className="text-center text-muted-foreground animate-pulse py-8">Cargando...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-muted-foreground py-8">
          <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
          No hay participantes registrados.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((p) => (
            <div key={p.id} className="glass-card rounded-lg p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold">
                    {p.first_name} {p.last_name}
                  </p>
                  <p className="text-xs text-muted-foreground">{p.email}</p>
                  {editingTeamId === p.id ? (
                    <div className="flex items-center gap-1.5 mt-1">
                      <Input
                        value={editTeamValue}
                        onChange={(e) => setEditTeamValue(e.target.value)}
                        className="h-7 text-xs w-36"
                        placeholder="Equipo"
                      />
                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => saveTeamName(p)}>
                        <Check className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditingTeamId(null)}>
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      Equipo: {p.team_name || "Sin equipo"}
                      <button onClick={() => { setEditingTeamId(p.id); setEditTeamValue(p.team_name || ""); }} className="text-primary hover:text-primary/80">
                        <Pencil className="w-3 h-3" />
                      </button>
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Check-in: {new Date(p.checked_in_at).toLocaleString("es-AR")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {p.time_value !== null && (
                    <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded font-medium">
                      <Ruler className="w-3 h-3 inline mr-0.5" />
                      {p.time_value} km
                    </span>
                  )}
                  {editingId !== p.id && (
                    <Button variant="outline" size="sm" onClick={() => startEdit(p)}>
                      Editar
                    </Button>
                  )}
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>¿Eliminar participante?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Se eliminará a {p.first_name} {p.last_name} del evento. Esta acción no se puede deshacer.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteParticipant(p.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                          Eliminar
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>

              {editingId === p.id && (
                <div className="space-y-3 border-t border-border pt-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Puntaje</label>
                      <Input
                        type="number"
                        value={editForm.score}
                        onChange={(e) => setEditForm({ ...editForm, score: e.target.value })}
                        placeholder="Ej: 85"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Distancia</label>
                      <Input
                        value={editForm.time_result}
                        onChange={(e) => setEditForm({ ...editForm, time_result: e.target.value })}
                        placeholder="Ej: 32.50 km"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Posición</label>
                      <Input
                        type="number"
                        value={editForm.position}
                        onChange={(e) => setEditForm({ ...editForm, position: e.target.value })}
                        placeholder="Ej: 1"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Comentario del staff</label>
                    <Textarea
                      value={editForm.staff_feedback}
                      onChange={(e) => setEditForm({ ...editForm, staff_feedback: e.target.value })}
                      placeholder="Feedback para el participante..."
                      rows={2}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button variant="gold" size="sm" onClick={saveEdit} disabled={saving}>
                      <Save className="w-4 h-4 mr-1" />
                      {saving ? "Guardando..." : "Guardar"}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default EventManagement;
