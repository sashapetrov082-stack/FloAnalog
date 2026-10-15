// Контрацепция: запросы к Supabase. Данные есть только в аккаунте — напоминания отправляет сервер.
// Партнёр эти таблицы не читает: он видит контрацепцию только через get_partner_view и с разрешения.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContraceptionSettings, Method, PillRegimen } from "@/lib/cycle/contraception";
import type { IsoDate } from "@/lib/cycle/dates";

export interface ContraceptionConfig extends ContraceptionSettings {
  remindersOn: boolean;
  /** «21:00» */
  reminderTime: string;
  /** Часовой пояс устройства (IANA), например «Europe/Berlin». */
  timezone: string;
}

export const NO_CONTRACEPTION: ContraceptionConfig = {
  method: "none",
  regimen: null,
  startDate: null,
  remindersOn: false,
  reminderTime: "21:00",
  timezone: "Europe/Berlin",
};

function check<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

export function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || NO_CONTRACEPTION.timezone;
  } catch {
    return NO_CONTRACEPTION.timezone;
  }
}

export async function getContraception(sb: SupabaseClient): Promise<ContraceptionConfig> {
  const r = check(
    await sb
      .from("contraception")
      .select("method, regimen, start_date, reminders_on, reminder_time, timezone")
      .maybeSingle(),
  );
  if (!r) return NO_CONTRACEPTION;
  return {
    method: r.method as Method,
    regimen: (r.regimen as PillRegimen | null) ?? null,
    startDate: r.start_date,
    remindersOn: r.reminders_on,
    reminderTime: String(r.reminder_time).slice(0, 5),
    timezone: r.timezone,
  };
}

export async function saveContraception(sb: SupabaseClient, userId: string, c: ContraceptionConfig): Promise<void> {
  const none = c.method === "none";
  check(
    await sb.from("contraception").upsert(
      {
        user_id: userId,
        method: c.method,
        regimen: c.method === "pill" ? c.regimen : null,
        start_date: none ? null : c.startDate,
        reminders_on: none ? false : c.remindersOn,
        reminder_time: c.reminderTime,
        timezone: c.timezone,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    ),
  );
}

/** Дни, когда таблетка отмечена принятой, в диапазоне дат. */
export async function listTaken(sb: SupabaseClient, from: IsoDate, to: IsoDate): Promise<IsoDate[]> {
  const rows = check(await sb.from("contraception_log").select("date").gte("date", from).lte("date", to));
  return (rows ?? []).map((r) => r.date as IsoDate);
}

export async function setTaken(sb: SupabaseClient, userId: string, date: IsoDate, taken: boolean): Promise<void> {
  if (taken) {
    check(await sb.from("contraception_log").upsert({ user_id: userId, date }, { onConflict: "user_id,date" }));
  } else {
    check(await sb.from("contraception_log").delete().eq("user_id", userId).eq("date", date));
  }
}

/** Всё о контрацепции — для «Скачать мои данные». */
export async function exportContraception(sb: SupabaseClient) {
  const settings = await getContraception(sb);
  const log = check(await sb.from("contraception_log").select("date, taken_at").order("date"));
  return { settings, log: log ?? [] };
}
