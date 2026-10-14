// Календарные даты в формате YYYY-MM-DD без часовых поясов.
// Вся арифметика идёт в UTC, чтобы переход на летнее время не сдвигал дни.

export type IsoDate = string;

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

function toUtcMs(date: IsoDate): number {
  if (!ISO_RE.test(date)) {
    throw new Error(`Ожидалась дата YYYY-MM-DD, получено: ${date}`);
  }
  const [y, m, d] = date.split("-").map(Number);
  const ms = Date.UTC(y, m - 1, d);
  if (new Date(ms).getUTCDate() !== d) {
    throw new Error(`Несуществующая дата: ${date}`);
  }
  return ms;
}

function fromUtcMs(ms: number): IsoDate {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return fromUtcMs(toUtcMs(date) + days * DAY_MS);
}

/** Сколько дней от `from` до `to` (положительно, если `to` позже). */
export function diffDays(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS);
}

export function compareDates(a: IsoDate, b: IsoDate): number {
  return diffDays(b, a);
}

export function assertIsoDate(date: IsoDate): void {
  toUtcMs(date);
}
