import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { FileText, Pencil, ShieldCheck, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

type Alumno = Tables<"alumnos">;

interface Props {
  alumno: Alumno;
  onUpdate: (a: Alumno) => void;
  readOnly?: boolean;
}

const CONDICIONES = [
  { value: "consumidor_final", label: "Consumidor Final" },
  { value: "monotributo", label: "Monotributo" },
  { value: "responsable_inscripto", label: "Responsable Inscripto" },
  { value: "exento", label: "Exento" },
];

const condLabel = (v?: string | null) =>
  CONDICIONES.find((c) => c.value === v)?.label || "Consumidor Final";

/** Calcula el dígito verificador de un CUIT/CUIL argentino. */
function cuitDV(first10: string): number {
  const mult = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = first10
    .split("")
    .reduce((acc, d, i) => acc + parseInt(d, 10) * mult[i], 0);
  const mod = 11 - (sum % 11);
  if (mod === 11) return 0;
  if (mod === 10) return 9;
  return mod;
}

function isValidCuit(c: string): boolean {
  if (!/^\d{11}$/.test(c)) return false;
  return cuitDV(c.slice(0, 10)) === parseInt(c[10], 10);
}

export function BillingDataSelfSection({ alumno, onUpdate, readOnly }: Props) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);

  // Detectar tipo de doc inicial (sino 'dni' por defecto)
  const initialTipo: "dni" | "cuit" =
    (alumno.tipo_documento as "dni" | "cuit") ||
    ((alumno.documento || "").replace(/\D/g, "").length === 11 ? "cuit" : "dni");

  const [tipo, setTipo] = useState<"dni" | "cuit">(initialTipo);
  const [numero, setNumero] = useState((alumno.documento || "").replace(/\D/g, ""));
  const [nombreFiscal, setNombreFiscal] = useState(alumno.nombre_fiscal || "");
  const [condicion, setCondicion] = useState(alumno.condicion_fiscal || "consumidor_final");
  const [domicilio, setDomicilio] = useState(alumno.domicilio_fiscal || "");
  const [verifiedNow, setVerifiedNow] = useState<boolean>(!!alumno.afip_verificado_at);

  const numeroOk = useMemo(() => {
    if (tipo === "dni") return /^\d{7,9}$/.test(numero);
    return isValidCuit(numero);
  }, [tipo, numero]);

  const dataComplete = !!alumno.documento && !!alumno.condicion_fiscal;
  const verifiedBadge = !!alumno.afip_verificado_at && alumno.tipo_documento === "cuit";

  const reset = () => {
    setTipo(initialTipo);
    setNumero((alumno.documento || "").replace(/\D/g, ""));
    setNombreFiscal(alumno.nombre_fiscal || "");
    setCondicion(alumno.condicion_fiscal || "consumidor_final");
    setDomicilio(alumno.domicilio_fiscal || "");
    setVerifiedNow(!!alumno.afip_verificado_at);
  };

  const handleVerify = async () => {
    if (tipo !== "cuit" || !isValidCuit(numero)) {
      toast.error("Ingresá un CUIT válido de 11 dígitos");
      return;
    }
    setVerifying(true);
    try {
      const { data, error } = await supabase.functions.invoke("consultar-padron-afip", {
        body: { cuit: numero, alumno_id: alumno.id },
      });
      if (error || (data as any)?.error) {
        const msg = (data as any)?.error || error?.message || "Error consultando AFIP";
        toast.error(msg);
        return;
      }
      const persona = (data as any).persona;
      if (persona?.nombre) setNombreFiscal(persona.nombre);
      if (persona?.condicion_fiscal) setCondicion(persona.condicion_fiscal);
      if (persona?.domicilio) setDomicilio(persona.domicilio);
      setVerifiedNow(true);
      toast.success("Datos verificados en AFIP ✓");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setVerifying(false);
    }
  };

  const handleSave = async () => {
    if (numero && !numeroOk) {
      toast.error(
        tipo === "cuit"
          ? "El CUIT debe tener 11 dígitos y dígito verificador válido"
          : "El DNI debe tener entre 7 y 9 dígitos",
      );
      return;
    }
    setSaving(true);
    const payload: Partial<Alumno> = {
      tipo_documento: tipo,
      documento: numero || null,
      nombre_fiscal: nombreFiscal.trim() || null,
      condicion_fiscal: condicion,
      domicilio_fiscal: domicilio.trim() || null,
    };
    // Si cambió el número manualmente respecto a lo verificado, invalidamos el badge
    if (tipo !== "cuit" || numero !== (alumno.documento || "")) {
      if (!verifiedNow) (payload as any).afip_verificado_at = null;
    }
    const { data, error } = await supabase
      .from("alumnos")
      .update(payload as any)
      .eq("id", alumno.id)
      .select()
      .single();
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Datos de facturación guardados");
    onUpdate(data as Alumno);
    setOpen(false);
  };

  return (
    <div id="datos-facturacion" className="space-y-3">
      <h3 className="text-sm font-heading font-semibold uppercase tracking-wider text-muted-foreground px-1">
        Datos de facturación
      </h3>

      <div className="rounded-xl border border-border bg-card/80 backdrop-blur-sm overflow-hidden">
        <div className="flex items-start gap-3 p-4">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-medium text-foreground">
                {dataComplete ? "Datos cargados" : "Sin completar"}
              </p>
              {verifiedBadge && (
                <Badge variant="default" className="text-[10px] gap-1">
                  <ShieldCheck className="w-3 h-3" /> Verificado en AFIP
                </Badge>
              )}
              {!dataComplete && (
                <Badge variant="outline" className="text-[10px] gap-1 border-amber-500/40 text-amber-500">
                  <AlertTriangle className="w-3 h-3" /> Incompleto
                </Badge>
              )}
            </div>
            {dataComplete ? (
              <div className="text-xs text-muted-foreground space-y-0.5 mt-1">
                <p>
                  {alumno.tipo_documento === "cuit" ? "CUIT" : "DNI"} {alumno.documento}
                </p>
                {alumno.nombre_fiscal && <p>{alumno.nombre_fiscal}</p>}
                <p>{condLabel(alumno.condicion_fiscal)}</p>
                {alumno.domicilio_fiscal && <p>{alumno.domicilio_fiscal}</p>}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground mt-1">
                Cargá tus datos para que las facturas salgan a tu nombre. Si no los completás se emiten como Consumidor Final.
              </p>
            )}
          </div>
          {!readOnly && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { reset(); setOpen(true); }}
            >
              <Pencil className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Datos de facturación</DialogTitle>
            <DialogDescription>
              Estos datos se usan para emitir tu factura. Podés dejarlos vacíos y se emitirá como Consumidor Final.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tipo de documento</Label>
              <RadioGroup
                value={tipo}
                onValueChange={(v) => { setTipo(v as "dni" | "cuit"); setVerifiedNow(false); }}
                className="flex gap-4"
              >
                <label className="flex items-center gap-2 cursor-pointer">
                  <RadioGroupItem value="dni" id="rb-dni" /> <span className="text-sm">DNI</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <RadioGroupItem value="cuit" id="rb-cuit" /> <span className="text-sm">CUIT</span>
                </label>
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label htmlFor="numero">Número</Label>
              <Input
                id="numero"
                inputMode="numeric"
                placeholder={tipo === "cuit" ? "11 dígitos sin puntos ni guiones" : "8 dígitos sin puntos"}
                value={numero}
                onChange={(e) => { setNumero(e.target.value.replace(/\D/g, "")); setVerifiedNow(false); }}
                maxLength={tipo === "cuit" ? 11 : 9}
              />
              {numero && !numeroOk && (
                <p className="text-xs text-destructive">
                  {tipo === "cuit"
                    ? "CUIT inválido (11 dígitos y dígito verificador)"
                    : "DNI inválido (7 a 9 dígitos)"}
                </p>
              )}
              {tipo === "dni" && (
                <p className="text-xs text-muted-foreground">
                  Si solo tenés DNI está perfecto, se factura con tu DNI. Para verificar contra AFIP hace falta CUIT (11 dígitos). Si no lo recordás, podés calcularlo en afip.gob.ar.
                </p>
              )}
              {tipo === "cuit" && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={handleVerify}
                  disabled={!isValidCuit(numero) || verifying}
                >
                  {verifying ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Consultando AFIP…</>
                  ) : (
                    <><ShieldCheck className="w-4 h-4 mr-2" /> Verificar en AFIP</>
                  )}
                </Button>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="razon">
                Nombre / Razón social fiscal
                {verifiedNow && (
                  <Badge variant="default" className="ml-2 text-[10px] gap-1">
                    <ShieldCheck className="w-3 h-3" /> AFIP
                  </Badge>
                )}
              </Label>
              <Input
                id="razon"
                placeholder="Como figura en AFIP"
                value={nombreFiscal}
                onChange={(e) => setNombreFiscal(e.target.value)}
                disabled={verifiedNow}
              />
            </div>

            <div className="space-y-2">
              <Label>Condición fiscal</Label>
              <Select value={condicion} onValueChange={setCondicion} disabled={verifiedNow}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONDICIONES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="dom">Domicilio fiscal (opcional)</Label>
              <Input
                id="dom"
                placeholder="Calle, número, localidad, provincia"
                value={domicilio}
                onChange={(e) => setDomicilio(e.target.value)}
                disabled={verifiedNow}
              />
            </div>

            {verifiedNow && (
              <button
                type="button"
                className="text-xs text-muted-foreground underline"
                onClick={() => setVerifiedNow(false)}
              >
                Editar manualmente (perderá la marca de verificación)
              </button>
            )}
          </div>

          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
