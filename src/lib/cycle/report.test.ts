import { describe, expect, it } from "vitest";
import type { DayLogs } from "@/lib/journal";
import { buildReport, reportStart } from "./report";
import type { Period } from "./predict";

const periods: Period[] = [
  { start: "2026-01-02", end: "2026-01-06" }, // раньше периода отчёта — только для длины цикла не нужен
  { start: "2026-05-01", end: "2026-05-05" },
  { start: "2026-05-29", end: "2026-06-02" },
  { start: "2026-06-29", end: null },
  { start: "2026-09-10", end: "2026-09-13" }, // перед ним, видимо, пропущены месячные
  { start: "2026-10-08", end: "2026-10-12" },
];

const dayLogs: DayLogs = {
  "2026-05-02": { flow: "medium", symptoms: ["cramps", "fatigue"], moods: ["calm"], note: "" },
  "2026-05-03": { flow: "heavy", symptoms: ["cramps"], moods: [], note: "  болит сильнее обычного " },
  "2026-10-09": { flow: "light", symptoms: ["cramps", "headache"], moods: [], note: "" },
  "2025-12-01": { flow: null, symptoms: ["headache"], moods: [], note: "старое" },
};

describe("отчёт для врача", () => {
  const r = buildReport({ periods, dayLogs, today: "2026-10-15", months: 6, includeNotes: false });

  it("период отчёта и циклы в нём", () => {
    expect(reportStart("2026-10-15", 6)).toBe("2026-04-15");
    expect([r.from, r.to]).toEqual(["2026-04-15", "2026-10-15"]);
    expect(r.cycles.map((c) => [c.start, c.cycleDays, c.periodDays])).toEqual([
      ["2026-05-01", 28, 5],
      ["2026-05-29", 31, 5],
      ["2026-06-29", 73, null],
      ["2026-09-10", 28, 4],
      ["2026-10-08", null, 5],
    ]);
    expect(r.cycles[2].unusual).toBe(true);
    expect(r.cycles[0].heaviestFlow).toBe("heavy");
    expect(r.cycles[4].heaviestFlow).toBe("light");
  });

  it("средние без необычных циклов", () => {
    expect(r.stats).toEqual({ cycleCount: 3, avgCycle: 29, minCycle: 28, maxCycle: 31, avgPeriod: 4.8 });
  });

  it("симптомы и заметки — только за период, заметки по выбору", () => {
    expect(r.symptoms).toEqual([
      { id: "cramps", days: 3 },
      { id: "fatigue", days: 1 },
      { id: "headache", days: 1 },
    ]);
    expect(r.loggedDays).toBe(3);
    expect(r.notes).toEqual([]);
    const withNotes = buildReport({ periods, dayLogs, today: "2026-10-15", months: 6, includeNotes: true });
    expect(withNotes.notes).toEqual([{ date: "2026-05-03", text: "болит сильнее обычного" }]);
  });

  it("пустые данные — без ошибок", () => {
    const empty = buildReport({ periods: [], dayLogs: {}, today: "2026-10-15", months: 3, includeNotes: true });
    expect(empty.cycles).toEqual([]);
    expect(empty.stats.avgCycle).toBeNull();
  });
});
