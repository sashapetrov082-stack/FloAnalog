// Ежедневное напоминание владелице: «Скоро новый цикл» за 2 дня до ожидаемых месячных.
// Запускается расписанием Vercel (vercel.json) с секретом CRON_SECRET.
import { adminClient, claimSend, sendToUser, serverConfig } from "@/lib/server/push";
import { CYCLE_REMINDER } from "@/lib/notify";

const DAYS_BEFORE = 2;

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const config = serverConfig();
  if (!config) return Response.json({ sent: 0, reason: "push-not-configured" });
  const admin = adminClient(config.url, config.serviceKey);

  const target = new Date(Date.now() + DAYS_BEFORE * 86_400_000).toISOString().slice(0, 10);
  const { data: rows } = await admin.from("predictions").select("user_id").eq("next_period_earliest", target);
  let sent = 0;
  for (const { user_id } of rows ?? []) {
    if (await claimSend(admin, user_id, "cycle_reminder")) sent += await sendToUser(admin, user_id, CYCLE_REMINDER);
  }
  return Response.json({ checked: rows?.length ?? 0, sent });
}
