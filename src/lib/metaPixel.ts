/** Meta tracking is disabled until the site has a configured Pixel ID and the visitor opts in. */
const PIXEL_ID = (import.meta.env.VITE_META_PIXEL_ID as string | undefined) || "862321973574316";
const CONSENT_KEY = "reybaud_meta_marketing_consent";
let initialized = false;
declare global {
  interface Window { fbq?: (...args: unknown[]) => void; _fbq?: (...args: unknown[]) => void }
}
export const hasMetaPixel = () => Boolean(PIXEL_ID && /^\d+$/.test(PIXEL_ID));
export const getMarketingConsent = (): "granted" | "denied" | null => {
  try {
    const value = localStorage.getItem(CONSENT_KEY);
    return value === "granted" || value === "denied" ? value : null;
  } catch { return null; }
};
export function setMarketingConsent(value: "granted" | "denied") {
  try { localStorage.setItem(CONSENT_KEY, value); } catch { /* storage blocked */ }
  if (value === "granted") initMetaPixel();
}
export function initMetaPixel() {
  if (!hasMetaPixel() || getMarketingConsent() !== "granted" || initialized || typeof window === "undefined") return;
  initialized = true;
  const fbq = function (...args: unknown[]) {
    if ((fbq as any).callMethod) (fbq as any).callMethod.apply(fbq, args);
    else ((fbq as any).queue ||= []).push(args);
  };
  (fbq as any).push = fbq;
  (fbq as any).loaded = true;
  (fbq as any).version = "2.0";
  (fbq as any).queue = [];
  window.fbq = fbq;
  window._fbq = fbq;
  const script = document.createElement("script");
  script.async = true;
  script.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(script);
  fbq("init", PIXEL_ID);
}
export function trackMetaEvent(name: "PageView" | "ViewContent" | "Contact" | "InitiateCheckout") {
  if (!hasMetaPixel() || getMarketingConsent() !== "granted") return;
  initMetaPixel();
  window.fbq?.("track", name);
}
