import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { CarouselApi } from "@/components/ui/carousel";
import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ResolvedEventHero } from "@/lib/eventHero";

interface EventHeroMediaProps {
  hero: ResolvedEventHero;
  title: string;
  onInteraction?: () => void;
}

export default function EventHeroMedia({ hero, title, onInteraction }: EventHeroMediaProps) {
  const [api, setApi] = useState<CarouselApi>();
  const [selected, setSelected] = useState(0);
  const [autoplayPaused, setAutoplayPaused] = useState(false);
  const isCarousel = hero.mode === "carousel";
  const isContain = hero.fit === "contain";

  useEffect(() => {
    if (!api) return;
    const syncSelected = () => setSelected(api.selectedScrollSnap());
    syncSelected();
    api.on("select", syncSelected);
    api.on("reInit", syncSelected);
    return () => {
      api.off("select", syncSelected);
      api.off("reInit", syncSelected);
    };
  }, [api]);

  useEffect(() => {
    if (!api || !hero.autoplay || autoplayPaused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => api.scrollNext(), 7000);
    return () => window.clearInterval(timer);
  }, [api, hero.autoplay, autoplayPaused]);

  const interact = useCallback((action: () => void) => {
    setAutoplayPaused(true);
    onInteraction?.();
    action();
  }, [onInteraction]);

  const image = (url: string, index: number) => (
    <img
      src={url}
      alt={hero.images.length > 1 ? `${title}, imagen ${index + 1} de ${hero.images.length}` : title}
      className={cn(
        "block w-full",
        isContain
          ? "h-auto md:w-auto md:max-w-full md:max-h-[520px] object-contain mx-auto"
          : "h-full object-cover",
      )}
      draggable={false}
    />
  );

  if (!isCarousel) {
    return isContain ? (
      <div className="w-full bg-muted flex justify-center pt-16 md:pt-0">{image(hero.images[0], 0)}</div>
    ) : (
      <div className="w-full h-[280px] md:h-[420px] overflow-hidden">
        {image(hero.images[0], 0)}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
      </div>
    );
  }

  return (
    <div
      className={cn("relative w-full", isContain ? "h-[420px] md:h-[520px] bg-muted pt-16 md:pt-0" : "h-[280px] md:h-[420px]")}
      onPointerDown={() => setAutoplayPaused(true)}
      onFocusCapture={() => setAutoplayPaused(true)}
      onMouseEnter={() => setAutoplayPaused(true)}
      aria-label={`Galería de ${title}`}
    >
      <Carousel setApi={setApi} opts={{ loop: true }} className="h-full">
        <CarouselContent className="h-full ml-0">
          {hero.images.map((url, index) => (
            <CarouselItem key={`${url}-${index}`} className={cn("pl-0", isContain ? "h-[356px] md:h-[520px]" : "h-[280px] md:h-[420px]") }>
              <div className="w-full h-full flex justify-center">{image(url, index)}</div>
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
      {!isContain && <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />}

      <Button
        type="button"
        variant="outline"
        size="icon"
        className="absolute z-20 left-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-background/80 backdrop-blur-sm"
        onClick={() => interact(() => api?.scrollPrev())}
        aria-label="Imagen anterior"
      >
        <ChevronLeft />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="absolute z-20 right-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-background/80 backdrop-blur-sm"
        onClick={() => interact(() => api?.scrollNext())}
        aria-label="Imagen siguiente"
      >
        <ChevronRight />
      </Button>

      <div className={cn("absolute z-20 left-1/2 -translate-x-1/2 flex items-center gap-2", isContain ? "bottom-3" : "bottom-5")} aria-label={`Imagen ${selected + 1} de ${hero.images.length}`}>
        {hero.images.map((_, index) => (
          <Button
            key={index}
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-full p-0"
            onClick={() => interact(() => api?.scrollTo(index))}
            aria-label={`Ir a imagen ${index + 1}`}
          >
            <span className={cn("block h-2 w-2 rounded-full border border-foreground/70", selected === index ? "bg-foreground" : "bg-background/60")} />
          </Button>
        ))}
      </div>
    </div>
  );
}