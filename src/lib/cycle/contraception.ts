// Контрацепция: где сегодня в схеме (таблетки, кольцо, пластырь) и что нужно сделать.
// Чистые функции: «сегодня» передаётся параметром. Медицинских советов здесь нет —
// только календарь схемы, как в инструкции к препарату.

import { addDays, compareDates, diffDays, type IsoDate } from "./dates";

export type Method = "none" | "pill" | "ring" | "patch";
export type PillRegimen = "21_7" | "24_4" | "28_0" | "pop";

export interface ContraceptionSettings {
  method: Method;
  regimen: PillRegimen | null;
  /** Первый день текущей упаковки / кольца / первого пластыря цикла. */
  startDate: IsoDate | null;
}

export const METHODS: { id: Method; label: string }[] = [
  { id: "none", label: "Не отслеживать" },
  { id: "pill", label: "Таблетки" },
  { id: "ring", label: "Кольцо" },
  { id: "patch", label: "Пластырь" },
];

export const REGIMENS: { id: PillRegimen; label: string; hint: string }[] = [
  { id: "21_7", label: "21 + 7", hint: "21 таблетка, затем 7 дней перерыва" },
  { id: "24_4", label: "24 + 4", hint: "24 активные таблетки, затем 4 дня перерыва или пустышек" },
  { id: "28_0", label: "28 без перерыва", hint: "таблетки каждый день без перерыва" },
  { id: "pop", label: "Мини-пили", hint: "прогестиновые таблетки каждый день без перерыва" },
];

/** Сколько дней активной фазы в 28-дневной схеме. */
function activeDays(s: ContraceptionSettings): number {
  if (s.method === "pill") return s.regimen === "24_4" ? 24 : s.regimen === "21_7" ? 21 : 28;
  return 21; // кольцо: 3 недели; пластырь: 3 пластыря по неделе
}

/**
 * Скрывать ли фертильное окно и овуляцию. При комбинированных таблетках, кольце и пластыре
 * овуляция обычно подавлена, а кровотечение в перерыв — не обычные месячные.
 * Мини-пили не всегда подавляют овуляцию — для них прогноз не скрываем.
 */
export function isHormonalCycleControl(s: ContraceptionSettings): boolean {
  return s.startDate !== null && (s.method === "ring" || s.method === "patch" || (s.method === "pill" && s.regimen !== "pop"));
}

export type Action = "take_pill" | "insert_ring" | "remove_ring" | "apply_patch" | "remove_patch";

export interface SchemeDay {
  /** День 28-дневной схемы, 1…28. */
  day: number;
  /** Активная фаза (таблетки/кольцо/пластырь) или перерыв. */
  phase: "active" | "break";
  activeTotal: number;
  breakTotal: number;
  /** Что нужно сделать сегодня. */
  actions: Action[];
  /** Начало следующего перерыва — тогда ждать кровотечения отмены. Нет перерыва — null. */
  nextBreakStart: IsoDate | null;
  /** Начало следующей упаковки / кольца / цикла пластырей. */
  nextCycleStart: IsoDate;
}

export const ACTION_LABELS: Record<Action, string> = {
  take_pill: "Принять таблетку",
  insert_ring: "Вставить кольцо",
  remove_ring: "Снять кольцо",
  apply_patch: "Наклеить новый пластырь",
  remove_patch: "Снять пластырь",
};

/** Где в схеме дата `date`. Схема повторяется каждые 28 дней от даты начала. Раньше начала — null. */
export function schemeDay(s: ContraceptionSettings, date: IsoDate): SchemeDay | null {
  if (s.method === "none" || !s.startDate || compareDates(date, s.startDate) < 0) return null;
  const offset = diffDays(s.startDate, date) % 28;
  const day = offset + 1;
  const active = activeDays(s);
  const phase = day <= active ? "active" : "break";
  const cycleStart = addDays(date, -offset);
  const nextCycleStart = addDays(cycleStart, 28);

  const actions: Action[] = [];
  if (s.method === "pill" && phase === "active") actions.push("take_pill");
  if (s.method === "ring" && day === 1) actions.push("insert_ring");
  if (s.method === "ring" && day === 22) actions.push("remove_ring");
  if (s.method === "patch" && (day === 1 || day === 8 || day === 15)) actions.push("apply_patch");
  if (s.method === "patch" && day === 22) actions.push("remove_patch");

  const hasBreak = active < 28;
  const breakThisCycle = addDays(cycleStart, active);
  const nextBreakStart = !hasBreak
    ? null
    : compareDates(date, breakThisCycle) < 0
      ? breakThisCycle
      : addDays(breakThisCycle, 28);

  return { day, phase, activeTotal: active, breakTotal: 28 - active, actions, nextBreakStart, nextCycleStart };
}

/** Дни ожидаемого кровотечения отмены на ближайшие циклы (для календаря): 2-й–5-й день перерыва. */
export function withdrawalDays(s: ContraceptionSettings, today: IsoDate, cycles = 3): IsoDate[] {
  const info = schemeDay(s, today);
  if (!info?.nextBreakStart || !isHormonalCycleControl(s)) return [];
  // Если перерыв идёт сейчас — начинаем с него.
  const first = info.phase === "break" ? addDays(info.nextCycleStart, -info.breakTotal) : info.nextBreakStart;
  const days: IsoDate[] = [];
  for (let k = 0; k < cycles; k++) {
    const breakStart = addDays(first, k * 28);
    for (let d = 1; d < Math.min(5, info.breakTotal + 1); d++) days.push(addDays(breakStart, d));
  }
  return days;
}

/** Короткая строка для экрана: «Таблетка 12 из 21», «Перерыв: день 3 из 7». */
export function describeScheme(s: ContraceptionSettings, info: SchemeDay): string {
  if (info.phase === "break") return `Перерыв: день ${info.day - info.activeTotal} из ${info.breakTotal}`;
  if (s.method === "pill") {
    return s.regimen === "28_0" || s.regimen === "pop" ? `Таблетка ${info.day} из 28` : `Таблетка ${info.day} из ${info.activeTotal}`;
  }
  if (s.method === "ring") return `Кольцо: день ${info.day} из 21`;
  return `Пластырь ${Math.ceil(info.day / 7)} из 3: день ${((info.day - 1) % 7) + 1} из 7`;
}

/**
 * Пора ли напомнить. `localDate`/`localMinutes` — местные дата и время пользователя.
 * Напоминаем в день действия, начиная с выбранного времени, один раз; повторно — через час,
 * если таблетка не отмечена. Отмеченное действие (таблетка, кольцо, пластырь) — без напоминаний.
 */
export function dueReminder(
  s: ContraceptionSettings & { reminderMinutes: number },
  localDate: IsoDate,
  localMinutes: number,
  takenToday: boolean,
): "first" | "repeat" | null {
  const info = schemeDay(s, localDate);
  if (!info || info.actions.length === 0 || localMinutes < s.reminderMinutes) return null;
  if (takenToday) return null;
  if (s.method === "pill" && localMinutes >= s.reminderMinutes + 60) return "repeat";
  return "first";
}
