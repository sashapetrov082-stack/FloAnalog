// Только для сервера: отправка push-уведомлений. Использует сервисный ключ Supabase
// (SUPABASE_SERVICE_ROLE_KEY) — он есть только в переменных Vercel и никогда не попадает в браузер.
import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { shouldSend, THROTTLE_MS, type PushMessage } from "@/lib/notify";

export function serverConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:privacy@example.com";
  if (!url || !serviceKey || !vapidPublic || !vapidPrivate) return null;
  webpush.setVapidDetails(subject, vapidPublic, vapidPrivate);
  return { url, serviceKey };
}

export function adminClient(url: string, serviceKey: string): SupabaseClient {
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Было ли такое уведомление от этого отправителя недавно; если нет — отмечаем отправку. */
export async function claimSend(
  admin: SupabaseClient,
  senderId: string,
  event: keyof typeof THROTTLE_MS,
): Promise<boolean> {
  const { data } = await admin
    .from("notify_log")
    .select("sent_at")
    .eq("sender_id", senderId)
    .eq("event", event)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!shouldSend(event, data ? new Date(data.sent_at) : null, new Date())) return false;
  await admin.from("notify_log").insert({ sender_id: senderId, event });
  return true;
}

/** Отправляет уведомление на все устройства пользователя; устаревшие подписки удаляет. */
export async function sendToUser(admin: SupabaseClient, userId: string, message: PushMessage): Promise<number> {
  const { data: subs } = await admin.from("push_subscriptions").select("endpoint, p256dh, auth").eq("user_id", userId);
  let sent = 0;
  await Promise.all(
    (subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(message),
          { TTL: 12 * 60 * 60, urgency: "normal" },
        );
        sent++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        // Подписка больше не действует (приложение удалили, уведомления выключили).
        if (status === 404 || status === 410) await admin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
      }
    }),
  );
  return sent;
}
