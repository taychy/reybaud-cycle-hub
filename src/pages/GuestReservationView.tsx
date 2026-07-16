import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, MapPin, Calendar, CheckCircle, AlertCircle, Upload } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface GuestData {
  participant: {
    id: string;
    nombre: string;
    apellido: string;
    email: string;
    telefono: string | null;
    documento: string | null;
  };
  reservations: Array<{
    id: string;
    event_id: string;
    reservation_status: string;
    payment_status: string;
    amount_total: number;
    amount_paid: number;
    balance_due: number;
    currency_snapshot: string;
    package_nombre_snapshot: string;
    next_due_date: string | null;
    created_at: string;
    last_proof_uploaded_at: string | null;
    event: {
      id: string;
      title: string;
      date: string | null;
      end_date: string | null;
      image_url: string | null;
      location: string | null;
      short_description: string | null;
    } | null;
    installments: Array<{
      id: string;
      numero: number;
      monto: number;
      monto_pagado: number;
      fecha_vencimiento: string | null;
      estado: string;
    }>;
  }>;
}

const fmtMoney = (n: number, cur: string) => {
  const sym = cur === "USD" ? "USD " : cur === "EUR" ? "EUR " : "$";
  return `${sym}${Number(n || 0).toLocaleString("es-AR")}`;
};

const fmtDate = (iso: string | null) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("T")[0].split("-").map(Number);
  if (!y) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" });
};

const statusBadge = (r: GuestData["reservations"][0]) => {
  if (r.reservation_status === "confirmada" || r.payment_status === "pagado") {
    return <Badge className="bg-emerald-600/20 text-emerald-400 border-emerald-600/30"><CheckCircle className="w-3 h-3 mr-1" /> Confirmada</Badge>;
  }
  if (r.reservation_status === "pendiente_verificacion") {
    return <Badge className="bg-amber-600/20 text-amber-400 border-amber-600/30"><AlertCircle className="w-3 h-3 mr-1" /> Verificando transferencia</Badge>;
  }
  if (r.reservation_status === "pendiente_pago") {
    return <Badge className="bg-blue-600/20 text-blue-400 border-blue-600/30">Pendiente de pago</Badge>;
  }
  if (r.reservation_status === "cancelada") {
    return <Badge variant="destructive">Cancelada</Badge>;
  }
  return <Badge>{r.reservation_status}</Badge>;
};

export default function GuestReservationView() {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const paymentStatus = searchParams.get("status");
  const [data, setData] = useState<GuestData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [amounts, setAmounts] = useState<Record<string, string>>({});

  useEffect(() => {
    document.title = "Mi reserva · Reybaud";
  }, []);

  const load = async () => {
    if (!token) return;
    setLoading(true);
    const { data: res, error: err } = await supabase.rpc("get_guest_reservation_by_token", { _token: token });
    if (err) { setError("No pudimos cargar tu reserva."); setLoading(false); return; }
    if (!res) { setError("El enlace no es válido o expiró."); setLoading(false); return; }
    setData(res as unknown as GuestData);
    setLoading(false);
  };

  useEffect(() => { load(); }, [token]);

  const onUpload = async (reservationId: string, balanceDue: number) => {
    const input = fileRefs.current[reservationId];
    const file = input?.files?.[0];
    if (!file || !token) {
      toast({ title: "Seleccioná un archivo primero", variant: "destructive" });
      return;
    }
    const rawAmount = amounts[reservationId];
    const amount = Number(rawAmount);
    if (!rawAmount || !Number.isFinite(amount) || amount <= 0) {
      toast({ title: "Ingresá el monto transferido", variant: "destructive" });
      return;
    }
    if (amount > balanceDue + 0.01) {
      toast({ title: "El monto supera el saldo pendiente", variant: "destructive" });
      return;
    }
    setUploadingId(reservationId);
    try {
      const fd = new FormData();
      fd.append("reservation_id", reservationId);
      fd.append("token", token);
      fd.append("file", file);
      fd.append("amount", String(amount));
      const url = `${(supabase as any).supabaseUrl || (import.meta.env.VITE_SUPABASE_URL as string)}/functions/v1/upload-reservation-comprobante`;
      const anonKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string) || "";
      const res = await fetch(url, {
        method: "POST",
        headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
        body: fd,
      });
      const j = await res.json();
      if (!res.ok || !j?.ok) throw new Error(j?.error || "No se pudo subir el comprobante");
      toast({ title: "Comprobante enviado", description: "Te avisamos por email cuando lo validemos." });
      if (input) input.value = "";
      setAmounts((prev) => ({ ...prev, [reservationId]: "" }));
      await load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Falló la subida", variant: "destructive" });
    } finally {
      setUploadingId(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <Card className="max-w-md">
          <CardContent className="p-6 text-center space-y-3">
            <AlertCircle className="w-10 h-10 text-destructive mx-auto" />
            <p className="text-sm text-muted-foreground">{error || "No encontramos tu reserva."}</p>
            <a href="/eventos"><Button variant="outline">Ver eventos</Button></a>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { participant, reservations } = data;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6">
        <div className="text-center py-4">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Reybaud Ciclismo</p>
          <h1 className="text-2xl font-heading font-bold mt-1">Hola, {participant.nombre}</h1>
          <p className="text-sm text-muted-foreground mt-1">Tu espacio para gestionar tus reservas.</p>
        </div>

        {paymentStatus === "approved" && (
          <Card className="border-emerald-600/30 bg-emerald-600/5">
            <CardContent className="p-4 flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0" />
              <p className="text-sm">¡Pago recibido! Estamos confirmando tu reserva.</p>
            </CardContent>
          </Card>
        )}
        {paymentStatus === "pending" && (
          <Card className="border-amber-600/30 bg-amber-600/5">
            <CardContent className="p-4 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0" />
              <p className="text-sm">Tu pago está pendiente. Te avisamos cuando se acredite.</p>
            </CardContent>
          </Card>
        )}

        {reservations.length === 0 && (
          <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">Todavía no tenés reservas asociadas a este perfil.</CardContent></Card>
        )}

        {reservations.map((r) => (
          <Card key={r.id} className="overflow-hidden">
            {r.event?.image_url && (
              <img src={r.event.image_url} alt={r.event.title} className="w-full h-40 object-cover" />
            )}
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-lg">{r.event?.title}</CardTitle>
                {statusBadge(r)}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {r.event?.date && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="w-4 h-4" />
                  <span>{fmtDate(r.event.date)}{r.event.end_date ? ` → ${fmtDate(r.event.end_date)}` : ""}</span>
                </div>
              )}
              {r.event?.location && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin className="w-4 h-4" /><span>{r.event.location}</span>
                </div>
              )}
              <div className="pt-3 border-t space-y-1">
                <div className="text-xs text-muted-foreground uppercase tracking-wider">Paquete</div>
                <div className="font-medium">{r.package_nombre_snapshot}</div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center pt-3 border-t">
                <div>
                  <div className="text-xs text-muted-foreground">Total</div>
                  <div className="font-semibold">{fmtMoney(r.amount_total, r.currency_snapshot)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Pagado</div>
                  <div className="font-semibold text-emerald-500">{fmtMoney(r.amount_paid, r.currency_snapshot)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Saldo</div>
                  <div className="font-semibold text-primary">{fmtMoney(r.balance_due, r.currency_snapshot)}</div>
                </div>
              </div>

              {r.installments.length > 0 && (
                <div className="pt-3 border-t space-y-2">
                  <div className="text-xs text-muted-foreground uppercase tracking-wider">Cuotas</div>
                  {r.installments.map((i) => (
                    <div key={i.id} className="flex items-center justify-between text-sm p-2 rounded bg-muted/30">
                      <div>
                        <div className="font-medium">Cuota {i.numero}</div>
                        {i.fecha_vencimiento && <div className="text-xs text-muted-foreground">Vence {fmtDate(i.fecha_vencimiento)}</div>}
                      </div>
                      <div className="text-right">
                        <div className="font-semibold">{fmtMoney(i.monto, r.currency_snapshot)}</div>
                        <Badge variant="outline" className="text-[10px]">{i.estado}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {r.payment_status !== "pagado" && r.reservation_status !== "cancelada" && (
                <div className="pt-3 border-t space-y-2">
                  <div className="text-xs text-muted-foreground uppercase tracking-wider">
                    Comprobante de transferencia
                  </div>
                  {r.last_proof_uploaded_at ? (
                    <div className="flex items-start gap-2 p-3 rounded-md bg-primary/5 border border-primary/20">
                      <CheckCircle className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                      <div className="text-xs">
                        <p className="font-medium text-foreground">Comprobante recibido</p>
                        <p className="text-muted-foreground mt-0.5">
                          Enviado el {fmtDate(r.last_proof_uploaded_at)}. Lo estamos revisando; te avisamos por email cuando lo validemos.
                        </p>
                        <p className="text-muted-foreground mt-1">¿Necesitás reenviarlo? Adjuntá uno nuevo abajo.</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Subí tu comprobante para que verifiquemos el pago (JPG, PNG, WEBP o PDF, máx. 8MB).
                    </p>
                  )}
                  <input
                    ref={(el) => { fileRefs.current[r.id] = el; }}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    className="block w-full text-sm text-foreground file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-muted file:text-foreground hover:file:bg-muted/80"
                  />
                  <Button
                    className="w-full"
                    onClick={() => onUpload(r.id)}
                    disabled={uploadingId === r.id}
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    {uploadingId === r.id ? "Subiendo..." : "Enviar comprobante"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}

        <Card>
          <CardContent className="p-4 text-xs text-muted-foreground space-y-1">
            <p>¿Necesitás ayuda con tu reserva? Escribinos a <a className="text-primary" href="mailto:natalia@ciclismoreybaud.com">natalia@ciclismoreybaud.com</a>.</p>
            <p>Guardá este enlace: te da acceso a tu reserva sin usuario ni contraseña.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
