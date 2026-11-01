import { useState } from "react";
import { Share2, MessageCircle, Link2, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { type ShareKind, copyText, productShareText, productShareUrl, tryNativeShare, whatsappShareUrl } from "@/lib/productShare";

type Props = { productId: string; productName: string; variant?: "full" | "icon"; className?: string; kind?: ShareKind };

const stop = (e: React.SyntheticEvent) => { e.preventDefault(); e.stopPropagation(); };

export default function ShareProductButton({ productId, productName, variant = "full", className = "", kind = "producto" }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const url = productShareUrl(productId, undefined, kind);
  const text = productShareText(productName);

  const onTrigger = async (e: React.MouseEvent) => {
    stop(e);
    const coarse = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
    if (coarse) {
      const r = await tryNativeShare({ title: productName, text, url });
      if (r !== "unsupported") return;
    }
    setOpen((o) => !o);
  };

  const onCopy = async (e: React.MouseEvent) => {
    stop(e);
    const ok = await copyText(url);
    if (ok) {
      setCopied(true);
      toast.success("Enlace copiado");
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error("No se pudo copiar. Copiá el enlace manualmente: " + url);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {variant === "icon" ? (
          <button
            type="button"
            onClick={onTrigger}
            aria-label={`Compartir ${productName}`}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-full bg-background/85 text-foreground border border-border shadow-sm backdrop-blur hover:bg-background ${className}`}
          >
            <Share2 className="w-4 h-4" />
          </button>
        ) : (
          <Button type="button" variant="outline" onClick={onTrigger} className={`w-full rounded-xl font-heading font-semibold uppercase tracking-wider text-xs ${className}`}>
            <Share2 className="w-4 h-4" /> Compartir producto
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60 p-2 space-y-1" onClick={(e) => e.stopPropagation()}>
        <a
          href={whatsappShareUrl(text, url)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => { e.stopPropagation(); setOpen(false); }}
          className="flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-secondary"
        >
          <MessageCircle className="w-4 h-4" /> Compartir por WhatsApp
        </a>
        <button type="button" onClick={onCopy} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-secondary text-left">
          {copied ? <Check className="w-4 h-4 text-primary" /> : <Link2 className="w-4 h-4" />}
          {copied ? "¡Enlace copiado!" : "Copiar enlace"}
        </button>
      </PopoverContent>
    </Popover>
  );
}
