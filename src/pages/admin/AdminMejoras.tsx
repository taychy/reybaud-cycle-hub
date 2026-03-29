import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { MessageSquarePlus, Send, CheckCheck } from "lucide-react";
import { toast } from "sonner";

interface Mejora {
  id: string;
  autor_email: string;
  autor_nombre: string;
  mensaje: string;
  leido: boolean;
  created_at: string;
}

const AdminMejoras = () => {
  const [mejoras, setMejoras] = useState<Mejora[]>([]);
  const [mensaje, setMensaje] = useState("");
  const [sending, setSending] = useState(false);
  const [autorInfo, setAutorInfo] = useState({ email: "", nombre: "" });
  const bottomRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const loadMejoras = useCallback(async () => {
    const { data } = await supabase
      .from("mejoras_sugeridas")
      .select("*")
      .order("created_at", { ascending: true });
    if (data) setMejoras(data as Mejora[]);
  }, []);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: profile } = await supabase
          .from("admin_profiles")
          .select("first_name, last_name, email")
          .eq("user_id", session.user.id)
          .single();
        if (profile) {
          setAutorInfo({
            email: profile.email,
            nombre: `${profile.first_name} ${profile.last_name}`,
          });
        }
      }
      await loadMejoras();
    };
    init();
  }, [loadMejoras]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("mejoras-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "mejoras_sugeridas" },
        () => {
          loadMejoras();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadMejoras]);

  // Auto-scroll on new messages
  useEffect(() => {
    scrollToBottom();
  }, [mejoras]);

  const handleSend = async () => {
    if (!mensaje.trim()) return;
    setSending(true);
    const { error } = await supabase.from("mejoras_sugeridas").insert({
      autor_email: autorInfo.email,
      autor_nombre: autorInfo.nombre,
      mensaje: mensaje.trim(),
    } as any);

    if (error) {
      toast.error("Error al enviar la mejora");
    } else {
      setMensaje("");
    }
    setSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const markAsRead = async (id: string) => {
    await supabase
      .from("mejoras_sugeridas")
      .update({ leido: true } as any)
      .eq("id", id);
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const isDev = (email: string) => email.toLowerCase() === "scarlett@ciclismoreybaud.com";

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-heading font-bold uppercase tracking-wider">
          Canal de Mejoras
        </h1>
        <p className="text-sm text-muted-foreground">
          Comunicación en tiempo real con el equipo de desarrollo
        </p>
      </div>

      <Card className="border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-heading font-bold uppercase tracking-wider flex items-center gap-2">
            <MessageSquarePlus className="w-4 h-4 text-primary" />
            Sugerencias y Mejoras
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {/* Messages area */}
          <div className="h-[50vh] overflow-y-auto px-4 py-3 space-y-3">
            {mejoras.length === 0 && (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                No hay mensajes aún. Escribí la primera mejora 💡
              </div>
            )}
            {mejoras.map((m) => {
              const isMe = m.autor_email === autorInfo.email;
              const devMsg = isDev(m.autor_email);
              return (
                <div
                  key={m.id}
                  className={`flex ${isMe ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg px-3 py-2 ${
                      isMe
                        ? "bg-primary text-primary-foreground"
                        : devMsg
                        ? "bg-accent/50 border border-accent"
                        : "bg-muted"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium opacity-80">
                        {m.autor_nombre}
                      </span>
                      {devMsg && (
                        <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">
                          DEV
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{m.mensaje}</p>
                    <div className="flex items-center justify-end gap-1 mt-1">
                      <span className="text-[10px] opacity-60">
                        {formatDate(m.created_at)}
                      </span>
                      {m.leido && (
                        <CheckCheck className="w-3 h-3 opacity-60" />
                      )}
                    </div>
                    {!isMe && !m.leido && (
                      <button
                        onClick={() => markAsRead(m.id)}
                        className="text-[10px] opacity-50 hover:opacity-100 mt-1"
                      >
                        Marcar como leído
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          {/* Input area */}
          <div className="border-t border-border px-4 py-3">
            <div className="flex gap-2">
              <Textarea
                value={mensaje}
                onChange={(e) => setMensaje(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Escribí una mejora o sugerencia..."
                className="min-h-[44px] max-h-[120px] resize-none"
                rows={1}
              />
              <Button
                onClick={handleSend}
                disabled={!mensaje.trim() || sending}
                size="icon"
                className="shrink-0 self-end"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              Enter para enviar · Shift+Enter para nueva línea
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminMejoras;
