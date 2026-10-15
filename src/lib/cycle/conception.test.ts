import { describe, expect, it } from "vitest";
import type { DayLog, DayLogs } from "@/lib/journal";
import { detectTemperatureShift, fertilityToday, lastPositiveTest, temperatures } from "./conception";
import { addDays } from "./dates";
import { predict } from "./predict";

const log = (patch: Partial<DayLog>): DayLog => ({ symptoms: [], moods: [], ...patch });
const periods = [{ start: "2026-10-01", end: "2026-10-05" }];
const at = (today: string) => predict({ periods, today, defaultCycleLength: 28, defaultPeriodLength: 5 })!;

/** Температуры с 1 октября подряд. */
function temps(values: number[]): DayLogs {
  return Object.fromEntries(values.map((t, i) => [addDays("2026-10-01", i), log({ temperature: t })]));
}

describe("режим зачатия", () => {
  it("правило «3 выше 6»", () => {
    const low = [36.4, 36.5, 36.3, 36.45, 36.4, 36.5, 36.35, 36.4, 36.45, 36.5, 36.4, 36.45, 36.4, 36.5];
    const logs = temps([...low, 36.6, 36.65, 36.75, 36.8]);
    const shift = detectTemperatureShift(temperatures(logs, "2026-10-01", "2026-10-31"));
    expect(shift).toEqual({ coverline: 36.5, firstHigh: "2026-10-15", ovulation: "2026-10-14", confirmedOn: "2026-10-17" });
    // Третье измерение выше линии меньше чем на 0,2 — подъём не подтверждён.
    expect(detectTemperatureShift(temperatures(temps([...low, 36.6, 36.6, 36.65]), "2026-10-01", "2026-10-31"))).toBeNull();
    // Меньше шести измерений до подъёма — не решаем.
    expect(detectTemperatureShift(temperatures(temps([36.4, 36.4, 36.8, 36.8, 36.8]), "2026-10-01", "2026-10-31"))).toBeNull();
  });

  it("пропуски дней не мешают", () => {
    const logs = temps([36.4, 36.5, 36.3, 36.45, 36.4, 36.5, 36.4, 36.45, 36.4, 36.5]);
    delete logs["2026-10-03"];
    Object.assign(logs, {
      "2026-10-16": log({ temperature: 36.7 }),
      "2026-10-18": log({ temperature: 36.75 }),
      "2026-10-19": log({ temperature: 36.8 }),
    });
    expect(detectTemperatureShift(temperatures(logs, "2026-10-01", "2026-10-31"))?.firstHigh).toBe("2026-10-16");
  });

  it("по прогнозу: вне окна, окно, дни перед овуляцией", () => {
    expect(at("2026-10-03").ovulation).toBe("2026-10-15");
    expect(fertilityToday(at("2026-10-03"), {}, "2026-10-03").level).toBe("low");
    expect(fertilityToday(at("2026-10-11"), {}, "2026-10-11").level).toBe("medium");
    expect(fertilityToday(at("2026-10-14"), {}, "2026-10-14").level).toBe("high");
    expect(fertilityToday(at("2026-10-20"), {}, "2026-10-20").level).toBe("low");
  });

  it("положительный тест повышает оценку на 2 дня", () => {
    const logs: DayLogs = { "2026-10-08": log({ ovulationTest: "negative" }), "2026-10-09": log({ ovulationTest: "positive" }) };
    expect(lastPositiveTest(logs, "2026-10-01", "2026-10-31")).toBe("2026-10-09");
    const f = fertilityToday(at("2026-10-09"), logs, "2026-10-09");
    expect([f.level, f.source, f.ovulation]).toEqual(["high", "test", "2026-10-10"]);
    expect(fertilityToday(at("2026-10-11"), logs, "2026-10-11").source).toBe("test");
    expect(fertilityToday(at("2026-10-12"), logs, "2026-10-12").source).toBe("prediction");
  });

  it("подтверждённый подъём температуры закрывает окно", () => {
    const logs = temps([36.4, 36.5, 36.3, 36.45, 36.4, 36.5, 36.35, 36.4, 36.45, 36.5, 36.4, 36.7, 36.75, 36.8]);
    // Подъём с 12 октября, овуляция ~11-го: 14-го по прогнозу было бы «высокая», но температура важнее.
    const f = fertilityToday(at("2026-10-14"), logs, "2026-10-14");
    expect([f.level, f.source, f.ovulation]).toEqual(["low", "temperature", "2026-10-11"]);
  });
});
