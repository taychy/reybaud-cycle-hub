import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Camera, CheckCircle2, MapPin } from "lucide-react";
import ConfirmarClaseDialog from "./ConfirmarClaseDialog";

interface Slot {
  id: string;
  coach_id: string;
  sede_id: string | null;
  honorario_id: string | null;
  hora_inicio: string | null;
  hora_fin: string | null;
  grupo: string | null;
  sede_nombre?: string;
}

export default function MisClasesHoy() {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [confirmadas, setConfirmadas] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Slot | null>(null);
  const [open, setOpen] = useState(false);
  const [coachId, setCoachId] = useState<string | null>(null);

  const today = new Date();
  const dow = today.getDay(); // 0..6, Sunday=0
  const fechaStr = today.toISOString().split("T")[0];

  const load = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return setLoading(false);
    const { data: coach } = await supabase.from("coaches").select("id").eq("user_id", session.user.id).maybeSingle();
    if (!coach) return setLoading(false);
    setCoachId((coach as any).id);

    const { data: agenda } = await supabase
      .from("agenda_grupal")
      .select("id, coach_id, sede_id, honorario_id, hora_inicio, hora_fin, grupo, activo, dia_semana, sedes:sede_id(nombre)")
      .eq("coach_id", (coach as any).id)
      .eq("dia_semana", dow)
      .eq("activo", true)
      .order("hora_inicio");

    const mapped: Slot[] = (agenda || []).map((a: any) => ({
      id: a.id,
      coach_id: a.coach_id,
      sede_id: a.sede_id,
      honorario_id: a.honorario_id,
      hora_inicio: a.hora_inicio,
      hora_fin: a.hora_fin,
      grupo: a.grupo,
      sede_nombre: a.sedes?.nombre,
    }));
    setSlots(mapped);

    const { data: hechas } = await supabase
      .from("clases_dictadas")
      .select("agenda_id")
      .eq("coach_id", (coach as any).id)
      .eq("fecha", fechaStr);
    setConfirmadas(new Set((hechas || []).map((h: any) => h.agenda_id).filter(Boolean)));
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) return null;
  if (slots.length === 0) return null;

  return (
    <Card className="bg-card border-border">
      <CardContent className="p-5 space-y-3">
        <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
          Mis clases de hoy
        </p>
        {slots.map((s) => {
          const done = confirmadas.has(s.id);
          return (
            <div key={s.id} className="flex items-center justify-between gap-2 p-3 rounded-lg border border-border bg-background/50">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-heading font-semibold text-sm">
                    {s.hora_inicio?.slice(0, 5)}–{s.hora_fin?.slice(0, 5)}
                  </span>
                  {s.grupo && <Badge variant="secondary" className="text-[10px]">{s.grupo}</Badge>}
                </div>
                {s.sede_nombre && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <MapPin className="w-3 h-3" /> {s.sede_nombre}
                  </p>
                )}
              </div>
              {done ? (
                <Badge variant="outline" className="gap-1">
                  <CheckCircle2 className="w-3 h-3 text-green-500" /> Confirmada
                </Badge>
              ) : (
                <Button size="sm" onClick={() => { setSelected(s); setOpen(true); }}>
                  <Camera className="w-4 h-4 mr-1" /> Confirmar
                </Button>
              )}
            </div>
          );
        })}
      </CardContent>

      <ConfirmarClaseDialog
        open={open}
        onOpenChange={setOpen}
        slot={selected}
        fecha={fechaStr}
        onConfirmed={load}
      />
    </Card>
  );
}
