// Push-уведомления в браузере: подписка этого устройства и сигнал «уведоми партнёра».

import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotifyEvent } from "@/lib/notify";
import { isIos, isStandalone } from "@/lib/pwa";

export type PushState = "unsupported" | "ios-install" | "denied" | "off" | "on";

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

export function pushConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
}

export async function getPushState(): Promise<PushState> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    // На iPhone push есть только у приложения, добавленного на экран «Домой».
    return isIos() && !isStandalone() ? "ios-install" : "unsupported";
  }
  if (Notification.permission === "denied") return "denied";
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  return subscription ? "on" : "off";
}

export async function enablePush(sb: SupabaseClient): Promise<PushState> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "off";
  const registration = await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64ToBytes(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
    }));
  const json = subscription.toJSON();
  const { error } = await sb.rpc("save_push_subscription", {
    p_endpoint: json.endpoint,
    p_p256dh: json.keys?.p256dh,
    p_auth: json.keys?.auth,
  });
  if (error) throw new Error(error.message);
  return "on";
}

/** Выключить уведомления на этом устройстве (и при выходе из аккаунта). */
export async function disablePush(sb: SupabaseClient | null): Promise<void> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  await sb?.rpc("delete_push_subscription", { p_endpoint: subscription.endpoint });
  await subscription.unsubscribe();
}

/** Попросить сервер уведомить второго участника пары. Ошибки не мешают работе приложения. */
export async function notifyPartner(sb: SupabaseClient, event: NotifyEvent): Promise<void> {
  try {
    const { data } = await sb.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    await fetch("/api/notify", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ event }),
      keepalive: true,
    });
  } catch {
    // Уведомление не критично: событие уже сохранено.
  }
}
