// Режим беременности: срок по неделям, триместр и предполагаемая дата родов.
// Считаем от первого дня последних месячных (акушерский срок), дата родов — по правилу Негеле (+280 дней).
// Чистые функции: «сегодня» передаётся параметром.

import { addDays, compareDates, diffDays, type IsoDate } from "./dates";

/** Длительность беременности от первого дня последних месячных. */
export const PREGNANCY_DAYS = 280;
/** Дальше 42 недель срок не показываем — скорее всего, дата устарела. */
export const MAX_PREGNANCY_DAYS = 42 * 7 + 6;

export interface Gestation {
  /** Полных недель. */
  weeks: number;
  /** Дней сверх полных недель, 0…6. */
  days: number;
  /** Неделя, которая идёт сейчас (1…43): при 12 неделях 3 днях идёт 13-я. */
  currentWeek: number;
  trimester: 1 | 2 | 3;
  dueDate: IsoDate;
  /** Дней до предполагаемой даты родов (отрицательно — дата прошла). */
  daysLeft: number;
  /** Доля пройденного пути до даты родов, 0…1. */
  progress: number;
}

export function dueDate(lmp: IsoDate): IsoDate {
  return addDays(lmp, PREGNANCY_DAYS);
}

/** Первый день последних месячных по предполагаемой дате родов (если врач назвал дату родов). */
export function lmpFromDueDate(due: IsoDate): IsoDate {
  return addDays(due, -PREGNANCY_DAYS);
}

/** Срок на сегодня. null — дата в будущем или срок больше 42 недель. */
export function gestation(lmp: IsoDate, today: IsoDate): Gestation | null {
  if (compareDates(today, lmp) < 0) return null;
  const total = diffDays(lmp, today);
  if (total > MAX_PREGNANCY_DAYS) return null;
  const weeks = Math.floor(total / 7);
  const due = dueDate(lmp);
  return {
    weeks,
    days: total % 7,
    currentWeek: weeks + 1,
    // Первый триместр — до 13 недель 6 дней, второй — до 27 недель 6 дней.
    trimester: weeks < 14 ? 1 : weeks < 28 ? 2 : 3,
    dueDate: due,
    daysLeft: diffDays(today, due),
    progress: Math.min(1, total / PREGNANCY_DAYS),
  };
}

/** «12 недель 3 дня», «1 неделя», «5 дней». */
export function formatGestation(weeks: number, days: number): string {
  const w = (n: number) => {
    const m10 = n % 10;
    const m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return `${n} неделя`;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return `${n} недели`;
    return `${n} недель`;
  };
  const d = (n: number) => (n === 1 ? "1 день" : n >= 2 && n <= 4 ? `${n} дня` : `${n} дней`);
  if (weeks === 0) return d(days);
  return days === 0 ? w(weeks) : `${w(weeks)} ${d(days)}`;
}
