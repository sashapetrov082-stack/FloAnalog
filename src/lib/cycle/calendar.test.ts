import { describe, expect, it } from "vitest";
import { dayMarks, monthGrid } from "./calendar";
import {
  askIfStillGoing,
  findPeriodAt,
  flowDaysOf,
  markPeriodEnd,
  markPeriodStart,
  ongoingPeriod,
  periodEnd,
  removePeriod,
} from "./periods";
import { predict, type Period } from "./predict";

describe("monthGrid", () => {
  it("октябрь 2026 начинается с четверга и занимает 5 недель", () => {
    const weeks = monthGrid(2026, 10);
    expect(weeks).toHaveLength(5);
    expect(weeks[0]).toEqual([null, null, null, "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
    expect(weeks[4].filter(Boolean).at(-1)).toBe("2026-10-31");
  });

  it("февраль високосного года и месяц, начинающийся с понедельника", () => {
    expect(monthGrid(2028, 2).flat().filter(Boolean)).toHaveLength(29);
    expect(monthGrid(2026, 6)[0][0]).toBe("2026-06-01");
    expect(monthGrid(2026, 12).flat().filter(Boolean).at(-1)).toBe("2026-12-31");
  });
});

describe("отметки месячных", () => {
  const base: Period[] = [{ start: "2026-09-01", end: "2026-09-05" }];

  it("«Начались» добавляет новые месячные без конца", () => {
    expect(markPeriodStart(base, "2026-09-29", 5)).toEqual([...base, { start: "2026-09-29", end: null }]);
  });

  it("«Начались» внутри уже отмеченных месячных ничего не меняет", () => {
    expect(markPeriodStart(base, "2026-09-03", 5)).toBe(base);
  });

  it("«Начались» чуть раньше отмеченных — переносит начало", () => {
    expect(markPeriodStart(base, "2026-08-30", 5)).toEqual([{ start: "2026-08-30", end: "2026-09-05" }]);
  });

  it("«Закончились» ставит конец последним месячным", () => {
    const open: Period[] = [...base, { start: "2026-09-29", end: null }];
    expect(markPeriodEnd(open, "2026-10-03")).toEqual([...base, { start: "2026-09-29", end: "2026-10-03" }]);
    // Слишком далеко от начала — ошибка отметки.
    expect(markPeriodEnd(open, "2026-10-20")).toBeNull();
    expect(markPeriodEnd([], "2026-10-03")).toBeNull();
  });

  it("удаление и «идут сейчас»", () => {
    const open: Period[] = [...base, { start: "2026-09-29", end: null }];
    expect(removePeriod(open, "2026-09-29")).toEqual(base);
    expect(ongoingPeriod(open, "2026-10-02")?.start).toBe("2026-09-29");
    expect(ongoingPeriod(open, "2026-10-10")?.start).toBe("2026-09-29"); // не закрыты — до 14 дней
    expect(ongoingPeriod(open, "2026-10-13")).toBeUndefined();
    expect(ongoingPeriod(base, "2026-09-10")).toBeUndefined();
    // Конец уже отмечен — месячные не считаются идущими, даже если конец сегодня.
    expect(ongoingPeriod(base, "2026-09-05")).toBeUndefined();
  });

  it("незакрытые месячные: «ещё идут?» после ожидаемой длины, выделения продлевают", () => {
    // Баг из теста: начало 3 октября, обычно 8 дней, конец не отмечен, а месячные всё ещё идут.
    const open: Period[] = [{ start: "2026-10-03", end: null }];
    expect(periodEnd(open[0], 8)).toBe("2026-10-10");
    expect(askIfStillGoing(open, "2026-10-10", 8)).toBeUndefined();
    expect(askIfStillGoing(open, "2026-10-11", 8)?.start).toBe("2026-10-03");
    // Ответ «да, ещё идут» = выделения в журнале сегодня.
    const flow = flowDaysOf({ "2026-10-12": { flow: "medium" }, "2026-10-01": { flow: "light" } });
    expect(periodEnd(open[0], 8, flow)).toBe("2026-10-12");
    expect(askIfStillGoing(open, "2026-10-12", 8, flow)).toBeUndefined();
    expect(findPeriodAt(open, "2026-10-12", 8, flow)?.start).toBe("2026-10-03");
    // Прогноз: сегодня ещё месячные, а не фертильные дни.
    const p = predict({ periods: open, today: "2026-10-12", defaultPeriodLength: 8, flowDays: flow })!;
    expect(p.phase).toBe("menstruation");
    expect(predict({ periods: open, today: "2026-10-12", defaultPeriodLength: 8 })!.phase).not.toBe("menstruation");
    expect(dayMarks(open, p, "2026-10-12", null, flow).get("2026-10-12")).toBe("period");
    // Через 14 дней без отметки конца — не спрашиваем.
    expect(askIfStillGoing(open, "2026-10-17", 8, flow)).toBeUndefined();
  });
});

describe("dayMarks", () => {
  const periods: Period[] = [{ start: "2026-10-01", end: "2026-10-05" }];
  const today = "2026-10-08";
  const marks = dayMarks(periods, predict({ periods, today }), today);

  it("отмеченные месячные, фертильное окно и овуляция", () => {
    expect(marks.get("2026-10-01")).toBe("period");
    expect(marks.get("2026-10-05")).toBe("period");
    expect(marks.get("2026-10-06")).toBeUndefined();
    expect(marks.get("2026-10-10")).toBe("fertile");
    expect(marks.get("2026-10-15")).toBe("ovulation");
    expect(marks.get("2026-10-16")).toBe("fertile");
  });

  it("прогноз месячных на будущие циклы", () => {
    expect(marks.get("2026-10-29")).toBe("predicted-period");
    expect(marks.get("2026-11-02")).toBe("predicted-period");
    expect(marks.get("2026-11-26")).toBe("predicted-period");
  });

  it("прогноз месячных не ставится на прошедшие дни при задержке", () => {
    const late = "2026-11-03";
    const m = dayMarks(periods, predict({ periods, today: late }), late);
    expect(m.get("2026-10-29")).toBeUndefined();
    expect(m.get("2026-11-03")).toBe("predicted-period");
  });

  it("месячные без отмеченного конца: прошедшие дни — факт, будущие — прогноз", () => {
    const open: Period[] = [{ start: "2026-10-06" }];
    const m = dayMarks(open, predict({ periods: open, today: "2026-10-07" }), "2026-10-07");
    expect(m.get("2026-10-07")).toBe("period");
    expect(m.get("2026-10-08")).toBe("predicted-period");
  });

  it("без прогноза отметок нет", () => {
    expect(dayMarks([], null, today).size).toBe(0);
  });

  it("гормональная контрацепция: без фертильных дней, прогноз — кровотечение отмены", () => {
    const periods: Period[] = [{ start: "2026-09-20", end: "2026-09-24" }];
    const p = predict({ periods, today, defaultCycleLength: 28, defaultPeriodLength: 5 });
    const marks = dayMarks(periods, p, today, ["2026-10-01", "2026-10-23", "2026-10-24"]);
    expect([...marks.values()]).not.toContain("fertile");
    expect([...marks.values()]).not.toContain("ovulation");
    expect(marks.get("2026-10-23")).toBe("predicted-period");
    expect(marks.has("2026-10-01")).toBe(false); // прошедший день — не прогноз
    expect(marks.get("2026-09-21")).toBe("period");
  });
});
