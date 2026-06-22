import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Link2, Copy, MessageCircle, Ban, Loader2, Eye, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { buildWhatsAppUrl } from "@/lib/contactInfo";

interface TokenRow {
  id: string;
  token: string;
  created_at: string;
  revoked_at: string | null;
  last_accessed_at: string | null;
  access_count: number;
  last_user_agent: string | null;
  last_ip: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  alumnoId: string;
  alumnoNombre: string;
  alumnoTelefono?: string | null;
}

function fmt(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function CuentaPublicLinkDialog({ open, onOpenChange, alumnoId, alumnoNombre, alumnoTelefono }: Props) {
  const [row, setRow] = useState<TokenRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("admin_get_or_create_cuenta_token" as any, { p_alumno_id: alumnoId });
    setLoading(false);
    if (error) { toast.error("No se pudo obtener el link"); return; }
    const r = Array.isArray(data) ? data[0] : data;
    setRow(r as TokenRow);
  };

  useEffect(() => {
    if (open) load();
  }, [open, alumnoId]);

  // Siempre usar dominio de producción — evita links rotos cuando se copia desde preview/lovableproject.com
  const PUBLIC_ORIGIN = "https://reybaud-app.com";
  const url = row ? `${PUBLIC_ORIGIN}/cuenta/${row.token}` : "";
  const active = row && !row.revoked_at;

  const handleCopy = async () => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    toast.success("Link copiado");
  };

  const handleWhatsApp = () => {
    if (!url) return;
    const msg = `Hola ${alumnoNombre.split(" ")[0]}, te dejo el link a tu cuenta corriente para revisar pagos pendientes: ${url}`;
    const phone = (alumnoTelefono || "").replace(/\D/g, "");
    window.open(buildWhatsAppUrl(msg, phone || undefined), "_blank");
  };

  const handleRevoke = async () => {
    if (!row) return;
    if (!confirm("¿Revocar este link? El alumno dejará de tener acceso. Podrás generar uno nuevo desde acá.")) return;
    setBusy(true);
    const { error } = await supabase.rpc("admin_revoke_cuenta_token" as any, { p_token_id: row.id });
    setBusy(false);
    if (error) { toast.error("No se pudo revocar"); return; }
    toast.success("Link revocado");
    load();
  };

  const handleRegenerate = async () => {
    if (!confirm("¿Generar un link nuevo? Esto reemplaza al anterior.")) return;
    setBusy(true);
    if (row) {
      await supabase.rpc("admin_revoke_cuenta_token" as any, { p_token_id: row.id });
    }
    await load();
    setBusy(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="w-4 h-4" /> Link de cuenta corriente
          </DialogTitle>
          <DialogDescription>
            Link único y permanente para que <strong>{alumnoNombre}</strong> revise sus pagos pendientes sin loguearse.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
            Cargando…
          </div>
        ) : !row ? (
          <p className="text-center text-sm text-muted-foreground py-6">No se pudo obtener el link.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              {active ? (
                <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Activo</Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">Revocado</Badge>
              )}
              <span className="text-[11px] text-muted-foreground">Creado {fmt(row.created_at)}</span>
            </div>

            <Input
              readOnly
              value={url}
              className="text-[11px] font-mono h-8"
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />

            {active ? (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={handleCopy}>
                  <Copy className="w-3 h-3 mr-1" />Copiar
                </Button>
                <Button size="sm" variant="outline" onClick={handleWhatsApp}>
                  <MessageCircle className="w-3 h-3 mr-1" />WhatsApp
                </Button>
                <Button size="sm" variant="outline" onClick={handleRevoke} disabled={busy} className="text-destructive ml-auto">
                  <Ban className="w-3 h-3 mr-1" />Revocar
                </Button>
              </div>
            ) : (
              <Button size="sm" onClick={handleRegenerate} disabled={busy}>
                {busy ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RefreshCw className="w-3 h-3 mr-1" />}
                Generar nuevo link
              </Button>
            )}

            <div className="border-t border-border pt-3 space-y-1 text-[11px] text-muted-foreground">
              <div className="flex items-center gap-2">
                <Eye className="w-3 h-3" />
                <span>{row.access_count} {row.access_count === 1 ? "acceso" : "accesos"}</span>
                {row.last_accessed_at && <span>· Último: {fmt(row.last_accessed_at)}</span>}
              </div>
              {row.last_ip && <div>IP último acceso: {row.last_ip}</div>}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
