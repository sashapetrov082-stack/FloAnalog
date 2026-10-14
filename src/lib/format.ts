// Форматирование дат и чисел для интерфейса (русский язык).

import type { IsoDate } from "@/lib/cycle/dates";

const dayMonth = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" });
const monthOnly = new Intl.DateTimeFormat("ru-RU", { month: "long", timeZone: "UTC" });
const weekdayDayMonth = new Intl.DateTimeFormat("ru-RU", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

function toDate(date: IsoDate): Date {
  return new Date(`${date}T00:00:00Z`);
}

/** «14 октября» */
export function formatDayMonth(date: IsoDate): string {
  return dayMonth.format(toDate(date));
}

/** «вторник, 14 октября» */
export function formatLong(date: IsoDate): string {
  return weekdayDayMonth.format(toDate(date));
}

/** «12–14 ноября», «30 ноября – 2 декабря», «14 ноября» */
export function formatRange(start: IsoDate, end: IsoDate): string {
  if (start === end) return formatDayMonth(start);
  if (start.slice(0, 7) === end.slice(0, 7)) {
    return `${Number(start.slice(8))}–${formatDayMonth(end)}`;
  }
  return `${formatDayMonth(start)} – ${formatDayMonth(end)}`;
}

/** «Октябрь 2026» */
export function formatMonthTitle(year: number, month: number): string {
  const name = monthOnly.format(new Date(Date.UTC(year, month - 1, 1)));
  return `${name[0].toUpperCase()}${name.slice(1)} ${year}`;
}

/** «1 день», «3 дня», «7 дней» */
export function pluralDays(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} день`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} дня`;
  return `${n} дней`;
}

/** Сегодняшняя дата по часам устройства, YYYY-MM-DD. */
export function todayLocal(now: Date = new Date()): IsoDate {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
