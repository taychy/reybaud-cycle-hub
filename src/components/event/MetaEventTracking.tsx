import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { getMarketingConsent, hasMetaPixel, initMetaPixel, setMarketingConsent, trackMetaEvent } from "@/lib/metaPixel";

/** Show marketing consent only on public event pages, where the pixel is relevant. */
export default function MetaEventTracking() {
  const { pathname } = useLocation();
  const isEvent = /^\/eventos\/[^/]+\/?$/.test(pathname);
  const [consent, setConsent] = useState(getMarketingConsent);
  useEffect(() => {
    if (!isEvent || consent !== "granted") return;
    initMetaPixel();
    trackMetaEvent("PageView");
    trackMetaEvent("ViewContent");
  }, [isEvent, pathname, consent]);
  if (!isEvent || !hasMetaPixel() || consent !== null) return null;
  return (
    <aside role="dialog" aria-label="Preferencias de publicidad" className="fixed bottom-20 left-4 right-4 z-[100] mx-auto max-w-md rounded-xl border border-border bg-background p-4 shadow-xl">
      <p className="text-sm font-semibold">Medición de publicidad</p>
      <p className="mt-1 text-xs text-muted-foreground">¿Nos permitís usar Meta Pixel para medir visitas desde Facebook e Instagram y mejorar nuestros anuncios? Es opcional y podés rechazarlo.</p>
      <div className="mt-3 flex gap-2">
        <button type="button" className="rounded-lg border border-border px-4 py-2 text-xs" onClick={() => { setMarketingConsent("denied"); setConsent("denied"); }}>Rechazar</button>
        <button type="button" className="rounded-lg bg-primary px-4 py-2 text-xs text-primary-foreground" onClick={() => { setMarketingConsent("granted"); setConsent("granted"); }}>Permitir</button>
      </div>
      <a className="mt-2 block text-xs underline" href="/politica-privacidad">Política de privacidad</a>
    </aside>
  );
}
