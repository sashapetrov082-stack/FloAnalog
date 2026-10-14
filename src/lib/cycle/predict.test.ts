import { describe, expect, it } from "vitest";
import { addDays, diffDays } from "./dates";
import { cycleLengths, predict, type Period } from "./predict";

/** Месячные, начинающиеся с `first` с заданными длинами циклов между ними. */
function history(first: string, lengths: number[], periodLength = 5): Period[] {
  const periods: Period[] = [];
  let start = first;
  for (const length of [...lengths, null]) {
    periods.push({ start, end: addDays(start, periodLength - 1) });
    if (length !== null) start = addDays(start, length);
  }
  return periods;
}

describe("predict", () => {
  it("1. без отмеченных месячных прогноза нет", () => {
    expect(predict({ periods: [], today: "2026-10-14" })).toBeNull();
  });

  it("2. одни месячные — длина цикла по умолчанию 28 и разброс ±1", () => {
    const p = predict({ periods: [{ start: "2026-10-01" }], today: "2026-10-03" })!;
    expect(p.basedOnHistory).toBe(false);
    expect(p.cycleLength).toBe(28);
    expect(p.nextPeriod).toEqual({
      date: "2026-10-29",
      earliest: "2026-10-28",
      latest: "2026-10-30",
      spreadDays: 1,
    });
  });

  it("3. одни месячные — берётся длина цикла из анкеты", () => {
    const p = predict({ periods: [{ start: "2026-10-01" }], today: "2026-10-03", defaultCycleLength: 32 })!;
    expect(p.cycleLength).toBe(32);
    expect(p.nextPeriod.date).toBe("2026-11-02");
  });

  it("4. овуляция за 14 дней до месячных, окно от −5 до +1 дня", () => {
    const p = predict({ periods: [{ start: "2026-10-01" }], today: "2026-10-03" })!;
    expect(p.ovulation).toBe("2026-10-15");
    expect(p.fertileWindow).toEqual({ start: "2026-10-10", end: "2026-10-16" });
  });

  it("5. регулярные циклы — среднее и минимальный разброс ±1", () => {
    const p = predict({ periods: history("2026-01-01", [30, 30, 30]), today: "2026-04-05" })!;
    expect(p.basedOnHistory).toBe(true);
    expect(p.cyclesUsed).toBe(3);
    expect(p.cycleLength).toBe(30);
    expect(p.nextPeriod.spreadDays).toBe(1);
  });

  it("6. нерегулярные циклы — разброс равен стандартному отклонению", () => {
    // 24, 32, 28, 36: среднее 30, выборочное отклонение ≈ 5.16
    const periods = history("2026-01-01", [24, 32, 28, 36]);
    const p = predict({ periods, today: "2026-05-01" })!;
    expect(p.cycleLength).toBe(30);
    expect(p.nextPeriod.spreadDays).toBe(5);
    expect(diffDays(p.nextPeriod.earliest, p.nextPeriod.latest)).toBe(10);
  });

  it("7. усредняются только последние 6 циклов", () => {
    const periods = history("2025-01-01", [40, 40, 40, 28, 28, 28, 28, 28, 28]);
    const p = predict({ periods, today: "2025-12-01" })!;
    expect(p.cyclesUsed).toBe(6);
    expect(p.cycleLength).toBe(28);
  });

  it("8. выбросы короче 15 и длиннее 60 дней не учитываются", () => {
    expect(cycleLengths(history("2026-01-01", [10, 28, 70, 28]))).toEqual([28, 28]);
  });

  it("9. все циклы — выбросы: используется значение из анкеты", () => {
    const p = predict({ periods: history("2026-01-01", [90]), today: "2026-04-05", defaultCycleLength: 30 })!;
    expect(p.basedOnHistory).toBe(false);
    expect(p.cycleLength).toBe(30);
  });

  it("10. порядок и дубли отметок не влияют на результат", () => {
    const periods = history("2026-01-01", [27, 29, 28]);
    const shuffled = [periods[2], periods[0], periods[3], periods[1], periods[0]];
    expect(predict({ periods: shuffled, today: "2026-04-01" })).toEqual(
      predict({ periods, today: "2026-04-01" }),
    );
  });

  it("11. отметки в будущем игнорируются", () => {
    const p = predict({
      periods: [{ start: "2026-10-01" }, { start: "2026-12-01" }],
      today: "2026-10-05",
    })!;
    expect(p.lastPeriodStart).toBe("2026-10-01");
  });

  it("12. день цикла и фазы по ходу цикла", () => {
    const periods: Period[] = [{ start: "2026-10-01", end: "2026-10-05" }];
    const at = (today: string) => predict({ periods, today })!;
    expect(at("2026-10-01").cycleDay).toBe(1);
    expect(at("2026-10-05").phase).toBe("menstruation");
    expect(at("2026-10-07").phase).toBe("follicular");
    expect(at("2026-10-12").phase).toBe("fertile");
    expect(at("2026-10-15").phase).toBe("ovulation");
    expect(at("2026-10-20").phase).toBe("luteal");
  });

  it("13. задержка: считается, предупреждение только после 7 дней", () => {
    const periods: Period[] = [{ start: "2026-09-01", end: "2026-09-05" }];
    const late5 = predict({ periods, today: "2026-10-04" })!; // ожидались 29.09
    expect(late5.delayDays).toBe(5);
    expect(late5.warnings).toEqual([]);
    const late8 = predict({ periods, today: "2026-10-07" })!;
    expect(late8.delayDays).toBe(8);
    expect(late8.cycleDay).toBe(37);
    expect(late8.warnings).toContainEqual({ type: "delay", days: 8 });
  });

  it("14. мягкие предупреждения о коротком и длинном цикле", () => {
    const short = predict({ periods: history("2026-01-01", [19, 20, 19]), today: "2026-03-05" })!;
    expect(short.warnings).toContainEqual({ type: "short_cycle", averageLength: 19 });
    const long = predict({ periods: history("2026-01-01", [40, 38]), today: "2026-03-20" })!;
    expect(long.warnings).toContainEqual({ type: "long_cycle", averageLength: 39 });
    // Значение из анкеты не вызывает предупреждений.
    const fromForm = predict({ periods: [{ start: "2026-10-01" }], today: "2026-10-02", defaultCycleLength: 40 })!;
    expect(fromForm.warnings).toEqual([]);
  });

  it("15. длина месячных — среднее по отмеченным концам, иначе из анкеты", () => {
    const withEnds = predict({ periods: history("2026-01-01", [28, 28], 4), today: "2026-03-01" })!;
    expect(withEnds.periodLength).toBe(4);
    const noEnds = predict({ periods: [{ start: "2026-10-01" }], today: "2026-10-02", defaultPeriodLength: 6 })!;
    expect(noEnds.periodLength).toBe(6);
    expect(predict({ periods: [{ start: "2026-10-01" }], today: "2026-10-06", defaultPeriodLength: 6 })!.phase).toBe(
      "menstruation",
    );
  });

  it("16. переход через год и високосный февраль", () => {
    const p = predict({ periods: [{ start: "2028-02-15" }], today: "2028-02-20" })!;
    expect(p.nextPeriod.date).toBe("2028-03-14");
    const ny = predict({ periods: [{ start: "2026-12-20" }], today: "2026-12-25" })!;
    expect(ny.nextPeriod.date).toBe("2027-01-17");
  });

  it("17. некорректная дата — ошибка, а не тихий неверный прогноз", () => {
    expect(() => predict({ periods: [{ start: "2026-02-30" }], today: "2026-03-01" })).toThrow();
    expect(() => predict({ periods: [{ start: "01.10.2026" }], today: "2026-10-14" })).toThrow();
  });
});
