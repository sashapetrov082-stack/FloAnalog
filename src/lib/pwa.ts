// Регистрация сервис-воркера (работа без интернета и push-уведомления).

const CACHE = "app-v1"; // то же имя, что в public/sw.js

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  // В режиме разработки кэш мешает видеть изменения.
  if (process.env.NODE_ENV !== "production") return null;
  try {
    const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
    // Файлы, загруженные до первой установки воркера, мимо него не прошли — кладём их в кэш сами,
    // чтобы приложение открылось без сети уже со следующего раза.
    if ("caches" in window) {
      const urls = performance
        .getEntriesByType("resource")
        .map((e) => e.name)
        .filter((u) => u.startsWith(`${location.origin}/_next/static/`));
      const cache = await caches.open(CACHE);
      await Promise.all(urls.map((u) => cache.add(u).catch(() => undefined)));
      await cache.add("/").catch(() => undefined);
    }
    return registration;
  } catch {
    return null;
  }
}

/** Установлено ли приложение на главный экран (на iPhone push работает только так). */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIos(): boolean {
  return typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);
}
