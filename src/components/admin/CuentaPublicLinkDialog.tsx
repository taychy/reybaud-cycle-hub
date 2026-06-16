import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Link2, Copy, MessageCircle, Ban, Loader2, Plus, Eye } from "lucide-react";
import { toast } from "sonner";
import { buildWhatsAppUrl } from "@/lib/contactInfo";

interface TokenRow {
  id: string;
  token: string;
  created_at: string;
  expires_at: string | null;
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

const EXPIRY_OPTIONS = [
  { value: "7", label: "7 días" },
  { value: "30", label: "30 días" },
  { value: "90", label: "90 días" },
  { value: "0", label: "Sin vencimiento" },
];

function fmt(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function CuentaPublicLinkDialog({ open, onOpenChange, alumnoId, alumnoNombre, alumnoTelefono }: Props) {
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expiry, setExpiry] = useState("30");
  const [creating, setCreating] = useState(false);

  const fetchTokens = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("cuenta_corriente_tokens" as any)
      .select("*")
      .eq("alumno_id", alumnoId)
      .order("created_at", { ascending: false });
    setTokens((data || []) as unknown as TokenRow[]);
    setLoading(false);
  };

  useEffect(() => {
    if (open) fetchTokens();
  }, [open, alumnoId]);

  const handleCreate = async () => {
    setCreating(true);
    const { data, error } = await supabase.rpc("admin_create_cuenta_token" as any, {
      p_alumno_id: alumnoId,
      p_expires_days: parseInt(expiry, 10),
    });
    setCreating(false);
    if (error) { toast.error("No se pudo generar el link"); return; }
    toast.success("Link generado");
    await fetchTokens();
    const row = Array.isArray(data) ? data[0] : data;
    if (row?.token) {
      const url = `${window.location.origin}/cuenta/${row.token}`;
      await navigator.clipboard.writeText(url).catch(() => {});
      toast.success("Link copiado al portapapeles");
    }
  };

  const handleRevoke = async (id: string) => {
    if (!confirm("¿Revocar este link? El alumno no podrá usarlo más.")) return;
    const { error } = await supabase.rpc("admin_revoke_cuenta_token" as any, { p_token_id: id });
    if (error) { toast.error("No se pudo revocar"); return; }
    toast.success("Link revocado");
    fetchTokens();
  };

  const handleCopy = async (token: string) => {
    const url = `${window.location.origin}/cuenta/${token}`;
    await navigator.clipboard.writeText(url);
    toast.success("Link copiado");
  };

  const handleWhatsApp = (token: string) => {
    const url = `${window.location.origin}/cuenta/${token}`;
    const msg = `Hola ${alumnoNombre.split(" ")[0]}, te dejo el link a tu cuenta corriente para revisar pagos pendientes: ${url}`;
    const phone = (alumnoTelefono || "").replace(/\D/g, "");
    window.open(buildWhatsAppUrl(msg, phone || undefined), "_blank");
  };

  const isActive = (t: TokenRow) =>
    !t.revoked_at && (!t.expires_at || new Date(t.expires_at) > new Date());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="w-4 h-4" /> Link público de cuenta corriente
          </DialogTitle>
          <DialogDescription>
            Generá un link seguro para que <strong>{alumnoNombre}</strong> vea sus deudas y pague sin loguearse.
          </DialogDescription>
        </DialogHeader>

        {/* Generar nuevo */}
        <div className="flex items-end gap-2 p-3 rounded-lg bg-secondary/40 border border-border">
          <div className="flex-1">
            <label className="text-xs text-muted-foreground mb-1 block">Vencimiento</label>
            <Select value={expiry} onValueChange={setExpiry}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {EXPIRY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleCreate} disabled={creating} className="h-9">
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4 mr-1" />Generar link</>}
          </Button>
        </div>

        {/* Lista */}
        <div className="space-y-2 max-h-[50vh] overflow-y-auto">
          {loading ? (
            <p className="text-center text-sm text-muted-foreground py-6">Cargando…</p>
          ) : tokens.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-6">Aún no hay links generados.</p>
          ) : (
            tokens.map((t) => {
              const active = isActive(t);
              const url = `${window.location.origin}/cuenta/${t.token}`;
              return (
                <div key={t.id} className="p-3 rounded-lg border border-border bg-card space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      {active ? (
                        <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Activo</Badge>
                      ) : t.revoked_at ? (
                        <Badge variant="outline" className="text-muted-foreground">Revocado</Badge>
                      ) : (
                        <Badge variant="outline" className="text-amber-400 border-amber-500/30">Vencido</Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        Vence: {fmt(t.expires_at) === "—" ? "nunca" : fmt(t.expires_at)}
                      </span>
                    </div>
                    {active && (
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => handleCopy(t.token)}>
                          <Copy className="w-3 h-3 mr-1" />Copiar
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleWhatsApp(t.token)}>
                          <MessageCircle className="w-3 h-3 mr-1" />WhatsApp
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleRevoke(t.id)} className="text-destructive">
                          <Ban className="w-3 h-3 mr-1" />Revocar
                        </Button>
                      </div>
                    )}
                  </div>
                  <Input readOnly value={url} className="text-[11px] font-mono h-7" onClick={(e) => (e.target as HTMLInputElement).select()} />
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground flex-wrap">
                    <span><Eye className="w-3 h-3 inline mr-1" />{t.access_count} accesos</span>
                    {t.last_accessed_at && <span>Últ.: {fmt(t.last_accessed_at)}</span>}
                    {t.last_ip && <span>IP: {t.last_ip}</span>}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
