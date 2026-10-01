export type EventHeroMode = "single" | "carousel";
export type EventHeroFit = "cover" | "contain";

export interface EventHeroMetadata {
  hero_mode?: unknown;
  hero_images?: unknown;
  hero_image_fit?: unknown;
  hero_autoplay?: unknown;
}

export interface ResolvedEventHero {
  mode: EventHeroMode;
  images: string[];
  fit: EventHeroFit;
  autoplay: boolean;
}

export function normalizeHeroImages(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((item) => {
    if (typeof item !== "string") return [];
    const url = item.trim();
    if (!url || seen.has(url)) return [];
    seen.add(url);
    return [url];
  });
}

export function resolveEventHero(
  imageUrl: string | null | undefined,
  metadata: EventHeroMetadata | null | undefined,
  placeholder: string,
): ResolvedEventHero {
  const primary = imageUrl?.trim() || "";
  const configured = normalizeHeroImages(metadata?.hero_images);
  const images = configured.length > 0
    ? configured
    : [primary || placeholder];
  const carouselEnabled = metadata?.hero_mode === "carousel" && images.length >= 2;

  return {
    mode: carouselEnabled ? "carousel" : "single",
    images: carouselEnabled ? images : [primary || images[0] || placeholder],
    fit: metadata?.hero_image_fit === "contain" ? "contain" : "cover",
    autoplay: carouselEnabled && metadata?.hero_autoplay === true,
  };
}