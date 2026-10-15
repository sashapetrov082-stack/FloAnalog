// Алгоритм прогноза для MVP. Чистая функция: без базы, без Date.now(),
// чтобы её можно было покрыть тестами и переиспользовать в мобильном приложении.

import { addDays, assertIsoDate, compareDates, diffDays, type IsoDate } from "./dates";
import { periodEnd } from "./periods";

export const DEFAULT_CYCLE_LENGTH = 28;
export const DEFAULT_PERIOD_LENGTH = 5;
/** Сколько последних циклов усредняем. */
export const CYCLES_FOR_AVERAGE = 6;
/** Циклы короче или длиннее считаем выбросами (пропуск отметки, ошибка ввода). */
export const MIN_VALID_CYCLE = 15;
export const MAX_VALID_CYCLE = 60;
/** Границы для мягких предупреждений. */
export const SHORT_CYCLE_WARNING = 21;
export const LONG_CYCLE_WARNING = 35;
export const DELAY_WARNING_DAYS = 7;
/** Лютеиновая фаза: овуляция = следующие месячные − 14 дней. */
export const LUTEAL_PHASE_DAYS = 14;

export interface Period {
  start: IsoDate;
  /** Последний день месячных включительно; нет — месячные идут или не отмечен конец. */
  end?: IsoDate | null;
}

export interface PredictInput {
  periods: Period[];
  today: IsoDate;
  /** Значения из анкеты онбординга, используются пока нет истории. */
  defaultCycleLength?: number;
  defaultPeriodLength?: number;
  /** Дни с отмеченными выделениями: продлевают незакрытые месячные. */
  flowDays?: ReadonlySet<IsoDate>;
}

export type Phase = "menstruation" | "follicular" | "fertile" | "ovulation" | "luteal";

export type Warning =
  | { type: "short_cycle"; averageLength: number }
  | { type: "long_cycle"; averageLength: number }
  | { type: "delay"; days: number };

export interface DateRange {
  start: IsoDate;
  end: IsoDate;
}

export interface Prediction {
  /** Длина цикла, по которой считали прогноз. */
  cycleLength: number;
  periodLength: number;
  /** true — длина взята из истории, false — из анкеты или по умолчанию. */
  basedOnHistory: boolean;
  /** Сколько циклов вошло в среднее. */
  cyclesUsed: number;
  lastPeriodStart: IsoDate;
  /** Номер дня цикла сегодня, начиная с 1. */
  cycleDay: number;
  phase: Phase;
  nextPeriod: { date: IsoDate; earliest: IsoDate; latest: IsoDate; spreadDays: number };
  ovulation: IsoDate;
  fertileWindow: DateRange;
  /** На сколько дней задерживаются месячные (0 — задержки нет). */
  delayDays: number;
  warnings: Warning[];
}

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function sampleStdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function sanitizeLength(value: number | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** Длины циклов между соседними началами месячных, без выбросов, от старых к новым. */
export function cycleLengths(periods: Period[]): number[] {
  const starts = [...new Set(periods.map((p) => p.start))].sort(compareDates);
  const lengths: number[] = [];
  for (let i = 1; i < starts.length; i++) {
    const length = diffDays(starts[i - 1], starts[i]);
    if (length >= MIN_VALID_CYCLE && length <= MAX_VALID_CYCLE) lengths.push(length);
  }
  return lengths;
}

function periodLengths(periods: Period[]): number[] {
  return periods
    .filter((p): p is Period & { end: IsoDate } => !!p.end)
    .map((p) => diffDays(p.start, p.end) + 1)
    .filter((length) => length >= 1 && length <= 14);
}

/**
 * Прогноз следующих месячных, овуляции и фертильного окна.
 * Возвращает null, если не отмечено ни одних месячных: прогнозировать не от чего.
 */
export function predict(input: PredictInput): Prediction | null {
  const { periods, today } = input;
  assertIsoDate(today);
  periods.forEach((p) => {
    assertIsoDate(p.start);
    if (p.end) assertIsoDate(p.end);
  });

  // Будущие отметки (ошибка ввода) не учитываем.
  const past = periods.filter((p) => compareDates(p.start, today) <= 0);
  if (past.length === 0) return null;

  const sorted = [...past].sort((a, b) => compareDates(a.start, b.start));
  const last = sorted[sorted.length - 1];

  const recent = cycleLengths(sorted).slice(-CYCLES_FOR_AVERAGE);
  const basedOnHistory = recent.length > 0;
  const defaultCycle = sanitizeLength(input.defaultCycleLength, DEFAULT_CYCLE_LENGTH, MIN_VALID_CYCLE, MAX_VALID_CYCLE);
  const cycleLength = basedOnHistory ? Math.round(mean(recent)) : defaultCycle;
  const spreadDays = Math.max(1, Math.round(sampleStdDev(recent)));

  const recentPeriods = periodLengths(sorted).slice(-CYCLES_FOR_AVERAGE);
  const defaultPeriod = sanitizeLength(input.defaultPeriodLength, DEFAULT_PERIOD_LENGTH, 1, 14);
  const periodLength = Math.min(
    cycleLength - 1,
    recentPeriods.length > 0 ? Math.round(mean(recentPeriods)) : defaultPeriod,
  );

  const nextDate = addDays(last.start, cycleLength);
  const ovulation = addDays(nextDate, -LUTEAL_PHASE_DAYS);
  const fertileWindow = { start: addDays(ovulation, -5), end: addDays(ovulation, 1) };

  const cycleDay = diffDays(last.start, today) + 1;
  const delayDays = Math.max(0, diffDays(nextDate, today));

  const lastEnd = periodEnd(last, periodLength, input.flowDays);
  let phase: Phase;
  if (compareDates(today, lastEnd) <= 0) {
    phase = "menstruation";
  } else if (today === ovulation) {
    phase = "ovulation";
  } else if (compareDates(today, fertileWindow.start) >= 0 && compareDates(today, fertileWindow.end) <= 0) {
    phase = "fertile";
  } else if (compareDates(today, ovulation) < 0) {
    phase = "follicular";
  } else {
    phase = "luteal";
  }

  const warnings: Warning[] = [];
  if (basedOnHistory && cycleLength < SHORT_CYCLE_WARNING) {
    warnings.push({ type: "short_cycle", averageLength: cycleLength });
  }
  if (basedOnHistory && cycleLength > LONG_CYCLE_WARNING) {
    warnings.push({ type: "long_cycle", averageLength: cycleLength });
  }
  if (delayDays > DELAY_WARNING_DAYS) {
    warnings.push({ type: "delay", days: delayDays });
  }

  return {
    cycleLength,
    periodLength,
    basedOnHistory,
    cyclesUsed: recent.length,
    lastPeriodStart: last.start,
    cycleDay,
    phase,
    nextPeriod: {
      date: nextDate,
      earliest: addDays(nextDate, -spreadDays),
      latest: addDays(nextDate, spreadDays),
      spreadDays,
    },
    ovulation,
    fertileWindow,
    delayDays,
    warnings,
  };
}
