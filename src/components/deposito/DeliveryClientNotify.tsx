import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Check, Link as LinkIcon, Mail, MessageCircle, Loader2, UserPlus, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface Alumno {
  id: string;
  nombre: string;
  apellido: string | null;
  email: string | null;
  telefono: string | null;
}

interface Props {
  listId: string;
  listTitulo: string;
  clienteNombre: string;
  items: Array<{
    id: string;
    producto: string;
    variante: any;
    cantidad: number;
    alumno_id: string | null;
    aviso_retiro_enviado_at: string | null;
    aviso_retiro_channel: string | null;
  }>;
  onChanged: () => void;
}

const REPLY_EMAIL = "natalia@ciclismoreybaud.com";

const formatVariant = (v: any): string => {
  if (!v) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object") {
    return Object.entries(v)
      .filter(([, val]) => val != null && val !== "")
      .map(([k, val]) => `${k}: ${val}`).join(" · ");
  }
  return String(v);
};

const normalizePhoneAr = (raw: string): string => {
  const digits = (raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("549")) return digits;
  if (digits.startsWith("54")) return "549" + digits.slice(2);
  if (digits.startsWith("15")) return "549" + digits.slice(2);
  if (digits.startsWith("9")) return "54" + digits;
  return "549" + digits;
};

const DeliveryClientNotify = ({ listId, listTitulo, clienteNombre, items, onChanged }: Props) => {
  const [alumno, setAlumno] = useState<Alumno | null>(null);
  const [loading, setLoading] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const [sending, setSending] = useState<null | "email" | "whatsapp">(null);

  const alumnoId = items.find(i => i.alumno_id)?.alumno_id || null;
  const notifiedAt = items.find(i => i.aviso_retiro_enviado_at)?.aviso_retiro_enviado_at || null;
  const notifiedChannel = items.find(i => i.aviso_retiro_channel)?.aviso_retiro_channel || null;

  useEffect(() => {
    if (!alumnoId) { setAlumno(null); return; }
    (async () => {
      const { data } = await supabase
        .from("alumnos")
        .select("id, nombre, apellido, email, telefono")
        .eq("id", alumnoId)
        .maybeSingle();
      setAlumno((data as any) || null);
    })();
  }, [alumnoId]);

  const missingReason = useMemo(() => {
    if (!alumno) return "Vinculá primero un alumno";
    if (!alumno.email && !alumno.telefono) return "El alumno no tiene email ni teléfono";
    return null;
  }, [alumno]);

  const sendEmail = async () => {
    if (!alumno) return;
    if (!alumno.email) { toast.error("El alumno no tiene email"); return; }
    setSending("email");
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const { error } = await supabase.functions.invoke("send-delivery-ready-pickup", {
        body: {
          list_id: listId,
          cliente_nombre: clienteNombre,
          alumno_id: alumno.id,
          channel: "email",
          actor_id: userRes.user?.id,
          actor_email: userRes.user?.email,
        },
      });
      if (error) throw error;
      toast.success(`Email enviado a ${alumno.email}`);
      onChanged();
    } catch (e: any) {
      toast.error("No se pudo enviar", { description: e.message });
    } finally {
      setSending(null);
    }
  };

  const sendWhatsApp = async () => {
    if (!alumno) return;
    if (!alumno.telefono) { toast.error("El alumno no tiene teléfono"); return; }
    const phone = normalizePhoneAr(alumno.telefono);
    const detail = items.map(i => {
      const q = (i.cantidad || 1) > 1 ? `${i.cantidad}× ` : "";
      const v = formatVariant(i.variante);
      return `• ${q}${i.producto}${v ? ` (${v})` : ""}`;
    }).join("\n");
    const msg =
      `Hola ${alumno.nombre}! Tu pedido de *${listTitulo}* ya está listo. ` +
      `Podés retirarlo en la camioneta de la escuela en tu próxima clase.\n\n` +
      `Detalle:\n${detail}\n\n` +
      `Si querés saber cuánto te resta pagar, admin se va a comunicar con vos, ` +
      `o podés escribirnos a ${REPLY_EMAIL}. ¡Nos vemos!`;
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank", "noopener,noreferrer");

    // Log the notification (server marks items + student_activity_log)
    setSending("whatsapp");
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const { error } = await supabase.functions.invoke("send-delivery-ready-pickup", {
        body: {
          list_id: listId,
          cliente_nombre: clienteNombre,
          alumno_id: alumno.id,
          channel: "whatsapp",
          actor_id: userRes.user?.id,
          actor_email: userRes.user?.email,
        },
      });
      if (error) throw error;
      onChanged();
    } catch (e: any) {
      toast.error("Aviso registrado en WhatsApp, pero no se pudo loguear", { description: e.message });
    } finally {
      setSending(null);
    }
  };

  const unlink = async () => {
    if (!confirm("¿Desvincular alumno de este cliente?")) return;
    setLoading(true);
    const { error } = await supabase
      .from("delivery_list_items")
      .update({ alumno_id: null })
      .eq("list_id", listId)
      .eq("cliente_nombre", clienteNombre);
    setLoading(false);
    if (error) return toast.error(error.message);
    setAlumno(null);
    onChanged();
  };

  return (
    <div className="mt-2 pt-2 border-t border-border/50 flex flex-wrap items-center gap-2">
      {alumno ? (
        <div className="flex items-center gap-1.5 text-xs bg-secondary/50 rounded px-2 py-1">
          <LinkIcon className="w-3 h-3 text-primary" />
          <span className="font-medium">{alumno.nombre} {alumno.apellido || ""}</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground text-[10px]">{alumno.email || "sin email"}</span>
          <button onClick={unlink} className="ml-1 text-[10px] text-muted-foreground hover:text-destructive underline">
            desvincular
          </button>
        </div>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setShowLink(true)} className="h-7 text-xs">
          <UserPlus className="w-3 h-3 mr-1" /> Vincular alumno
        </Button>
      )}

      {notifiedAt ? (
        <Badge className="bg-emerald-500/15 text-emerald-600 border border-emerald-500/30 gap-1">
          <Check className="w-3 h-3" />
          Avisado {notifiedChannel ? `(${notifiedChannel})` : ""} · {new Date(notifiedAt).toLocaleDateString("es-AR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
        </Badge>
      ) : null}

      <div className="flex gap-1.5 ml-auto">
        <Button
          variant="outline"
          size="sm"
          onClick={sendEmail}
          disabled={!alumno || !alumno.email || sending !== null}
          title={!alumno ? "Vinculá primero un alumno" : !alumno.email ? "Alumno sin email" : "Enviar email de aviso"}
          className="h-7 text-xs"
        >
          {sending === "email" ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Mail className="w-3 h-3 mr-1" />}
          {notifiedAt ? "Reenviar email" : "Avisar por email"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={sendWhatsApp}
          disabled={!alumno || !alumno.telefono || sending !== null}
          title={!alumno ? "Vinculá primero un alumno" : !alumno.telefono ? "Alumno sin teléfono" : "Abrir WhatsApp"}
          className="h-7 text-xs"
        >
          {sending === "whatsapp" ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <MessageCircle className="w-3 h-3 mr-1" />}
          WhatsApp
        </Button>
      </div>

      {missingReason && !notifiedAt && (
        <div className="w-full flex items-center gap-1 text-[10px] text-amber-600">
          <AlertCircle className="w-3 h-3" /> {missingReason}
        </div>
      )}

      <LinkAlumnoDialog
        open={showLink}
        onOpenChange={setShowLink}
        clienteNombre={clienteNombre}
        listId={listId}
        onLinked={(a) => { setAlumno(a); setShowLink(false); onChanged(); }}
      />
    </div>
  );
};

// ============= Alumno picker dialog =============
const LinkAlumnoDialog = ({
  open, onOpenChange, clienteNombre, listId, onLinked,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clienteNombre: string;
  listId: string;
  onLinked: (a: Alumno) => void;
}) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Alumno[]>([]);
  const [searching, setSearching] = useState(false);
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQuery(clienteNombre);
  }, [open, clienteNombre]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) { setResults([]); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      const parts = q.split(/\s+/).filter(Boolean);
      // Build OR filter across nombre/apellido/email
      const or = parts.length === 1
        ? `nombre.ilike.%${q}%,apellido.ilike.%${q}%,email.ilike.%${q}%`
        : `and(nombre.ilike.%${parts[0]}%,apellido.ilike.%${parts.slice(1).join(" ")}%),and(apellido.ilike.%${parts[0]}%,nombre.ilike.%${parts.slice(1).join(" ")}%),nombre.ilike.%${q}%,apellido.ilike.%${q}%,email.ilike.%${q}%`;
      const { data } = await supabase
        .from("alumnos")
        .select("id, nombre, apellido, email, telefono")
        .or(or)
        .limit(15);
      setResults((data as any) || []);
      setSearching(false);
    }, 250);
    return () => clearTimeout(timer);
  }, [query, open]);

  const link = async (a: Alumno) => {
    setLinking(true);
    const { error } = await supabase
      .from("delivery_list_items")
      .update({ alumno_id: a.id })
      .eq("list_id", listId)
      .eq("cliente_nombre", clienteNombre);
    setLinking(false);
    if (error) return toast.error(error.message);
    toast.success(`Vinculado con ${a.nombre} ${a.apellido || ""}`);
    onLinked(a);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Vincular con alumno</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Cliente: <b>{clienteNombre}</b>. Buscá y elegí el alumno correspondiente para sincronizar sus datos.
          </p>
          <Input
            autoFocus
            placeholder="Buscar por nombre, apellido o email..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="max-h-72 overflow-y-auto space-y-1">
            {searching && <p className="text-xs text-muted-foreground text-center py-2">Buscando...</p>}
            {!searching && results.length === 0 && query.length >= 2 && (
              <p className="text-xs text-muted-foreground text-center py-2">Sin resultados.</p>
            )}
            {results.map(a => (
              <button
                key={a.id}
                onClick={() => link(a)}
                disabled={linking}
                className="w-full text-left p-2 rounded hover:bg-secondary/50 border border-transparent hover:border-border transition disabled:opacity-50"
              >
                <div className="text-sm font-medium">{a.nombre} {a.apellido || ""}</div>
                <div className="text-xs text-muted-foreground flex gap-2 flex-wrap">
                  <span>{a.email || "sin email"}</span>
                  {a.telefono && <span>· {a.telefono}</span>}
                </div>
              </button>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DeliveryClientNotify;
