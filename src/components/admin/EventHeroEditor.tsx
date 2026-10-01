import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { normalizeHeroImages } from "@/lib/eventHero";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

interface EventHeroEditorProps {
  imageUrl: string;
  metadata: Record<string, any>;
  onImageUrlChange: (url: string) => void;
  onMetadataChange: (metadata: Record<string, any>) => void;
}

export default function EventHeroEditor({ imageUrl, metadata, onImageUrlChange, onMetadataChange }: EventHeroEditorProps) {
  const [uploading, setUploading] = useState(false);
  const [urlDraft, setUrlDraft] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mode = metadata.hero_mode === "carousel" ? "carousel" : "single";
  const images = normalizeHeroImages(metadata.hero_images);
  const carouselImages = images.length > 0 ? images : imageUrl ? [imageUrl] : [];

  const updateMetadata = (patch: Record<string, unknown>) => onMetadataChange({ ...metadata, ...patch });
  const commitImages = (next: string[]) => {
    const normalized = normalizeHeroImages(next);
    updateMetadata({ hero_images: normalized });
    onImageUrlChange(normalized[0] || "");
  };

  const addUrl = () => {
    const url = urlDraft.trim();
    if (!url) return;
    commitImages([...carouselImages, url]);
    setUrlDraft("");
  };

  const uploadImages = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;
    if (files.some((file) => !file.type.startsWith("image/"))) {
      toast.error("Solo se permiten archivos de imagen.");
      return;
    }
    if (files.some((file) => file.size > 5 * 1024 * 1024)) {
      toast.error("Cada imagen debe pesar menos de 5MB.");
      return;
    }

    setUploading(true);
    const uploaded: string[] = [];
    for (const file of files) {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("event-images").upload(path, file, { upsert: true });
      if (error) {
        toast.error(`No se pudo subir ${file.name}.`);
        continue;
      }
      uploaded.push(supabase.storage.from("event-images").getPublicUrl(path).data.publicUrl);
    }
    if (uploaded.length > 0) {
      commitImages([...carouselImages, ...uploaded]);
      toast.success(uploaded.length === 1 ? "Imagen subida." : `${uploaded.length} imágenes subidas.`);
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= carouselImages.length) return;
    const next = [...carouselImages];
    [next[index], next[target]] = [next[target], next[index]];
    commitImages(next);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Tipo de portada</Label>
          <Select
            value={mode}
            onValueChange={(value: "single" | "carousel") => updateMetadata({
              hero_mode: value,
              hero_images: value === "carousel" && images.length === 0 && imageUrl ? [imageUrl] : images,
            })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="single">Imagen única</SelectItem>
              <SelectItem value="carousel">Carrusel</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Ajuste de imagen</Label>
          <Select value={metadata.hero_image_fit === "contain" ? "contain" : "cover"} onValueChange={(value) => updateMetadata({ hero_image_fit: value })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="cover">Cubrir área (fotos)</SelectItem>
              <SelectItem value="contain">Mostrar completa (arte)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {mode === "single" ? (
        <div className="space-y-2">
          {imageUrl && <img src={imageUrl} alt="Vista previa de portada" className="w-full h-40 object-cover rounded-md border border-border" />}
          <div className="flex gap-2">
            <Input value={imageUrl} onChange={(event) => onImageUrlChange(event.target.value)} placeholder="URL de la imagen principal" className="text-xs" />
            <Button type="button" variant="outline" size="icon" onClick={() => fileInputRef.current?.click()} aria-label="Subir imagen">
              {uploading ? <Loader2 className="animate-spin" /> : <ImagePlus />}
            </Button>
            {imageUrl && <Button type="button" variant="ghost" size="icon" onClick={() => onImageUrlChange("")} aria-label="Eliminar imagen"><Trash2 /></Button>}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-2">
            {carouselImages.map((url, index) => (
              <div key={`${url}-${index}`} className="grid grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-2 rounded-md border border-border p-2">
                <img src={url} alt={`Imagen ${index + 1}`} className="h-12 w-16 rounded object-cover bg-muted" />
                <div className="min-w-0">
                  <p className="truncate text-xs">{url}</p>
                  <p className="text-[10px] text-muted-foreground">{index === 0 ? "Principal y fallback" : `Posición ${index + 1}`}</p>
                </div>
                <div className="flex gap-1">
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={index === 0} onClick={() => move(index, -1)} aria-label="Mover imagen arriba"><ArrowUp /></Button>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={index === carouselImages.length - 1} onClick={() => move(index, 1)} aria-label="Mover imagen abajo"><ArrowDown /></Button>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => commitImages(carouselImages.filter((_, itemIndex) => itemIndex !== index))} aria-label="Eliminar imagen"><Trash2 /></Button>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Input value={urlDraft} onChange={(event) => setUrlDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addUrl(); } }} placeholder="Pegá una URL y agregala" className="text-xs" />
            <Button type="button" variant="outline" onClick={addUrl} disabled={!urlDraft.trim()}>Agregar</Button>
            <Button type="button" variant="outline" size="icon" onClick={() => fileInputRef.current?.click()} aria-label="Subir imágenes">
              {uploading ? <Loader2 className="animate-spin" /> : <ImagePlus />}
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={metadata.hero_autoplay === true} onCheckedChange={(checked) => updateMetadata({ hero_autoplay: checked })} />
            <Label className="text-sm">Avance automático suave</Label>
          </div>
          {carouselImages.length < 2 && <p className="text-xs text-muted-foreground">Agregá al menos dos imágenes. Mientras tanto, la portada seguirá como imagen única.</p>}
        </div>
      )}

      <input ref={fileInputRef} type="file" accept="image/*" multiple={mode === "carousel"} onChange={uploadImages} className="hidden" />
      <p className="text-[11px] text-muted-foreground">JPG, PNG o WEBP, hasta 5MB por imagen. La primera imagen también queda como respaldo.</p>
    </div>
  );
}