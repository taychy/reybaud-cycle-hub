import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, ArrowLeft, Sparkles } from "lucide-react";
import logo from "@/assets/logo.png";
import EventWaitlistDialog from "@/components/waitlist/EventWaitlistDialog";
import { WaitlistQuestion } from "@/lib/waitlistTypes";

interface Meta {
  id: string;
  title: string;
  image_url: string | null;
  estado_publicacion: string;
  waitlist_mensaje: string | null;
  waitlist_questions: WaitlistQuestion[];
}

export default function EventWaitlistPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (!id) return;
    supabase.rpc("get_event_waitlist_meta" as any, { p_event_id: id }).then(({ data, error }) => {
      if (error || !data) {
        setNotFound(true);
      } else {
        setMeta({
          ...(data as any),
          waitlist_questions: Array.isArray((data as any).waitlist_questions)
            ? (data as any).waitlist_questions
            : [],
        });
      }
      setLoading(false);
    });
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound || !meta) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 space-y-4">
        <p className="text-muted-foreground">Este evento no tiene lista de espera activa.</p>
        <Button variant="outline" onClick={() => navigate("/eventos")}>Ver eventos</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="flex items-center gap-3 px-5 pt-5 pb-2">
        <button onClick={() => navigate(-1)} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <img src={logo} alt="Ciclismo Reybaud" className="w-8 h-8" />
      </header>

      <main className="flex-1 max-w-lg mx-auto w-full px-4 py-6 space-y-4">
        {meta.image_url && (
          <div className="rounded-lg overflow-hidden aspect-video bg-muted">
            <img src={meta.image_url} alt={meta.title} className="w-full h-full object-cover" />
          </div>
        )}
        <div>
          <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-primary/15 text-primary text-[11px] font-medium mb-2">
            <Sparkles className="w-3 h-3" /> Próximamente
          </div>
          <h1 className="text-2xl font-heading font-bold">{meta.title}</h1>
        </div>

        <Card>
          <CardContent className="py-5 space-y-3 text-sm">
            {meta.waitlist_mensaje ? (
              <p>{meta.waitlist_mensaje}</p>
            ) : (
              <p className="text-muted-foreground">
                Estamos definiendo los últimos detalles. Anotate y te avisamos por mail apenas abramos las inscripciones.
              </p>
            )}
            <Button className="w-full" onClick={() => setOpen(true)}>
              Anotarme en la lista de espera
            </Button>
          </CardContent>
        </Card>
      </main>

      <EventWaitlistDialog
        open={open}
        onOpenChange={setOpen}
        eventId={meta.id}
        eventTitle={meta.title}
        waitlistMensaje={meta.waitlist_mensaje}
        questions={meta.waitlist_questions}
      />
    </div>
  );
}
