// Проверочное уведомление себе: показывает, на каком шаге ломается доставка.
// Отвечает только количеством устройств, кодами ошибок push-служб и их доменами — без адресов подписок.
import { adminClient, claimSend, deliver, serverConfig } from "@/lib/server/push";
import { TEST_MESSAGE } from "@/lib/notify";

export async function POST(request: Request) {
  const config = serverConfig();
  if (!config) return Response.json({ reason: "push-not-configured" });

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ error: "unauthorized" }, { status: 401 });
  const admin = adminClient(config.url, config.serviceKey);
  const { data: auth } = await admin.auth.getUser(token);
  const user = auth?.user;
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { endpoint?: string } | null;
  const { data: own, error } = await admin
    .from("push_subscriptions")
    .select("endpoint")
    .eq("user_id", user.id)
    .eq("endpoint", body?.endpoint ?? "")
    .maybeSingle();
  if (error) {
    // 42P01 / PGRST205 — таблицы нет (не выполнена миграция); 42501 — нет прав (не тот ключ).
    const missing = error.code === "42P01" || error.code === "PGRST205";
    return Response.json({ reason: missing ? "db-not-ready" : "db-error", detail: `${error.code}: ${error.message}` });
  }

  if (!(await claimSend(admin, user.id, "test"))) return Response.json({ reason: "throttled" });
  const result = await deliver(admin, user.id, TEST_MESSAGE);
  return Response.json({ ...result, thisDevice: Boolean(own) });
}
