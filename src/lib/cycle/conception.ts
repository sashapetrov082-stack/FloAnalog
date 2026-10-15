// Режим зачатия: фертильность на сегодня по прогнозу, тестам на овуляцию и базальной температуре.
// Чистые функции: «сегодня» передаётся параметром. Это ориентир для планирования, не диагноз
// и не метод контрацепции.

import type { DayLogs } from "@/lib/journal";
import { addDays, compareDates, diffDays, type IsoDate } from "./dates";
import type { Prediction } from "./predict";

export interface TempPoint {
  date: IsoDate;
  temp: number;
}

/** Измерения температуры с `from` по `to` включительно, по порядку. */
export function temperatures(dayLogs: DayLogs, from: IsoDate, to: IsoDate): TempPoint[] {
  return Object.entries(dayLogs)
    .filter(([date, log]) => log.temperature != null && compareDates(date, from) >= 0 && compareDates(date, to) <= 0)
    .map(([date, log]) => ({ date, temp: log.temperature! }))
    .sort((a, b) => compareDates(a.date, b.date));
}

export interface TemperatureShift {
  /** Линия покрытия — максимум шести измерений перед подъёмом. */
  coverline: number;
  /** Первый день высокой температуры. */
  firstHigh: IsoDate;
  /** Овуляция, вероятно, накануне подъёма. */
  ovulation: IsoDate;
  /** День третьего высокого измерения — подъём подтверждён. */
  confirmedOn: IsoDate;
}

/** Подъём на 0,2 °C, который считается подтверждающим. */
export const SHIFT_DELTA = 0.2;
const EPS = 1e-9;

/**
 * Правило «3 выше 6»: три измерения подряд выше максимума шести предыдущих,
 * третье — хотя бы на 0,2 °C выше. Пропущенные дни не мешают: считаются только измерения.
 */
export function detectTemperatureShift(points: TempPoint[]): TemperatureShift | null {
  for (let i = 6; i + 2 < points.length; i++) {
    const coverline = Math.max(...points.slice(i - 6, i).map((p) => p.temp));
    const [a, b, c] = points.slice(i, i + 3);
    if (a.temp > coverline + EPS && b.temp > coverline + EPS && c.temp >= coverline + SHIFT_DELTA - EPS) {
      return { coverline, firstHigh: a.date, ovulation: addDays(a.date, -1), confirmedOn: c.date };
    }
  }
  return null;
}

/** Последний положительный (или пиковый) тест на овуляцию с `from` по `to`. */
export function lastPositiveTest(dayLogs: DayLogs, from: IsoDate, to: IsoDate): IsoDate | null {
  const dates = Object.entries(dayLogs)
    .filter(
      ([date, log]) =>
        (log.ovulationTest === "positive" || log.ovulationTest === "peak") &&
        compareDates(date, from) >= 0 &&
        compareDates(date, to) <= 0,
    )
    .map(([date]) => date)
    .sort(compareDates);
  return dates.at(-1) ?? null;
}

export type FertilityLevel = "high" | "medium" | "low";

export interface FertilityToday {
  level: FertilityLevel;
  /** Почему такая оценка — короткое пояснение для экрана. */
  reason: string;
  /** Лучшая оценка овуляции в текущем цикле и откуда она. */
  ovulation: IsoDate;
  source: "temperature" | "test" | "prediction";
  shift: TemperatureShift | null;
}

export const FERTILITY_LABEL: Record<FertilityLevel, string> = {
  high: "высокая",
  medium: "средняя",
  low: "низкая",
};

export function fertilityToday(prediction: Prediction, dayLogs: DayLogs, today: IsoDate): FertilityToday {
  const cycleStart = prediction.lastPeriodStart;
  const shift = detectTemperatureShift(temperatures(dayLogs, cycleStart, today));
  const test = lastPositiveTest(dayLogs, cycleStart, today);

  if (shift && compareDates(today, addDays(shift.ovulation, 1)) > 0) {
    return {
      level: "low",
      reason: "Температура поднялась и держится — овуляция, вероятно, уже прошла. В этом цикле фертильное окно, скорее всего, закрылось.",
      ovulation: shift.ovulation,
      source: "temperature",
      shift,
    };
  }
  if (test && diffDays(test, today) <= 2) {
    return {
      level: "high",
      reason: "Тест на овуляцию положительный — обычно овуляция наступает в ближайшие 1–2 дня.",
      ovulation: addDays(test, 1),
      source: "test",
      shift,
    };
  }

  const { start, end } = prediction.fertileWindow;
  const ovulation = prediction.ovulation;
  const inWindow = compareDates(today, start) >= 0 && compareDates(today, end) <= 0;
  const nearOvulation = inWindow && compareDates(today, addDays(ovulation, -2)) >= 0 && compareDates(today, ovulation) <= 0;
  if (prediction.phase === "menstruation" || !inWindow) {
    return {
      level: "low",
      reason: "По прогнозу сегодня вне фертильного окна.",
      ovulation,
      source: "prediction",
      shift,
    };
  }
  return {
    level: nearOvulation ? "high" : "medium",
    reason: nearOvulation ? "По прогнозу — дни перед овуляцией, самые благоприятные." : "По прогнозу — фертильное окно.",
    ovulation,
    source: "prediction",
    shift,
  };
}
