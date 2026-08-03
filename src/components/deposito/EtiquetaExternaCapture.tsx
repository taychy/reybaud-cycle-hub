import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Camera, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

export const ORIGENES = [
  { value: "tienda_nube", label: "Tienda Nube" },
  { value: "mercado_libre", label: "Mercado Libre" },
  { value: "instagram", label: "Instagram" },
  { value: "otro", label: "Otra tienda" },
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Si viene, el pedido se agrega automáticamente a esa carga de camioneta. */
  cargaId?: string | null;
  sedeId?: string | null;
  onSaved?: () => void;
}

interface ItemForm { producto: string; variante: string; cantidad: number }

const emptyItem: ItemForm = { producto: "", variante: "", cantidad: 1 };

const emptyForm = {
  origen: "tienda_nube",
  externo_ref: "",
  cliente_nombre: "",
  cliente_telefono: "",
  cliente_email: "",
  ubicacion: "",
  notas: "",
};


/** Comprime la foto para que suba rápido desde el celular. */
const compress = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 1400;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("canvas")); return; }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = () => reject(new Error("No pudimos leer la imagen"));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error("No pudimos leer la imagen"));
    reader.readAsDataURL(file);
  });

const dataUrlToBlob = (dataUrl: string) => {
  const [head, b64] = dataUrl.split(",");
  const mime = head.match(/data:(.*?);/)?.[1] || "image/jpeg";
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
};

const EtiquetaExternaCapture = ({ open, onOpenChange, cargaId, sedeId, onSaved }: Props) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ocr, setOcr] = useState<any>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [items, setItems] = useState<ItemForm[]>([{ ...emptyItem }]);

  const reset = () => { setPhoto(null); setForm({ ...emptyForm }); setItems([{ ...emptyItem }]); setOcr(null); };

  const updateItem = (idx: number, patch: Partial<ItemForm>) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const handleFile = async (file?: File | null) => {
    if (!file) return;
    try {
      const dataUrl = await compress(file);
      setPhoto(dataUrl);
      setReading(true);
      const { data, error } = await supabase.functions.invoke("parse-etiqueta-externa", {
        body: { imageDataUrl: dataUrl },
      });
      setReading(false);
      if (error) { toast.info("No pudimos leer la etiqueta automáticamente. Completá los datos a mano."); return; }
      const d = (data as any)?.data || {};
      setOcr(d);
      setForm((f) => ({
        ...f,
        origen: ORIGENES.some((o) => o.value === d.origen) ? d.origen : f.origen,
        externo_ref: d.externo_ref || f.externo_ref,
        cliente_nombre: d.cliente_nombre || f.cliente_nombre,
        cliente_telefono: d.cliente_telefono || f.cliente_telefono,
        cliente_email: d.cliente_email || f.cliente_email,
      }));
      const detected: ItemForm[] = Array.isArray(d.items) && d.items.length
        ? d.items.map((it: any) => ({
            producto: String(it?.producto || "").trim(),
            variante: String(it?.variante || "").trim(),
            cantidad: Number(it?.cantidad) > 0 ? Number(it.cantidad) : 1,
          })).filter((it: ItemForm) => it.producto || it.variante)
        : [];
      if (detected.length) setItems(detected);
      else if (d.producto || d.variante) {
        setItems([{
          producto: d.producto || "",
          variante: d.variante || "",
          cantidad: Number(d.cantidad) > 0 ? Number(d.cantidad) : 1,
        }]);
      }

      if (d.cliente_nombre) toast.success("Etiqueta leída", { description: d.cliente_nombre });
    } catch (e) {
      setReading(false);
      toast.error((e as Error).message);
    }
  };

  const save = async () => {
    if (!form.cliente_nombre.trim()) { toast.error("Falta el nombre del cliente"); return; }
    const validItems = items.filter((it) => it.producto.trim() || it.variante.trim());
    const finalItems: ItemForm[] = validItems.length ? validItems : [{ ...emptyItem }];
    setSaving(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      let foto_path: string | null = null;
      let foto_url: string | null = null;

      if (photo) {
        const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.jpg`;
        const { error: upErr } = await supabase.storage
          .from("etiquetas-externas")
          .upload(path, dataUrlToBlob(photo), { contentType: "image/jpeg", upsert: false });
        if (upErr) throw upErr;
        foto_path = path;
        const { data: signed } = await supabase.storage.from("etiquetas-externas").createSignedUrl(path, 60 * 60 * 24 * 365);
        foto_url = signed?.signedUrl ?? null;
      }

      const base = {
        origen: form.origen,
        externo_ref: form.externo_ref.trim() || null,
        cliente_nombre: form.cliente_nombre.trim(),
        cliente_telefono: form.cliente_telefono.trim() || null,
        cliente_email: form.cliente_email.trim() || null,
        ubicacion: form.ubicacion.trim() || (cargaId ? "Camioneta" : "Depósito"),
        notas: form.notas.trim() || null,
        sede_id: sedeId || null,
        estado: cargaId ? "en_camioneta" : "en_deposito",
        foto_path,
        foto_url,
        ocr_raw: ocr || null,
        created_by: userRes.user?.id ?? null,
      };

      const { data: pedidos, error } = await (supabase as any)
        .from("pedidos_externos")
        .insert(
          finalItems.map((it) => ({
            ...base,
            producto: it.producto.trim() || null,
            variante: it.variante.trim() || null,
            cantidad: Number(it.cantidad) || 1,
          })),
        )
        .select();
      if (error) throw error;

      if (cargaId && pedidos?.length) {
        const now = new Date().toISOString();
        const { error: itemErr } = await (supabase as any).from("vehiculo_carga_items").insert(
          pedidos.map((pedido: any) => ({
            carga_id: cargaId,
            source_table: "pedidos_externos",
            source_id: pedido.id,
            cliente_nombre: pedido.cliente_nombre,
            producto: pedido.producto,
            variante: pedido.variante,
            cantidad: pedido.cantidad,
            estado: "cargado",
            chequeado_at: now,
            chequeado_by: userRes.user?.id ?? null,
            notas: `Venta externa (${ORIGENES.find((o) => o.value === pedido.origen)?.label || pedido.origen})`,
          })),
        );
        if (itemErr) throw itemErr;
      }

      toast.success(
        cargaId ? "Pedido externo cargado en la camioneta" : "Pedido externo registrado",
        { description: `${finalItems.length} producto(s)` },
      );

      reset();
      onOpenChange(false);
      onSaved?.();
    } catch (e) {
      toast.error((e as Error).message || "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-lg max-h-[88dvh] overflow-y-auto overscroll-contain">
        <DialogHeader>
          <DialogTitle>Foto de etiqueta · venta externa</DialogTitle>
          <p className="text-xs text-muted-foreground">
            Sacá la foto de la etiqueta del pedido (Tienda Nube u otra tienda). Leemos los datos automáticamente y creamos el producto con su estado.
          </p>
        </DialogHeader>

        <div className="space-y-3">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />

          {photo ? (
            <div className="relative">
              <img src={photo} alt="Etiqueta del pedido externo" className="w-full rounded-md border border-border object-contain max-h-56" />
              <Button variant="outline" size="sm" className="mt-2" onClick={() => fileRef.current?.click()}>
                <Camera className="w-4 h-4 mr-1" /> Otra foto
              </Button>
            </div>
          ) : (
            <Button variant="gold" className="w-full h-24" onClick={() => fileRef.current?.click()}>
              <Camera className="w-5 h-5 mr-2" /> Sacar foto de la etiqueta
            </Button>
          )}

          {reading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Leyendo la etiqueta...
            </div>
          )}
          {!reading && ocr && (
            <div className="flex items-center gap-2 text-xs text-cyan-400">
              <Sparkles className="w-3.5 h-3.5" /> Datos sugeridos por lectura automática. Revisalos antes de guardar.
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2">
              <Label>Cliente *</Label>
              <Input value={form.cliente_nombre} onChange={(e) => setForm({ ...form, cliente_nombre: e.target.value })} placeholder="Nombre del comprador" />
            </div>
            <div className="space-y-1.5">
              <Label>Tienda</Label>
              <Select value={form.origen} onValueChange={(v) => setForm({ ...form, origen: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ORIGENES.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>N° de orden</Label>
              <Input value={form.externo_ref} onChange={(e) => setForm({ ...form, externo_ref: e.target.value })} placeholder="#1234" />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Producto</Label>
              <Input value={form.producto} onChange={(e) => setForm({ ...form, producto: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Variante</Label>
              <Input value={form.variante} onChange={(e) => setForm({ ...form, variante: e.target.value })} placeholder="Talle / color" />
            </div>
            <div className="space-y-1.5">
              <Label>Cantidad</Label>
              <Input type="number" min={1} value={form.cantidad} onChange={(e) => setForm({ ...form, cantidad: Number(e.target.value) })} />
            </div>
            <div className="space-y-1.5">
              <Label>Teléfono</Label>
              <Input value={form.cliente_telefono} onChange={(e) => setForm({ ...form, cliente_telefono: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Ubicación</Label>
              <Input value={form.ubicacion} onChange={(e) => setForm({ ...form, ubicacion: e.target.value })} placeholder={cargaId ? "Camioneta" : "Estante / caja"} />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Notas</Label>
              <Textarea rows={2} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button variant="gold" onClick={save} disabled={saving || reading}>
            {saving ? "Guardando..." : cargaId ? "Registrar en camioneta" : "Registrar pedido"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EtiquetaExternaCapture;
