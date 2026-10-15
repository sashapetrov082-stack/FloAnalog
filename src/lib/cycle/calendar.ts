// Разметка календаря: какие дни — месячные, прогноз, фертильные, овуляция.

import { addDays, compareDates, diffDays, type IsoDate } from "./dates";
import { periodEnd } from "./periods";
import { LUTEAL_PHASE_DAYS, type Period, type Prediction } from "./predict";

export type DayMark = "period" | "predicted-period" | "fertile" | "ovulation";

/** Сколько будущих циклов показывать в календаре. */
export const CYCLES_AHEAD = 6;

const KNOWN_MONDAY = "2024-01-01";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function isoFromParts(year: number, month: number, day: number): IsoDate {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * Сетка месяца по неделям, неделя начинается с понедельника.
 * `month` — 1…12. Пустые клетки до 1-го числа и после последнего — null.
 */
export function monthGrid(year: number, month: number): (IsoDate | null)[][] {
  const first = isoFromParts(year, month, 1);
  const nextFirst = month === 12 ? isoFromParts(year + 1, 1, 1) : isoFromParts(year, month + 1, 1);
  const daysInMonth = diffDays(first, nextFirst);
  // 1 января 2024 — понедельник; 0 — понедельник, 6 — воскресенье.
  const offset = ((diffDays(KNOWN_MONDAY, first) % 7) + 7) % 7;
  const cells: (IsoDate | null)[] = Array(offset).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(isoFromParts(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (IsoDate | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

function eachDay(start: IsoDate, end: IsoDate, fn: (date: IsoDate) => void): void {
  for (let d = start; compareDates(d, end) <= 0; d = addDays(d, 1)) fn(d);
}

/**
 * Отметки дней для календаря.
 * Отмеченные месячные важнее прогноза; прогноз месячных не ставим на прошедшие дни.
 */
export function dayMarks(
  periods: Period[],
  prediction: Prediction | null,
  today: IsoDate,
  /** Гормональная контрацепция: вместо прогноза цикла — ожидаемое кровотечение отмены. */
  withdrawal: IsoDate[] | null = null,
): Map<IsoDate, DayMark> {
  const marks = new Map<IsoDate, DayMark>();
  if (withdrawal) {
    for (const d of withdrawal) if (compareDates(d, today) >= 0) marks.set(d, "predicted-period");
    markPeriods(marks, periods, prediction?.periodLength ?? 5, today);
    return marks;
  }
  if (!prediction) return marks;
  const { cycleLength, periodLength } = prediction;

  // Прогноз: текущий цикл и несколько следующих. При задержке ожидаемые
  // месячные сдвигаются на сегодня, а следующие циклы — вслед за ними.
  const delayed = prediction.delayDays > 0;
  const firstStart = delayed ? today : prediction.nextPeriod.date;
  for (let k = 0; k < CYCLES_AHEAD; k++) {
    const start = addDays(firstStart, k * cycleLength);
    // Фертильное окно текущего цикла при задержке уже позади и остаётся на прежнем месте.
    const ovulation = addDays(k === 0 ? prediction.nextPeriod.date : start, -LUTEAL_PHASE_DAYS);
    eachDay(addDays(ovulation, -5), addDays(ovulation, 1), (d) => marks.set(d, "fertile"));
    marks.set(ovulation, "ovulation");
    eachDay(start, addDays(start, periodLength - 1), (d) => {
      if (compareDates(d, today) >= 0) marks.set(d, "predicted-period");
    });
  }

  markPeriods(marks, periods, periodLength, today);
  return marks;
}

function markPeriods(marks: Map<IsoDate, DayMark>, periods: Period[], periodLength: number, today: IsoDate): void {
  for (const p of periods) {
    const end = periodEnd(p, periodLength);
    eachDay(p.start, end, (d) => {
      // Неотмеченный конец в будущем — это ещё прогноз.
      marks.set(d, !p.end && compareDates(d, today) > 0 ? "predicted-period" : "period");
    });
  }
}
