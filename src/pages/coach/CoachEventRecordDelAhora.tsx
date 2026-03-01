import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import logo from "@/assets/logo.png";
import {
  ArrowLeft, Users, Trophy, Mail, Search, Check, X, Clock,
  ChevronDown, ChevronUp, Send, CalendarDays, MapPin,
} from "lucide-react";

interface Participant {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  team_name: string;
  status: string;
  checked_in_at: string;
  time_value: number | null;
  time_result: string | null;
  participant_comment: string | null;
  evidence_url: string | null;
  score: number | null;
  position: number | null;
  staff_feedback: string | null;
  approved_at: string | null;
  approved_by: string | null;
  rejection_reason: string | null;
  public_access_token: string;
  last_request_email_sent_at: string | null;
  request_email_count: number;
}

type Tab = "participantes" | "ranking";

const statusConfig: Record<string, { label: string; color: string }> = {
  checked_in: { label: "Presente", color: "bg-secondary text-secondary-foreground" },
  result_submitted: { label: "Resultado enviado", color: "bg-primary/20 text-primary" },
  approved: { label: "Aprobado", color: "bg-green-500/20 text-green-400" },
  rejected: { label: "Rechazado", color: "bg-destructive/20 text-destructive" },
};

const CoachEventRecordDelAhora = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Tab>("participantes");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [sendingAll, setSendingAll] = useState(false);

  useEffect(() => {
    const checkCoach = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/admin/login"); return; }
      const { data: isCoach } = await supabase.rpc("has_role", {
        _user_id: session.user.id,
        _role: "coach" as any,
      });
      if (!isCoach) { navigate("/admin/login"); return; }
      await fetchParticipants();
      setLoading(false);
    };
    checkCoach();
  }, [navigate]);

  const fetchParticipants = async () => {
    const { data, error } = await supabase
      .from("event_participants")
      .select("*")
      .eq("event_slug", "record-del-ahora")
      .order("checked_in_at", { ascending: true });
    if (!error && data) setParticipants(data as unknown as Participant[]);
  };

  const filtered = participants.filter((p) => {
    const q = search.toLowerCase();
    return (
      p.first_name.toLowerCase().includes(q) ||
      p.last_name.toLowerCase().includes(q) ||
      p.email.toLowerCase().includes(q) ||
      p.team_name.toLowerCase().includes(q)
    );
  });

  const canSendEmail = (p: Participant) => {
    if (!p.last_request_email_sent_at) return true;
    const diff = Date.now() - new Date(p.last_request_email_sent_at).getTime();
    return diff > 60000; // 60 seconds
  };

  const sendResultRequestEmail = async (p: Participant) => {
    if (!canSendEmail(p)) {
      toast({ title: "Esperá", description: "Debés esperar 60 segundos entre envíos.", variant: "destructive" });
      return;
    }
    setActionLoading(p.id);
    try {
      const { error: fnError } = await supabase.functions.invoke("send-result-request-email", {
        body: {
          email: p.email,
          first_name: p.first_name,
          token: p.public_access_token,
        },
      });
      if (fnError) throw fnError;

      await supabase
        .from("event_participants")
        .update({
          last_request_email_sent_at: new Date().toISOString(),
          request_email_count: (p.request_email_count || 0) + 1,
        } as any)
        .eq("id", p.id);

      toast({ title: "Mail enviado", description: `Se envió a ${p.email}` });
      await fetchParticipants();
    } catch (err) {
      console.error(err);
      toast({ title: "Error", description: "No se pudo enviar el mail.", variant: "destructive" });
    }
    setActionLoading(null);
  };

  const sendToAll = async () => {
    const pending = participants.filter(
      (p) => p.status === "checked_in" && canSendEmail(p)
    );
    if (pending.length === 0) {
      toast({ title: "Sin pendientes", description: "No hay participantes sin resultado que puedan recibir mail." });
      return;
    }
    setSendingAll(true);
    let sent = 0;
    for (const p of pending) {
      try {
        await supabase.functions.invoke("send-result-request-email", {
          body: { email: p.email, first_name: p.first_name, token: p.public_access_token },
        });
        await supabase
          .from("event_participants")
          .update({
            last_request_email_sent_at: new Date().toISOString(),
            request_email_count: (p.request_email_count || 0) + 1,
          } as any)
          .eq("id", p.id);
        sent++;
      } catch {}
    }
    toast({ title: "Listo", description: `Se enviaron ${sent} mails.` });
    await fetchParticipants();
    setSendingAll(false);
  };

  const approveResult = async (p: Participant) => {
    setActionLoading(p.id);
    const { data: { session } } = await supabase.auth.getSession();
    await supabase
      .from("event_participants")
      .update({
        status: "approved",
        approved_at: new Date().toISOString(),
        approved_by: session?.user.id || null,
        results_updated_at: new Date().toISOString(),
      } as any)
      .eq("id", p.id);
    toast({ title: "Aprobado", description: `Resultado de ${p.first_name} aprobado.` });
    await fetchParticipants();
    setExpandedId(null);
    setActionLoading(null);
  };

  const rejectResult = async (p: Participant) => {
    if (!rejectionReason.trim()) {
      toast({ title: "Motivo requerido", description: "Escribí un motivo de rechazo.", variant: "destructive" });
      return;
    }
    setActionLoading(p.id);
    await supabase
      .from("event_participants")
      .update({
        status: "rejected",
        rejection_reason: rejectionReason.trim(),
        time_value: null,
        time_result: null,
        participant_comment: null,
        results_updated_at: new Date().toISOString(),
      } as any)
      .eq("id", p.id);
    toast({ title: "Rechazado", description: `Resultado de ${p.first_name} rechazado.` });
    setRejectionReason("");
    await fetchParticipants();
    setExpandedId(null);
    setActionLoading(null);
  };

  // Ranking: only approved, sorted by time_value ASC
  const ranking = participants
    .filter((p) => p.status === "approved" && p.time_value !== null)
    .sort((a, b) => (a.time_value ?? 0) - (b.time_value ?? 0))
    .map((p, i) => ({ ...p, rank: i + 1 }));

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground animate-pulse">Cargando...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/coach")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <img src={logo} alt="Reybaud" className="w-8 h-8 rounded-full" />
          <div className="flex-1">
            <h1 className="font-heading font-bold text-foreground text-sm uppercase tracking-wider">
              Record del Ahora
            </h1>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <CalendarDays className="w-3 h-3" /> 29/02/2026
              <Clock className="w-3 h-3 ml-1" /> 08:00
              <MapPin className="w-3 h-3 ml-1" /> KDT
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-5">
        {/* Tabs */}
        <div className="flex gap-2">
          <Button
            variant={tab === "participantes" ? "default" : "outline"}
            size="sm"
            onClick={() => setTab("participantes")}
            className="flex-1"
          >
            <Users className="w-4 h-4 mr-1.5" /> Participantes ({participants.length})
          </Button>
          <Button
            variant={tab === "ranking" ? "default" : "outline"}
            size="sm"
            onClick={() => setTab("ranking")}
            className="flex-1"
          >
            <Trophy className="w-4 h-4 mr-1.5" /> Ranking ({ranking.length})
          </Button>
        </div>

        {tab === "participantes" && (
          <>
            {/* Send to all button */}
            <Button
              variant="gold"
              className="w-full h-12"
              onClick={sendToAll}
              disabled={sendingAll}
            >
              <Mail className="w-4 h-4 mr-2" />
              {sendingAll ? "Enviando..." : "Pedir resultados por mail"}
            </Button>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Participant list */}
            <div className="space-y-3">
              {filtered.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No hay participantes.
                </div>
              ) : (
                filtered.map((p) => {
                  const st = statusConfig[p.status] || statusConfig.checked_in;
                  const isExpanded = expandedId === p.id;

                  return (
                    <div
                      key={p.id}
                      className="bg-card border border-border rounded-xl p-4 space-y-3"
                    >
                      {/* Row header */}
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <p className="font-semibold text-foreground">
                            {p.first_name} {p.last_name}
                          </p>
                          <p className="text-xs text-muted-foreground">{p.team_name}</p>
                        </div>
                        <Badge className={`${st.color} text-xs`}>
                          {st.label}
                        </Badge>
                      </div>

                      {/* Action buttons row */}
                      <div className="flex gap-2 flex-wrap">
                        {p.status === "checked_in" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => sendResultRequestEmail(p)}
                            disabled={actionLoading === p.id || !canSendEmail(p)}
                          >
                            <Send className="w-3.5 h-3.5 mr-1" />
                            {actionLoading === p.id ? "Enviando..." : "Pedir resultado"}
                          </Button>
                        )}

                        {(p.status === "result_submitted" || p.status === "approved" || p.status === "rejected") && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setExpandedId(isExpanded ? null : p.id);
                              setRejectionReason("");
                            }}
                          >
                            {isExpanded ? (
                              <><ChevronUp className="w-3.5 h-3.5 mr-1" /> Cerrar</>
                            ) : (
                              <><ChevronDown className="w-3.5 h-3.5 mr-1" /> Ver detalle</>
                            )}
                          </Button>
                        )}
                      </div>

                      {/* Expanded detail */}
                      {isExpanded && (
                        <div className="border-t border-border pt-3 space-y-3">
                          <div className="space-y-1.5 text-sm">
                            {p.time_result && (
                              <p><span className="text-muted-foreground">Tiempo:</span> {p.time_result}</p>
                            )}
                            {p.time_value !== null && (
                              <p><span className="text-muted-foreground">Valor (seg):</span> {p.time_value}</p>
                            )}
                            {p.participant_comment && (
                              <p><span className="text-muted-foreground">Comentario:</span> {p.participant_comment}</p>
                            )}
                            {p.rejection_reason && (
                              <p className="text-destructive text-xs">Motivo rechazo: {p.rejection_reason}</p>
                            )}
                          </div>

                          {p.status === "result_submitted" && (
                            <div className="space-y-3">
                              <div className="flex gap-2">
                                <Button
                                  variant="default"
                                  size="sm"
                                  onClick={() => approveResult(p)}
                                  disabled={actionLoading === p.id}
                                  className="flex-1"
                                >
                                  <Check className="w-4 h-4 mr-1" />
                                  {actionLoading === p.id ? "..." : "Aprobar"}
                                </Button>
                              </div>
                              <div className="space-y-2">
                                <Textarea
                                  placeholder="Motivo de rechazo (obligatorio)..."
                                  value={rejectionReason}
                                  onChange={(e) => setRejectionReason(e.target.value)}
                                  rows={2}
                                />
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => rejectResult(p)}
                                  disabled={actionLoading === p.id}
                                  className="w-full"
                                >
                                  <X className="w-4 h-4 mr-1" />
                                  Rechazar
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}

        {tab === "ranking" && (
          <div className="space-y-3">
            {ranking.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No hay resultados aprobados todavía.
              </div>
            ) : (
              ranking.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between bg-card border border-border rounded-xl p-4"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-heading font-bold text-primary text-lg w-8 text-center">
                      {p.rank}
                    </span>
                    <div>
                      <p className="font-semibold text-foreground text-sm">
                        {p.first_name} {p.last_name}
                      </p>
                      <p className="text-xs text-muted-foreground">{p.team_name}</p>
                    </div>
                  </div>
                  <span className="font-mono font-semibold text-foreground">
                    {p.time_result || `${p.time_value}s`}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default CoachEventRecordDelAhora;
