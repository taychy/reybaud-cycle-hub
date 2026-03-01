import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Search, Save, Copy, ExternalLink, Users, Trophy } from "lucide-react";

interface Participant {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  team_name: string;
  checked_in_at: string;
  score: number | null;
  time_result: string | null;
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

  const eventUrl = `${window.location.origin}/eventos/record-del-ahora`;

  const fetchParticipants = async () => {
    const { data, error } = await supabase
      .from("event_participants")
      .select("*")
      .eq("event_slug", "record-del-ahora")
      .order("checked_in_at", { ascending: true });

    if (!error && data) setParticipants(data as Participant[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchParticipants();
  }, []);

  const filtered = participants.filter((p) => {
    const q = search.toLowerCase();
    return (
      p.first_name.toLowerCase().includes(q) ||
      p.last_name.toLowerCase().includes(q) ||
      p.email.toLowerCase().includes(q) ||
      p.team_name.toLowerCase().includes(q)
    );
  });

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

  const copyLink = () => {
    navigator.clipboard.writeText(eventUrl);
    toast({ title: "Link copiado", description: eventUrl });
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
            29/02/2026 – 08:00 – KDT, Palermo • {participants.length} participantes
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

      {/* QR hint */}
      <div className="glass-card rounded-lg p-4 text-sm text-muted-foreground">
        <p>📱 Generá un QR con este link para que los participantes escaneen al llegar:</p>
        <code className="text-xs text-primary break-all">{eventUrl}</code>
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
                  <p className="text-xs text-muted-foreground">Equipo: {p.team_name}</p>
                  <p className="text-xs text-muted-foreground">
                    Check-in: {new Date(p.checked_in_at).toLocaleString("es-AR")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {p.score !== null && (
                    <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded font-medium">
                      <Trophy className="w-3 h-3 inline mr-0.5" />
                      {p.score}
                    </span>
                  )}
                  {editingId !== p.id && (
                    <Button variant="outline" size="sm" onClick={() => startEdit(p)}>
                      Editar
                    </Button>
                  )}
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
                      <label className="text-xs text-muted-foreground">Tiempo</label>
                      <Input
                        value={editForm.time_result}
                        onChange={(e) => setEditForm({ ...editForm, time_result: e.target.value })}
                        placeholder="Ej: 01:23:45"
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
