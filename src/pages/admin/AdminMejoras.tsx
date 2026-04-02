import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageSquarePlus, Send, CheckCheck, Bot, Lightbulb, Save } from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";

interface Mejora {
  id: string;
  autor_email: string;
  autor_nombre: string;
  mensaje: string;
  leido: boolean;
  created_at: string;
}

type AiMsg = { role: "user" | "assistant"; content: string };

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-ai-assistant`;

const AdminMejoras = () => {
  const [mejoras, setMejoras] = useState<Mejora[]>([]);
  const [mensaje, setMensaje] = useState("");
  const [sending, setSending] = useState(false);
  const [autorInfo, setAutorInfo] = useState({ email: "", nombre: "" });
  const bottomRef = useRef<HTMLDivElement>(null);

  // AI state
  const [aiMessages, setAiMessages] = useState<AiMsg[]>([]);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const aiBottomRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  };
  const scrollAiToBottom = () => {
    aiBottomRef.current?.scrollIntoView({ behavior: "smooth" });
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

  useEffect(() => {
    const channel = supabase
      .channel("mejoras-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "mejoras_sugeridas" }, () => loadMejoras())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadMejoras]);

  useEffect(() => { scrollToBottom(); }, [mejoras]);
  useEffect(() => { scrollAiToBottom(); }, [aiMessages]);

  const handleSend = async () => {
    if (!mensaje.trim()) return;
    setSending(true);
    const { error } = await supabase.from("mejoras_sugeridas").insert({
      autor_email: autorInfo.email,
      autor_nombre: autorInfo.nombre,
      mensaje: mensaje.trim(),
    } as any);
    if (error) toast.error("Error al enviar la mejora");
    else setMensaje("");
    setSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const markAsRead = async (id: string) => {
    await supabase.from("mejoras_sugeridas").update({ leido: true } as any).eq("id", id);
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("es-AR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  const isDev = (email: string) => email.toLowerCase() === "scarlett@ciclismoreybaud.com";

  // --- AI Assistant ---
  const sendAiMessage = async () => {
    if (!aiInput.trim() || aiLoading) return;
    const userMsg: AiMsg = { role: "user", content: aiInput.trim() };
    const updatedMessages = [...aiMessages, userMsg];
    setAiMessages(updatedMessages);
    setAiInput("");
    setAiLoading(true);

    let assistantSoFar = "";

    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: updatedMessages }),
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.error || `Error ${resp.status}`);
      }

      if (!resp.body) throw new Error("No stream body");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              assistantSoFar += content;
              const finalContent = assistantSoFar;
              setAiMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === "assistant") {
                  return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: finalContent } : m);
                }
                return [...prev, { role: "assistant", content: finalContent }];
              });
            }
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }
    } catch (e: any) {
      toast.error(e.message || "Error al contactar el asistente");
      // Remove user message if no response
      if (!assistantSoFar) {
        setAiMessages(prev => prev.slice(0, -1));
      }
    }
    setAiLoading(false);
  };

  const handleAiKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendAiMessage(); }
  };

  const saveAsSuggestion = async (content: string) => {
    const { error } = await supabase.from("mejoras_sugeridas").insert({
      autor_email: autorInfo.email,
      autor_nombre: `${autorInfo.nombre} (vía Asistente AI)`,
      mensaje: content,
    } as any);
    if (error) toast.error("Error al guardar la mejora");
    else toast.success("Mejora guardada en el canal");
  };

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-heading font-bold uppercase tracking-wider">
          Canal de Mejoras
        </h1>
        <p className="text-sm text-muted-foreground">
          Comunicación con el equipo de desarrollo y asistente inteligente
        </p>
      </div>

      <Tabs defaultValue="ai" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="ai" className="flex items-center gap-2">
            <Bot className="w-4 h-4" /> Asistente AI
          </TabsTrigger>
          <TabsTrigger value="mejoras" className="flex items-center gap-2">
            <Lightbulb className="w-4 h-4" /> Mejoras
            {mejoras.filter(m => !m.leido && !isDev(m.autor_email) && m.autor_email !== autorInfo.email).length > 0 && (
              <Badge variant="destructive" className="text-[10px] h-4 px-1">
                {mejoras.filter(m => !m.leido && !isDev(m.autor_email) && m.autor_email !== autorInfo.email).length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* AI Assistant Tab */}
        <TabsContent value="ai">
          <Card className="border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-heading font-bold uppercase tracking-wider flex items-center gap-2">
                <Bot className="w-4 h-4 text-primary" />
                Asistente de la App
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Preguntá sobre cualquier funcionalidad de la app. Si el asistente sugiere una mejora, podés guardarla.
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <div className="h-[50vh] overflow-y-auto px-4 py-3 space-y-3">
                {aiMessages.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-sm gap-3">
                    <Bot className="w-10 h-10 opacity-30" />
                    <p>¿En qué puedo ayudarte?</p>
                    <div className="flex flex-wrap gap-2 justify-center max-w-md">
                      {[
                        "¿Cómo asigno un plan a un alumno?",
                        "¿Cómo funciona el sistema de descuentos?",
                        "¿Cómo registro un pago en efectivo?",
                        "¿Cómo publico los entrenamientos del mes?",
                      ].map(q => (
                        <button
                          key={q}
                          onClick={() => { setAiInput(q); }}
                          className="text-xs bg-muted hover:bg-accent rounded-full px-3 py-1.5 transition-colors text-left"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {aiMessages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] rounded-lg px-3 py-2 ${
                      m.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}>
                      {m.role === "assistant" ? (
                        <div className="prose prose-sm dark:prose-invert max-w-none text-sm [&>p]:my-1 [&>ul]:my-1 [&>ol]:my-1">
                          <ReactMarkdown>{m.content}</ReactMarkdown>
                        </div>
                      ) : (
                        <p className="text-sm whitespace-pre-wrap">{m.content}</p>
                      )}
                      {m.role === "assistant" && i === aiMessages.length - 1 && !aiLoading && (
                        <div className="flex justify-end mt-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-[10px] gap-1 opacity-60 hover:opacity-100"
                            onClick={() => saveAsSuggestion(m.content)}
                          >
                            <Save className="w-3 h-3" /> Guardar como mejora
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {aiLoading && aiMessages[aiMessages.length - 1]?.role !== "assistant" && (
                  <div className="flex justify-start">
                    <div className="bg-muted rounded-lg px-3 py-2">
                      <div className="flex gap-1">
                        <span className="w-2 h-2 bg-foreground/30 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="w-2 h-2 bg-foreground/30 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="w-2 h-2 bg-foreground/30 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={aiBottomRef} />
              </div>
              <div className="border-t border-border px-4 py-3">
                <div className="flex gap-2">
                  <Textarea
                    value={aiInput}
                    onChange={(e) => setAiInput(e.target.value)}
                    onKeyDown={handleAiKeyDown}
                    placeholder="Preguntá sobre la app..."
                    className="min-h-[44px] max-h-[120px] resize-none"
                    rows={1}
                  />
                  <Button
                    onClick={sendAiMessage}
                    disabled={!aiInput.trim() || aiLoading}
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
        </TabsContent>

        {/* Mejoras Tab */}
        <TabsContent value="mejoras">
          <Card className="border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-heading font-bold uppercase tracking-wider flex items-center gap-2">
                <MessageSquarePlus className="w-4 h-4 text-primary" />
                Sugerencias y Mejoras
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
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
                    <div key={m.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] rounded-lg px-3 py-2 ${
                        isMe ? "bg-primary text-primary-foreground"
                          : devMsg ? "bg-accent/50 border border-accent"
                          : "bg-muted"
                      }`}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium opacity-80">{m.autor_nombre}</span>
                          {devMsg && (
                            <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">DEV</Badge>
                          )}
                        </div>
                        <p className="text-sm whitespace-pre-wrap">{m.mensaje}</p>
                        <div className="flex items-center justify-end gap-1 mt-1">
                          <span className="text-[10px] opacity-60">{formatDate(m.created_at)}</span>
                          {m.leido && <CheckCheck className="w-3 h-3 opacity-60" />}
                        </div>
                        {!isMe && !m.leido && (
                          <button onClick={() => markAsRead(m.id)} className="text-[10px] opacity-50 hover:opacity-100 mt-1">
                            Marcar como leído
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>
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
                  <Button onClick={handleSend} disabled={!mensaje.trim() || sending} size="icon" className="shrink-0 self-end">
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Enter para enviar · Shift+Enter para nueva línea
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminMejoras;
