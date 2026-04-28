export const UPDATE_QUERY_PARAM = "_v";

export const getCacheBustedUrl = (href = window.location.href) => {
  const url = new URL(href);
  url.searchParams.set(UPDATE_QUERY_PARAM, Date.now().toString());
  return url.toString();
};

export const clearBrowserCaches = async () => {
  if (!("caches" in window)) return;
  const keys = await caches.keys();
  await Promise.all(keys.map((key) => caches.delete(key)));
};

export const unregisterServiceWorkers = async () => {
  if (!("serviceWorker" in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister().catch(() => false)));
};

export const forceAppHardReload = async (delayMs = 150) => {
  await clearBrowserCaches();
  await unregisterServiceWorkers();
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  window.location.replace(getCacheBustedUrl());
};