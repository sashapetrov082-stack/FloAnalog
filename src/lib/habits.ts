// Трекер привычек: привычки, отметки по дням, проценты за день, неделю и месяц, серии.
// Чистые функции: «сегодня» передаётся параметром.

import { addDays, compareDates, diffDays, type IsoDate } from "@/lib/cycle/dates";
import { isoFromParts } from "@/lib/cycle/calendar";

export interface Habit {
  /** uuid — создаётся на устройстве, чтобы работало без интернета. */
  id: string;
  name: string;
  emoji: string;
  /** Цель: сколько дней в месяц, 1…31. */
  goal: number;
  /** Порядок в списке. */
  position: number;
}

/** Отметки: дата → id выполненных привычек. */
export type HabitChecks = Record<IsoDate, string[]>;

export const MAX_HABITS = 20;
export const HABIT_NAME_MAX = 60;

export const HABIT_TEMPLATES: { name: string; emoji: string; goal: number }[] = [
  { name: "Медитация", emoji: "🧘", goal: 10 },
  { name: "Пить воду", emoji: "💧", goal: 31 },
  { name: "10 000 шагов", emoji: "🚶", goal: 31 },
  { name: "Читать книгу", emoji: "📚", goal: 10 },
  { name: "Полезное питание", emoji: "🥗", goal: 31 },
  { name: "Тренировка", emoji: "💪", goal: 10 },
  { name: "Сон до 23:00", emoji: "😴", goal: 31 },
  { name: "Ведение дневника", emoji: "📝", goal: 4 },
  { name: "Уход за собой", emoji: "🧴", goal: 15 },
  { name: "Час без телефона", emoji: "📵", goal: 31 },
];

export const HABIT_EMOJIS = ["✅", "🧘", "💧", "🚶", "📚", "🥗", "💪", "😴", "📝", "🧴", "📵", "🌿", "🎨", "🎵", "💊", "🙏", "🧹", "💰", "🗣️", "❤️"];

export function isChecked(checks: HabitChecks, date: IsoDate, id: string): boolean {
  return checks[date]?.includes(id) ?? false;
}

/** Отметить или снять отметку. Пустые дни удаляются. */
export function toggleCheck(checks: HabitChecks, date: IsoDate, id: string): HabitChecks {
  const day = checks[date] ?? [];
  const nextDay = day.includes(id) ? day.filter((x) => x !== id) : [...day, id];
  const next = { ...checks };
  if (nextDay.length) next[date] = nextDay;
  else delete next[date];
  return next;
}

/** Удалить привычку вместе со всеми её отметками. */
export function removeHabit(habits: Habit[], checks: HabitChecks, id: string): { habits: Habit[]; checks: HabitChecks } {
  const nextChecks: HabitChecks = {};
  for (const [date, ids] of Object.entries(checks)) {
    const rest = ids.filter((x) => x !== id);
    if (rest.length) nextChecks[date] = rest;
  }
  return { habits: habits.filter((h) => h.id !== id), checks: nextChecks };
}

/** Привычки по порядку. */
export function sortHabits(habits: Habit[]): Habit[] {
  return [...habits].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
}

/** Сдвинуть привычку вверх (-1) или вниз (+1); позиции перенумеровываются подряд. */
export function moveHabit(habits: Habit[], id: string, delta: -1 | 1): Habit[] {
  const list = sortHabits(habits);
  const i = list.findIndex((h) => h.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= list.length) return habits;
  [list[i], list[j]] = [list[j], list[i]];
  return list.map((h, position) => ({ ...h, position }));
}

/** Все дни месяца (`month` — 1…12). */
export function monthDays(year: number, month: number): IsoDate[] {
  const first = isoFromParts(year, month, 1);
  const next = month === 12 ? isoFromParts(year + 1, 1, 1) : isoFromParts(year, month + 1, 1);
  return Array.from({ length: diffDays(first, next) }, (_, i) => addDays(first, i));
}

/** Текущая серия: дни подряд с отметкой. Если сегодня ещё не отмечено — считаем до вчера. */
export function streak(checks: HabitChecks, id: string, today: IsoDate): number {
  let day = isChecked(checks, today, id) ? today : addDays(today, -1);
  let n = 0;
  while (isChecked(checks, day, id)) {
    n++;
    day = addDays(day, -1);
  }
  return n;
}

export interface HabitMonthStats {
  done: number;
  goal: number;
  /** Выполнено от цели, может быть больше 1. */
  ratio: number;
  streak: number;
}

export function habitMonthStats(
  habit: Habit,
  checks: HabitChecks,
  year: number,
  month: number,
  today: IsoDate,
): HabitMonthStats {
  const done = monthDays(year, month).filter((d) => isChecked(checks, d, habit.id)).length;
  return { done, goal: habit.goal, ratio: done / habit.goal, streak: streak(checks, habit.id, today) };
}

export interface MonthSummary {
  /** Доля выполненного за прошедшие дни месяца; null — месяц ещё не начался или нет привычек. */
  percent: number | null;
  days: { date: IsoDate; percent: number | null }[];
  /** Недели месяца: 1–7, 8–14, 15–21, 22–28, 29–31. */
  weeks: { index: number; from: IsoDate; to: IsoDate; percent: number | null }[];
}

function share(checked: number, total: number): number | null {
  return total > 0 ? checked / total : null;
}

export function monthSummary(habits: Habit[], checks: HabitChecks, year: number, month: number, today: IsoDate): MonthSummary {
  const ids = new Set(habits.map((h) => h.id));
  const count = (d: IsoDate) => (checks[d] ?? []).filter((id) => ids.has(id)).length;
  const days = monthDays(year, month).map((date) => ({
    date,
    // Будущие дни не считаем — иначе месяц всегда выглядел бы проваленным.
    percent: compareDates(date, today) > 0 ? null : share(count(date), habits.length),
  }));
  const summarize = (list: typeof days) => {
    const past = list.filter((d) => d.percent !== null);
    return share(
      past.reduce((sum, d) => sum + count(d.date), 0),
      past.length * habits.length,
    );
  };
  const weeks = [];
  for (let i = 0; i * 7 < days.length; i++) {
    const chunk = days.slice(i * 7, i * 7 + 7);
    weeks.push({ index: i + 1, from: chunk[0].date, to: chunk.at(-1)!.date, percent: summarize(chunk) });
  }
  return { percent: summarize(days), days, weeks };
}
