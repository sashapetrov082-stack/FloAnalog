// Отметки месячных: «Начались», «Закончились», удаление. Чистые функции —
// возвращают новый массив и не трогают исходный.

import { addDays, compareDates, diffDays, type IsoDate } from "./dates";
import type { Period } from "./predict";

/** Насколько раньше можно перенести начало уже отмеченных месячных. */
const MOVE_START_WINDOW = 10;
/** Месячные длиннее этого считаем ошибкой отметки конца. */
const MAX_PERIOD_DAYS = 14;

function sortPeriods(periods: Period[]): Period[] {
  return [...periods].sort((a, b) => compareDates(a.start, b.start));
}

/** Последний день месячных: отмеченный конец или ожидаемый по средней длине. */
export function periodEnd(period: Period, periodLength: number): IsoDate {
  return period.end ?? addDays(period.start, periodLength - 1);
}

/** Месячные, в которые попадает дата (с учётом ожидаемой длины, если конец не отмечен). */
export function findPeriodAt(periods: Period[], date: IsoDate, periodLength: number): Period | undefined {
  return periods.find(
    (p) => compareDates(p.start, date) <= 0 && compareDates(date, periodEnd(p, periodLength)) <= 0,
  );
}

/**
 * «Месячные начались» в дату `date`.
 * - Дата внутри уже отмеченных месячных — ничего не меняется.
 * - Отмеченные месячные начинаются в ближайшие 10 дней после даты — переносим их начало раньше.
 * - Иначе добавляем новые месячные без конца.
 */
export function markPeriodStart(periods: Period[], date: IsoDate, periodLength: number): Period[] {
  if (findPeriodAt(periods, date, periodLength)) return periods;

  const later = sortPeriods(periods).find((p) => {
    const gap = diffDays(date, p.start);
    return gap > 0 && gap <= MOVE_START_WINDOW;
  });
  if (later) {
    return sortPeriods(periods.map((p) => (p === later ? { ...p, start: date } : p)));
  }
  return sortPeriods([...periods, { start: date, end: null }]);
}

/**
 * «Месячные закончились» в дату `date`: ставит конец последним месячным,
 * начавшимся не позже даты и не раньше чем за 14 дней. Нет таких — null.
 */
export function markPeriodEnd(periods: Period[], date: IsoDate): Period[] | null {
  const target = sortPeriods(periods)
    .filter((p) => compareDates(p.start, date) <= 0)
    .at(-1);
  if (!target || diffDays(target.start, date) >= MAX_PERIOD_DAYS) return null;
  return periods.map((p) => (p === target ? { ...p, end: date } : p));
}

export function removePeriod(periods: Period[], start: IsoDate): Period[] {
  return periods.filter((p) => p.start !== start);
}

/** Идут ли месячные сейчас: начались недавно и конец не отмечен или ещё не наступил. */
export function ongoingPeriod(periods: Period[], today: IsoDate, periodLength: number): Period | undefined {
  const last = sortPeriods(periods)
    .filter((p) => compareDates(p.start, today) <= 0)
    .at(-1);
  if (!last) return undefined;
  if (last.end) return compareDates(today, last.end) <= 0 ? last : undefined;
  // Конец не отмечен: считаем, что идут, пока не прошла ожидаемая длина + 2 дня запаса.
  return diffDays(last.start, today) < periodLength + 2 ? last : undefined;
}
