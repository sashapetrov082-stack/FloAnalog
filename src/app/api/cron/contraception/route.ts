// Напоминания о контрацепции по местному времени владелицы. Vercel Hobby запускает свои расписания
// только раз в день, поэтому этот адрес каждые 5 минут вызывает pg_cron из Supabase
// (docs/contraception-cron.sql) с секретом CRON_SECRET.
import type { SupabaseClient } from "@supabase/supabase-js";
import { dueReminder, type Method, type PillRegimen } from "@/lib/cycle/contraception";
import { contraceptionReminder, contraceptionReminderKey, localClock, parseTime } from "@/lib/notify";
import { adminClient, sendToUser, serverConfig } from "@/lib/server/push";

/** Отправляли ли уже это напоминание (ключ включает местную дату); если нет — отмечаем. */
async function claimOnce(admin: SupabaseClient, userId: string, event: string): Promise<boolean> {
  const { data } = await admin.from("notify_log").select("id").eq("sender_id", userId).eq("event", event).limit(1);
  if (data && data.length > 0) return false;
  const { error } = await admin.from("notify_log").insert({ sender_id: userId, event });
  return !error;
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const config = serverConfig();
  if (!config) return Response.json({ sent: 0, reason: "push-not-configured" });
  const admin = adminClient(config.url, config.serviceKey);

  const { data: rows } = await admin
    .from("contraception")
    .select("user_id, method, regimen, start_date, reminder_time, timezone")
    .eq("reminders_on", true)
    .neq("method", "none");

  const now = new Date();
  let sent = 0;
  for (const r of rows ?? []) {
    const clock = localClock(now, r.timezone);
    if (!clock) continue;
    const settings = {
      method: r.method as Method,
      regimen: r.regimen as PillRegimen | null,
      startDate: r.start_date as string | null,
      reminderMinutes: parseTime(String(r.reminder_time)),
    };
    const { data: log } = await admin
      .from("contraception_log")
      .select("date")
      .eq("user_id", r.user_id)
      .eq("date", clock.date)
      .limit(1);
    const due = dueReminder(settings, clock.date, clock.minutes, (log?.length ?? 0) > 0);
    if (!due) continue;
    if (await claimOnce(admin, r.user_id, contraceptionReminderKey(due, clock.date))) {
      sent += await sendToUser(admin, r.user_id, contraceptionReminder(due));
    }
  }
  return Response.json({ checked: rows?.length ?? 0, sent });
}
