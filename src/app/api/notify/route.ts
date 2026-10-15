// Уведомить второго участника пары о событии: новый статус, заметка, просьба, «Сделано», рисунок.
// Вызывает приложение после того, как событие сохранено. Проверяем, кто вызывает и состоит ли он в паре.
import { adminClient, claimSend, sendToUser, serverConfig } from "@/lib/server/push";
import { buildMessage, isAllowed, type PairRole } from "@/lib/notify";

export async function POST(request: Request) {
  const config = serverConfig();
  if (!config) return Response.json({ sent: 0, reason: "push-not-configured" });

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ error: "unauthorized" }, { status: 401 });
  const admin = adminClient(config.url, config.serviceKey);
  const { data: auth } = await admin.auth.getUser(token);
  const user = auth?.user;
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { event?: string } | null;
  const { data: link } = await admin
    .from("partner_links")
    .select("id, owner_id, partner_id")
    .eq("status", "active")
    .or(`owner_id.eq.${user.id},partner_id.eq.${user.id}`)
    .limit(1)
    .maybeSingle();
  if (!link) return Response.json({ sent: 0, reason: "no-pair" });

  const role: PairRole = link.owner_id === user.id ? "owner" : "partner";
  const event = body?.event ?? "";
  if (!isAllowed(role, event)) return Response.json({ error: "bad-event" }, { status: 400 });

  // Статус дня шлём, только если партнёру разрешено его видеть.
  if (event === "status") {
    const { data: s } = await admin.from("share_settings").select("daily_status").eq("link_id", link.id).single();
    if (!s?.daily_status) return Response.json({ sent: 0, reason: "not-shared" });
  }

  if (!(await claimSend(admin, user.id, event))) return Response.json({ sent: 0, reason: "throttled" });

  const { data: profile } = await admin.from("profiles").select("display_name").eq("id", user.id).single();
  const recipient = role === "owner" ? link.partner_id : link.owner_id;
  const sent = await sendToUser(admin, recipient, buildMessage(event, profile?.display_name ?? null));
  return Response.json({ sent });
}
