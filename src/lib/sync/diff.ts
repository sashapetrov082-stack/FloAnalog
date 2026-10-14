// Синхронизация с аккаунтом: что поменялось и как объединить гостевые данные.
// Чистые функции без сети — их легко тестировать.

import { diffDays, type IsoDate } from "@/lib/cycle/dates";
import type { Period } from "@/lib/cycle/predict";
import type { GuestData, GuestSettings } from "@/lib/guest/store";
import type { DayLog } from "@/lib/journal";

export interface SyncOps {
  settings: GuestSettings | null;
  upsertPeriods: Period[];
  deletePeriodStarts: IsoDate[];
  upsertLogs: [IsoDate, DayLog][];
  deleteLogDates: IsoDate[];
}

function sameLog(a: DayLog, b: DayLog): boolean {
  const norm = (l: DayLog) =>
    JSON.stringify([l.flow ?? null, [...l.symptoms].sort(), [...l.moods].sort(), l.note ?? ""]);
  return norm(a) === norm(b);
}

/** Изменения, которые нужно отправить, чтобы `prev` на сервере стал `next`. */
export function diffData(prev: GuestData | null, next: GuestData): SyncOps {
  const prevPeriods = new Map((prev?.periods ?? []).map((p) => [p.start, p]));
  const nextPeriods = new Map(next.periods.map((p) => [p.start, p]));
  const prevLogs = prev?.dayLogs ?? {};

  const settingsChanged =
    !prev ||
    prev.settings.cycleLength !== next.settings.cycleLength ||
    prev.settings.periodLength !== next.settings.periodLength;

  return {
    settings: settingsChanged ? next.settings : null,
    upsertPeriods: next.periods.filter((p) => {
      const old = prevPeriods.get(p.start);
      return !old || (old.end ?? null) !== (p.end ?? null);
    }),
    deletePeriodStarts: [...prevPeriods.keys()].filter((start) => !nextPeriods.has(start)),
    upsertLogs: Object.entries(next.dayLogs).filter(([date, log]) => !prevLogs[date] || !sameLog(prevLogs[date], log)),
    deleteLogDates: Object.keys(prevLogs).filter((date) => !(date in next.dayLogs)),
  };
}

export function isEmptyOps(ops: SyncOps): boolean {
  return (
    !ops.settings &&
    ops.upsertPeriods.length === 0 &&
    ops.deletePeriodStarts.length === 0 &&
    ops.upsertLogs.length === 0 &&
    ops.deleteLogDates.length === 0
  );
}

/** Начала месячных ближе этого считаем одними и теми же месячными, отмеченными на разных устройствах. */
const SAME_PERIOD_DAYS = 7;

function hasData(data: GuestData): boolean {
  return data.periods.length > 0 || Object.keys(data.dayLogs).length > 0;
}

/**
 * Объединяет гостевые данные с данными аккаунта при входе.
 * При совпадении побеждает аккаунт; настройки берутся из гостевых данных, только если аккаунт пустой.
 */
export function mergeGuestIntoAccount(account: GuestData, guest: GuestData): GuestData {
  const periods = [...account.periods];
  for (const p of guest.periods) {
    const duplicate = account.periods.some((a) => Math.abs(diffDays(a.start, p.start)) <= SAME_PERIOD_DAYS);
    if (!duplicate) periods.push(p);
  }
  periods.sort((a, b) => diffDays(b.start, a.start));

  return {
    version: 2,
    settings: hasData(account) ? account.settings : guest.settings,
    periods,
    dayLogs: { ...guest.dayLogs, ...account.dayLogs },
  };
}
