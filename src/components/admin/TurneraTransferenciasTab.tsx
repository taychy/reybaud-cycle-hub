import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Check, X, ExternalLink, RefreshCw } from "lucide-react";

type Row = {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  pago_monto: number | null;
  moneda_snapshot: string | null;
  comprobante_url: string | null;
  comprobante_subido_at: string | null;
  hold_expira_at: string | null;
  servicio_id: string;
  servicios_turnera?: { nombre: string } | null;
};

const fmtMoney = (n: number | null, cur: string | null) => {
  const sym = cur === "USD" ? "US$" : cur === "EUR" ? "€" : "$";
  return `${sym}${Number(n || 0).toLocaleString("es-AR")}`;
};

const TurneraTransferenciasTab = () => {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [rechazoOpen, setRechazoOpen] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [processing, setProcessing] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("reservas_turnera")
      .select("id, nombre, apellido, email, fecha, hora_inicio, hora_fin, pago_monto, moneda_snapshot, comprobante_url, comprobante_subido_at, hold_expira_at, servicio_id, servicios_turnera:servicio_id(nombre)")
      .eq("pago_estado", "comprobante_subido")
      .order("comprobante_subido_at", { ascending: true });
    const list = (data as any[]) || [];
    setRows(list);

    // Signed URLs
    const urls: Record<string, string> = {};
    await Promise.all(list.map(async (r) => {
      if (!r.comprobante_url) return;
      const { data: sig } = await supabase.storage
        .from("turnera-comprobantes")
        .createSignedUrl(r.comprobante_url, 60 * 60);
      if (sig?.signedUrl) urls[r.id] = sig.signedUrl;
    }));
    setSignedUrls(urls);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const aprobar = async (id: string) => {
    setProcessing(id);
    try {
      const { error } = await supabase.functions.invoke("admin-verificar-comprobante", {
        body: { reservation_id: id, action: "aprobar" },
      });
      if (error) throw error;
      toast({ title: "Comprobante aprobado", description: "La reserva quedó confirmada y avisamos al alumno." });
      await load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "No se pudo aprobar", variant: "destructive" });
    } finally {
      setProcessing(null);
    }
  };

  const rechazar = async () => {
    if (!rechazoOpen) return;
    setProcessing(rechazoOpen);
    try {
      const { error } = await supabase.functions.invoke("admin-verificar-comprobante", {
        body: { reservation_id: rechazoOpen, action: "rechazar", motivo },
      });
      if (error) throw error;
      toast({ title: "Comprobante rechazado", description: "Le avisamos al alumno." });
      setRechazoOpen(null);
      setMotivo("");
      await load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "No se pudo rechazar", variant: "destructive" });
    } finally {
      setProcessing(null);
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">Cargando comprobantes...</p>;
  }

  if (rows.length === 0) {
    return (
      <div className="text-center py-12 space-y-3">
        <p className="text-sm text-muted-foreground">No hay comprobantes pendientes de validación.</p>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="w-4 h-4 mr-2" /> Actualizar
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{rows.length} comprobante(s) esperando validación</p>
        <Button variant="ghost" size="sm" onClick={load}>
          <RefreshCw className="w-4 h-4 mr-2" /> Actualizar
        </Button>
      </div>

      {rows.map((r) => (
        <Card key={r.id} className="bg-card border-border">
          <CardContent className="p-4 space-y-3">
            <div className="flex justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="font-medium text-foreground">{r.nombre} {r.apellido}</div>
                <div className="text-xs text-muted-foreground">{r.email}</div>
              </div>
              <Badge variant="outline">
                {fmtMoney(r.pago_monto, r.moneda_snapshot)} {r.moneda_snapshot || "ARS"}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <div className="text-muted-foreground">Servicio</div>
                <div className="text-foreground">{r.servicios_turnera?.nombre || "—"}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Turno</div>
                <div className="text-foreground">{r.fecha} · {r.hora_inicio.slice(0,5)}</div>
              </div>
            </div>

            {signedUrls[r.id] ? (
              <a
                href={signedUrls[r.id]}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
              >
                <ExternalLink className="w-4 h-4" /> Ver comprobante
              </a>
            ) : (
              <p className="text-xs text-muted-foreground">Sin archivo.</p>
            )}

            <div className="flex gap-2 pt-2">
              <Button
                size="sm"
                onClick={() => aprobar(r.id)}
                disabled={processing === r.id}
                className="flex-1"
              >
                <Check className="w-4 h-4 mr-1" /> Aprobar
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => { setRechazoOpen(r.id); setMotivo(""); }}
                disabled={processing === r.id}
                className="flex-1"
              >
                <X className="w-4 h-4 mr-1" /> Rechazar
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}

      <Dialog open={!!rechazoOpen} onOpenChange={(o) => !o && setRechazoOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rechazar comprobante</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Contale al alumno por qué no lo aprobás (opcional):</p>
            <Textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej: El monto no coincide con la reserva."
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRechazoOpen(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={rechazar} disabled={!!processing}>
              Confirmar rechazo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TurneraTransferenciasTab;
