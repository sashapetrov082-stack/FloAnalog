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

/**
 * Последний день месячных: отмеченный конец или, если конец не отмечен, ожидаемый по средней длине —
 * но не раньше последнего дня, когда в журнале отмечены выделения (в пределах 14 дней от начала).
 */
export function periodEnd(period: Period, periodLength: number, flowDays?: ReadonlySet<IsoDate>): IsoDate {
  if (period.end) return period.end;
  let end = addDays(period.start, periodLength - 1);
  if (flowDays) {
    for (let i = 0; i < MAX_PERIOD_DAYS; i++) {
      const d = addDays(period.start, i);
      if (flowDays.has(d) && compareDates(d, end) > 0) end = d;
    }
  }
  return end;
}

/** Месячные, в которые попадает дата (с учётом ожидаемой длины, если конец не отмечен). */
export function findPeriodAt(
  periods: Period[],
  date: IsoDate,
  periodLength: number,
  flowDays?: ReadonlySet<IsoDate>,
): Period | undefined {
  return periods.find(
    (p) => compareDates(p.start, date) <= 0 && compareDates(date, periodEnd(p, periodLength, flowDays)) <= 0,
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

/**
 * Незакрытые месячные: начались не больше 14 дней назад, а конец ещё не отмечен.
 * Пока ожидаемая длина не прошла — просто идут; потом стоит спросить, идут ли ещё (см. `askIfStillGoing`).
 */
export function ongoingPeriod(periods: Period[], today: IsoDate): Period | undefined {
  const last = sortPeriods(periods)
    .filter((p) => compareDates(p.start, today) <= 0)
    .at(-1);
  if (!last || last.end) return undefined;
  return diffDays(last.start, today) < MAX_PERIOD_DAYS ? last : undefined;
}

/** Конец не отмечен, а ожидаемая длина (с учётом отмеченных выделений) уже прошла — спросить «ещё идут?». */
export function askIfStillGoing(
  periods: Period[],
  today: IsoDate,
  periodLength: number,
  flowDays?: ReadonlySet<IsoDate>,
): Period | undefined {
  const open = ongoingPeriod(periods, today);
  return open && compareDates(today, periodEnd(open, periodLength, flowDays)) > 0 ? open : undefined;
}

/** Дни, когда в журнале отмечены выделения. */
export function flowDaysOf(dayLogs: Record<IsoDate, { flow?: unknown }>): Set<IsoDate> {
  return new Set(Object.entries(dayLogs).filter(([, l]) => !!l.flow).map(([d]) => d));
}
