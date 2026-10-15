// Чтение и запись данных аккаунта в Supabase. Доступ ограничен правилами RLS:
// клиент видит и меняет только свои строки.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { GuestData } from "@/lib/guest/store";
import { parseGuestData, parseMode, parseTemperature } from "@/lib/guest/store";
import type { DayLogs } from "@/lib/journal";
import type { SyncOps } from "./diff";

function check<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

function rows<T>(result: { data: T | null; error: { message: string } | null }): T {
  const data = check(result);
  if (data === null) throw new Error("Пустой ответ сервера");
  return data;
}

export async function fetchAccountData(sb: SupabaseClient, userId: string): Promise<GuestData> {
  // MVP: одного запроса хватает на годы записей (лимит сервера — 1000 строк на запрос).
  const [profile, periods, logs] = await Promise.all([
    sb.from("profiles").select("*").eq("id", userId).single(),
    sb.from("periods").select("start_date, end_date").eq("user_id", userId).order("start_date"),
    sb
      .from("day_logs")
      .select("date, flow, symptoms, moods, note, temperature, ovulation_test")
      .eq("user_id", userId)
      .order("date"),
  ]);
  const p = rows(profile);
  const dayLogs: DayLogs = {};
  for (const l of rows(logs)) {
    dayLogs[l.date] = {
      flow: l.flow,
      symptoms: l.symptoms ?? [],
      moods: l.moods ?? [],
      note: l.note ?? "",
      // numeric из Postgres приходит строкой.
      temperature: parseTemperature(l.temperature),
      ovulationTest: l.ovulation_test ?? null,
    };
  }
  const data = parseGuestData({
    version: 2,
    settings: {
      cycleLength: p.avg_cycle_length,
      periodLength: p.avg_period_length,
      mode: parseMode(p.mode),
      pregnancyLmp: p.pregnancy_lmp ?? null,
    },
    periods: rows(periods).map((r) => ({ start: r.start_date, end: r.end_date })),
    dayLogs,
  });
  if (!data) throw new Error("Сервер вернул данные в неожиданном формате");
  return data;
}

export async function pushOps(sb: SupabaseClient, userId: string, ops: SyncOps): Promise<void> {
  if (ops.settings) {
    check(
      await sb
        .from("profiles")
        .update({
          avg_cycle_length: ops.settings.cycleLength,
          avg_period_length: ops.settings.periodLength,
          mode: ops.settings.mode ?? "cycle",
          // Колонка появилась позже (миграция 20261022000000_pregnancy) — шлём, только если она нужна.
          ...(ops.settings.mode === "pregnancy" || ops.settings.pregnancyLmp
            ? { pregnancy_lmp: ops.settings.pregnancyLmp ?? null }
            : {}),
        })
        .eq("id", userId),
    );
  }
  // Сначала удаления: перенос начала месячных — это удаление старой строки и вставка новой.
  if (ops.deletePeriodStarts.length > 0) {
    check(await sb.from("periods").delete().eq("user_id", userId).in("start_date", ops.deletePeriodStarts));
  }
  if (ops.upsertPeriods.length > 0) {
    check(
      await sb.from("periods").upsert(
        ops.upsertPeriods.map((p) => ({ user_id: userId, start_date: p.start, end_date: p.end ?? null })),
        { onConflict: "user_id,start_date" },
      ),
    );
  }
  if (ops.deleteLogDates.length > 0) {
    check(await sb.from("day_logs").delete().eq("user_id", userId).in("date", ops.deleteLogDates));
  }
  if (ops.upsertLogs.length > 0) {
    check(
      await sb.from("day_logs").upsert(
        ops.upsertLogs.map(([date, l]) => ({
          user_id: userId,
          date,
          flow: l.flow ?? null,
          symptoms: l.symptoms,
          moods: l.moods,
          note: l.note || null,
          temperature: l.temperature ?? null,
          ovulation_test: l.ovulationTest ?? null,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: "user_id,date" },
      ),
    );
  }
}

/** Отмечает согласие на обработку данных о здоровье (один раз, при первом входе). */
export async function recordHealthConsent(sb: SupabaseClient, userId: string): Promise<void> {
  check(
    await sb
      .from("profiles")
      .update({ health_data_consent_at: new Date().toISOString() })
      .eq("id", userId)
      .is("health_data_consent_at", null),
  );
}

export async function deleteAccount(sb: SupabaseClient): Promise<void> {
  check(await sb.rpc("delete_my_account"));
}
