import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

const schema = z.object({
  nombre: z.string().trim().min(2, "Ingresá tu nombre y apellido").max(120),
  email: z.string().trim().email("Email inválido").max(255),
  telefono: z.string().trim().max(40).optional().or(z.literal("")),
});

interface Props {
  cohortSlug: string;
  sedeId: string | null;
  sedeNombre?: string | null;
}

/** Alta a la lista de espera de un programa (por sede). No envía emails. */
export default function ProgramWaitlistForm({ cohortSlug, sedeId, sedeNombre }: Props) {
  const [form, setForm] = useState({ nombre: "", email: "", telefono: "" });
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.errors[0]?.message ?? "Datos inválidos");
      return;
    }
    setSending(true);
    const { data, error } = await supabase.rpc("join_program_waitlist" as any, {
      _cohort_slug: cohortSlug,
      _sede_id: sedeId,
      _nombre: parsed.data.nombre,
      _email: parsed.data.email,
      _telefono: parsed.data.telefono || null,
    });
    setSending(false);
    if (error || !(data as any)?.ok) {
      toast.error("No pudimos sumarte a la lista de espera. Intentá de nuevo.");
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="p-5 rounded-xl border border-cyan/40 bg-cyan/5 text-center">
        <CheckCircle2 className="w-8 h-8 text-cyan mx-auto mb-2" />
        <p className="font-semibold">Te sumamos a la lista de espera{sedeNombre ? ` de ${sedeNombre}` : ""}.</p>
        <p className="text-sm text-muted-foreground mt-1">Si se libera un lugar o abrimos una nueva edición, te contactamos.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <Label htmlFor="wl-nombre">Nombre y apellido *</Label>
        <Input id="wl-nombre" maxLength={120} value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} />
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <Label htmlFor="wl-email">Email *</Label>
          <Input id="wl-email" type="email" maxLength={255} value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
        </div>
        <div>
          <Label htmlFor="wl-tel">WhatsApp</Label>
          <Input id="wl-tel" type="tel" maxLength={40} value={form.telefono} onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))} />
        </div>
      </div>
      <Button type="submit" className="w-full" disabled={sending}>
        {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Sumarme a la lista de espera"}
      </Button>
    </form>
  );
}
