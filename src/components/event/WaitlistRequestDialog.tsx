import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, BellRing, CheckCircle2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
  packageId: string;
  packageName: string;
  /** Datos precargados si el usuario está identificado */
  alumnoId?: string | null;
  reservationId?: string | null;
  defaultName?: string;
  defaultEmail?: string;
  defaultPhone?: string;
  generoPreferido?: "femenina" | "masculina" | "mixta" | null;
}

export function WaitlistRequestDialog({
  open, onOpenChange, eventId, packageId, packageName,
  alumnoId = null, reservationId = null,
  defaultName = "", defaultEmail = "", defaultPhone = "", generoPreferido = null,
}: Props) {
  const [nombre, setNombre] = useState(defaultName);
  const [email, setEmail] = useState(defaultEmail);
  const [telefono, setTelefono] = useState(defaultPhone);
  const [nota, setNota] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const canSubmit = !!alumnoId || (nombre.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));

  const submit = async () => {
    if (!canSubmit) return;
    setLoading(true);
    const { error } = await supabase
      .from("event_accommodation_waitlist_requests" as any)
      .insert({
        event_id: eventId,
        package_id: packageId,
        alumno_id: alumnoId,
        reservation_id: reservationId,
        prospect_nombre: alumnoId ? null : nombre.trim(),
        prospect_email: alumnoId ? null : email.trim(),
        prospect_telefono: alumnoId ? null : telefono.trim() || null,
        genero_preferido: generoPreferido,
        nota_alumno: nota.trim() || null,
      });
    setLoading(false);
    if (error) {
      toast({ title: "No se pudo enviar", description: error.message, variant: "destructive" });
      return;
    }
    setDone(true);
  };

  const close = () => {
    onOpenChange(false);
    setTimeout(() => { setDone(false); setNota(""); }, 300);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(o) : close())}>
      <DialogContent className="max-w-md">
        {done ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" /> Pedido registrado
              </DialogTitle>
              <DialogDescription>
                No hay cupo confirmado para <strong>{packageName}</strong>. Tu pedido quedó registrado — el equipo va a consultar disponibilidad con el proveedor y te va a contactar por email.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={close} className="w-full">Entendido</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <BellRing className="w-5 h-5 text-primary" /> Solicitar igual
              </DialogTitle>
              <DialogDescription>
                No hay cupo confirmado para <strong>{packageName}</strong>. Podés dejarnos tu pedido y consultamos con el proveedor si podemos abrir un lugar más.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              {!alumnoId && (
                <>
                  <div>
                    <Label>Nombre y apellido *</Label>
                    <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
                  </div>
                  <div>
                    <Label>Email *</Label>
                    <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                  <div>
                    <Label>Teléfono</Label>
                    <Input value={telefono} onChange={(e) => setTelefono(e.target.value)} />
                  </div>
                </>
              )}
              <div>
                <Label>Nota (opcional)</Label>
                <Textarea
                  placeholder="Contanos cualquier detalle: fechas, con quién compartirías, flexibilidad, etc."
                  value={nota}
                  onChange={(e) => setNota(e.target.value)}
                  rows={3}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                No garantiza que se abra el cupo. Si podemos conseguirlo, te vamos a contactar con los pasos para confirmar y pagar.
              </p>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={close} disabled={loading}>Cancelar</Button>
              <Button onClick={submit} disabled={!canSubmit || loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <BellRing className="w-4 h-4 mr-1" />}
                Enviar pedido
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
