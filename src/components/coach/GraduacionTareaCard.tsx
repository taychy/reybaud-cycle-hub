import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageCircle, Check, GraduationCap, PhoneOff } from "lucide-react";
import { normalizePhoneAR } from "@/lib/phoneNormalize";
import type { Tarea } from "@/hooks/useTareas";

interface Props {
  tarea: Tarea;
  onDone: (t: Tarea, nota?: string) => Promise<void> | void;
}

export const GraduacionTareaCard = ({ tarea, onDone }: Props) => {
  const meta = (tarea.metadata || {}) as Record<string, any>;
  const [mensaje, setMensaje] = useState<string>(meta.mensaje_borrador || "");
  const [saving, setSaving] = useState(false);
  const telefono = normalizePhoneAR(meta.alumno_telefono);
  const hecha = tarea.estado === "hecha";

  const abrirWhatsapp = () => {
    if (!telefono) return;
    window.open(`https://wa.me/${telefono}?text=${encodeURIComponent(mensaje)}`, "_blank");
  };

  return (
    <Card className="border-border">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start gap-2">
          <GraduationCap className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">{tarea.titulo}</p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Badge variant="outline" className="text-[10px]">
                {meta.grupo_origen ?? "sin grupo"} → {meta.grupo_destino ?? "-"}
              </Badge>
              {hecha && (
                <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                  Enviado
                </Badge>
              )}
              {!telefono && (
                <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/30">
                  <PhoneOff className="w-3 h-3 mr-1" /> Sin teléfono
                </Badge>
              )}
            </div>
          </div>
        </div>

        <Textarea
          value={mensaje}
          onChange={e => setMensaje(e.target.value)}
          rows={6}
          disabled={hecha}
          className="text-sm"
          placeholder="Mensaje para el alumno"
        />

        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={abrirWhatsapp} disabled={!telefono || !mensaje.trim()}>
            <MessageCircle className="w-4 h-4 mr-1" /> Abrir WhatsApp
          </Button>
          {!hecha && (
            <Button
              size="sm"
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                try { await onDone(tarea, "Mensaje de felicitación enviado"); } finally { setSaving(false); }
              }}
            >
              <Check className="w-4 h-4 mr-1" /> Marcar enviado
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
