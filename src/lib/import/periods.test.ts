import { describe, expect, it } from "vitest";
import {
  applyImport,
  daysToPeriods,
  extractPeriodsFromJson,
  parseDateList,
  parseLooseDate,
  planImport,
} from "./periods";

describe("импорт: даты", () => {
  it("разные форматы дат", () => {
    expect(parseLooseDate("2026-03-12")).toBe("2026-03-12");
    expect(parseLooseDate("2026-03-12T21:00:00.000Z")).toBe("2026-03-12");
    expect(parseLooseDate("12.03.2026")).toBe("2026-03-12");
    expect(parseLooseDate("2/3/2026")).toBe("2026-03-02");
    expect(parseLooseDate(Date.UTC(2026, 2, 12) / 1000)).toBe("2026-03-12");
    expect(parseLooseDate(Date.UTC(2026, 2, 12))).toBe("2026-03-12");
    expect(parseLooseDate("31.02.2026")).toBeNull();
    expect(parseLooseDate("вчера")).toBeNull();
    expect(parseLooseDate(5)).toBeNull();
  });

  it("дни кровотечения склеиваются в месячные, разрыв в день не разрывает", () => {
    expect(daysToPeriods(["2026-03-03", "2026-03-01", "2026-03-02", "2026-03-05", "2026-03-29"])).toEqual([
      { start: "2026-03-01", end: "2026-03-05" },
      { start: "2026-03-29", end: "2026-03-29" },
    ]);
  });
});

describe("импорт: файлы", () => {
  it("Clue (старый .cluedata): дни с полем period", () => {
    const json = {
      data: [
        { day: "2026-01-05", period: "medium" },
        { day: "2026-01-06", period: "heavy" },
        { day: "2026-01-07", period: "light" },
        { day: "2026-01-15", tags: ["pain"] },
        { day: "2026-02-02", period: "spotting" },
      ],
    };
    expect(extractPeriodsFromJson(json)).toEqual([
      { start: "2026-01-05", end: "2026-01-07" },
      { start: "2026-02-02", end: "2026-02-02" },
    ]);
  });

  it("Clue (measurements.json): записи type=period", () => {
    const json = [
      { date: "2026-03-01", type: "period", value: { option: "medium" } },
      { date: "2026-03-02", type: "period", value: { option: "light" } },
      { date: "2026-03-02", type: "pain", value: { option: "cramps" } },
      { date: "2026-03-10", type: "period", value: { option: "none" } },
    ];
    expect(extractPeriodsFromJson(json)).toEqual([{ start: "2026-03-01", end: "2026-03-02" }]);
  });

  it("Flo: циклы с началом и концом месячных (в записи есть и конец цикла)", () => {
    const json = {
      operationalData: {
        cycles: [
          { cycle_start_date: "2026-01-01", cycle_end_date: "2026-01-28", period_start_date: "2026-01-01", period_end_date: "2026-01-05" },
          { period_start_date: "2026-01-29T00:00:00Z", period_end_date: "2026-02-02T00:00:00Z" },
        ],
      },
    };
    expect(extractPeriodsFromJson(json)).toEqual([
      { start: "2026-01-01", end: "2026-01-05" },
      { start: "2026-01-29", end: "2026-02-02" },
    ]);
  });

  it("незнакомые данные не превращаются в месячные", () => {
    expect(extractPeriodsFromJson({ reminders: [{ start: "2026-01-01", end: "2026-02-01" }], user: { birthday: "1995-05-05" } })).toEqual([]);
  });
});

describe("импорт: список дат", () => {
  it("начала и диапазоны в разных форматах, ошибки отдельно", () => {
    const { periods, bad } = parseDateList("12.03.2026\n2026-04-09 – 2026-04-13\n07.05.2026-11.05.2026\n\nабракадабра\n01.06.2026 - 30.06.2026");
    expect(periods).toEqual([
      { start: "2026-03-12", end: null },
      { start: "2026-04-09", end: "2026-04-13" },
      { start: "2026-05-07", end: "2026-05-11" },
    ]);
    expect(bad).toEqual(["абракадабра", "01.06.2026 - 30.06.2026"]);
  });
});

describe("импорт: объединение с уже отмеченным", () => {
  it("совпадающие и будущие месячные не добавляются", () => {
    const existing = [{ start: "2026-03-13", end: null }];
    const imported = [
      { start: "2026-02-12", end: "2026-02-16" },
      { start: "2026-03-12", end: "2026-03-16" },
      { start: "2026-12-01", end: null },
    ];
    const plan = planImport(existing, imported, "2026-10-16");
    expect(plan.added).toEqual([{ start: "2026-02-12", end: "2026-02-16" }]);
    expect(plan.skipped).toBe(1);
    expect(applyImport(existing, plan).map((p) => p.start)).toEqual(["2026-02-12", "2026-03-13"]);
  });
});
