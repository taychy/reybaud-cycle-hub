// Página pública para completar el pago por transferencia:
// - Muestra datos bancarios, monto, concepto y countdown
// - Permite subir el comprobante (jpg/png/webp/pdf)
// - Muestra estado "comprobante_subido" cuando ya está entregado
// - Muestra "expirado" o "rechazado" con CTA de volver a reservar
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Clock, Upload, CheckCircle, AlertTriangle, Copy } from "lucide-react";
import logo from "@/assets/logo.png";

type Reserva = {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  pago_estado: string;
  pago_monto: number | null;
  moneda_snapshot: string | null;
  metodo_pago: string | null;
  hold_expira_at: string | null;
  upload_token: string | null;
  comprobante_url: string | null;
  motivo_rechazo: string | null;
  servicio_id: string;
  servicios_turnera?: { nombre: string } | null;
};

type BankCfg = { cbu: string; alias: string; titular: string; cuit: string };

const fmtMoney = (n: number, cur: string) => {
  const sym = cur === "USD" ? "US$" : cur === "EUR" ? "€" : "$";
  return `${sym}${Number(n || 0).toLocaleString("es-AR")}`;
};

const fmtDateAR = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
};

const TurneraTransferencia = () => {
  const { id } = useParams<{ id: string }>();
  const [search] = useSearchParams();
  const token = search.get("token") || "";

  const [reserva, setReserva] = useState<Reserva | null>(null);
  const [bank, setBank] = useState<BankCfg>({ cbu: "", alias: "", titular: "", cuit: "" });
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [remaining, setRemaining] = useState<number>(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const concepto = useMemo(
    () => (id ? `RESERVA-${id.slice(0, 8).toUpperCase()}` : ""),
    [id],
  );

  const load = async () => {
    if (!id) return;
    setLoading(true);
    const { data: r } = await supabase
      .from("reservas_turnera")
      .select("id, nombre, apellido, email, fecha, hora_inicio, hora_fin, pago_estado, pago_monto, moneda_snapshot, metodo_pago, hold_expira_at, upload_token, comprobante_url, motivo_rechazo, servicio_id, servicios_turnera:servicio_id(nombre)")
      .eq("id", id)
      .maybeSingle();
    setReserva((r as any) || null);

    const { data: cfg } = await supabase
      .from("app_config")
      .select("key, value")
      .in("key", ["turnera_cbu", "turnera_alias", "turnera_titular", "turnera_cuit"]);
    const map: Record<string, string> = {};
    for (const row of (cfg || [])) {
      const v = (row as any).value;
      map[(row as any).key] = typeof v === "string" ? v : (v ?? "");
    }
    setBank({
      cbu: map.turnera_cbu || "",
      alias: map.turnera_alias || "",
      titular: map.turnera_titular || "",
      cuit: map.turnera_cuit || "",
    });
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  // Countdown
  useEffect(() => {
    if (!reserva?.hold_expira_at) return;
    const tick = () => {
      const ms = new Date(reserva.hold_expira_at as string).getTime() - Date.now();
      setRemaining(Math.max(0, Math.floor(ms / 1000)));
    };
    tick();
    const id2 = setInterval(tick, 1000);
    return () => clearInterval(id2);
  }, [reserva?.hold_expira_at]);

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: `${label} copiado` });
    } catch { /* ignore */ }
  };

  const onUpload = async () => {
    if (!id || !token || !fileRef.current?.files?.[0]) {
      toast({ title: "Seleccioná un archivo primero", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("reservation_id", id);
      fd.append("token", token);
      fd.append("file", fileRef.current.files[0]);

      const url = `${(supabase as any).supabaseUrl || (import.meta.env.VITE_SUPABASE_URL as string)}/functions/v1/upload-turnera-comprobante`;
      const anonKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string) || "";
      const res = await fetch(url, {
        method: "POST",
        headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
        body: fd,
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "No se pudo subir el comprobante");
      }
      toast({ title: "Comprobante enviado", description: "Te avisamos por email cuando lo validemos." });
      await load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Falló la subida", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Cargando...</p>
      </div>
    );
  }

  if (!reserva) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Reserva no encontrada.</p>
      </div>
    );
  }

  if (!token || String(reserva.upload_token || "") !== token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-3 max-w-sm px-4">
          <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto" />
          <p className="text-sm text-muted-foreground">El link no es válido o expiró. Reservá el turno nuevamente.</p>
          <Link to="/reservar"><Button>Volver a reservar</Button></Link>
        </div>
      </div>
    );
  }

  const monto = Number(reserva.pago_monto || 0);
  const currency = String(reserva.moneda_snapshot || "ARS").toUpperCase();
  const nombreServicio = reserva.servicios_turnera?.nombre || "Reserva";

  const expirado = reserva.pago_estado === "expirado" || (remaining <= 0 && ["pendiente","pendiente_transferencia"].includes(reserva.pago_estado));
  const yaSubido = reserva.pago_estado === "comprobante_subido";
  const aprobado = reserva.pago_estado === "aprobado";
  const rechazado = reserva.pago_estado === "rechazado";

  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-3">
          <img src={logo} alt="Ciclismo Reybaud" className="w-8 h-8" />
          <h1 className="font-heading font-bold text-foreground text-sm uppercase tracking-wider">
            Pago por transferencia
          </h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {aprobado && (
          <Card className="border-emerald-500/40 bg-emerald-500/10">
            <CardContent className="p-4 flex gap-2">
              <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-foreground">Reserva confirmada</p>
                <p className="text-xs text-muted-foreground">Aprobamos tu transferencia. ¡Nos vemos!</p>
              </div>
            </CardContent>
          </Card>
        )}

        {rechazado && (
          <Card className="border-destructive/40 bg-destructive/10">
            <CardContent className="p-4 flex gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-foreground">Comprobante no aprobado</p>
                {reserva.motivo_rechazo && (
                  <p className="text-xs text-muted-foreground mt-1">Motivo: {reserva.motivo_rechazo}</p>
                )}
                <Link to="/reservar" className="inline-block mt-2">
                  <Button size="sm">Volver a reservar</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

        {expirado && !aprobado && !yaSubido && !rechazado && (
          <Card className="border-destructive/40 bg-destructive/10">
            <CardContent className="p-4 flex gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-foreground">El turno se liberó</p>
                <p className="text-xs text-muted-foreground">No recibimos el comprobante a tiempo.</p>
                <Link to="/reservar" className="inline-block mt-2">
                  <Button size="sm">Volver a reservar</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

        {yaSubido && (
          <Card className="border-primary/40 bg-primary/5">
            <CardContent className="p-4 flex gap-2">
              <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-foreground">Comprobante recibido</p>
                <p className="text-xs text-muted-foreground">Lo estamos revisando. Te vamos a avisar por email en cuanto lo validemos.</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Detalle */}
        <Card className="bg-card border-border">
          <CardContent className="p-4 space-y-2">
            <Row label="Servicio" value={nombreServicio} />
            <Row label="Fecha" value={fmtDateAR(reserva.fecha)} />
            <Row label="Horario" value={`${reserva.hora_inicio.slice(0,5)} – ${reserva.hora_fin.slice(0,5)}`} mono />
            <Row label="Monto" value={`${fmtMoney(monto, currency)} ${currency}`} strong />
          </CardContent>
        </Card>

        {!aprobado && !rechazado && !expirado && (
          <>
            {/* Countdown */}
            <Card className="bg-amber-500/10 border-amber-500/30">
              <CardContent className="p-4 flex items-center gap-3">
                <Clock className="w-5 h-5 text-amber-500" />
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground">Tiempo restante</p>
                  <p className="font-mono text-lg text-foreground">{mm}:{ss}</p>
                </div>
              </CardContent>
            </Card>

            {/* Datos bancarios */}
            <Card className="bg-card border-border">
              <CardContent className="p-4 space-y-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Datos para transferir</p>
                <BankRow label="Titular" value={bank.titular || "—"} />
                <BankRow label="CUIT" value={bank.cuit || "—"} onCopy={() => copy(bank.cuit, "CUIT")} />
                <BankRow label="CBU" value={bank.cbu || "—"} onCopy={() => copy(bank.cbu, "CBU")} />
                <BankRow label="Alias" value={bank.alias || "—"} onCopy={() => copy(bank.alias, "Alias")} />
                <BankRow label="Monto" value={`${fmtMoney(monto, currency)} ${currency}`} onCopy={() => copy(String(monto), "Monto")} strong />
                <BankRow label="Concepto sugerido" value={concepto} onCopy={() => copy(concepto, "Concepto")} />
              </CardContent>
            </Card>

            {/* Upload */}
            <Card className="bg-card border-border">
              <CardContent className="p-4 space-y-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Subir comprobante</p>
                <p className="text-xs text-muted-foreground">JPG, PNG, WEBP o PDF (máx. 8MB)</p>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  className="block w-full text-sm text-foreground file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-muted file:text-foreground hover:file:bg-muted/80"
                />
                <Button className="w-full" onClick={onUpload} disabled={uploading || yaSubido}>
                  <Upload className="w-4 h-4 mr-2" />
                  {uploading ? "Subiendo..." : yaSubido ? "Ya enviaste el comprobante" : "Enviar comprobante"}
                </Button>
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
};

const Row = ({ label, value, mono, strong }: { label: string; value: string; mono?: boolean; strong?: boolean }) => (
  <div className="flex justify-between text-sm gap-3">
    <span className="text-muted-foreground">{label}</span>
    <span className={`text-foreground text-right ${mono ? "font-mono" : ""} ${strong ? "font-bold" : "font-medium"}`}>{value}</span>
  </div>
);

const BankRow = ({ label, value, onCopy, strong }: { label: string; value: string; onCopy?: () => void; strong?: boolean }) => (
  <div className="flex items-center justify-between gap-2">
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-sm text-foreground break-all ${strong ? "font-bold" : ""}`}>{value}</div>
    </div>
    {onCopy && (
      <Button size="icon" variant="ghost" onClick={onCopy} className="shrink-0">
        <Copy className="w-4 h-4" />
      </Button>
    )}
  </div>
);

export default TurneraTransferencia;
